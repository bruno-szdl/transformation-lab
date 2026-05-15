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

/** True if the learner ran `dbt compile` covering this model in the current lesson. */
export function modelCompiled(state: GameState, name: string): boolean {
  return state.compiledModels.has(name)
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

/** True if a relationships test on `model.column` points at `toModel.field`. */
export function relationshipTestPoints(
  state: GameState,
  model: string,
  column: string,
  toModel: string,
  field: string,
): boolean {
  const defs = parseTests(state.files, new Set([model]))
  return defs.some(
    (d) =>
      d.model === model &&
      d.column === column &&
      d.kind === 'relationships' &&
      d.to === toModel &&
      d.field === field,
  )
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

/** True if the model has a test that has been run and failed. */
export function testFailed(state: GameState, model: string): boolean {
  return state.testResults[model] === 'fail'
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

/** True if the most recent run/build selected EXACTLY the given model names
 *  (set equality) — i.e. the learner targeted just those, not the whole project. */
export function onlyModelsRan(state: GameState, names: string[]): boolean {
  const lr = state.lastRun
  if (!lr || (lr.command !== 'run' && lr.command !== 'build')) return false
  if (!lr.usedSelect) return false
  const got = new Set(lr.selectedModels)
  return got.size === names.length && names.every((n) => got.has(n))
}

/** True if the most recent command used `--select` and its resolved set
 *  contains every given model name. */
export function lastRunSelected(state: GameState, names: string[]): boolean {
  const lr = state.lastRun
  if (!lr || !lr.usedSelect) return false
  const got = new Set(lr.selectedModels)
  return names.every((n) => got.has(n))
}

/** True if the most recent command used a `model+` (downstream) graph operator.
 *  When `model` is given, also requires that model to be in the selection. */
export function usedDownstreamOperator(state: GameState, model?: string): boolean {
  const lr = state.lastRun
  if (!lr || !lr.usedDownstream) return false
  return model ? lr.selectedModels.includes(model) : true
}

/** True if the most recent command used a `+model` (upstream) graph operator.
 *  When `model` is given, also requires that model to be in the selection. */
export function usedUpstreamOperator(state: GameState, model?: string): boolean {
  const lr = state.lastRun
  if (!lr || !lr.usedUpstream) return false
  return model ? lr.selectedModels.includes(model) : true
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

