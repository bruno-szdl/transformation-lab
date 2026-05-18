# Lesson system architecture

How the Analytics Engineering Quest curriculum is structured in code.

## Curriculum overview

**15 lessons (IDs 0–14)** live at `src/lessons/lesson00.ts–lesson14.ts`, registered in `src/lessons/index.ts`.

- **Lesson 0**: Introduction (landing page only)
- **Lessons 1–14**: Progressive hands-on tutorials

Topic progression:
1. Your first dbt model
2. ref() and the DAG
3. Multi-step pipelines
4. Materializations: view vs table
5. Selecting models (--select, -s flags)
6. Sources (source() declarations)
7. Seeds (CSV loading)
8. Data tests: not_null & unique
9. Relationships & accepted_values
10. Documentation (descriptions in YAML)
11. Project structure: staging/intermediate/marts
12. Selecting subsets: unions & graph operators
13. Custom (singular) tests
14. Putting it all together: dbt build

## Lesson interface (`src/engine/types.ts`)

- `id` — numeric, 0–14. Matches lesson order.
- `title` — short lesson name.
- `concept` — markdown-formatted explanation. Supports `**bold**`, `` `code` ``, fenced blocks, lists.
- `initialFiles` — starter files the learner sees (e.g., `{ 'models/foo.sql': '...' }`).
- `openFiles` — which file tabs auto-open on load (optional).
- `seeds` — CSV data keyed by warehouse table name (e.g., `{ 'raw.customers': CSV_STRING }`). Auto-registered into DuckDB on lesson load.
- `preRanModels` — models to silently materialize on load so the learner starts in a known state (optional).
- `panels` — which context panels to show (`['files', 'warehouse', 'lineage']`). Once unlocked, panels stay visible. Omit or pass `ALL_PANELS` to show all.
- `tasks` — array of `{ id, prompt, hint?, validate(state) => boolean }`. Each task is a learner goal with a validation function.
- `quiz` — optional end-of-lesson multiple-choice: `{ question, options: [a, b, c, d], correctIndex, explanation }`.
- `goal` — optional `{ dagShape: { nodes, edges } }` to show a target DAG shape.
- `furtherReading` — optional links to dbt docs: `[{ label, url }, ...]`.

## Engine pipeline

1. **commandParser.ts** — parses `dbt <subcommand>` and selector syntax (`+model`, `tag:`, etc.)
2. **compiler.ts** — extracts `ref()`, `source()`, `config()` from SQL/YAML
3. **dagBuilder.ts** — builds node/edge graph; infers layers (staging/intermediate/mart) from names
4. **executor.ts** — compiles SQL, handles VIEW vs TABLE materialization, runs against DuckDB
5. **runner.ts** — dispatches `dbt run/test/build/show/compile/seed/snapshot`, formats output
6. **tests.ts** — parses `schema.yml` generic tests and runs them as SQL
7. **validators.ts** — reusable check functions for lesson tasks

## Engine capabilities

- **`dbt run`** — materializes models in DAG order, marks them in `state.ranModels`.
- **`dbt test`** — runs generic tests from `schema.yml` (not_null, unique, relationships, accepted_values) and singular tests from `tests/*.sql`. Results go in `state.testResults`.
- **`dbt build`** — runs models then tests together, setting `state.buildSucceeded` only if both succeed.
- **`dbt show --select <model>`** — previews materialized result, marks in `state.shownModels`.
- **`dbt compile`** — compiles Jinja ({{ ref() }}, {{ source() }}, {{ config() }}), marks in `state.compiledModels`.
- **`dbt seed`** — loads CSVs from `seeds/*.csv` into DuckDB, records in `state.loadedSeeds`.
- **Selectors** — `+model`, `model+`, `tag:`, graph operators. Parsed by commandParser, resolved in runner.
- **Jinja simulation** — `{% ... %}` blocks are stripped; `{{ ref() }}` and `{{ source() }}` are expanded to table names.
- **Materialization** — default is VIEW; config `{{ config(materialized='table') }}` creates a TABLE. Ephemeral (inlined as CTE) and incremental (simulated as full rebuild) are parsed but only used in advanced lessons.

## Validators (`src/engine/validators.ts`)

Reusable check functions for lessons:

- `hasModel(state, name)` — file exists
- `modelRan(state, name)` — ran successfully
- `modelRefs(state, modelName, refName)` — uses ref()
- `modelMaterialization(state, name, 'table'|'view')` — correct materialization
- `lineageHasEdge(state, from, to)` — dependency edge exists
- `sourceDefined(state, sourceName, tableName)` — source declared in YAML
- `testPassed(state, modelName)` — test passed
- `allTestsPass(state, modelName)` — all tests on model passed
- `outputColumnsInclude(state, modelName, ['col1', 'col2', ...])` — output has columns
- `buildSucceeded(state)` — `dbt build` completed with no failures

Write new validators in `src/engine/validators.ts` if a check is reusable; otherwise inline in the lesson's `validate()` function.

## Task validation

Tasks validate purely from `GameState`. Once a task is marked done (`state.completedTasks` contains its key), it's never re-evaluated. This allows validators to key off transient state (e.g., "a test failed") and remain sticky.

```ts
task = {
  id: 'my-task',
  prompt: 'What to do',
  hint: 'Optional nudge',
  validate: (state) => {
    // Return true if learner succeeded, false if not yet
    return modelRan(state, 'my_model')
  }
}
```

## Project evolution (canonical snapshots)

`src/lessons/_canonical.ts` holds SQL/YAML snapshots of the shared e-commerce project at each milestone. Each lesson imports the snapshots it needs, so the project evolves coherently. For example:

- L1: `STG_CUSTOMERS_HARDCODED` (one staging model, hardcoded raw table name)
- L6: `STG_CUSTOMERS_SOURCED` (same model, now uses `source()`)
- L14: All 6 models (staging, intermediate, marts) fully wired with tests

When adding a lesson, check if you need a new snapshot or can reuse existing ones. Update `_canonical.ts` if the project state changes.

## Adding a new lesson

See `CONTRIBUTING.md` for the full walkthrough. In brief:

1. Create `src/lessons/lessonNN.ts` with type `Lesson`.
2. Update `src/lessons/index.ts`: import and push to `lessons[]`.
3. Update `src/lessons/_canonical.ts` if the project state changes.
4. Update i18n: `src/i18n/lessons/pt.json` and `src/i18n/lessons/es.json` for any student-facing text.
5. Test: `npm run dev`, clear localStorage, play through the lesson.

## Notes

- **No automated tests**: Correctness is verified by playing through lessons in the browser. TypeScript strict mode is the safety net.
- **Jinja is simplified**: We don't execute full Jinja templates; we only parse and expand `{{ ref() }}`, `{{ source() }}`, and `{{ config() }}`. Real Jinja features (filters, loops) are left to dbt docs or production dbt.
- **Incremental & snapshot support**: Engine code exists for both, but no lessons use them yet (planned for v2).
