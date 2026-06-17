# ROADMAP - transformation-lab

Status board for the "real dbt in the browser via Pyodide" engine. Rationale and the full
decisions log (D1–D37) live in [`CLAUDE.md`](./CLAUDE.md); this file is **what's done / what's next**.

> **TL;DR (2026-05-31):** engine + basics course are **done, certified on real dbt, hardened, and in git**.
> Run the lab: `npm install && npm run engine:wheelhouse && npm run basics:dev`. **Shipped 2026-06-17** (transformation-lab.datagym.io); next:
> start the intermediate course (see "🔜 Next").

Legend: ✅ done · 🔜 next · ⬜ later · 🧪 spike-quality (works, not productionized)

---

## ✅ Done (2026-05-30)

### Step 0 - boot gate
- Proved real `dbt-core` + `dbt-duckdb` **import and construct** inside Pyodide (Node, headless).
- The #1 risk (`multiprocessing`) is beaten with four wasm-compat stubs (D11–D14) + the
  `dbt-extractor` mock (D5). Run: `npm run gate`.

### Step 1 - hello-dbt
- Minimal project in MEMFS (1 seed + 2 models) → `dbtRunner().invoke(["seed"])` then `["build"]`
  → `PASS=3`, real `manifest.json` lineage + `run_results.json`. Run: `npm run hello`.
- Required beyond boot: dbt-duckdb single-thread connection patch (D13), file-backed DuckDB (D16),
  no `--single-threaded` (D17).

### Engine factored into `boot.mjs` (single source of truth)
- Pinned wheel set (D15), all stubs, PyPI-throttle-resilient install loop.

---

## ✅ Step 2: UI bridge + productionize the engine

1. **✅ Bundle a local wheelhouse** (2026-05-30)
   - The pipeline: `freeze-deps.mjs` (boot once, force networkx-from-PyPI, dump the resolved
     53-pkg closure) → `wheelhouse-lock.json` → `build-wheelhouse.mjs` (download the 28
     PyPI-sourced wheels) → `wheelhouse/`. Run: `npm run freeze && npm run wheelhouse`.
   - Boot now installs the **exact pinned closure with no resolver** (D19/D20): `loadPackage()` the
     25 dist packages + `micropip.install(emfs:, deps=False)` the 28 vendored wheels.
   - Result: installs are **deterministic, fast (~10 s full build), PyPI-independent**. No throttling.
   - Side effect: surfaced + sidestepped the dbt 1.10.8 internal `protobuf<6`/`>=6` conflict (D20).
2. **✅ Trim the download** (2026-05-30)
   - **networkx forced from PyPI** (pure-python 3.6.1, no hard deps) → matplotlib/Pillow/numpy stack
     gone. Verified zero in the closure. **~11.6 MB saved**; footprint now ~42 MB (D21).
   - ⬜ Still open: trim/defer **Babel** (~10 MB CLDR locale data via agate) - biggest item left.
3. **✅ Web Worker - browser harness** (2026-05-30)
   - Engine stubs extracted to shared **`engine-stubs.mjs`** (one source of truth for Node + browser).
   - **`web/worker.js`** boots Pyodide from the **CDN**, `loadPackage`s the 25 dist packages, fetches
     the 28 vendored wheels from `/wheelhouse/` over HTTP, installs `deps=False`, applies the stubs,
     runs dbt (D22). Minimal page (`web/index.html` + `web/main.js`): editable models, Build button,
     streamed dbt terminal, lineage list.
   - **GATE PASSED** - `npm run browser-gate` drives it in **headless Chromium** (Playwright) and
     asserts `PASS=3`: real dbt-core 1.10.8 boots & builds in a real browser tab, no backend. The
     2.3 analog of the Step-0 import gate. Manual run: `npm run serve` → http://localhost:5173/.
4. **🟡 DAG render** - the harness already renders dbt's real `manifest.json` lineage (text list) and
   streams the real terminal output. A **polished visual node-graph** (React Flow et al.) is deferred
   to the app build. **Needs the app-stack decision (below).**

## ✅ Step 3 / Phases 0–2 - monorepo, app, and the full course on real dbt (2026-05-31)
- **Phase 0/1**: npm-workspaces monorepo, `@dbt-wasm/engine` (`createDbtEngine`), and a faithful port of
  the Data Transformation Lab app over a single execution seam (D23–D29). App stack decided + shipped:
  Vite + React 19 + TS + Tailwind 4 + Monaco + React Flow.
