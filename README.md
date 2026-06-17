# Transformation Lab - real dbt in the browser (monorepo)

> **Live at [transformation-lab.datagym.io](https://transformation-lab.datagym.io)** - Vercel static build (see [`vercel.json`](./vercel.json) and [`CLAUDE.md`](./CLAUDE.md) > Deployment).

Run the **real** dbt-core 1.10.8 + dbt-duckdb engine inside **Pyodide** (CPython→wasm), executing
SQL against **DuckDB-wasm**, with **no backend**. This is an **npm-workspaces monorepo**:

- **`packages/dbt-wasm-engine`** (`@dbt-wasm/engine`) - the proven engine: `createDbtEngine()` =
  main-thread client + a generic RPC Web Worker (boot / writeFiles / syncProject / invoke / query /
  readArtifact / reset).
- **`apps/transformation-lab-basics`** - the "Data Transformation Lab" course (Vite + React 19 + TS +
  Tailwind + Monaco + React Flow) rebuilt on the real engine. **All 15 lessons certified end-to-end on
  real dbt.**

See [`CLAUDE.md`](./CLAUDE.md) for the full rationale + decisions log (D1–D37), and
[`ROADMAP.md`](./ROADMAP.md) for what's done / next.

## Status
- ✅ **Engine (Steps 0–2.3)**: `import duckdb` + `dbt.cli.main` clean; real `seed`/`build` against
  DuckDB-wasm with real `manifest.json` lineage; deterministic PyPI-free wheelhouse (D19/D20);
  networkx trim → ~42 MB (D21); `PASS=3` in a headless-Chromium Web Worker (D22).
- ✅ **App (Phases 0–2)**: monorepo + `createDbtEngine` API; the lab ported onto real dbt behind one
  execution seam; **all 15 lessons certified on real dbt** (D31); editable infra + warehouse-path
  decoupling + lesson-controlled file visibility (D30).
- ✅ **Review & harden (D32)**: `git init`; dead sim-code removed; reactflow code-split; lesson
  warehouses pre-baked (reload 6.6 s → 1.5 s).

## Run the lab app (what you'll usually want)
```bash
npm install                  # workspace deps (root) - React/Vite/Monaco/reactflow + the engine
npm run engine:wheelhouse    # ONE-TIME: build the vendored wheelhouse (it's gitignored). Skip if
                             #   packages/dbt-wasm-engine/wheelhouse/ already exists.
npm run basics:dev           # Vite dev server → open the printed URL (default http://localhost:5173)
```
> The app serves the wheelhouse via the `apps/transformation-lab-basics/public/wheelhouse` **symlink**
> → the engine package's `wheelhouse/`. **Pyodide itself loads from the jsDelivr CDN** (so you do NOT
> need `npm run fetch-dist` for the browser app - that 768 MB dist is only for the Node engine gates).
> The first lesson that touches the engine triggers the one-time **~40 MB** boot (network required on
> first boot); a full-screen overlay covers it. Lesson 0 is the intro and pays no boot cost.

```bash
npm run basics:build         # production build (dist/ - wheelhouse copied from the symlink)
npm run basics:gate          # build + headless-Chromium drive lessons 1 & 3 + the D30 foundation phases
npm run basics:certify       # build + drive lessons 2,4–14 to completion on real dbt (all 15 certified)
```

## Engine-only gates (Node / headless, no app)
- 🟡 **Step 2.4 - DAG render**: the engine harness renders real `manifest.json` lineage + the dbt
  terminal; the polished React Flow node-graph lives in the app (`apps/transformation-lab-basics`).

These run **from the repo root** (workspace-delegated; the bare `npm run gate`/`hello`/etc. names
only work inside `packages/dbt-wasm-engine/`):
```bash
npm install                  # workspace deps
npm run engine:wheelhouse    # build-wheelhouse.mjs -> the 28 vendored wheels from wheelhouse-lock.json
npm run engine:gate          # node spike.mjs    -> the import GATE (headless Node)
npm run engine:hello         # node hello-dbt.mjs -> seed + build a minimal project, dump lineage (Node)
npm run fetch-dist -w @dbt-wasm/engine   # ONLY for the Node gates: the ~768 MB Pyodide dist → pyodide-dist/
```

### Engine in a real browser (no app)
```bash
npx playwright install chromium   # one-time, for the automated gate
npm run engine:browser-gate       # headless Chromium: boots dbt + builds PASS=3 in a Web Worker
npm run engine:serve              # then open http://localhost:5173/ to use the harness by hand
```
> The browser worker (`web/worker.js`) loads Pyodide from the **jsDelivr CDN**, fetches the vendored
> wheels from `/wheelhouse/` over HTTP, and runs the exact same engine as Node - the stubs are shared
> via `engine-stubs.mjs`. No bundler; `serve.mjs` static-serves the repo.
> Boot installs the **exact pinned closure with no resolver** (D19/D20): it `loadPackage()`s the 25
> dist-sourced packages and `micropip.install(emfs:, deps=False)`s the 28 vendored wheels - so it's
> **deterministic, fast (~10 s), and never touches PyPI** (no more throttling). If `wheelhouse/` is
> missing, boot falls back to a backoff-retry PyPI install. Rebuild the wheelhouse from the committed
> `wheelhouse-lock.json` with `npm run wheelhouse`; regenerate the lock itself (only when bumping
> versions) with `npm run freeze`.

