import { getModelName } from './compiler'

export type NodeLayer = 'source' | 'staging' | 'intermediate' | 'mart'

export interface DagNode {
  id: string
  label: string
  layer: NodeLayer
  hasCycle: boolean
}

export interface DagEdge {
  id: string
  source: string
  target: string
}

// ── helpers ──────────────────────────────────────────────────────────────────

function getModelLayer(name: string, path: string): Exclude<NodeLayer, 'source'> {
  if (name.startsWith('stg_') || path.includes('/staging/')) return 'staging'
  if (name.startsWith('int_') || path.includes('/intermediate/')) return 'intermediate'
  return 'mart'
}

function stripLineComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '')
}

function extractRefs(sql: string): string[] {
  const out: string[] = []
  const re = /\{\{\s*ref\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\}\}/g
  let m
  while ((m = re.exec(stripLineComments(sql)))) out.push(m[1])
  return out
}

function extractSourceCalls(sql: string): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const re = /\{\{\s*source\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)\s*\}\}/g
  let m
  while ((m = re.exec(stripLineComments(sql)))) out.push([m[1], m[2]])
  return out
}

// ── schema.yml source parsing ─────────────────────────────────────────────────

function parseSchemaYmlSources(content: string): Array<{ id: string; label: string }> {
  const result: Array<{ id: string; label: string }> = []
  const lines = content.split('\n')

  let inSources = false
  let currentSource = ''
  let inTables = false
  let sourceIndent = -1
  let tablesIndent = -1

  for (const raw of lines) {
    const s = raw.trim()
    if (!s || s.startsWith('#')) continue
    const indent = raw.search(/\S/)

    if (indent === 0) {
      inSources = s === 'sources:'
      currentSource = ''
      inTables = false
      sourceIndent = -1
      tablesIndent = -1
      continue
    }

    if (!inSources) continue

    if (s === 'tables:') {
      inTables = !!currentSource
      tablesIndent = indent
      continue
    }

    if (s.startsWith('- name:')) {
      const name = s.replace(/^-\s*name:\s*/, '').trim()
      if (!name) continue

      if (!inTables) {
        // Source-level entry
        if (sourceIndent === -1) sourceIndent = indent
        if (indent <= sourceIndent) {
          currentSource = name
          inTables = false
          tablesIndent = -1
        }
      } else {
        // We're in a tables: block - but check indent hasn't gone back up
        if (indent <= tablesIndent) {
          // Actually a new source item, not a table
          if (sourceIndent !== -1 && indent <= sourceIndent) {
            currentSource = name
            inTables = false
            tablesIndent = -1
          }
        } else {
          // Table item
          if (currentSource) {
            result.push({ id: `${currentSource}.${name}`, label: `${currentSource}.${name}` })
          }
        }
      }
    }
  }

  return result
}

// ── cycle detection ───────────────────────────────────────────────────────────

function detectCycleNodes(adjacency: Map<string, string[]>): Set<string> {
  const cycleNodes = new Set<string>()
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const stack: string[] = []

  function dfs(id: string): void {
    visited.add(id)
    inStack.add(id)
    stack.push(id)

    for (const neighbor of adjacency.get(id) ?? []) {
      if (inStack.has(neighbor)) {
        // Found a back edge - mark all nodes from neighbor to current as cycle members
        const idx = stack.indexOf(neighbor)
        for (let i = idx; i < stack.length; i++) cycleNodes.add(stack[i])
      } else if (!visited.has(neighbor)) {
        dfs(neighbor)
      }
    }

    stack.pop()
    inStack.delete(id)
  }

  for (const id of adjacency.keys()) {
    if (!visited.has(id)) dfs(id)
  }

  return cycleNodes
}

// ── main ──────────────────────────────────────────────────────────────────────

export function buildDag(files: Record<string, string>): { nodes: DagNode[]; edges: DagEdge[] } {
  const nodesMap = new Map<string, DagNode>()
  const edges: DagEdge[] = []
  const edgeSet = new Set<string>()

  function addEdge(src: string, tgt: string) {
    const id = `${src}→${tgt}`
    if (edgeSet.has(id)) return
    edgeSet.add(id)
    edges.push({ id, source: src, target: tgt })
  }

  function ensureSource(id: string, label: string) {
    if (!nodesMap.has(id)) {
      nodesMap.set(id, { id, label, layer: 'source', hasCycle: false })
    }
  }

  // 1. Collect declared sources from any models/*.yml file
  for (const [path, content] of Object.entries(files)) {
    if (!path.startsWith('models/')) continue
    if (!path.endsWith('.yml') && !path.endsWith('.yaml')) continue
    for (const { id, label } of parseSchemaYmlSources(content)) {
      ensureSource(id, label)
    }
  }

  // 2. Parse model SQL files
  const modelFiles = Object.entries(files).filter(
    ([p]) => p.startsWith('models/') && p.endsWith('.sql'),
  )
  // 2a. Parse snapshot files - same lineage semantics as a model.
  const snapshotFiles = Object.entries(files).filter(
    ([p]) => p.startsWith('snapshots/') && p.endsWith('.sql'),
  )
  const SNAPSHOT_NAME_RE = /\{%\s*snapshot\s+([A-Za-z_][A-Za-z0-9_]*)\s*%\}/
  for (const [, content] of snapshotFiles) {
    const m = SNAPSHOT_NAME_RE.exec(content)
    if (!m) continue
    const name = m[1]
    if (!nodesMap.has(name)) {
      nodesMap.set(name, { id: name, label: name, layer: 'intermediate', hasCycle: false })
    }
    for (const ref of extractRefs(content)) {
      if (!nodesMap.has(ref)) {
        nodesMap.set(ref, { id: ref, label: ref, layer: getModelLayer(ref, ''), hasCycle: false })
      }
      addEdge(ref, name)
    }
    for (const [src, table] of extractSourceCalls(content)) {
      const srcId = `${src}.${table}`
      ensureSource(srcId, `${src}.${table}`)
      addEdge(srcId, name)
    }
  }

  for (const [path, content] of modelFiles) {
    const name = getModelName(path)
    const layer = getModelLayer(name, path)
    if (!nodesMap.has(name)) {
      nodesMap.set(name, { id: name, label: name, layer, hasCycle: false })
    }

    // ref() edges
    for (const ref of extractRefs(content)) {
      // Ensure the ref target exists (might not have a file yet)
      if (!nodesMap.has(ref)) {
        const refLayer = getModelLayer(ref, '')
        nodesMap.set(ref, { id: ref, label: ref, layer: refLayer, hasCycle: false })
      }
      addEdge(ref, name)
    }

    // source() edges - auto-create source node if not declared in schema.yml
    for (const [src, table] of extractSourceCalls(content)) {
      const srcId = `${src}.${table}`
      ensureSource(srcId, `${src}.${table}`)
      addEdge(srcId, name)
    }
  }

  // 3. Detect cycles (only among model nodes, not source nodes)
  const modelIds = [...nodesMap.keys()].filter((id) => nodesMap.get(id)!.layer !== 'source')
  const adjacency = new Map<string, string[]>()
  for (const id of modelIds) adjacency.set(id, [])
  for (const e of edges) {
    if (adjacency.has(e.source) && adjacency.has(e.target)) {
      adjacency.get(e.source)!.push(e.target)
    }
  }
  const cycleNodes = detectCycleNodes(adjacency)

  // 4. Apply cycle flag
  const nodes = [...nodesMap.values()].map((n) => ({
    ...n,
    hasCycle: cycleNodes.has(n.id),
  }))

  return { nodes, edges }
}
