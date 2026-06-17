/**
 * Command dispatch - Phase-1b adapter over REAL dbt.
 *
 * `resolveSelection()` and the selector machinery below stay pure + file-derived: they drive the
 * live DAG highlight and compute `lastRun` (so selector-aware validators behave exactly as before).
 * `execute()` no longer simulates dbt - it syncs the editor files into the in-Pyodide project,
 * invokes real dbt-core, streams dbt's own terminal output, and reconstructs the GameState fields
 * from dbt's run_results.json + manifest.json. `dbt show` is served by reading the warehouse back.
 */
import type { ParsedCommand, SelectorGroup, SelectorTerm } from './commandParser'
import { parseCommand } from './commandParser'
import { plan } from './executor'
import { type CompiledModel, collectModels, getFileStem } from './compiler'
import { buildDag } from './dagBuilder'
import { syncProjectFiles, invokeDbt, type DbtArtifacts } from './engine'
import {
  ranModelNames,
  ranSnapshotNames,
  seededNames,
  testVerdictsByModel,
  modelColumnsFromCatalog,
} from './artifacts'
import type { LastRunInfo } from './types'

export interface TerminalLine {
  text: string
  color?: 'green' | 'red' | 'yellow' | 'gray'
}

export interface RunnerState {
  files: Record<string, string>
  ranModels: Set<string>
  shownModels: Set<string>
  compiledModels: Set<string>
  testResults: Record<string, 'pass' | 'fail' | 'untested'>
  modelColumns: Record<string, string[]>
  loadedSeeds: Set<string>
  buildSucceeded: boolean
  snapshotRunCounts: Record<string, number>
  snapshotClosedRows: Record<string, number>
  lastRun: LastRunInfo | null
}

export interface ExecutionResult {
  lines: TerminalLine[]
  updatedState: Partial<RunnerState>
}

// ── selector resolution (pure, file-derived - unchanged from the simulation) ──────────────────

function buildDownstream(models: CompiledModel[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const m of models) {
    for (const r of m.refs) {
      if (!map.has(r)) map.set(r, new Set())
      map.get(r)!.add(m.name)
    }
  }
  return map
}

function expandUpstream(name: string, byName: Map<string, CompiledModel>, out: Set<string>): void {
  for (const r of byName.get(name)?.refs ?? [])
    if (!out.has(r)) { out.add(r); expandUpstream(r, byName, out) }
}

function expandDownstream(name: string, downstream: Map<string, Set<string>>, out: Set<string>): void {
  for (const d of downstream.get(name) ?? [])
    if (!out.has(d)) { out.add(d); expandDownstream(d, downstream, out) }
}

function resolveTerm(term: SelectorTerm, models: CompiledModel[]): Set<string> {
  switch (term.method) {
    case 'fqn':
      return new Set(models.filter(m => m.name === term.value).map(m => m.name))
    case 'tag':
      return new Set(models.filter(m => m.tags.includes(term.value)).map(m => m.name))
    case 'path': {
      const prefix = term.value.endsWith('/') ? term.value : `${term.value}/`
      return new Set(models.filter(m => m.path === term.value || m.path.startsWith(prefix)).map(m => m.name))
    }
  }
}

function expandGraphOps(
  base: Set<string>,
  term: SelectorTerm,
  byName: Map<string, CompiledModel>,
  downstream: Map<string, Set<string>>,
): Set<string> {
  if (!term.upstream && !term.downstream) return base
  const out = new Set(base)
  for (const name of base) {
    if (term.upstream) expandUpstream(name, byName, out)
    if (term.downstream) expandDownstream(name, downstream, out)
  }
  return out
}

function resolveGroup(
  group: SelectorGroup,
  models: CompiledModel[],
  byName: Map<string, CompiledModel>,
  downstream: Map<string, Set<string>>,
): Set<string> {
  if (group.terms.length === 0) return new Set()
  const sets = group.terms.map(term =>
    expandGraphOps(resolveTerm(term, models), term, byName, downstream)
  )
  // Intersection: keep only names present in every set.
  return sets.reduce((acc, s) => new Set([...acc].filter(x => s.has(x))))
}

function applySelectors(
  sorted: CompiledModel[],
  select: SelectorGroup[],
  exclude: SelectorGroup[],
): CompiledModel[] {
  const byName = new Map(sorted.map(m => [m.name, m]))
  const downstream = buildDownstream(sorted)

  let included: Set<string>
  if (select.length === 0) {
    included = new Set(sorted.map(m => m.name))
  } else {
    included = new Set()
    for (const g of select)
      for (const n of resolveGroup(g, sorted, byName, downstream)) included.add(n)
  }

  for (const g of exclude)
    for (const n of resolveGroup(g, sorted, byName, downstream)) included.delete(n)

  return sorted.filter(m => included.has(m.name))
}

type NodeKind = 'model' | 'seed' | 'source'

/**
 * Build the full selectable universe - models, seeds, and sources - as CompiledModel-shaped
 * entities so the selector machinery (fqn / tag / path and the `+` graph operators) resolves
 * uniformly across all three. Each model's source() calls are folded into refs so `+` traverses
 * model→source edges too.
 */
