import type { ParsedCommand, SelectorGroup, SelectorTerm } from './commandParser'
import { parseCommand } from './commandParser'
import { materializeModels, plan, previewModel, type ModelOutcome } from './executor'
import { parseTests, runTests, parseSingularTests, runSingularTests, getYamlDiagnostics, formatYamlDiagnostic, type TestDef, type TestOutcome, type SingularTestOutcome } from './tests'
import { type CompiledModel, collectModels, getFileStem } from './compiler'
import { buildDag } from './dagBuilder'
import { registerCsv } from './duckdb'
import { collectSnapshots, runSnapshot, type SnapshotOutcome } from './snapshots'
import { errorMessage } from './errors'
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

// ── selector resolution ───────────────────────────────────────────────────────

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
 * Build the full selectable universe — models, seeds, and sources — as
 * CompiledModel-shaped entities so the selector machinery (fqn / tag / path and
 * the `+` graph operators) resolves uniformly across all three. Each model's
 * `source()` calls are folded into `refs` so `+` traverses model→source edges
 * too, exactly like model→model edges.
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

/** Which node kinds a given command is allowed to highlight. `dbt run`,
 *  `dbt compile` and `dbt show` only touch models, `dbt seed` only seeds;
 *  `build` / `test` can hit any kind. */
function allowedKinds(type: ParsedCommand['type']): Record<NodeKind, boolean> {
  if (type === 'seed') return { model: false, seed: true, source: false }
  if (type === 'build' || type === 'test')
    return { model: true, seed: true, source: true }
  return { model: true, seed: false, source: false } // run, compile, show, snapshot
}

