/**
 * Lesson-controlled file visibility (D30).
 *
 * The File Explorer shows a SIMPLIFIED view of the project: a lesson can hide infrastructure /
 * scaffolding it doesn't teach yet (e.g. dbt_project.yml, profiles.yml, macros/**) so the tree
 * "feels like a real dbt project" without overwhelming a beginner. This is a TREE-ONLY filter:
 * hidden files still live in the store's `files` map and still sync to the in-Pyodide project, so
 * real dbt sees a complete project and the learner can `ref()` a hidden model.
 *
 * Matching is a tiny glob subset - enough for the patterns lessons need:
 *   - a single star matches within one path segment (no slash)
 *   - a double star matches across segments (any depth)
 *   - a leading "double-star slash" matches zero-or-more leading directories, so a pattern like
 *     "(double-star)/secrets.yml" also matches a root "secrets.yml"
 * Patterns are anchored to the full relative path (implicit ^…$).
 */

/** Always hidden, regardless of lesson - engine scaffolding the learner never edits. */
export const DEFAULT_HIDDEN_GLOBS: readonly string[] = [
  'target/**', // dbt's compiled output + artifacts
  'logs/**', // dbt.log et al.
  '.lab_raw/**', // raw/source CSVs we materialize directly (registerCsv)
]
// NB: `.gitkeep` keepers are deliberately NOT hidden here. The tree builder (FileExplorer.buildTree)
// drops the `.gitkeep` *leaf* but keeps its parent folders - that's how a lesson pre-creates an empty
// folder (e.g. lesson 11's models/staging|intermediate|marts, so files can be moved into them).
// Filtering them out at this layer would delete the folders too, making the placeholders do nothing.

/** Compile one glob to an anchored RegExp. Special regex chars are escaped; `*`/`**` are expanded. */
function globToRegExp(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        // `**` - across segments. `**/` collapses to "zero or more leading dirs".
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?'
          i += 2
        } else {
          re += '.*'
          i += 1
        }
      } else {
        re += '[^/]*' // single `*` - within a segment
      }
    } else if ('\\^$.|?+()[]{}'.includes(c)) {
      re += '\\' + c
    } else {
      re += c
    }
  }
  return new RegExp('^' + re + '$')
}

/** The effective hidden-glob set for a lesson = built-in defaults + the lesson's own patterns. */
export function hiddenGlobsFor(lessonHidden?: string[]): string[] {
  return lessonHidden && lessonHidden.length > 0
    ? [...DEFAULT_HIDDEN_GLOBS, ...lessonHidden]
    : [...DEFAULT_HIDDEN_GLOBS]
}

/**
 * Drop the files whose paths match any hidden glob. Returns a new map; the input is untouched
 * (the store keeps the complete set - only the TREE view is filtered).
 */
export function filterVisibleFiles(
  files: Record<string, string>,
  globs: string[],
): Record<string, string> {
  const regexes = globs.map(globToRegExp)
  const out: Record<string, string> = {}
  for (const [path, content] of Object.entries(files)) {
    if (!regexes.some((r) => r.test(path))) out[path] = content
  }
  return out
}