- **"Real dbt project" foundation (D30)**: lesson-controlled file visibility (glob denylist), editable
  `dbt_project.yml`/`profiles.yml`, warehouse-path decoupling.
- **Phase 2 (D31)**: **all 15 lessons certified end-to-end on real dbt.** New gate
  `npm run basics:certify` (`certify-lessons.mjs`) + the existing `npm run basics:gate`
  (`test-lesson.mjs`, lessons 1 & 3 + foundation phases). Exercised: `source()` resolution to the
  `registerCsv` raw tables (no extra config), `dbt seed`, generic + singular tests (real bad-data
  fails), graph operators / unions / subfolder models. Two fixes: engine `syncProject` (prune stale
  resource files on rename/delete) and lessons 8/9's invalid empty `data_tests:` placeholder.
- **No snapshot/incremental lesson exists yet** - would be NEW content. Other dbt features (macros,
  contracts, docs, hooks, Python models) remain unexercised by lessons; add coverage when authored.
- `modelColumnsFromCatalog()` multi-schema deferred (no lesson builds into a non-`main` schema).

## ✅ Post-milestone review & harden (2026-05-31, D32)
- **`git init`** done (monorepo under version control; `pyodide-dist`/`wheelhouse` ignored + rebuildable).
- Removed ~400 lines of vestigial sim machinery (`engine/snapshots.ts`, the sim-era run-helpers in
  `engine/tests.ts`); kept `parseTests` + `getYamlDiagnostics`.
- **Perf:** lazy-load the workspace so **reactflow** (290 kB) is its own chunk (initial index 935 → 658 kB);
  **pre-bake** lesson warehouses (EXPORT/IMPORT, D26-safe) → reload **6.6 s → 1.5 s (4.4×)**.
  (Monaco was already CDN-lazy.)
- `:memory:` decided: **not supported** (per-invoke model needs a persistent file) - documented in CLAUDE.md.

## 🔜 Next (recommended order)
1. **✅ Shipped (2026-06-17): the basics course is live at `transformation-lab.datagym.io`.** Static
   build (`npm run basics:build` → `dist/`, wheelhouse copied from the `public/wheelhouse` symlink,
   Pyodide from CDN), hosted on **Vercel** ([`vercel.json`](./vercel.json)). It **replaced** the original
   hand-written-simulation app on that domain; the mock is preserved at git tag `v2-mock`. Now watch
   real-device cold-boot UX, mobile, and cross-browser Pyodide quirks - the things the headless gates
   can't catch - before investing heavily in course #2.
2. **Start `apps/transformation-lab-intermediate` (course #2).** This is what triggers extracting
   **`packages/dbt-wasm-lab-kit`** (the shared UI shell - D23 says design it against the *second* app,
   not guess with one), and authoring NEW dbt-feature lessons the basics course never covers:
   snapshots, incremental, macros, multi-schema sources, contracts, Python models. These exercise
   engine paths the current 15 lessons don't - expect to surface fresh engine work (e.g.
   `modelColumnsFromCatalog()` multi-schema, snapshot/incremental fidelity).

## ⬜ Later / deferred
- `dbt deps` / packages story (pre-bundle vs proxy).
- Build-time pre-baked warehouses (instant *first* loads, not just reloads) + full pt/es/fr/de/it lesson port + an a11y/mobile polish pass.
- **Trim Babel (~10 MB)** - deferred *spike* only: it arrives via `agate`; excluding it risks breaking dbt.
- Extract `packages/dbt-wasm-lab-kit` (shared UI shell) when the **2nd** app appears (D23).
- Author new dbt-feature lessons not in the original course (snapshots, incremental, macros, contracts,
  Python models) - these are NEW content, exercising engine paths the current 15 lessons don't.

---

## Known sharp edges (carry forward)
- **No OS threads / processes** in Pyodide → everything runs synchronously via the stubs. If a
  future dbt/dep version introduces a new threading/multiprocessing path, expect a new stub.
- **dbt-duckdb connection patch (D13)** monkeypatches internals - re-verify on any dbt-duckdb bump.
- **Pinned to dbt-core 1.10.8** by `protobuf<6`; moving to 1.11+ needs a Pyodide release that ships
  protobuf 6 wheels (or accept pure-python protobuf). See README "Updating versions".
- **No runtime-loaded DuckDB extensions** (httpfs/spatial/etc.) - only what the wasm build bundles.
