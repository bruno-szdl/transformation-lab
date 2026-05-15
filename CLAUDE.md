# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start Vite dev server at localhost:5173
npm run build    # TypeScript check + production build → dist/
npm run lint     # ESLint validation
npm run preview  # Preview production build locally
```

There are no automated tests — task completion is validated via `validate()` functions in each lesson definition.

## Architecture

**dbt-quest** is a browser-based interactive tool for learning dbt, inspired by SQLBolt. It runs entirely in-browser with no backend: SQL executes in DuckDB WASM, the editor is Monaco, and the DAG is rendered with React Flow.

It is a course of **15 lessons** (lesson 0 is the intro page, lessons 1–14 teach core dbt concepts). Each lesson teaches one concept, then gives the learner 3–5 hands-on **tasks** that share a single workspace, plus an optional end-of-lesson quiz.

### Stack

- **React 19 + TypeScript** (strict mode) — UI
- **Zustand** — all game/UI state in `src/store/gameStore.ts`
- **Vite + Tailwind CSS 4** — build and styling
- **DuckDB WASM** — in-browser SQL execution
- **Monaco Editor** — code editing with file tabs
- **React Flow + Dagre** — DAG visualization

### Key directories

```
src/
├── engine/          # dbt simulation: parse SQL, build DAG, execute against DuckDB, run CLI commands
├── lessons/         # Lesson definitions (lesson00.ts–lesson14.ts), the shared _canonical.ts snapshot, index.ts
├── components/      # React UI panels (Editor, TerminalPanel, DagPanel, LessonPanel, IntroPage, etc.)
├── store/
│   └── gameStore.ts # Zustand store: files, ranModels, testResults, compiledModels, completedTasks, theme
└── index.css        # CSS variable theming (dark default, light variant)
```

### Engine pipeline

1. **`commandParser.ts`** — parses `dbt <subcommand>` input and `--select` / `--exclude` selectors (`+model`, `model+`, `tag:`, `path:`)
2. **`compiler.ts`** — extracts `ref()`, `source()`, `config()` from SQL Jinja-like syntax
3. **`dagBuilder.ts`** — builds node/edge graph; infers layer (staging/intermediate/mart) from naming; reads `.yml` for sources
4. **`executor.ts`** — compiles and runs SQL in DuckDB; handles VIEW vs TABLE materialization
5. **`runner.ts`** — dispatches `dbt run/test/build/show/compile/seed/snapshot`, formats terminal output
6. **`tests.ts`** — parses `schema.yml` generic tests (`not_null`, `unique`, `accepted_values`, `relationships`) and runs them as real SQL against DuckDB
7. **`validators.ts`** — helpers used by each lesson task's `validate()` to check completion

`snapshots.ts` and incremental-model handling still exist for engine compatibility but are **not used by any current lesson**.

### Lesson structure

Each lesson file (`src/lessons/lessonNN.ts`) exports a `Lesson` object (type in `src/engine/types.ts`):

- `concept` — the explanatory text shown above the tasks (minimal markdown: `**bold**`, `` `code` ``, fenced blocks, `-` lists)
- `initialFiles` — starting SQL/YAML/CSV file contents
- `openFiles` — which files open as editor tabs on load
- `seeds` — CSV data registered directly as warehouse tables (`raw.customers` → DuckDB `raw.customers`)
- `preRanModels` — models silently materialized into DuckDB on lesson load
- `tasks` — array of `Task { id, prompt, hint?, validate(state) => boolean }`
- `quiz` — optional end-of-lesson multiple-choice question
- `goal.dagShape` — optional target DAG shape
- `panels` — which side panels (`files` / `warehouse` / `lineage`) this lesson needs; omit for all, `[]` for none. The Editor + Console are always visible.
- `furtherReading` — optional links to official dbt docs

Tasks validate purely from observed `GameState` (`files`, `ranModels`, `testResults`, `compiledModels`, `loadedSeeds`, etc.). **Task completion is sticky** — once a task is in `completedTasks` it is never re-evaluated (`gameStore.ts` `checkTasks`), so a `validate()` may key off a transient state (e.g. `testResults === 'fail'`) and stay completed after that state changes.

### The canonical project

Every lesson is a slice of the **same fictional e-commerce dbt project**. `src/lessons/_canonical.ts` holds the "ideal" file contents at each milestone (the shared raw CSVs, staging/mart model SQL, `schema.yml` snapshots). Each lesson imports the snapshot constants it starts from, so the project evolves coherently lesson to lesson.

### Internationalization (i18n)

**CRITICAL: Any time you touch text that is exposed to the student, you must update all translation files.**

Student-facing text lives in two places:
- `src/i18n/locales/` — UI strings (button labels, headings, status messages). Files: `en.json`, `pt.json`, `es.json`
- `src/i18n/lessons/` — lesson-specific text (concept explanations, task prompts, hints, quiz questions/answers). Files: `pt.json`, `es.json` (English is the source in the lesson TS files themselves)

If you add or change any of the following, update `pt.json` and `es.json` accordingly:
- Lesson `concept` text
- Task `prompt` or `hint` strings
- Quiz questions or answer choices
- Any UI string present in `src/i18n/locales/en.json`

Never leave a translation key missing or stale. If you are unsure of the correct translation, add a best-effort translation and leave a `// TODO: verify translation` comment in the PR description — but do not skip the update entirely.

### Adding a lesson

Create `src/lessons/lessonNN.ts` and register it in `src/lessons/index.ts`. `getLastLessonId()` returns `max(lesson.id)` automatically — it's the single source of truth for "is this the last lesson?", used by the lesson panel / navigation. Do not guard "last lesson" with `lessons.length`.

### Theming

CSS variables defined in `index.css` drive all colors. Theme (dark/light) is persisted to `localStorage` and applied via `document.documentElement.dataset.theme`. Components use CSS vars rather than hardcoded colors.

### State shape

`gameStore.ts` holds: `files` (record of filename → content), `ranModels`, `shownModels`, `compiledModels`, `testResults`, `loadedSeeds`, `buildSucceeded`, `openedFiles`, `terminalHistory`, `currentLessonId`, `completedTasks` (keyed `<lessonId>.<taskId>`), `revealedHints`, `correctQuizzes`, `seenPanels`, `bottomTab`, and `theme`. Only `theme` and `seenPanels` are persisted to `localStorage` (via `safeStorage`); task progress is in-memory for the session.