/**
 * Resolve the `--select` of a (possibly partially-typed) command into the set
 * of DAG node ids it targets — for the live DAG preview.
 *
 * - Returns `null` when there is no usable `--select` at all (plain command or
 *   unparseable input): the DAG should render normally.
 * - Returns a `Set` when `--select` is present. The set may be **empty** — that
 *   means the selector currently matches nothing the command can act on, and
 *   every node should fade.
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
  // `dbt show` previews exactly one model — anything else is invalid for it,
  // so fade the whole graph rather than implying a multi-node selection.
  if (parsed.command.type === 'show' && out.size !== 1) return new Set()
  return out
}

// ── output formatting ────────────────────────────────────────────────────────

function dots(prefix: string, suffix: string, width = 68): string {
  return '.'.repeat(Math.max(3, width - prefix.length - suffix.length))
}

function countUniqueSources(models: CompiledModel[]): number {
  const set = new Set<string>()
  for (const m of models) for (const s of m.sources) set.add(`${s.source}.${s.table}`)
  return set.size
}

function formatModelLine(i: number, total: number, o: ModelOutcome): TerminalLine {
  const mat = o.materialization
  if (o.skipped) {
    const prefix = `${i + 1} of ${total} SKIP inlined ${mat} ${o.name} `
    const suffix = `[SKIP]`
    return { text: `${prefix}${dots(prefix, suffix)} ${suffix}`, color: 'gray' }
  }
  const prefix = `${i + 1} of ${total} ${o.passed ? 'OK' : 'ERROR'} ${o.passed ? `created ${mat}` : 'failed     '} ${o.name} `
  const suffix = `[${o.passed ? `OK in ${o.elapsed.toFixed(2)}s` : 'ERROR'}]`
  return {
    text: `${prefix}${dots(prefix, suffix)} ${suffix}`,
    color: o.passed ? 'green' : 'red',
  }
}

function formatSkipLine(i: number, total: number, name: string): TerminalLine {
  const prefix = `${i + 1} of ${total} SKIP ${name} `
  const suffix = `[SKIP]`
  return { text: `${prefix}${dots(prefix, suffix)} ${suffix}`, color: 'yellow' }
}

function formatTestLine(i: number, total: number, t: TestOutcome): TerminalLine {
  const label = `${t.kind}_${t.model}_${t.column}`
  const prefix = `${i + 1} of ${total} ${t.passed ? 'PASS' : 'FAIL'} ${label} `
  const suffix = t.passed ? '[PASS]' : `[FAIL — ${t.failingRows} row${t.failingRows !== 1 ? 's' : ''}]`
  return { text: `${prefix}${dots(prefix, suffix)} ${suffix}`, color: t.passed ? 'green' : 'red' }
}

function formatSingularTestLine(i: number, total: number, t: SingularTestOutcome): TerminalLine {
  const prefix = `${i + 1} of ${total} ${t.passed ? 'PASS' : 'FAIL'} ${t.name} `
  const suffix = t.passed ? '[PASS]' : `[FAIL — ${t.failingRows} row${t.failingRows !== 1 ? 's' : ''}]`
  return { text: `${prefix}${dots(prefix, suffix)} ${suffix}`, color: t.passed ? 'green' : 'red' }
}

function renderTable(columns: string[], rows: unknown[][]): TerminalLine[] {
  const stringRows = rows.map((r) => r.map((v) => (v === null || v === undefined ? 'NULL' : String(v))))
  const widths = columns.map((c, i) =>
    Math.max(c.length, ...stringRows.map((r) => r[i]?.length ?? 0)),
  )
  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ')
  const out: TerminalLine[] = []
  out.push({ text: fmt(columns), color: 'gray' })
  out.push({ text: widths.map((w) => '─'.repeat(w)).join('  '), color: 'gray' })
  for (const r of stringRows) out.push({ text: fmt(r) })
  return out
}

// ── main dispatcher ──────────────────────────────────────────────────────────

export async function execute(
  command: ParsedCommand,
  state: RunnerState,
): Promise<ExecutionResult> {
  const lines: TerminalLine[] = []
  const newRan = new Set(state.ranModels)
  const newTestResults: Record<string, 'pass' | 'fail' | 'untested'> = { ...state.testResults }
  const newColumns: Record<string, string[]> = { ...state.modelColumns }
  const newSeeds = new Set(state.loadedSeeds)

  const { sorted } = plan(state.files)
  const selected = applySelectors(sorted, command.select, command.exclude)

  const lastRun: LastRunInfo = {
    command: command.type,
    selectedModels: selected.map(m => m.name),
    usedSelect: command.select.length > 0,
    usedUpstream: command.select.some(g => g.terms.some(t => t.upstream)),
    usedDownstream: command.select.some(g => g.terms.some(t => t.downstream)),
  }

  lines.push({ text: '' })
  lines.push({ text: 'Running with ae-quest (DuckDB-Wasm)', color: 'gray' })

  if (command.type === 'snapshot') {
    const snapshots = collectSnapshots(state.files)
    const newCounts = { ...state.snapshotRunCounts }
    const newClosed = { ...state.snapshotClosedRows }
    lines.push({
      text: `Found ${snapshots.length} snapshot${snapshots.length !== 1 ? 's' : ''}`,
      color: 'gray',
    })
    lines.push({ text: '' })
    if (snapshots.length === 0) {
      lines.push({ text: 'Nothing to snapshot.', color: 'yellow' })
      lines.push({ text: '' })
      return { lines, updatedState: {} }
    }
    const outcomes: SnapshotOutcome[] = []
    for (const snap of snapshots) {
      const out = await runSnapshot(snap)
      outcomes.push(out)
      if (out.passed) {
        newRan.add(out.name)
        newCounts[out.name] = (newCounts[out.name] ?? 0) + 1
        newClosed[out.name] = (newClosed[out.name] ?? 0) + out.closed
      }
    }
    outcomes.forEach((o, i) => {
      const prefix = `${i + 1} of ${outcomes.length} ${o.passed ? 'OK' : 'ERROR'} snapshot ${o.name} `
      const suffix = o.passed
        ? `[${o.inserted} new, ${o.closed} closed, ${o.elapsed.toFixed(2)}s]`
        : '[ERROR]'
      lines.push({
        text: `${prefix}${dots(prefix, suffix)} ${suffix}`,
        color: o.passed ? 'green' : 'red',
      })
      if (!o.passed && o.error) {
        lines.push({ text: `  Error: ${o.error}`, color: 'red' })
      }
    })
    const okCount = outcomes.filter((o) => o.passed).length
    const failCount = outcomes.length - okCount
    lines.push({ text: '' })
    lines.push({
      text: failCount === 0
        ? `Completed successfully. ${okCount} snapshot${okCount !== 1 ? 's' : ''} captured.`
        : `Done. PASS=${okCount} ERROR=${failCount}`,
      color: failCount === 0 ? 'green' : 'red',
    })
    lines.push({ text: '' })
    return {
      lines,
      updatedState: {
        ranModels: newRan,
        snapshotRunCounts: newCounts,
        snapshotClosedRows: newClosed,
      },
    }
  }

  if (command.type === 'seed') {
    const seedFiles = Object.entries(state.files).filter(
      ([p]) => p.startsWith('seeds/') && p.endsWith('.csv'),
    )
    lines.push({
      text: `Found ${seedFiles.length} seed file${seedFiles.length !== 1 ? 's' : ''}`,
      color: 'gray',
    })
    lines.push({ text: '' })
    if (seedFiles.length === 0) {
      lines.push({ text: 'Nothing to seed.', color: 'yellow' })
      lines.push({ text: '' })
      return { lines, updatedState: {} }
    }
    let okCount = 0
    let failCount = 0
    for (const [path, content] of seedFiles) {
      const name = getFileStem(path, '.csv')
      try {
        await registerCsv(name, content.trim())
        newSeeds.add(name)
        okCount++
        lines.push({ text: `OK loaded seed ${name}`, color: 'green' })
      } catch (e) {
        failCount++
        lines.push({
          text: `ERROR loading ${name}: ${errorMessage(e)}`,
          color: 'red',
        })
      }
    }
    lines.push({ text: '' })
    lines.push({
      text: failCount === 0
        ? `Completed successfully. ${okCount} seed${okCount !== 1 ? 's' : ''} loaded.`
        : `Done. PASS=${okCount} ERROR=${failCount}`,
      color: failCount === 0 ? 'green' : 'red',
    })
    lines.push({ text: '' })
    return { lines, updatedState: { loadedSeeds: newSeeds } }
  }

  if (command.type === 'compile') {
    lines.push({ text: `Found ${selected.length} model${selected.length !== 1 ? 's' : ''}`, color: 'gray' })
    lines.push({ text: '' })
    if (selected.length === 0) {
      lines.push({ text: 'Nothing selected.', color: 'yellow' })
      lines.push({ text: '' })
      return { lines, updatedState: {} }
    }
    const newCompiled = new Set(state.compiledModels)
    for (const model of selected) {
      newCompiled.add(model.name)
      lines.push({ text: `Compiled model: ${model.name}`, color: 'green' })
      lines.push({ text: `  Path: ${model.path}`, color: 'gray' })
      lines.push({ text: '' })
      for (const line of model.sql.split('\n')) lines.push({ text: `  ${line}`, color: 'gray' })
      lines.push({ text: '' })
    }
    return { lines, updatedState: { compiledModels: newCompiled, lastRun } }
  }

  if (command.type === 'show') {
    if (selected.length !== 1) {
      lines.push({
        text: 'dbt show requires exactly one --select target, e.g. dbt show --select stg_users',
        color: 'red',
      })
      lines.push({ text: '' })
      return { lines, updatedState: {} }
    }
    const target = selected[0]
    if (!newRan.has(target.name)) {
      lines.push({
        text: `Model "${target.name}" hasn't been run yet. Run 'dbt run' first.`,
        color: 'yellow',
      })
      lines.push({ text: '' })
      return { lines, updatedState: {} }
    }
    try {
      const res = await previewModel(target.name, 20)
      lines.push({ text: `Preview of "${target.name}" (${res.rowCount} row${res.rowCount !== 1 ? 's' : ''}):`, color: 'gray' })
      lines.push({ text: '' })
      if (res.rowCount === 0) {
        lines.push({ text: '(no rows)', color: 'yellow' })
      } else {
        lines.push(...renderTable(res.columns, res.rows))
      }
      lines.push({ text: '' })
    } catch (e) {
      lines.push({ text: errorMessage(e), color: 'red' })
      lines.push({ text: '' })
    }
    return { lines, updatedState: { lastRun } }
  }

  const wantRun = command.type === 'run'
  let runFailed = false
  let skippedCount = 0
  let failedTestCount = 0

  if (command.type === 'build') {
    // For dbt build, interleave model execution and test execution in DAG order:
    // run model1 → test model1 → run model2 → test model2 → ...
    const srcCount = countUniqueSources(selected)
    lines.push({
      text: `Found ${selected.length} model${selected.length !== 1 ? 's' : ''}, ${srcCount} source${srcCount !== 1 ? 's' : ''}`,
      color: 'gray',
    })
    lines.push({ text: '' })

    if (selected.length === 0) {
      lines.push({ text: 'Nothing selected.', color: 'yellow' })
      lines.push({ text: '' })
    } else {
      if (selected.some((m) => m.materialization === 'incremental')) {
        lines.push({
          text: '(ae-quest simulates incremental models as full rebuilds.)',
          color: 'gray',
        })
      }

      // Load seeds before running models (dbt build includes dbt seed)
      const seedFiles = Object.entries(state.files).filter(
        ([p]) => p.startsWith('seeds/') && p.endsWith('.csv'),
      )
      for (const [path, content] of seedFiles) {
        const name = getFileStem(path, '.csv')
        try {
          await registerCsv(name, content.trim())
          newSeeds.add(name)
          lines.push({ text: `OK loaded seed ${name}`, color: 'green' })
        } catch (e) {
          lines.push({ text: `ERROR loading seed ${name}: ${errorMessage(e)}`, color: 'red' })
        }
      }
      if (seedFiles.length > 0) lines.push({ text: '' })

      const buildYamlDiags = getYamlDiagnostics(state.files)
      for (const d of buildYamlDiags) {
        lines.push({ text: `Warning: ${d.path} — ${formatYamlDiagnostic(d)}`, color: 'yellow' })
      }
      if (buildYamlDiags.length > 0) lines.push({ text: '' })

      const modelNames = new Set(selected.map((m) => m.name))
      const tests = parseTests(state.files, modelNames)
      const testsByModel = new Map<string, TestDef[]>()
      for (const test of tests) {
        if (!testsByModel.has(test.model)) testsByModel.set(test.model, [])
        testsByModel.get(test.model)!.push(test)
      }

      let totalModelTime = 0
      let totalModels = 0
      let totalTests = 0
      let passedTests = 0
      // Models that failed a test, or were skipped because an upstream did.
      // `dbt build` never builds a model on top of bad data.
      const tainted = new Set<string>()
      let nodeIndex = 0

      for (const model of selected) {
        // Skip this model if any model it ref()s failed a test or was itself skipped.
        const taintedUpstream = model.refs.filter((r) => tainted.has(r))
        if (taintedUpstream.length > 0) {
          tainted.add(model.name)
          skippedCount++
          lines.push(formatSkipLine(nodeIndex, selected.length, model.name))
          lines.push({
            text: `  → skipped: upstream ${taintedUpstream.join(', ')} failed a test.`,
            color: 'yellow',
          })
          nodeIndex++
          continue
        }

        // Run the model
        const modelOutcome = await materializeModels([model])
        const modelResult = modelOutcome[0]
        totalModels++

        lines.push(formatModelLine(nodeIndex, selected.length, modelResult))
        nodeIndex++

        if (modelResult.passed && modelResult.materialization === 'incremental' && modelResult.incrementalAppendedRows !== undefined) {
          const n = modelResult.incrementalAppendedRows
          lines.push({
            text: `  → incremental filter would append ${n} new row${n === 1 ? '' : 's'} (full rebuild applied).`,
            color: 'gray',
          })
        }
        if (modelResult.passed && modelResult.inlinedEphemerals && modelResult.inlinedEphemerals.length) {
          const list = modelResult.inlinedEphemerals.map((n) => `"${n}"`).join(', ')
          const word = modelResult.inlinedEphemerals.length === 1 ? 'ephemeral' : 'ephemerals'
          lines.push({
            text: `  → inlined ${word} ${list} as CTE${modelResult.inlinedEphemerals.length === 1 ? '' : 's'} in the compiled SQL.`,
            color: 'gray',
          })
        }

        if (modelResult.passed && !modelResult.skipped) {
          newRan.add(modelResult.name)
          newColumns[modelResult.name] = modelResult.columns
        } else if (!modelResult.passed) {
          lines.push({ text: '', })
          lines.push({ text: `  Compiled SQL:`, color: 'gray' })
          for (const s of modelResult.compiledSql.split('\n')) lines.push({ text: `    ${s}`, color: 'gray' })
          lines.push({ text: `  Error: ${modelResult.error}`, color: 'red' })
          runFailed = true
          break
        }

        totalModelTime += modelResult.elapsed

        // Run tests for this model
        const modelTests = testsByModel.get(model.name) ?? []
        if (modelTests.length > 0) {
          const testOutcomes = await runTests(modelTests)
          testOutcomes.forEach((t, i) => {
            lines.push(formatTestLine(i, modelTests.length, t))
            if (t.error) lines.push({ text: `  Error: ${t.error}`, color: 'red' })
          })

          let modelHadFailingTest = false
          for (const t of testOutcomes) {
            totalTests++
            if (t.passed) passedTests++
            else modelHadFailingTest = true
            const prev = newTestResults[t.model]
            if (prev === 'fail') continue
            newTestResults[t.model] = t.passed ? 'pass' : 'fail'
          }
          // A failing test taints the model: downstream models that ref() it
          // will be skipped rather than built on bad data.
          if (modelHadFailingTest) tainted.add(model.name)
        }
      }

      // Run singular tests after all models are built
      if (!runFailed) {
        const singularTests = parseSingularTests(state.files)
        if (singularTests.length > 0) {
          const singularOutcomes = await runSingularTests(singularTests)
          singularOutcomes.forEach((t, i) => {
            lines.push(formatSingularTestLine(i, singularOutcomes.length, t))
            if (t.error) lines.push({ text: `  Error: ${t.error}`, color: 'red' })
          })
          for (const t of singularOutcomes) {
            totalTests++
            if (t.passed) passedTests++
          }
        }
      }

      lines.push({ text: '' })
      if (runFailed) {
        lines.push({
          text: `Stopped. Model ${totalModels} failed.`,
          color: 'red',
        })
      } else {
        const skipNote = skippedCount > 0 ? `, ${skippedCount} skipped` : ''
        lines.push({
          text: `Finished running ${totalModels} model${totalModels !== 1 ? 's' : ''}${skipNote} in ${totalModelTime.toFixed(2)}s and ${totalTests} test${totalTests !== 1 ? 's' : ''}.`,
          color: 'gray',
        })
        failedTestCount = totalTests - passedTests
        const ok = failedTestCount === 0 && skippedCount === 0
        lines.push({
          text: ok
            ? 'Completed successfully.'
            : `Done. PASS=${passedTests} FAIL=${failedTestCount} SKIP=${skippedCount}`,
          color: ok ? 'green' : 'red',
        })
      }
      lines.push({ text: '' })
    }
  } else if (wantRun) {
    // Separate path for dbt run (without tests)
    const srcCount = countUniqueSources(selected)
    lines.push({
      text: `Found ${selected.length} model${selected.length !== 1 ? 's' : ''}, ${srcCount} source${srcCount !== 1 ? 's' : ''}`,
      color: 'gray',
    })
    lines.push({ text: '' })

    if (selected.length === 0) {
      lines.push({ text: 'Nothing selected.', color: 'yellow' })
      lines.push({ text: '' })
    } else {
      const outcomes = await materializeModels(selected)
      if (outcomes.some((o) => o.materialization === 'incremental')) {
        lines.push({
          text: '(ae-quest simulates incremental models as full rebuilds.)',
          color: 'gray',
        })
      }
      let totalTime = 0
      outcomes.forEach((o, i) => {
        lines.push(formatModelLine(i, outcomes.length, o))
        if (o.passed && o.materialization === 'incremental' && o.incrementalAppendedRows !== undefined) {
          // Diagnostic: how many rows the user's `is_incremental()` filter would
          // have appended on this run. The table is still full-rebuilt — this is
          // a teaching aid so the WHERE clause feels real.
          const n = o.incrementalAppendedRows
          lines.push({
            text: `  → incremental filter would append ${n} new row${n === 1 ? '' : 's'} (full rebuild applied).`,
            color: 'gray',
          })
        }
        if (o.passed && o.inlinedEphemerals && o.inlinedEphemerals.length) {
          // Surface the CTE inlining so the "ephemeral" wow lands: the model
          // ran with the upstream's SQL embedded as a CTE, no warehouse object.
          const list = o.inlinedEphemerals.map((n) => `"${n}"`).join(', ')
          const word = o.inlinedEphemerals.length === 1 ? 'ephemeral' : 'ephemerals'
          lines.push({
            text: `  → inlined ${word} ${list} as CTE${o.inlinedEphemerals.length === 1 ? '' : 's'} in the compiled SQL.`,
            color: 'gray',
          })
        }
        if (o.passed && !o.skipped) {
          newRan.add(o.name)
          newColumns[o.name] = o.columns
        } else if (!o.passed) {
          lines.push({ text: '', })
          lines.push({ text: `  Compiled SQL:`, color: 'gray' })
          for (const s of o.compiledSql.split('\n')) lines.push({ text: `    ${s}`, color: 'gray' })
          lines.push({ text: `  Error: ${o.error}`, color: 'red' })
        }
        totalTime += o.elapsed
      })
      const passed = outcomes.filter((o) => o.passed).length
      const failed = outcomes.length - passed
      if (failed > 0) runFailed = true
      lines.push({ text: '' })
      lines.push({
        text: `Finished running ${outcomes.length} model${outcomes.length !== 1 ? 's' : ''} in ${totalTime.toFixed(2)}s.`,
        color: 'gray',
      })
      lines.push({
        text: failed === 0 ? 'Completed successfully.' : `Done. PASS=${passed} ERROR=${failed}`,
        color: failed === 0 ? 'green' : 'red',
      })
      lines.push({ text: '' })
    }
  }

  if (command.type === 'test') {
    // Separate path for dbt test (without models)
    const yamlDiags = getYamlDiagnostics(state.files)
    for (const d of yamlDiags) {
      lines.push({ text: `Warning: ${d.path} — ${formatYamlDiagnostic(d)}`, color: 'yellow' })
    }
    if (yamlDiags.length > 0) lines.push({ text: '' })

    const modelNames = new Set(selected.map((m) => m.name))
    const tests = parseTests(state.files, modelNames)
    const singularTests = parseSingularTests(state.files)
    const totalTestCount = tests.length + singularTests.length
    lines.push({
      text: `Found ${totalTestCount} test${totalTestCount !== 1 ? 's' : ''}`,
      color: 'gray',
    })
    lines.push({ text: '' })

    if (totalTestCount === 0) {
      lines.push({ text: 'Nothing to test.', color: 'yellow' })
      lines.push({ text: '' })
    } else {
      const outcomes = await runTests(tests)
      const singularOutcomes = await runSingularTests(singularTests)
      outcomes.forEach((t, i) => {
        lines.push(formatTestLine(i, outcomes.length, t))
        if (t.error) lines.push({ text: `  Error: ${t.error}`, color: 'red' })
      })
      singularOutcomes.forEach((t, i) => {
        lines.push(formatSingularTestLine(i, singularOutcomes.length, t))
        if (t.error) lines.push({ text: `  Error: ${t.error}`, color: 'red' })
      })
      // Clear stale results for models in this run so a passing re-run
      // can recover from a previous failure.
      for (const name of modelNames) delete newTestResults[name]
      // Aggregate per-model test status: fail if any test fails, else pass.
      for (const t of outcomes) {
        const prev = newTestResults[t.model]
        if (prev === 'fail') continue
        newTestResults[t.model] = t.passed ? 'pass' : 'fail'
      }
      const passed = outcomes.filter((t) => t.passed).length + singularOutcomes.filter((t) => t.passed).length
      const failed = totalTestCount - passed

      lines.push({ text: '' })
      lines.push({
        text: `Finished running ${totalTestCount} test${totalTestCount !== 1 ? 's' : ''}.`,
        color: 'gray',
      })
      lines.push({
        text: failed === 0 ? 'All tests passed.' : `Done. PASS=${passed} FAIL=${failed}`,
        color: failed === 0 ? 'green' : 'red',
      })
      lines.push({ text: '' })
    }
  }

  const updatedState: Partial<RunnerState> = {
    ranModels: newRan,
    testResults: newTestResults,
    modelColumns: newColumns,
    lastRun,
  }
  if (command.type === 'run' && !runFailed) {
    updatedState.buildSucceeded = true
  }
  if (command.type === 'build') {
    updatedState.buildSucceeded =
      !runFailed && skippedCount === 0 && failedTestCount === 0
    updatedState.loadedSeeds = newSeeds
  }
  return { lines, updatedState }
}