function selectionUniverse(files: Record<string, string>): {
  entities: CompiledModel[]
  kindOf: Map<string, NodeKind>
} {
  const kindOf = new Map<string, NodeKind>()
  const entities: CompiledModel[] = []
  const pseudo = (name: string, path: string): CompiledModel => ({
    name, path, sql: '', materialization: 'view', refs: [], sources: [], tags: [],
  })

  for (const m of collectModels(files)) {
    kindOf.set(m.name, 'model')
    entities.push({ ...m, refs: [...m.refs, ...m.sources.map(s => `${s.source}.${s.table}`)] })
  }
  for (const path of Object.keys(files)) {
    if (!path.startsWith('seeds/') || !path.endsWith('.csv')) continue
    const name = getFileStem(path, '.csv')
    if (kindOf.has(name)) continue
    kindOf.set(name, 'seed')
    entities.push(pseudo(name, path))
  }
  for (const node of buildDag(files).nodes) {
    if (node.layer !== 'source' || kindOf.has(node.id)) continue
    kindOf.set(node.id, 'source')
    entities.push(pseudo(node.id, ''))
  }
  return { entities, kindOf }
}

/** Which node kinds a given command is allowed to highlight. */
function allowedKinds(type: ParsedCommand['type']): Record<NodeKind, boolean> {
  if (type === 'seed') return { model: false, seed: true, source: false }
  if (type === 'build' || type === 'test')
    return { model: true, seed: true, source: true }
  return { model: true, seed: false, source: false } // run, compile, show, snapshot
}

/**
 * Resolve the `--select` of a (possibly partially-typed) command into the DAG node ids it targets,
 * for the live DAG preview. null = no usable selector (render normally); a Set (possibly empty) =
 * selector present, fade everything not in it.
 */
export function resolveSelection(
  input: string,
  files: Record<string, string>,
): Set<string> | null {
  const parsed = parseCommand(input)
  if (!parsed.ok || parsed.command.select.length === 0) return null
  const { entities, kindOf } = selectionUniverse(files)
  const allowed = allowedKinds(parsed.command.type)
  const selected = applySelectors(entities, parsed.command.select, parsed.command.exclude)
  const out = new Set<string>()
  for (const e of selected)
    if (allowed[kindOf.get(e.name) ?? 'model']) out.add(e.name)
  if (parsed.command.type === 'show' && out.size !== 1) return new Set()
  return out
}

// ── command → dbt args ─────────────────────────────────────────────────────────

/** Forward the parsed command's argv straight to real dbt (subcommand + all flags, verbatim). */
function toDbtArgs(command: ParsedCommand): string[] {
  return command.args
}

// ── dbt output → terminal lines ──────────────────────────────────────────────────

