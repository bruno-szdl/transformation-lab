/**
 * The bridge between the lab's GameState world and the REAL dbt engine
 * (`@dbt-wasm/engine` = dbt-core + dbt-duckdb running in Pyodide/WebAssembly).
 *
 * Phase-1b swap: the old hand-written simulation (regex Jinja, a DuckDB-wasm SQL executor) is
 * replaced by genuine dbt. This module owns:
 *   - a single, lazily-booted engine instance for the whole session (boot is ~10–30s / ~40 MB);
 *   - the generated dbt project scaffolding (dbt_project.yml + profiles.yml);
 *   - syncing the learner's editor files into the in-Pyodide project before each dbt invoke;
 *   - `invokeDbt()` - run dbt and read back its real artifacts (run_results.json + manifest.json);
 *   - `query()` - ad-hoc SQL against the warehouse for previews + the catalog.
 *
 * The downstream engine modules (duckdb.ts, executor.ts, runner.ts) are thin adapters over this.
 */
import { createDbtEngine, type DbtEngine } from '@dbt-wasm/engine'
import { errorMessage } from './errors'

export const PROJECT_NAME = 'transformation_lab'
const PROJECT_DIR = '/project'
/** Where the duckdb warehouse lives inside the engine's in-memory FS (worker mirrors this). */
export const WAREHOUSE_PATH = `${PROJECT_DIR}/warehouse.duckdb`
/** Scratch dir for raw/source CSVs we materialize directly (the lesson's pre-existing tables). */
const RAW_SEED_DIR = '.lab_raw'

// ── live output streaming (boot status + dbt logs) ──────────────────────────
export type EngineOutput =
  | { kind: 'status'; phase: string }
  | { kind: 'log'; line: string; stream: 'out' | 'err' }
  // Boot lifecycle, so the UI can show a full-screen loading overlay while the ~40 MB
  // engine (Pyodide + dbt-core + dbt-duckdb) downloads & installs the first time.
  | { kind: 'boot'; state: 'start' | 'ready' | 'error'; error?: string }

let outputSink: ((o: EngineOutput) => void) | null = null
/** The store registers a sink so boot progress (and any non-captured dbt output) reaches the UI. */
export function setEngineOutputSink(fn: ((o: EngineOutput) => void) | null): void {
  outputSink = fn
}

// While an invoke is in flight, dbt's stdout/stderr is collected into `captureBuffer` (returned as
// `art.output`) AND, when a live sink is attached, forwarded line-by-line to `liveSink` so the
// terminal streams output as dbt runs instead of dumping it all when the command finishes. The
// silent pre-run (lesson load) attaches no live sink, so its output stays captured-only (not shown).
let captureBuffer: Array<{ line: string; stream: 'out' | 'err' }> | null = null
let liveSink: ((line: string, stream: 'out' | 'err') => void) | null = null

// ── the singleton engine ────────────────────────────────────────────────────
let enginePromise: Promise<DbtEngine> | null = null
let booted = false

export function isEngineBooted(): boolean {
  return booted
}

/** Boot the engine exactly once for the session; subsequent calls await the same boot. */
export function getEngine(): Promise<DbtEngine> {
  if (!enginePromise) {
    const engine = createDbtEngine({
      wheelhouseUrl: '/wheelhouse/',
      onStatus: (phase) => outputSink?.({ kind: 'status', phase }),
      onOutput: (line, stream) => {
        if (captureBuffer) {
          captureBuffer.push({ line, stream })
          liveSink?.(line, stream)
        } else outputSink?.({ kind: 'log', line, stream })
      },
    })
    // Fire the boot-start before awaiting boot() so the overlay appears immediately
    // (the very first getEngine() is what kicks off the one-time download/install).
    outputSink?.({ kind: 'boot', state: 'start' })
    enginePromise = engine
      .boot()
      .then(() => {
        booted = true
        outputSink?.({ kind: 'boot', state: 'ready' })
        return engine
      })
      .catch((e) => {
        outputSink?.({ kind: 'boot', state: 'error', error: errorMessage(e) })
        throw e
      })
  }
  return enginePromise
}

// ── project scaffolding ──────────────────────────────────────────────────────
// These are the FALLBACK dbt_project.yml + profiles.yml (D30). syncProjectFiles spreads
// `{...baseProjectFiles(), ...files}`, so a lesson that ships its own dbt_project.yml / profiles.yml
// in `initialFiles` overrides them - that's how a lesson teaches custom schemas / a different
// duckdb path. The default profile is named `${PROJECT_NAME}` and the warehouse lives at
// WAREHOUSE_PATH; query()/reset() resolve the *active* warehouse path from profiles.yml, so editing
// the path stays consistent with what the Results panel / Database Explorer read.
function baseProjectFiles(): Record<string, string> {
  return {
    'dbt_project.yml': `name: ${PROJECT_NAME}
version: "1.0.0"
config-version: 2
profile: ${PROJECT_NAME}
model-paths: ["models"]
seed-paths: ["seeds"]
test-paths: ["tests"]
snapshot-paths: ["snapshots"]
macro-paths: ["macros"]
analysis-paths: ["analyses"]
target-path: "target"
clean-targets: ["target"]
flags:
  send_anonymous_usage_stats: false
`,
    'profiles.yml': `${PROJECT_NAME}:
  target: dev
  outputs:
    dev:
      type: duckdb
      path: "${WAREHOUSE_PATH}"
      threads: 1
`,
  }
}

/** Wipe the project + warehouse for a fresh lesson, then lay down the base scaffolding. */
export async function resetProject(): Promise<void> {
  const engine = await getEngine()
  await engine.reset()
  await engine.writeFiles(baseProjectFiles())
}

