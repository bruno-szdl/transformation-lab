// boot.mjs - the proven Step-0 boot sequence for the NODE harness (spike.mjs, hello-dbt.mjs).
// Brings up Pyodide 0.27.7, installs the pinned dbt-core/dbt-duckdb wheel set from the local
// wheelhouse, and applies the wasm-compat stubs that make dbt import & run.
//
// The engine "magic" (the D5/D11/D12/D13/D14 Python stubs) lives in `engine-stubs.mjs`, shared
// with the browser Web Worker (web/worker.js). This file is just the Node-specific plumbing:
// self-hosted dist core (D18) + local wheelhouse install (D19/D20).

import { loadPyodide } from "pyodide";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { registerExtractorMock, applyEngineStubs } from "./engine-stubs.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));

// Local wheelhouse (Step 2.1): the exact PyPI-sourced wheel closure, vendored by
// build-wheelhouse.mjs. Installing from here (via emfs:) makes boot deterministic and
// PyPI-independent - no more micropip burst-throttling. The other ~24 packages are
// `pyodide`-sourced and come from the dist automatically (micropip loadPackage).
export const WHEELHOUSE_DIR = join(__dir, "wheelhouse");
const WHEELHOUSE_MANIFEST = join(WHEELHOUSE_DIR, "wheelhouse.json");

// ---------------------------------------------------------------------------
// Locked version set - the D7 dependency-ABI intersection for Pyodide 0.27.7.
// (Python 3.12.7 / emscripten_3_1_58.) See CLAUDE.md Decisions log.
// ---------------------------------------------------------------------------
export const PINS = [
  "dbt-core==1.10.8",   // latest 1.10.x still on protobuf<6 (repo ships protobuf via PyPI anyway)
  "dbt-duckdb==1.9.6",  // needs only duckdb>=1.0.0 -> repo's 1.1.2 satisfies
  "pydantic==2.10.6",   // -> pydantic-core==2.27.2, which the Pyodide repo ships
];

// Full local Pyodide dist (core + lockfile + all .whl). The Node build of loadPyodide
// imports pyodide.asm.js as a LOCAL module, so the core can't be served from a remote URL,
// and the npm package omits the compiled wheels. Self-hosting the full dist mirrors prod.
export const INDEX_URL = join(__dir, "pyodide-dist", "pyodide") + "/";

const log = (verbose, ...a) => verbose && console.log(...a);

// Step 2.1 install path: install the EXACT pinned closure with NO dependency resolver.
//  (a) loadPackage() the 24 dist-sourced packages by name (compiled wheels duckdb/pydantic-core/
//      msgpack/… + pure-python jinja2/requests/… straight from the self-hosted dist).
//  (b) micropip.install(emfs wheels, deps=False) the 28 vendored PyPI wheels RAW.
// deps=False is deliberate: the dbt 1.10.8 set is internally inconsistent (dbt-core wants
// protobuf<6, dbt-common/dbt-adapters want >=6 - no version satisfies all three; 6.33.6 works at
// runtime, proven in Step 1). Skipping resolution sidesteps the unsolvable constraint AND removes
// all PyPI/throttling. networkx 3.6.1 (pure-python) is one of the vendored wheels, so the dist's
// networkx - which over-declares matplotlib+numpy as hard deps - is never pulled (~11.6 MB saved).
async function installFromWheelhouse(py, verbose) {
  const manifest = JSON.parse(readFileSync(WHEELHOUSE_MANIFEST, "utf8"));

  // (a) dist packages by name
  await py.loadPackage(manifest.pyodidePackages);

  // (b) vendored wheels -> MEMFS -> micropip install raw (no deps)
  try {
    py.FS.mkdir("/wheelhouse");
  } catch {
    /* already exists */
  }
  const emfsUrls = [];
  for (const { file } of Object.values(manifest.packages)) {
    const bytes = readFileSync(join(WHEELHOUSE_DIR, file));
    py.FS.writeFile("/wheelhouse/" + file, new Uint8Array(bytes));
    emfsUrls.push("emfs:/wheelhouse/" + file);
  }
  const installPy = `
import micropip, json, traceback
_result = None
try:
    await micropip.install(${JSON.stringify(emfsUrls)}, deps=False)
    _result = {"ok": True}
except Exception:
    _result = {"ok": False, "error": traceback.format_exc()}
json.dumps(_result)
`;
  const res = JSON.parse(await py.runPythonAsync(installPy));
  if (!res.ok) throw new Error("wheelhouse install failed:\n" + res.error);
  log(
    verbose,
    `   installed ${manifest.pyodidePackages.length} dist + ${emfsUrls.length} vendored wheels (no PyPI, no resolver)`
  );
}

// Fallback install path: resolve PINS live against PyPI. Used only when the wheelhouse is absent
// (run `node build-wheelhouse.mjs` to create it). micropip fires ~50 concurrent requests per
// attempt and bursts get rate-limited - so retry with backoff until resolution sticks.
async function installFromPyPI(py, verbose, maxInstallTries) {
  const installPy = `
import micropip, json, traceback
_result = None
try:
    await micropip.install(${JSON.stringify(PINS)}, keep_going=True)
    _result = {"ok": True}
except Exception:
    _result = {"ok": False, "error": traceback.format_exc()}
json.dumps(_result)
`;
  for (let attempt = 1; attempt <= maxInstallTries; attempt++) {
    const res = JSON.parse(await py.runPythonAsync(installPy));
    if (res.ok) {
      log(verbose, `   micropip.install OK (attempt ${attempt}/${maxInstallTries})`);
      return;
    }
    log(verbose, `   install attempt ${attempt}/${maxInstallTries} throttled; retrying`);
    if (attempt === maxInstallTries) {
      throw new Error("micropip.install failed after retries:\n" + res.error);
    }
    const wait = Math.min(6000 + 1500 * attempt, 20000) + Math.floor(Math.random() * 2000);
    await new Promise((r) => setTimeout(r, wait));
  }
}

/**
 * Boot Pyodide with dbt-core + dbt-duckdb fully importable.
 * Returns the live Pyodide instance (engine ready; nothing invoked yet).
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.verbose=true]
 * @param {number}  [opts.maxInstallTries=20]  retries for the PyPI fallback path
 * @param {boolean} [opts.useWheelhouse=true]  install from the local wheelhouse if present
 */
export async function bootDbt({ verbose = true, maxInstallTries = 20, useWheelhouse = true } = {}) {
  const py = await loadPyodide({
    indexURL: INDEX_URL,
    stdout: (s) => verbose && process.stdout.write("[py] " + s + "\n"),
    stderr: (s) => verbose && process.stderr.write("[py:err] " + s + "\n"),
  });

  await py.loadPackage("micropip");

  // D5 mock - must precede the install so dbt-extractor's requirement is satisfied by the mock.
  await registerExtractorMock(py);

  if (useWheelhouse && existsSync(WHEELHOUSE_MANIFEST)) {
    await installFromWheelhouse(py, verbose);
  } else {
    log(verbose, "   no wheelhouse found -> installing from PyPI (run build-wheelhouse.mjs to fix)");
    await installFromPyPI(py, verbose, maxInstallTries);
  }

  // D11/D12/D14 patch stdlib before dbt imports it; D13 imports dbt-duckdb and runs last.
  await applyEngineStubs(py);

  return py;
}