## Engine files (`packages/dbt-wasm-engine/`)
| File | Role |
|------|------|
| **`src/client.js` + `src/worker.js`** | The public API: `createDbtEngine()` (main thread) + the generic RPC Web Worker the app uses. |
| **`engine-stubs.mjs`** | **The shared engine heart**: the D5/D11/D12/D13/D14 Python stubs + apply helpers, pure strings, no Node imports. Used by BOTH `boot.mjs` (Node) and `web/worker.js` (browser). |
| **`boot.mjs`** | Node plumbing: brings up Pyodide from the self-hosted dist, installs the pinned wheel set from the wheelhouse (D19/D20), applies the shared stubs. Exports `bootDbt()`. |
| `freeze-deps.mjs` | Wheelhouse pipeline 1/2: boot once, force networkx-from-PyPI (D21), dump the resolved 53-pkg closure → `wheelhouse-lock.json`. Re-run only when bumping versions. |
| `build-wheelhouse.mjs` | Wheelhouse pipeline 2/2: read the lock, download the 28 PyPI-sourced wheels → `wheelhouse/`. |
| `wheelhouse-lock.json` | The pinned 53-package closure (source of truth for the wheelhouse). **Committed.** |
| `spike.mjs` | Step 0 import gate (thin, on top of `boot.mjs`). |
| `hello-dbt.mjs` | Step 1: minimal project in MEMFS → `dbtRunner().invoke(["seed"/"build"])` → read `manifest.json`. |
| `debug-conn.mjs` | Diagnostic harness that traces dbt-duckdb's connection lifecycle (how D13 was found). |
| `web/worker.js` | Step 2.3: the engine in a browser Web Worker - Pyodide from CDN, wheels over HTTP, shared stubs. |
| `web/index.html` + `web/main.js` | Minimal harness UI: editable models, Build button, streamed dbt terminal, lineage. |
| `serve.mjs` | Zero-dep static server for the harness (`npm run serve`). |
| `test-browser.mjs` | Step 2.3 gate: drives the harness in headless Chromium and asserts `PASS=3` (`npm run browser-gate`). |

## The engine, in one breath
Pyodide **0.27.7** (Python 3.12.7) · dbt-core **1.10.8** · dbt-duckdb **1.9.6** · pydantic **2.10.6**
→ pydantic-core 2.27.2 / duckdb 1.1.2 from the dist. Four wasm-compatibility stubs make it run:
`_multiprocessing` (threading-backed), synchronous `ThreadPoolExecutor`, synchronous
`multiprocessing.pool.ThreadPool`, and a dbt-duckdb single-thread connection patch. The
`dbt-extractor` Rust parser is mocked to always fall back to full Python-Jinja (high fidelity).

## Footprint & browser feasibility

**Yes - it runs entirely in the user's browser tab, with no backend.** No server, no database, no
login, no per-user compute. The dbt engine (CPython + DuckDB, both WebAssembly) executes in the
page. The *only* infra you need is **static file hosting** - any CDN/static host works (GitHub
Pages, S3+CloudFront, Cloudflare Pages, Netlify, Vercel static). You are serving files, not running
dbt on a server.

> Note: we use the **default single-threaded Pyodide**, so you do **NOT** need the `SharedArrayBuffer`
> COOP/COEP cross-origin-isolation headers that threaded Pyodide builds require. Plain static hosting
> is enough.

### How heavy is the first load? (measured, uncompressed)

| Bucket | Size | Notes |
|---|---:|---|
| Pyodide core (`pyodide.asm.wasm` 9.6 + stdlib.zip 2.3 + glue) | **~13 MB** | the CPython-in-wasm runtime; the `.wasm` compresses to ~3–4 MB with brotli/gzip |
| **duckdb** wasm wheel | **~10 MB** | the embedded warehouse - unavoidable, it's the point |
| Other needed compiled wheels (pydantic-core, pyyaml, msgpack, rpds-py, markupsafe, jinja2, requests…) | **~5 MB** | from the Pyodide dist |
| dbt pure-python wheels (dbt-core, dbt-duckdb, dbt-common, adapters, semantic-interfaces, protos, mashumaro, agate, networkx, …) | **~5 MB** | the 28-wheel vendored wheelhouse minus Babel (next row) ≈ 4.7 MB |
| **Babel** (pulled by agate) | **~10 MB** | mostly CLDR locale data; **the biggest single trim candidate left** |
| ~~matplotlib + numpy + Pillow stack~~ | ~~**~11.6 MB**~~ | ✅ **GONE (D21)** - networkx now from PyPI (zero hard deps), so this spurious stack is never pulled |
| **TOTAL (realized today, after the networkx trim)** | **~42 MB** | matplotlib stack removed; verified zero in the resolved closure |
| **TOTAL (achievable next, if Babel is trimmed)** | **~32 MB** | trim/defer Babel's CLDR data |