const ANSI_RE = /\x1b\[[0-9;]*m/g
const TIMESTAMP_RE = /^\d{2}:\d{2}:\d{2}(\.\d+)?\s+/

function cleanLine(s: string): string {
  return s.replace(ANSI_RE, '').replace(TIMESTAMP_RE, '').replace(/\s+$/, '')
}

function colorFor(s: string, stream: 'out' | 'err'): TerminalLine['color'] {
  if (stream === 'err') return 'red'
  // dbt's run summary ("Done. PASS=1 WARN=0 ERROR=0 SKIP=0 NO-OP=0 TOTAL=1") carries the words
  // ERROR/WARN even on a clean run, so color it by the actual COUNTS, not keyword presence -
  // otherwise the naive ERROR rule below paints every successful summary red.
  const errCount = /\bERROR=(\d+)/.exec(s)
  if (errCount) {
    if (Number(errCount[1]) > 0) return 'red'
    if (Number(/\bWARN=(\d+)/.exec(s)?.[1] ?? '0') > 0) return 'yellow'
    return 'green'
  }
  if (/\b(ERROR|FAIL|Failure in|Database Error|Compilation Error|Runtime Error)\b/i.test(s)) return 'red'
  if (/(\bOK\b|\bPASS\b|Completed successfully|\bcreated\b)/.test(s)) return 'green'
  if (/\b(WARN|SKIP|Nothing to do)\b/i.test(s)) return 'yellow'
  // "Finished running …" is a neutral completion line, not a warning - keep it gray.
  return 'gray'
}

/** Convert one raw dbt output chunk (may hold several '\n'-separated lines) into terminal lines -
 *  cleaned (ANSI + leading timestamp stripped) and colored. Shared by the live stream and the
 *  end-of-command batch so output renders identically whether it's streamed or assembled at once. */
export function rawToTerminalLines(line: string, stream: 'out' | 'err'): TerminalLine[] {
  const out: TerminalLine[] = []
  for (const raw of line.split('\n')) {
    const c = cleanLine(raw)
    if (c.length === 0) { out.push({ text: '' }); continue }
    out.push({ text: c, color: colorFor(c, stream) })
  }
  return out
}

// `includeOutput` is false when dbt's stdout was already streamed live (then this only appends the
// error tail + trailing blank, so the streamed lines aren't duplicated).
function dbtOutputToLines(art: DbtArtifacts, includeOutput = true): TerminalLine[] {
  const lines: TerminalLine[] = []
  if (includeOutput) {
    for (const { line, stream } of art.output) lines.push(...rawToTerminalLines(line, stream))
  }
  // Surface an engine-level failure dbt didn't already print.
  if (art.fatal) {
    lines.push({ text: '' })
    lines.push({ text: 'Engine error:', color: 'red' })
    for (const l of art.fatal.split('\n')) if (l.trim()) lines.push({ text: l, color: 'red' })
  } else if (!art.success && art.exception && art.output.length === 0) {
    for (const l of art.exception.split('\n')) if (l.trim()) lines.push({ text: l, color: 'red' })
  }
  if (lines.length === 0 || lines[lines.length - 1].text !== '') lines.push({ text: '' })
  return lines
}

// ── GameState reconstruction from dbt artifacts ──────────────────────────────────

async function reconstruct(
  command: ParsedCommand,
  state: RunnerState,
  art: DbtArtifacts,
  selected: CompiledModel[],
): Promise<Partial<RunnerState>> {
  const updated: Partial<RunnerState> = {}

  const ranModels = new Set(state.ranModels)
  for (const n of ranModelNames(art)) ranModels.add(n)
  for (const n of ranSnapshotNames(art)) ranModels.add(n)
  updated.ranModels = ranModels

  const seeded = seededNames(art)
  if (seeded.length || command.type === 'seed' || command.type === 'build') {
    const loadedSeeds = new Set(state.loadedSeeds)
    for (const n of seeded) loadedSeeds.add(n)
    updated.loadedSeeds = loadedSeeds
  }

  // Overwrite verdicts for models tested in THIS run (so a passing re-run recovers from a fail).
  const verdicts = testVerdictsByModel(art)
  if (Object.keys(verdicts).length) {
    updated.testResults = { ...state.testResults, ...verdicts }
  }

  if (command.type === 'compile') {
    const compiledModels = new Set(state.compiledModels)
    for (const m of selected) compiledModels.add(m.name)
    updated.compiledModels = compiledModels
  }

  if (command.type === 'run' || command.type === 'build') {
    updated.buildSucceeded = art.success
    updated.modelColumns = { ...state.modelColumns, ...(await modelColumnsFromCatalog()) }
  }

  if (command.type === 'snapshot') {
    const counts = { ...state.snapshotRunCounts }
    for (const n of ranSnapshotNames(art)) counts[n] = (counts[n] ?? 0) + 1
    updated.snapshotRunCounts = counts
  }

  return updated
}

// ── main dispatcher ──────────────────────────────────────────────────────────────

// Commands that genuinely can't run in the browser sandbox: `deps` needs network + a git client,
// `docs serve` needs a listening socket, `init` is interactive. We intercept them with a friendly
// note instead of letting dbt emit a confusing traceback (or hang the worker on a socket).
function browserIncompatible(command: ParsedCommand): string | null {
  if (command.type === 'deps') return 'dbt deps'
  if (command.type === 'init') return 'dbt init'
  if (command.type === 'docs' && command.args.includes('serve')) return 'dbt docs serve'
  return null
}

export async function execute(
  command: ParsedCommand,
  state: RunnerState,
  /** Optional live sink: receives dbt's terminal lines as they're emitted (streaming). When given,
   *  the returned `lines` omit the streamed output (only the error tail + trailing blank remain). */
  onLine?: (lines: TerminalLine[]) => void,
): Promise<ExecutionResult> {
  // Selector resolution stays static so lastRun + DAG highlighting are identical to before.
  const { sorted } = plan(state.files)
  const selected = applySelectors(sorted, command.select, command.exclude)
  const lastRun: LastRunInfo = {
    command: command.type,
    selectedModels: selected.map(m => m.name),
    usedSelect: command.select.length > 0,
    usedUpstream: command.select.some(g => g.terms.some(t => t.upstream)),
    usedDownstream: command.select.some(g => g.terms.some(t => t.downstream)),
  }

  const blocked = browserIncompatible(command)
  if (blocked) {
    const needs =
      blocked === 'dbt deps' ? 'network access + git'
        : blocked === 'dbt docs serve' ? 'a local web server'
          : 'interactive input'
    return {
      lines: [
        { text: `${blocked} isn't available in the browser lab (needs ${needs}).`, color: 'yellow' },
        { text: '' },
      ],
      updatedState: { lastRun },
    }
  }

  // Sync the learner's files into the dbt project, then run REAL dbt. `dbt show` now routes here
  // too (real dbt compiles + previews); the store fills the Results panel for single-model selects.
  await syncProjectFiles(state.files)
  const art = await invokeDbt(
    toDbtArgs(command),
    onLine ? (line, stream) => onLine(rawToTerminalLines(line, stream)) : undefined,
  )

  const lines = dbtOutputToLines(art, !onLine)
  const updatedState = await reconstruct(command, state, art, selected)
  updatedState.lastRun = lastRun
  return { lines, updatedState }
}
