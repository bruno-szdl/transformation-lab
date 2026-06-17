import { load } from 'js-yaml'

export type TestKind = 'not_null' | 'unique' | 'accepted_values' | 'relationships'

export interface TestDef {
  id: string
  kind: TestKind
  model: string
  column: string
  /** For accepted_values: the list of allowed string values. */
  values?: string[]
  /** For relationships: the target model name (the result of `ref(...)`). */
  to?: string
  /** For relationships: the column to look up in the target model. */
  field?: string
}

type YamlMap = Record<string, unknown>

/**
 * Parse `schema.yml` style test declarations using a real YAML parser.
 * Supports the four generic tests: `not_null`, `unique`, `accepted_values`,
 * and `relationships`. Both the `arguments:` wrapper form and the direct form
 * are accepted (dbt supports both).
 *
 * Because we use js-yaml, indentation must be structurally valid YAML -
 * wrong indentation produces a different parse tree and the test won't be
 * detected, which is the correct behaviour for a learning tool.
 */
export function parseTests(files: Record<string, string>, modelNames: Set<string>): TestDef[] {
  const tests: TestDef[] = []

  for (const [path, content] of Object.entries(files)) {
    if (!path.startsWith('models/')) continue
    if (!path.endsWith('.yml') && !path.endsWith('.yaml')) continue

    let parsed: unknown
    try {
      parsed = load(content)
    } catch {
      continue
    }

    if (!parsed || typeof parsed !== 'object') continue
    const root = parsed as YamlMap
    const models = root['models']
    if (!Array.isArray(models)) continue

    for (const model of models) {
      if (!model || typeof model !== 'object') continue
      const m = model as YamlMap
      const modelName = typeof m['name'] === 'string' ? m['name'] : ''
      if (!modelName || !modelNames.has(modelName)) continue

      const columns = m['columns']
      if (!Array.isArray(columns)) continue

      for (const col of columns) {
        if (!col || typeof col !== 'object') continue
        const c = col as YamlMap
        const columnName = typeof c['name'] === 'string' ? c['name'] : ''
        if (!columnName) continue

        const dataTests = c['data_tests']
        if (!Array.isArray(dataTests)) continue

        for (const test of dataTests) {
          if (typeof test === 'string') {
            if (test === 'not_null' || test === 'unique') {
              tests.push({
                id: `${test}_${modelName}_${columnName}`,
                kind: test,
                model: modelName,
                column: columnName,
              })
            }
            continue
          }

          if (!test || typeof test !== 'object') continue
          const t = test as YamlMap

          if ('accepted_values' in t) {
            const av = t['accepted_values']
            if (av && typeof av === 'object') {
              const avMap = av as YamlMap
              // If arguments: key exists it must be an object - a null arguments:
              // means the student indented values: at the wrong level.
              const hasArgs = 'arguments' in avMap
              const argsObj = hasArgs && avMap['arguments'] && typeof avMap['arguments'] === 'object'
                ? avMap['arguments'] as YamlMap
                : null
              if (hasArgs && !argsObj) continue  // arguments: present but malformed
              const src = argsObj ?? avMap
              const values = src['values']
              if (Array.isArray(values) && values.length > 0) {
                tests.push({
                  id: `accepted_values_${modelName}_${columnName}`,
                  kind: 'accepted_values',
                  model: modelName,
                  column: columnName,
                  values: values.map(String),
                })
              }
            }
          }

          if ('relationships' in t) {
            const rel = t['relationships']
            if (rel && typeof rel === 'object') {
              const relMap = rel as YamlMap
              const hasArgs = 'arguments' in relMap
              const argsObj = hasArgs && relMap['arguments'] && typeof relMap['arguments'] === 'object'
                ? relMap['arguments'] as YamlMap
                : null
              if (hasArgs && !argsObj) continue  // arguments: present but malformed
              const src = argsObj ?? relMap
              const toRaw = typeof src['to'] === 'string' ? src['to'] : ''
              const field = src['field'] != null ? String(src['field']) : ''
              const toMatch = toRaw.match(/ref\s*\(\s*['"]([^'"]+)['"]\s*\)/)
              const to = toMatch ? toMatch[1] : ''
              if (to && field) {
                tests.push({
                  id: `relationships_${modelName}_${columnName}`,
                  kind: 'relationships',
                  model: modelName,
                  column: columnName,
                  to,
                  field,
                })
              }
            }
          }
        }
      }
    }
  }

  // De-duplicate by id (last write wins).
  const seen = new Map<string, TestDef>()
  for (const t of tests) seen.set(t.id, t)
  return [...seen.values()]
}