- **It is a heavy first load, not a slow ongoing one.** All assets are immutable and **cacheable**
  (hash-pinned). First visit downloads ~30–50 MB (less over the wire with brotli on the `.wasm`);
  repeat visits are served from the HTTP/browser cache. Cold-start compute is a few seconds
  (Pyodide init was ~1.1 s in our runs; wheel install + first parse add a few more).
- **No offline support by design** (D9) - first load needs the network; after that, lazy-load the
  engine behind the lesson UI and show a loading state.
- **The networkx trim (D21) is done** → ~42 MB realized. Trimming Babel's CLDR data would reach ~32 MB.

## Updating dbt-core / package versions

The versions are **pinned on purpose** (D7/D15) - the whole engine depends on one consistent
Python+emscripten ABI. The constraint chain to respect, in order:

1. **Pyodide release decides the compiled-wheel versions.** `duckdb`, `pydantic-core`, `msgpack`,
   `pyyaml`, `markupsafe`, `rpds-py`, `numpy` come from the **Pyodide dist** and are frozen to
   whatever that release ships. Check a release's lockfile before adopting it:
   ```bash
   curl -s https://cdn.jsdelivr.net/pyodide/v<VERSION>/full/pyodide-lock.json \
     | python3 -c 'import json,sys; p=json.load(sys.stdin)["packages"]; \
        print({k:p[k]["version"] for k in ["duckdb","pydantic-core","msgpack","pyyaml"] if k in p})'
   ```
   ⚠️ **Pyodide ≥ 0.28 currently ships NO `duckdb` wheel** - do not upgrade past 0.27.x until that
   returns, or the project loses its warehouse.
2. **Pick a `dbt-core` whose pins intersect those compiled versions.** Inspect a candidate's deps:
   ```bash
   curl -s https://pypi.org/pypi/dbt-core/<VERSION>/json \
     | python3 -c 'import json,sys; [print(r) for r in json.load(sys.stdin)["info"]["requires_dist"]]'
   ```
   The two pins that actually bite:
   - **`protobuf`** - 1.10.8 wants `<6` (matches the dist); dbt-core **1.10.10+/1.11+** want
     `protobuf>=6`. protobuf has a pure-python wheel on PyPI, so >=6 *may* still work - verify by
     boot-testing, don't assume.
   - **`pydantic`** - must land on a pydantic whose `pydantic-core==X` equals the version the dist
     ships (0.27.7 → 2.27.2 → **pydantic 2.10.x**). Pin pydantic explicitly or micropip tries to
     build a newer pydantic-core from source and fails.
3. **`dbt-duckdb`** only needs `duckdb>=1.0.0` for the base adapter (the `duckdb==1.4.x` pin is the
   MotherDuck `md` extra) - so most versions are fine against the dist's duckdb.

### The actual procedure
> Run these **inside `packages/dbt-wasm-engine/`** (the bare `npm run freeze`/`wheelhouse`/`gate`/`hello`
> names are that package's scripts). From the repo root, prefix with `engine:` where a root script
> exists (`engine:wheelhouse`/`engine:gate`/`engine:hello`) or use `-w @dbt-wasm/engine`.
1. Edit the `PINS` array (and Pyodide version comments) in **`boot.mjs`**; bump `pyodide` in
   `package.json` + `npm run fetch-dist` if you changed the Pyodide release.
2. `npm run freeze` - re-resolve the closure against the new pins → rewrites `wheelhouse-lock.json`
   (also re-checks the networkx-from-PyPI trim and that matplotlib/numpy stay out).
3. `npm run wheelhouse` - download the new vendored wheel set from the refreshed lock.
4. `npm run gate` - does it still **import** clean? (Watch for new `multiprocessing`/threading paths
   needing another stub, and for dbt-duckdb internals that move D13's patch targets.)
5. `npm run hello` - does it still **build**? (`PASS=3`).
6. If a stub breaks, `node debug-conn.mjs` traces the connection lifecycle; the D11–D14 stubs in
   `boot.mjs` are the usual suspects to re-target.
7. Record the new pinned set + any new stub/decision in `CLAUDE.md`.

> ⚠️ Watch for **resolver conflicts** like the dbt 1.10.8 `protobuf<6`/`>=6` skew (D20): because
> boot installs with `deps=False`, an inconsistent pin set won't error at install - it surfaces only
> at `npm run gate`/`hello`. If `npm run freeze` itself warns or a runtime import fails, inspect the
> conflicting `requires_dist` (the curl snippet above) and pick a coherent dbt-core/common/adapters set.

> Rule of thumb: **stay on the newest Pyodide that still ships duckdb**, then take the **newest
> dbt-core that still fits that release's `protobuf`/`pydantic-core`**. Bleeding-edge dbt will
> usually be one or two minors ahead of what the ABI allows.
