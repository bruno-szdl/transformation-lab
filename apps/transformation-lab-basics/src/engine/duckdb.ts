/**
 * Warehouse access - Phase-1b adapter.
 *
 * Originally this module embedded a DuckDB-wasm worker and the lab's simulated executor ran SQL
 * against it. Now the warehouse is the single DuckDB file that REAL dbt-core builds into, living
 * inside the engine's Pyodide FS. Every query here runs against THAT warehouse via the engine's
 * `query()` capability, so the catalog (DatabaseExplorer), `dbt show` previews, and the lesson's
 * pre-existing raw/source tables all see exactly what dbt produced.
 *
 * The export surface (runQuery / exec / registerCsv / resetDb / QueryResult) is unchanged so the
 * components and store keep compiling against it.
 */
import { query, resetProject, writeProjectFile, rawSeedPath, type QueryResult } from './engine'

export type { QueryResult }

/** Run a SELECT and return columns + rows. */
export async function runQuery(sql: string): Promise<QueryResult> {
  return query(sql)
}

/** Run a statement for its side effect (DDL/DML); result is ignored. */
export async function exec(sql: string): Promise<void> {
  await query(sql)
}

/**
 * Materialize a lesson's pre-existing raw/source table directly in the warehouse.
 *
 * These are NOT dbt seeds - they're the upstream tables a lesson assumes already exist (e.g.
 * `raw.customers`), which the learner's models read from. We create them by writing the CSV into
 * the project FS and `CREATE TABLE ... AS SELECT * FROM read_csv_auto(...)`, matching the old
 * naming: `source.table` → schema `source`, table `table`; a bare name → the `main` schema.
 */
export async function registerCsv(name: string, csv: string): Promise<void> {
  const dot = name.indexOf('.')
  const schema = dot !== -1 ? name.slice(0, dot) : 'main'
  const table = dot !== -1 ? name.slice(dot + 1) : name
  const rel = rawSeedPath(name)
  await writeProjectFile(rel, csv.trim())
  if (schema !== 'main') await exec(`CREATE SCHEMA IF NOT EXISTS "${schema}"`)
  await exec(
    `CREATE OR REPLACE TABLE "${schema}"."${table}" AS ` +
      `SELECT * FROM read_csv_auto('/project/${rel}', header=true)`,
  )
}

/** Reset the warehouse + project for a fresh lesson (delegates to the engine reset). */
export async function resetDb(): Promise<void> {
  await resetProject()
}