export type YamlDiagnosticCode =
  | 'syntax'
  | 'acceptedValuesMissingConfig'
  | 'acceptedValuesWrongIndent'
  | 'relationshipsMissingConfig'
  | 'relationshipsWrongIndent'

export interface YamlDiagnostic {
  path: string
  code: YamlDiagnosticCode
  /** Column name involved (structural errors). */
  column?: string
  /** Raw js-yaml error message (syntax errors). */
  raw?: string
}

/**
 * Returns diagnostics (syntax errors + structural mistakes) for all YAML files
 * in `files`. Structural checks catch common dbt indentation mistakes that are
 * valid YAML but represent the wrong schema structure (e.g. `arguments:` null
 * because `values:` / `to:` / `field:` were indented at the wrong level).
 *
 * Returns structured codes - callers translate via i18n or
 * `formatYamlDiagnostic` for English output (terminal).
 */
export function getYamlDiagnostics(files: Record<string, string>): YamlDiagnostic[] {
  const out: YamlDiagnostic[] = []

  for (const [path, content] of Object.entries(files)) {
    if (!path.startsWith('models/')) continue
    if (!path.endsWith('.yml') && !path.endsWith('.yaml')) continue

    let parsed: unknown
    try {
      parsed = load(content)
    } catch (e) {
      out.push({ path, code: 'syntax', raw: e instanceof Error ? e.message.split('\n')[0] : String(e) })
      continue
    }

    if (!parsed || typeof parsed !== 'object') continue
    const models = (parsed as YamlMap)['models']
    if (!Array.isArray(models)) continue

    for (const model of models) {
      if (!model || typeof model !== 'object') continue
      const columns = (model as YamlMap)['columns']
      if (!Array.isArray(columns)) continue

      for (const col of columns) {
        if (!col || typeof col !== 'object') continue
        const c = col as YamlMap
        const colName = typeof c['name'] === 'string' ? c['name'] : '?'
        const dataTests = c['data_tests']
        if (!Array.isArray(dataTests)) continue

        for (const test of dataTests) {
          if (!test || typeof test !== 'object') continue
          const t = test as YamlMap

          if ('accepted_values' in t) {
            const av = t['accepted_values']
            if (!av || typeof av !== 'object') {
              out.push({ path, code: 'acceptedValuesMissingConfig', column: colName })
              continue
            }
            const avMap = av as YamlMap
            if ('arguments' in avMap && (!avMap['arguments'] || typeof avMap['arguments'] !== 'object')) {
              out.push({ path, code: 'acceptedValuesWrongIndent', column: colName })
            }
          }

          if ('relationships' in t) {
            const rel = t['relationships']
            if (!rel || typeof rel !== 'object') {
              out.push({ path, code: 'relationshipsMissingConfig', column: colName })
              continue
            }
            const relMap = rel as YamlMap
            if ('arguments' in relMap && (!relMap['arguments'] || typeof relMap['arguments'] !== 'object')) {
              out.push({ path, code: 'relationshipsWrongIndent', column: colName })
            }
          }
        }
      }
    }
  }

  return out
}

/** English formatter for terminal output (engine layer - not i18n). */
export function formatYamlDiagnostic(d: YamlDiagnostic): string {
  switch (d.code) {
    case 'syntax':
      return d.raw ?? 'YAML syntax error'
    case 'acceptedValuesMissingConfig':
      return `Column "${d.column}": accepted_values is missing its configuration block - check indentation.`
    case 'acceptedValuesWrongIndent':
      return `Column "${d.column}": values: must be indented inside arguments:, not at the same level.`
    case 'relationshipsMissingConfig':
      return `Column "${d.column}": relationships is missing its configuration block - check indentation.`
    case 'relationshipsWrongIndent':
      return `Column "${d.column}": to: and field: must be indented inside arguments:, not at the same level.`
  }
}
