/**
 * Reconstruct the lab's GameState fields from dbt's REAL artifacts.
 *
 * After an invoke, `run_results.json` carries the canonical per-node status and `manifest.json`
 * the resource types / names / dependencies. These pure helpers translate that into the shapes
 * the lesson validators read (ranModels, loadedSeeds, per-model test verdicts), plus a catalog
 * read for observed output columns. Shared by executor.ts (pre-ran models) and runner.ts.
 */
import { query, type DbtArtifacts } from './engine'

interface ManifestNode {
  resource_type?: string
  name?: string
  /** The model a generic/singular test is attached to (dbt 1.10 manifest). */
  attached_node?: string
  depends_on?: { nodes?: string[] }
}
interface RunResult {
  unique_id: string
  status: string
}

function manifestNodes(art: DbtArtifacts): Record<string, ManifestNode> {
  const m = art.manifest as { nodes?: Record<string, ManifestNode> } | null
  return m?.nodes ?? {}
}
function runResults(art: DbtArtifacts): RunResult[] {
  const r = art.runResults as { results?: RunResult[] } | null
  return r?.results ?? []
}
/** Node name - prefer the manifest's declared name; fall back to the last unique_id segment. */
function nameOf(uid: string, nodes: Record<string, ManifestNode>): string {
  return nodes[uid]?.name ?? uid.split('.').pop() ?? uid
}
/** Resource type - prefer the manifest; fall back to the unique_id prefix (model/seed/test/...). */
function typeOf(uid: string, nodes: Record<string, ManifestNode>): string {
  return nodes[uid]?.resource_type ?? uid.split('.')[0]
}

function successfulNamesOfType(art: DbtArtifacts, resourceType: string): string[] {
  const nodes = manifestNodes(art)
  const out: string[] = []
  for (const r of runResults(art)) {
    if (typeOf(r.unique_id, nodes) === resourceType && r.status === 'success') {
      out.push(nameOf(r.unique_id, nodes))
    }
  }
  return out
}

/** Models that materialized successfully in this invocation. */
export function ranModelNames(art: DbtArtifacts): string[] {
  return successfulNamesOfType(art, 'model')
}
/** Snapshots that ran successfully. */
export function ranSnapshotNames(art: DbtArtifacts): string[] {
  return successfulNamesOfType(art, 'snapshot')
}
/** Seeds that loaded successfully. */
export function seededNames(art: DbtArtifacts): string[] {
  return successfulNamesOfType(art, 'seed')
}

/**
 * Per-model test verdicts for the models tested in this run: a model is 'pass' iff every test
 * attached to it passed, else 'fail'. Keyed by the model the test is declared on (attached_node),
 * falling back to the first model in the test's depends_on (covers older manifests).
 */
export function testVerdictsByModel(art: DbtArtifacts): Record<string, 'pass' | 'fail'> {
  const nodes = manifestNodes(art)
  const perModel = new Map<string, { failed: number }>()
  for (const r of runResults(art)) {
    if (typeOf(r.unique_id, nodes) !== 'test') continue
    const node = nodes[r.unique_id]
    let modelName: string | undefined
    if (node?.attached_node) modelName = nameOf(node.attached_node, nodes)
    else {
      const dep = (node?.depends_on?.nodes ?? []).find((n) => typeOf(n, nodes) === 'model')
      if (dep) modelName = nameOf(dep, nodes)
    }
    if (!modelName) continue
    const agg = perModel.get(modelName) ?? { failed: 0 }
    if (r.status !== 'pass') agg.failed++ // 'fail' or 'error' both count as failing
    perModel.set(modelName, agg)
  }
  const out: Record<string, 'pass' | 'fail'> = {}
  for (const [model, agg] of perModel) out[model] = agg.failed === 0 ? 'pass' : 'fail'
  return out
}

/** Observed columns of every table/view in the `main` schema (i.e. model output columns). */
export async function modelColumnsFromCatalog(): Promise<Record<string, string[]>> {
  const res = await query(
    `select table_name, column_name from information_schema.columns ` +
      `where table_schema = 'main' order by table_name, ordinal_position`,
  )
  const out: Record<string, string[]> = {}
  for (const [t, c] of res.rows) {
    const name = String(t)
    ;(out[name] ??= []).push(String(c))
  }
  return out
}
