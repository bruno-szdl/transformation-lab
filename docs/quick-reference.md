# Quick Reference for Analytics Engineering Quest

Fast lookup for common tasks and questions.

## 🎓 Curriculum

**15 lessons (IDs 0–14)**:

| ID | Lesson | Concept |
|----|--------|---------|
| 0 | Introduction | Landing page (no workspace) |
| 1 | Your first dbt model | `dbt run`, `dbt show` |
| 2 | ref() and the DAG | Dependencies, lineage, `dbt compile` |
| 3 | Multi-step pipelines | Chaining models together |
| 4 | Materializations | VIEW vs TABLE |
| 5 | Selecting models | `--select`, `-s`, selective runs |
| 6 | Sources | `source()` declarations, YAML |
| 7 | Seeds | CSV loading, `dbt seed` |
| 8 | Data tests: not_null & unique | Generic tests, schema.yml |
| 9 | Relationships & accepted_values | More generic tests |
| 10 | Documentation | Descriptions, metadata |
| 11 | Project structure | staging/intermediate/marts, layer naming |
| 12 | Selecting subsets | Graph operators (+model, model+, tag:) |
| 13 | Custom (singular) tests | Custom test queries |
| 14 | dbt build | `dbt build`, full pipeline, capstone |

## 📂 Key Directories

```
src/
├── engine/          # dbt simulation (parse, build, run)
├── lessons/         # lesson00.ts – lesson14.ts + _canonical.ts
├── components/      # React UI (Editor, Terminal, DAG, etc.)
├── store/gameStore.ts
├── i18n/            # Internationalization (en, pt, es)
└── index.css        # CSS variables, theming

public/             # Static assets
├── robots.txt       # Search engine crawling rules
├── sitemap.xml      # XML sitemap for SEO
├── og-image.svg     # Social media preview (1200×630)
├── favicon.svg
└── .well-known/security.txt

docs/
├── lesson-system.md # Architecture reference
├── seo-setup.md     # SEO guide & maintenance
└── quick-reference.md (this file)
```

## 🏗️ Adding a Lesson (Quick Steps)

1. **Create** `src/lessons/lessonNN.ts`
2. **Import** in `src/lessons/index.ts`
3. **Update** `src/lessons/_canonical.ts` if project state changes
4. **Translate** lesson text in `src/i18n/lessons/pt.json` and `es.json`
5. **Test**: `npm run dev`, clear localStorage, play through

**Template**:
```ts
const lessonNN: Lesson = {
  id: NN,
  title: 'Lesson title',
  concept: `Explanation text...`,
  initialFiles: { 'models/foo.sql': '...' },
  tasks: [{ id: 'task', prompt: '...', validate: (s) => ... }],
  quiz: { question: '...', options: [...], correctIndex: 0, explanation: '...' },
}
export default lessonNN
```

## 🚀 Commands

```bash
npm run dev         # Start Vite dev server
npm run build       # TypeScript check + production build
npm run lint        # ESLint validation
npm run preview     # Preview production build
vercel deploy       # Deploy to preview
vercel deploy --prod # Deploy to production
```

## 🔍 Finding Things

**What validator do I use?**
→ Check `src/engine/validators.ts` for `modelRan`, `modelRefs`, `lineageHasEdge`, etc.

**How does the engine execute SQL?**
→ `src/engine/executor.ts` (compiles and runs against DuckDB)

**Where's the DAG rendered?**
→ `src/components/DagPanel.tsx` (React Flow + Dagre layout)

**Where's the editor?**
→ `src/components/Editor.tsx` (Monaco Editor)

**Where's the terminal output?**
→ `src/components/TerminalPanel.tsx` (xterm.js)

**Where's the lesson text?**
→ Each lesson file (e.g., `src/lessons/lesson02.ts`); translations in `src/i18n/lessons/`

**Where's the file system?**
→ `src/store/gameStore.ts` (Zustand store, `files` record)

**How do tasks get validated?**
→ Each task has a `validate(state) => boolean` function. Sticky once completed.

## 🌐 Internationalization

**Add a translated string**:

1. Add to English lesson (e.g., `concept: "text"` in `lesson01.ts`)
2. Add key to `src/i18n/lessons/pt.json` and `es.json`
3. Reference with `{{ key }}` in lesson or use `useTranslation()` in React

**UI string** (not lesson content):
→ Update `src/i18n/locales/en.json`, `pt.json`, `es.json`

## 🎨 Styling

**All colors are CSS variables** in `src/index.css`:
- `--color-base` (background)
- `--color-surface` (panel background)
- `--color-accent-orange` (brand color)
- `--color-text`, `--color-text-secondary`, `--color-text-muted`
- `--color-success`, `--color-fail`, `--color-warning`

Never hardcode hex codes. Update CSS vars to change theme across the whole app.

**Theme switching**: Dark (default) ↔ Light via `data-theme` attribute on `<html>`.

## 📊 State Shape (`gameStore.ts`)

```ts
{
  files: { 'models/foo.sql': '...' },          // File system
  ranModels: Set<string>,                       // Models that ran
  testResults: { modelName: 'pass'|'fail' },   // Test outcomes
  compiledModels: Set<string>,                 // Compiled via dbt compile
  loadedSeeds: Set<string>,                    // Loaded via dbt seed
  buildSucceeded: boolean,                     // dbt build succeeded
  currentLessonId: number,                     // Active lesson (0–14)
  completedTasks: Set<string>,                 // Sticky task completions
  revealedHints: Set<string>,                  // Revealed hints
  correctQuizzes: Set<number>,                 // Correct quiz answers
  openedFiles: Set<string>,                    // Open editor tabs
  terminalHistory: string[],                   // Command history
  bottomTab: 'commands' | 'results',           // Bottom panel tab
  theme: 'dark' | 'light',                     // User theme preference
  seenPanels: Set<'files'|'warehouse'|'lineage'>, // Unlocked panels
}
```

## 🐛 Debugging

**Check state**: In browser console:
```js
aeQuest = (window as any).__ZUSTAND_DEVTOOLS_CONTEXT__.store.getState()
```

**Inspect a lesson**: `src/lessons/lessonNN.ts`
**Inspect engine**: `src/engine/validators.ts` or `executor.ts`
**Check terminal output**: `src/components/TerminalPanel.tsx`

## ✅ Pre-Launch Checklist

```
- [ ] npm run build passes
- [ ] npm run lint passes
- [ ] Test at least 3 lessons cold (clear localStorage)
- [ ] Verify mobile layout
- [ ] Test light/dark theme toggle
- [ ] Check language selector (en/pt/es)
- [ ] Verify robots.txt is served: https://transform-lab.datagym.io/robots.txt
- [ ] Verify sitemap.xml is served: https://transform-lab.datagym.io/sitemap.xml
- [ ] Test og:image preview: https://www.opengraph.xyz/
- [ ] Deploy to Vercel: vercel deploy --prod
- [ ] Submit sitemap to Google Search Console
```

## 📞 Getting Help

- **Architecture questions**: Read `docs/lesson-system.md`
- **SEO questions**: Read `docs/seo-setup.md`
- **Contributing**: Read `CONTRIBUTING.md`
- **Launch checklist**: Read `LAUNCH_CHECKLIST.md`

---

Last updated: 2026-05-15
