import type { GameState } from './types'
import { parseTests, type TestKind } from './tests'
import { getModelName } from './compiler'

/** Remove SQL line comments (--) and block comments (/* *\/) from content. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/--[^\n]*/g, '')            // line comments
}

function findModelPath(files: Record<string, string>, name: string): string | undefined {
  return Object.keys(files).find(
    (p) => p.startsWith('models/') && p.endsWith('.sql') && getModelName(p) === name,
  )
}

export function hasModel(state: GameState, name: string): boolean {
  return Boolean(findModelPath(state.files, name))
}

export function modelRefs(state: GameState, modelName: string, refName: string): boolean {
  const path = findModelPath(state.files, modelName)
  if (!path) return false
  const content = stripSqlComments(state.files[path] ?? '')
  const re = /\{\{\s*ref\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\}\}/g
  let m
  while ((m = re.exec(content))) if (m[1] === refName) return true
  return false
}

export function modelRan(state: GameState, name: string): boolean {
  return state.ranModels.has(name)
}

/** True if the learner ran `dbt show --select <name>` for this model in the current level. */
export function modelShown(state: GameState, name: string): boolean {
  return state.shownModels.has(name)
}

export function testPassed(
  state: GameState,
  modelName: string,
  _testName?: string,
): boolean {
  return state.testResults[modelName] === 'pass'
}

export function sourceDefined(
  state: GameState,
  sourceName: string,
  tableName: string,
): boolean {
  for (const [path, content] of Object.entries(state.files)) {
    if (!path.endsWith('.yml') && !path.endsWith('.yaml')) continue
    if (content.includes(`name: ${sourceName}`) && content.includes(`name: ${tableName}`))
      return true
  }
  return false
}

export function modelMaterialization(
  state: GameState,
  name: string,
  type: string,
): boolean {
  const path = findModelPath(state.files, name)
  if (!path) return false
  const content = stripSqlComments(state.files[path] ?? '')
  const re = /\{\{\s*config\s*\([^)]*materialized\s*=\s*['"](\w+)['"]/
  const m = re.exec(content)
  if (m) return m[1] === type
  return type === 'view'
}

/** True if the named model ran successfully and its output columns include every expected name. */
export function outputColumnsInclude(
  state: GameState,
  name: string,
  expected: string[],
): boolean {
  const cols = state.modelColumns[name]
  if (!cols) return false
  const lower = new Set(cols.map((c) => c.toLowerCase()))
  return expected.every((c) => lower.has(c.toLowerCase()))
}

/** True if model `to` references model `from` via ref() in its SQL. */
export function lineageHasEdge(state: GameState, from: string, to: string): boolean {
  return modelRefs(state, to, from)
}

/** True if model `to` sources directly from `source.table` via source(). */
export function lineageHasSourceEdge(
  state: GameState,
  sourceName: string,
  tableName: string,
  to: string,
): boolean {
  const path = findModelPath(state.files, to)
  if (!path) return false
  const content = stripSqlComments(state.files[path] ?? '')
  const re = /\{\{\s*source\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)\s*\}\}/g
  let m
  while ((m = re.exec(content))) {
    if (m[1] === sourceName && m[2] === tableName) return true
  }
  return false
}

/** True if every expected test kind is declared in YAML for the model (any column). */
export function testDefinitionsInclude(
  state: GameState,
  model: string,
  expectedKinds: TestKind[],
): boolean {
  const defs = parseTests(state.files, new Set([model]))
  const have = new Set(defs.filter((d) => d.model === model).map((d) => d.kind))
  return expectedKinds.every((k) => have.has(k))
}

/** True if every test declared for the model has been run and passed. */
export function allTestsPass(state: GameState, model: string): boolean {
  const defs = parseTests(state.files, new Set([model]))
  const hasTests = defs.some((d) => d.model === model)
  if (!hasTests) return false
  return state.testResults[model] === 'pass'
}

export function buildSucceeded(state: GameState): boolean {
  return state.buildSucceeded
}

export function seedLoaded(state: GameState, seedName: string): boolean {
  return state.loadedSeeds.has(seedName)
}

/** True if the model's SQL (comments stripped) matches the given regex (case-insensitive). */
export function modelSqlMatches(
  state: GameState,
  name: string,
  pattern: RegExp,
): boolean {
  const path = findModelPath(state.files, name)
  if (!path) return false
  const content = stripSqlComments(state.files[path] ?? '')
  const flags = pattern.flags.includes('i') ? pattern.flags : pattern.flags + 'i'
  const re = new RegExp(pattern.source, flags)
  return re.test(content)
}

/** True if a file at `path` exists and its (comments-stripped where applicable)
 *  content matches the regex. Works for any file type. */
export function fileMatches(
  state: GameState,
  path: string,
  pattern: RegExp,
): boolean {
  const content = state.files[path]
  if (content == null) return false
  return pattern.test(content)
}