/**
 * Editable-infra guardrail (D30): if a lesson ships a custom dbt_project.yml that points at a profile
 * name, make sure a profiles.yml (the lesson's own, or the base fallback) actually defines it -
 * otherwise dbt errors with an opaque "Could not find profile". This is a dev-time aid for lesson
 * authors; we only warn (dbt still surfaces its own clean error to the learner if it slips through).
 */
function assertProfileConsistency(files: Record<string, string>): void {
  const project = files['dbt_project.yml']
  if (!project) return // using the base dbt_project.yml - its profile matches the base profiles.yml
  const profileName = project.match(/^\s*profile:\s*['"]?([A-Za-z0-9_-]+)/m)?.[1] ?? PROJECT_NAME
  const profiles = files['profiles.yml'] ?? baseProjectFiles()['profiles.yml']
  if (!new RegExp(`^\\s*${profileName}:`, 'm').test(profiles)) {
    console.warn(
      `[engine] dbt_project.yml selects profile "${profileName}" but no profiles.yml defines it. ` +
        `Ship a profiles.yml keyed "${profileName}:" in the lesson, or keep profile: ${PROJECT_NAME}.`,
    )
  }
}

/** Mirror the learner's current editor files into the in-Pyodide project. Uses `syncProject` so the
 *  in-Pyodide resource dirs match the editor EXACTLY - a renamed/deleted file (e.g. lesson 11's
 *  staging/intermediate/marts reorg) disappears instead of lingering as a duplicate dbt node.
 *  Base scaffolding is the fallback; lesson-provided dbt_project.yml / profiles.yml override it. */
export async function syncProjectFiles(files: Record<string, string>): Promise<void> {
  const engine = await getEngine()
  assertProfileConsistency(files)
  await engine.syncProject({ ...baseProjectFiles(), ...files })
}

/** Write a single raw file into the project FS (used for raw/source CSV materialization). */
export async function writeProjectFile(rel: string, content: string): Promise<void> {
  const engine = await getEngine()
  await engine.writeFiles({ [rel]: content })
}

/** Absolute path inside the project FS for a raw/source seed CSV. */
export function rawSeedPath(key: string): string {
  return `${RAW_SEED_DIR}/${key.replace(/[^A-Za-z0-9_.-]/g, '_')}.csv`
}

// ── querying the warehouse ────────────────────────────────────────────────────
export interface QueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
}

export async function query(sql: string): Promise<QueryResult> {
  const engine = await getEngine()
  const r = await engine.query(sql)
  return { columns: r.columns, rows: r.rows, rowCount: r.rows.length }
}

// ── pre-baked warehouse cache (perf) ─────────────────────────────────────────────
// A lesson's STARTING warehouse (raw source tables + pre-ran models) is identical every time the
// lesson loads. The first load does the real work (registerCsv + a `dbt run` of the pre-ran models);
// we then EXPORT that warehouse so later loads (the Reset button, revisiting a lesson) can IMPORT it
// back in ~milliseconds instead of re-running dbt. IMPORT recreates objects on the open connection
// (no file overwrite) → D26-safe. Bake dirs live OUTSIDE /project (top-level, parent `/` already
// exists so no mkdir is needed) so reset()/syncProject never prune them.
function bakeDir(key: string): string {
  return `/wh_bake_${key.replace(/[^A-Za-z0-9_]/g, '_')}`
}

/** Snapshot the current warehouse into the bake cache under `key`. Best-effort (caller may ignore). */
export async function bakeWarehouse(key: string): Promise<void> {
  await query(`EXPORT DATABASE '${bakeDir(key)}' (FORMAT PARQUET)`)
}

/** Restore a previously-baked warehouse for `key` into the (freshly reset) warehouse. Throws if the
 *  bake is missing/corrupt - callers fall back to a full rebuild. */
export async function restoreWarehouse(key: string): Promise<void> {
  await query(`IMPORT DATABASE '${bakeDir(key)}'`)
}

// ── invoking dbt ──────────────────────────────────────────────────────────────
export interface DbtArtifacts {
  /** dbt's overall success flag for the command. */
  success: boolean
  /** Per-node unique_id + status from the programmatic result. */
  nodes: Array<{ node: string; status: string }>
  /** Formatted traceback if dbt raised a handled exception. */
  exception?: string
  /** Formatted traceback for an unexpected error around the invocation. */
  fatal?: string
  /** Parsed target/run_results.json (canonical per-node statuses), or null. */
  runResults: unknown
  /** Parsed target/manifest.json (resource types, names, depends_on), or null. */
  manifest: unknown
  /** dbt's captured stdout/stderr for this command, in order. */
  output: Array<{ line: string; stream: 'out' | 'err' }>
}

/** Run a dbt command and read back its real artifacts. dbt's stdout is captured into `output`; if
 *  `onLine` is given, each line is ALSO forwarded as it arrives so the caller can stream it live. */
export async function invokeDbt(
  args: string[],
  onLine?: (line: string, stream: 'out' | 'err') => void,
): Promise<DbtArtifacts> {
  const engine = await getEngine()
  const buf: Array<{ line: string; stream: 'out' | 'err' }> = []
  captureBuffer = buf
  liveSink = onLine ?? null
  const res = await engine.invoke(args).finally(() => {
    captureBuffer = null
    liveSink = null
  })
  const runResultsRaw = await engine.readArtifact('target/run_results.json')
  const manifestRaw = await engine.readArtifact('target/manifest.json')
  return {
    success: !!res.success,
    nodes: res.nodes ?? [],
    exception: res.exception,
    fatal: res.fatal,
    runResults: runResultsRaw ? JSON.parse(runResultsRaw) : null,
    manifest: manifestRaw ? JSON.parse(manifestRaw) : null,
    output: buf,
  }
}
