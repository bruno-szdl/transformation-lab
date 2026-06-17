export type Materialization = 'view' | 'table' | 'ephemeral' | 'incremental'

export interface CompiledModel {
  name: string
  path: string
  sql: string
  materialization: Materialization
  refs: string[]
  sources: Array<{ source: string; table: string }>
  tags: string[]
  /**
   * For incremental models, the SQL captured from the `{% if is_incremental() %}`
   * block - typically a WHERE-clause filter such as `where created_at > (select
   * max(created_at) from "this")`. The lab still full-rebuilds the table on
   * each run, but on subsequent runs it evaluates this filter as a diagnostic
   * count so learners see how many rows would have been appended.
   */
  incrementalFilter?: string
}

const REF_RE = /\{\{\s*ref\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\}\}/g
const SOURCE_RE = /\{\{\s*source\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)\s*\}\}/g
const CONFIG_RE = /\{\{\s*config\s*\(([\s\S]*?)\)\s*\}\}/g
const MATERIALIZED_RE = /materialized\s*=\s*['"](\w+)['"]/
const TAGS_RE = /\btags\s*=\s*(\[[^\]]*\]|['"][^'"]*['"])/
// Jinja control blocks like {% if is_incremental() %} ... {% endif %} are
// stripped entirely - the lab doesn't execute Jinja, and leaving them in
// would make DuckDB fail to parse the SQL.
const JINJA_BLOCK_RE = /\{%[\s\S]*?%\}/g
// Capture the body of `{% if is_incremental() %} ... {% endif %}` so we can
// re-evaluate it as a diagnostic on subsequent runs of an incremental model.
const INCREMENTAL_IF_RE =
  /\{%\s*if\s+is_incremental\s*\(\s*\)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/i
// {{ this }} is only meaningful during incremental runs. Replace with the
// model's own name so simple self-references don't break.
const THIS_RE = /\{\{\s*this\s*\}\}/g

/** Schema-qualified name that a dbt source("s","t") maps to in DuckDB. */
export function sourceViewName(source: string, table: string): string {
  return `"${source}"."${table}"`
}

function extractTagsFromConfig(inner: string): string[] {
  const m = TAGS_RE.exec(inner)
  if (!m) return []
  const raw = m[1].trim()
  if (raw.startsWith('['))
    return raw.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  return [raw.replace(/^['"]|['"]$/g, '')]
}

function extractTagsFromYamlBlock(block: string): string[] {
  const tags: string[] = []
  // Inline list: tags: [a, b]
  for (const m of block.matchAll(/\btags\s*:\s*\[([^\]]*)\]/g))
    tags.push(...m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean))
  if (tags.length) return tags
  // Block list: tags:\n  - a\n  - b
  for (const m of block.matchAll(/\btags\s*:\s*\n((?:[ \t]+-[ \t]+\S[^\n]*\n?)+)/g))
    for (const line of m[1].split('\n')) {
      const item = /^[ \t]+-[ \t]+(\S+)/.exec(line)
      if (item) tags.push(item[1].replace(/^['"]|['"]$/g, ''))
    }
  return tags
}

function extractTagsFromYaml(content: string): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const modelEntryRe = /^[ \t]{2}-[ \t]+name:[ \t]+(\S+)[ \t]*$/gm
  const entries: Array<{ name: string; start: number }> = []
  let m: RegExpExecArray | null
  while ((m = modelEntryRe.exec(content)) !== null)
    entries.push({ name: m[1], start: m.index })
  for (let i = 0; i < entries.length; i++) {
    const { name, start } = entries[i]
    const end = i + 1 < entries.length ? entries[i + 1].start : content.length
    const tags = extractTagsFromYamlBlock(content.slice(start, end))
    if (tags.length) result.set(name, tags)
  }
  return result
}

export function compileModel(name: string, path: string, raw: string): CompiledModel {
  const refs: string[] = []
  const sources: Array<{ source: string; table: string }> = []
  let materialization: Materialization = 'view'
  const tags: string[] = []

  // Strip line comments before any Jinja parsing so refs/sources inside
  // comments don't create false edges or get compiled into the SQL.
  raw = raw.replace(/--[^\n]*/g, '')

  // Extract config(), then strip all config calls.
  raw.replace(CONFIG_RE, (_m, inner) => {
    const mat = MATERIALIZED_RE.exec(inner)
    if (mat) {
      const v = mat[1]
      if (v === 'view' || v === 'table' || v === 'ephemeral' || v === 'incremental') {
        materialization = v
      }
    }
    tags.push(...extractTagsFromConfig(inner))
    return ''
  })
  let sql = raw.replace(CONFIG_RE, '')

  // Capture the `{% if is_incremental() %} … {% endif %}` body, if any, before
  // we strip Jinja blocks. The captured filter still contains ref()/source()/
  // {{ this }}; we resolve those purely (without re-collecting refs/sources)
  // since the surrounding SQL substitution will have already collected them.
  let incrementalFilter: string | undefined
  const ifMatch = INCREMENTAL_IF_RE.exec(sql)
  if (ifMatch) incrementalFilter = ifMatch[1]

  // Substitutions on the main SQL collect refs/sources as side effects.
  sql = sql
    .replace(REF_RE, (_m, modelName: string) => {
      refs.push(modelName)
      return `"${modelName}"`
    })
    .replace(SOURCE_RE, (_m, src: string, tbl: string) => {
      sources.push({ source: src, table: tbl })
      return sourceViewName(src, tbl)
    })
    .replace(THIS_RE, `"${name}"`)

  if (incrementalFilter !== undefined) {
    incrementalFilter = incrementalFilter
      .replace(REF_RE, (_m, modelName: string) => `"${modelName}"`)
      .replace(SOURCE_RE, (_m, src: string, tbl: string) => sourceViewName(src, tbl))
      .replace(THIS_RE, `"${name}"`)
      .trim()
  }

  // Strip Jinja control blocks ({% ... %}) from the main SQL - they were just
  // captured above where they matter.
  sql = sql.replace(JINJA_BLOCK_RE, '')

  return {
    name,
    path,
    sql: sql.trim(),
    materialization,
    refs,
    sources,
    tags,
    ...(incrementalFilter ? { incrementalFilter } : {}),
  }
}

/** Last path segment, with no trailing slash assumption. */
export function basename(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? path : path.slice(i + 1)
}

export function getModelName(path: string): string {
  return basename(path).replace(/\.sql$/, '')
}

/** Strip both directory and a known extension (e.g. ".csv"). */
export function getFileStem(path: string, ext: string): string {
  return basename(path).replace(new RegExp(`\\${ext}$`), '')
}

export function collectModels(files: Record<string, string>): CompiledModel[] {
  const models = Object.entries(files)
    .filter(([p]) => p.startsWith('models/') && p.endsWith('.sql'))
    .map(([path, content]) => compileModel(getModelName(path), path, content))

  // Merge tags declared in schema YAML files.
  for (const [path, content] of Object.entries(files)) {
    if (path.startsWith('models/') && (path.endsWith('.yml') || path.endsWith('.yaml'))) {
      for (const [modelName, yamlTags] of extractTagsFromYaml(content)) {
        const model = models.find(m => m.name === modelName)
        if (model)
          for (const t of yamlTags)
            if (!model.tags.includes(t)) model.tags.push(t)
      }
    }
  }

  return models
}
