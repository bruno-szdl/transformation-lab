/**
 * Model planning + materialization - Phase-1b adapter.
 *
 * `plan()` stays a pure, file-derived topological sort (used to resolve selectors and order
 * pre-ran models). `previewModel()` reads a built model back from the warehouse for `dbt show`.
 * `materializeModels()` no longer simulates anything - it asks REAL dbt to `run` the given models
 * and reports which succeeded (used by the store to silently pre-build a lesson's starting models).
 */
import { collectModels, type CompiledModel } from './compiler'
import { query, invokeDbt, syncProjectFiles, type QueryResult } from './engine'
import { ranModelNames, modelColumnsFromCatalog } from './artifacts'

export type { QueryResult }
// Re-exported so the store can sync editor files into the dbt project without importing engine.ts.
export { syncProjectFiles }

export interface ModelOutcome {
  name: string
  materialization: 'view' | 'table' | 'ephemeral' | 'incremental'
  passed: boolean
  elapsed: number
  rowCount: number
  columns: string[]
  error?: string
  compiledSql: string
}

export interface ExecutionPlan {
  all: CompiledModel[]
  sorted: CompiledModel[]
  byName: Map<string, CompiledModel>
}

/** Topologically sort models by their ref() edges (dependencies first). File-derived, no dbt. */
export function plan(files: Record<string, string>): ExecutionPlan {
  const all = collectModels(files)
  const byName = new Map(all.map((m) => [m.name, m]))
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
  for (const m of all) visit(m.name)
  return { all, sorted, byName }
}

/** Read a built model's rows back from the warehouse (for `dbt show`). */
export async function previewModel(name: string, limit = 20): Promise<QueryResult> {
  return query(`SELECT * FROM "${name}" LIMIT ${limit}`)
}

/**
 * Silently build the given models with real dbt (`dbt run --select ...`). Returns an outcome per
 * requested model: whether dbt reported it successful, plus its observed output columns. Assumes
 * the project files + any raw/source tables are already in place (the store sets those up first).
 */
export async function materializeModels(models: CompiledModel[]): Promise<ModelOutcome[]> {
  if (models.length === 0) return []
  const art = await invokeDbt(['run', '--select', ...models.map((m) => m.name)])
  const ok = new Set(ranModelNames(art))
  const cols = await modelColumnsFromCatalog()
  return models.map((m) => ({
    name: m.name,
    materialization: m.materialization,
    passed: ok.has(m.name),
    elapsed: 0,
    rowCount: 0,
    columns: cols[m.name] ?? [],
    compiledSql: '',
  }))
}
