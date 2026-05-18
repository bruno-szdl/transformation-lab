# Contributing to Analytics Engineering Quest

Thanks for considering a contribution! This project is small, opinionated, and runs entirely in the browser. Most contributions will land in one of three places: a new **lesson**, a new **concept**, or a new **engine validator**. This guide walks through each.

## Setup

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b + vite build
npm run lint     # ESLint validation
npm run preview  # Preview production build locally
```

There's no automated test suite — correctness is checked by playing through the affected lesson(s) in the dev server. The TypeScript compiler is your safety net; treat a clean `npm run build` as the floor.

### Analytics (production builds only)

The prod site uses Cloudflare Web Analytics (free, no cookies, no tracking pixels). The beacon loads only when `VITE_CF_ANALYTICS_TOKEN` is set at build time, so dev and preview builds never ping the prod stats. Copy `.env.example` to `.env.local` and fill the token if you're deploying your own instance; otherwise leave it unset.

## Repository layout

```
src/
├── engine/            # dbt simulation: parse SQL, build DAG, run SQL, execute CLI commands
│   ├── compiler.ts    # SQL/YAML parsing, ref()/source()/config()/tags
│   ├── runner.ts      # dbt CLI dispatcher (run/test/build/show/compile/seed/snapshot)
│   ├── executor.ts    # materialize models against DuckDB
│   ├── commandParser.ts  # parse selector syntax (+model, model+, tag:, comma, space)
│   ├── dagBuilder.ts  # build node/edge graph from models and sources
│   ├── tests.ts       # parse and execute generic/singular tests
│   ├── validators.ts  # helpers used by each lesson's validate()
│   └── types.ts       # Lesson, GameState, GoalDagShape
├── lessons/
│   ├── lesson00.ts–lesson14.ts  # one file per lesson (file number == lesson id == order)
│   ├── _canonical.ts  # shared "ideal project state" snapshots across lessons
│   └── index.ts       # imports all lessons, exports lessons[], helpers
├── components/        # React UI panels (Editor, FileExplorer, DagPanel, LessonPanel, etc.)
├── store/gameStore.ts # Zustand store: files, ranModels, testResults, completedTasks, theme
├── i18n/              # Internationalization (en.json, pt.json, es.json)
└── index.css          # CSS variables for theming (dark default, light variant)
```

## Curriculum structure

Analytics Engineering Quest is 15 lessons (IDs 0–14):
- **Lesson 0**: Introduction (full-width landing page, no workspace)
- **Lessons 1–14**: Hands-on dbt tutorials (editor + console + context panels)

Each lesson teaches one core concept progressively. The fictional e-commerce project evolves lesson by lesson, showing a realistic dbt project by the capstone (L14).

## Adding a new lesson

1. **Pick the slot.** Decide where in the curriculum (after which lesson) the new content belongs. Pick the next available lesson number (or insert in the middle if replacing).

2. **If inserting in the middle:** Renumber all later lessons. This invalidates saved progress for existing users, so do it carefully and document in the PR.

3. **Create `src/lessons/lessonNN.ts`** following the `Lesson` shape in `src/engine/types.ts`:

   ```ts
   const lessonNN: Lesson = {
     id: NN,
     title: 'Lesson title',
     concept: `Markdown-formatted explanation. **Bold**, \`code\`, lists, fenced blocks.`,
     initialFiles: { 'models/foo.sql': '...', 'models/schema.yml': '...' },
     openFiles: ['models/foo.sql'],  // which tabs open by default
     seeds: { 'raw.table': CSV_DATA },  // CSV data auto-registered as warehouse tables
     preRanModels: ['model_name'],   // optional: silently materialize on load
     panels: ['files', 'warehouse', 'lineage'],  // optional: which context panels to show
     tasks: [
       {
         id: 'task-id',
         prompt: 'What the learner should do.',
         hint: 'Optional helpful nudge.',
         validate: (state) => /* check GameState */* true,
       },
     ],
     quiz: {  // optional end-of-lesson multiple-choice
       question: 'Question text?',
       options: ['A', 'B', 'C', 'D'],
       correctIndex: 1,
       explanation: 'Why B is correct.',
     },
     goal: {
       dagShape: { nodes: [...], edges: [...] },  // optional visual target
     },
     furtherReading: [  // optional links to dbt docs
       { label: 'Page title', url: 'https://...' },
     ],
   }
   export default lessonNN
   ```

4. **Update `src/lessons/_canonical.ts`** with any new SQL/YAML snapshots the lesson uses.

5. **Update `src/lessons/index.ts`**: Import the lesson and push it into the `lessons` array at the right position.

6. **Add i18n strings**: If the lesson has text, update:
   - `src/i18n/lessons/pt.json` (Portuguese)
   - `src/i18n/lessons/es.json` (Spanish)
   - English text lives inline in the lesson TS file; Portuguese and Spanish translations live in JSON.

7. **Pick the right validators.** Reuse helpers from `src/engine/validators.ts` — `modelRan`, `modelRefs`, `testPassed`, `lineageHasEdge`, `outputColumnsInclude`, `allTestsPass`, `buildSucceeded`, `seedLoaded`, etc. Write a new validator only if the check is reusable across lessons.

8. **Play it.** `npm run dev`, clear localStorage, walk through the lesson fresh, and verify:
   - The concept text is clear.
   - Tasks guide the learner step-by-step.
   - The validate() function passes when you do the right thing, fails when you don't.
   - The quiz (if present) is comprehensible.

## Curriculum invariants

These keep the learner experience predictable:

- **File number = lesson id = curriculum order.** `lessonNN.ts` exports a `Lesson` with `id: NN`. If you insert a lesson mid-curriculum, renumber all later lessons.
- **`panels: [...]` controls which context panels show.** Introduce panels progressively (e.g., `warehouse` in L1, `lineage` in L2). Once unlocked, they stay visible.
- **Lesson snapshots are canonical.** `_canonical.ts` holds the "ideal state" of the project at each milestone. Update it when the project evolves.
- **Persisted progress is keyed by lesson id.** Renumbering invalidates saved progress. Call it out in the PR.

## Adding a new concept or feature to the engine

If a lesson needs functionality that isn't in the existing engine:

- **Prefer reusing what exists.** Most checks can be expressed with `state.files`, `state.ranModels`, `state.compiledModels`, `collectModels(state.files)` from `compiler.ts`, or `plan(state.files)` from `executor.ts`.
- **If you need a new validator helper**, add it to `src/engine/validators.ts`, keep it pure (input: `GameState`, output: boolean), and document the precondition.
- **If you need a new CLI command or selector**, parsing lives in `commandParser.ts` and execution in `runner.ts`. Document the grammar inline.
- **For materialization changes or new test types**, update `executor.ts` and `tests.ts` respectively.

## Style and conventions

- TypeScript strict mode is enforced. Avoid `any`.
- All colors come from CSS variables in `index.css` — never hardcode hex values in components.
- Comments should explain *why* non-obvious decisions exist, not *what* the code does. Names should be self-documenting.
- No tests, mocks, or scaffolding "for the future". The project is small; ad-hoc verification in the browser is the workflow.

## Pull requests

- One feature or fix per PR. Smaller PRs land faster.
- The PR description should answer: *what changes for the learner?* If nothing visible changed, say so (e.g., "internal refactor, no learner-facing changes").
- Run `npm run build` and `npm run lint` locally before pushing. CI runs both.
- If you renumbered lessons, explicitly say which lessons shifted: "Lesson 5–14 renumbered to 6–15. Existing users' saved progress for L5+ will be off by one lesson."

That's it. Open an issue first if you're unsure whether a change fits, especially anything that touches the engine or curriculum order.
