import { exec, runQuery, type QueryResult } from './duckdb'
import { collectModels, type CompiledModel } from './compiler'
import { errorMessage } from './errors'

export interface ModelOutcome {
  name: string
  materialization: 'view' | 'table' | 'ephemeral' | 'incremental'
  passed: boolean
  elapsed: number
  rowCount: number
  columns: string[]
  error?: string
  compiledSql: string
  /** True when the model was skipped (ephemeral). */
  skipped?: boolean
  /**
   * For incremental models: the number of rows that the user's
   * `is_incremental()` filter would have appended on this run, evaluated
   * against the prior incarnation of the table. Undefined on the first run
   * (no prior table to diff against) or when the model isn't incremental.
   */
  incrementalAppendedRows?: number
  /**
   * Names of upstream ephemeral models that were inlined as CTEs into this
   * model's compiled SQL. Empty for models with no ephemeral upstreams.
   */
  inlinedEphemerals?: string[]
}

export interface ExecutionPlan {
  all: CompiledModel[]
  sorted: CompiledModel[]
  byName: Map<string, CompiledModel>
}

export function plan(files: Record<string, string>): ExecutionPlan {
  const raw = collectModels(files)
  const rawByName = new Map(raw.map((m) => [m.name, m]))
  const inlined = inlineEphemeralCtes(raw, rawByName)
  const byName = new Map(inlined.map((m) => [m.name, m]))
  const visited = new Set<string>()
  const sorted: CompiledModel[] = []
  function visit(name: string) {
    if (visited.has(name)) return
    visited.add(name)
    const node = byName.get(name)
    if (!node) return
    for (const r of node.refs) visit(r)
    sorted.push(node)
  }
  for (const m of inlined) visit(m.name)
  return { all: inlined, sorted, byName }
}

/**
 * For each non-ephemeral model, collect all ephemeral models it depends on
 * (recursively) and prepend them as CTEs. ref("eph") already compiled to
 * `"eph"` in the SQL, which now resolves to the CTE name rather than a DB
 * object. Ephemeral models themselves keep their compiled SQL unchanged —
 * they're never materialized, only inlined into downstream models.
 */
function inlineEphemeralCtes(
  all: CompiledModel[],
  byName: Map<string, CompiledModel>,
): CompiledModel[] {
  const ephNames = new Set(
    all.filter((m) => m.materialization === 'ephemeral').map((m) => m.name),
  )
  if (ephNames.size === 0) return all

  // Return upstream ephemerals in dependency-first order.
  function collectEphDeps(start: string): string[] {
    const order: string[] = []
    const seen = new Set<string>()
    function walk(name: string) {
      const node = byName.get(name)
      if (!node) return
      for (const r of node.refs) {
        if (ephNames.has(r) && !seen.has(r)) {
          seen.add(r)
          walk(r)
          order.push(r)
        } else if (!ephNames.has(r)) {
          // Walk non-ephemeral refs too, because an ephemeral ref may hide
          // behind a chain of non-ephemeral refs? No — dbt only inlines
          // direct ephemeral dependencies. Stop here.
        }
      }
    }
    walk(start)
    return order
  }

  return all.map((m) => {
    if (m.materialization === 'ephemeral') return m
    const ephs = collectEphDeps(m.name)
    if (ephs.length === 0) return m
    const ctes = ephs
      .map((name) => `"${name}" AS (\n${byName.get(name)!.sql}\n)`)
      .join(',\n')
    return { ...m, sql: `WITH ${ctes}\n${m.sql}`, _inlinedEphemerals: ephs } as CompiledModel & { _inlinedEphemerals: string[] }
  })
}

/** Execute each model as a DuckDB view (or table). Order is given by caller. */
export async function materializeModels(models: CompiledModel[]): Promise<ModelOutcome[]> {
  const outcomes: ModelOutcome[] = []
  for (const m of models) {
    const start = performance.now()
    if (m.materialization === 'ephemeral') {
      outcomes.push({
        name: m.name,
        materialization: 'ephemeral',
        passed: true,
        skipped: true,
        elapsed: 0,
        rowCount: 0,
        columns: [],
        compiledSql: m.sql,
      })
      continue
    }
    try {
      // For incremental models on a re-run, evaluate the user's filter against
      // the prior table snapshot to surface a real "would-have-appended" count.
      // Run before the DROP so the filter's `(select max(...) from "this")`
      // sub-queries see the existing data.
      let incrementalAppendedRows: number | undefined
      if (m.materialization === 'incremental' && m.incrementalFilter) {
        try {
          const exists = await runQuery(
            `SELECT 1 FROM information_schema.tables WHERE table_name = '${m.name}' LIMIT 1`,
          )
          if (exists.rows.length > 0) {
            const diag = await runQuery(
              `SELECT COUNT(*) FROM (${m.sql}) AS _diag ${m.incrementalFilter}`,
            )
            incrementalAppendedRows = Number(diag.rows[0]?.[0] ?? 0)
          }
        } catch {
          // Diagnostic is best-effort. If the filter doesn't evaluate cleanly
          // (e.g. the user's WHERE clause has a typo) we silently skip it and
          // proceed with the normal full rebuild.
        }
      }

      // IF EXISTS only protects against "not found" — DuckDB still errors if
      // the object exists but is the other kind (e.g. DROP TABLE on a view).
      // Try both and swallow the type-mismatch error.
      try { await exec(`DROP VIEW IF EXISTS "${m.name}" CASCADE`) } catch { /* not a view */ }
      try { await exec(`DROP TABLE IF EXISTS "${m.name}" CASCADE`) } catch { /* not a table */ }
      // Incremental is simulated as a full table rebuild in ae-quest.
      const keyword = m.materialization === 'table' || m.materialization === 'incremental' ? 'TABLE' : 'VIEW'
      await exec(`CREATE ${keyword} "${m.name}" AS ${m.sql}`)
      const preview = await runQuery(`SELECT * FROM "${m.name}" LIMIT 0`)
      const count = await runQuery(`SELECT COUNT(*) AS c FROM "${m.name}"`)
      const rowCount = Number(count.rows[0]?.[0] ?? 0)
      const inlinedEphemerals = (m as CompiledModel & { _inlinedEphemerals?: string[] })._inlinedEphemerals
      outcomes.push({
        name: m.name,
        materialization: m.materialization,
        passed: true,
        elapsed: (performance.now() - start) / 1000,
        rowCount,
        columns: preview.columns,
        compiledSql: m.sql,
        ...(incrementalAppendedRows !== undefined ? { incrementalAppendedRows } : {}),
        ...(inlinedEphemerals && inlinedEphemerals.length ? { inlinedEphemerals } : {}),
      })
    } catch (e) {
      outcomes.push({
        name: m.name,
        materialization: m.materialization,
        passed: false,
        elapsed: (performance.now() - start) / 1000,
        rowCount: 0,
        columns: [],
        error: errorMessage(e),
        compiledSql: m.sql,
      })
      // Stop on the first failure to mirror dbt's default behaviour.
      break
    }
  }
  return outcomes
}

export async function previewModel(name: string, limit = 20): Promise<QueryResult> {
  return runQuery(`SELECT * FROM "${name}" LIMIT ${limit}`)
}
