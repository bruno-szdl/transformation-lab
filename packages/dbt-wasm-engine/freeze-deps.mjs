// freeze-deps.mjs - wheelhouse pipeline, step 1 of 2 (re-run only when bumping versions).
// Boots Pyodide, forces networkx from PyPI (the D21 trim), installs the dbt PINS, and dumps the
// resolved 53-package closure (micropip.list()) to wheelhouse-lock.json - the lock that
// build-wheelhouse.mjs reads. Also confirms the matplotlib/numpy/Pillow stack stays out.
//
// Pipeline:  freeze-deps.mjs  ->  wheelhouse-lock.json  ->  build-wheelhouse.mjs  ->  wheelhouse/
//            (npm run freeze)                              (npm run wheelhouse)

import { loadPyodide } from "pyodide";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";
import { PINS, INDEX_URL } from "./boot.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));

// Find a pure-python networkx wheel on PyPI that satisfies dbt-core's `networkx>=2.3,<4`.
// The Pyodide-dist networkx over-declares matplotlib+numpy as HARD deps; PyPI's wheel has none.
async function pypiNetworkxWheelUrl() {
  const r = await fetch("https://pypi.org/pypi/networkx/json");
  const j = await r.json();
  // pick the newest 3.x py3-none-any wheel (zero hard deps, requires py>=3.10 - fine on 3.12)
  const candidates = [];
  for (const [ver, files] of Object.entries(j.releases)) {
    if (!/^3\.\d+(\.\d+)?$/.test(ver)) continue;
    const whl = files.find(
      (f) => f.packagetype === "bdist_wheel" && f.filename.endsWith("-py3-none-any.whl") && !f.yanked
    );
    if (whl) candidates.push({ ver, url: whl.url });
  }
  candidates.sort((a, b) =>
    a.ver.localeCompare(b.ver, undefined, { numeric: true })
  );
  return candidates[candidates.length - 1];
}

const nx = await pypiNetworkxWheelUrl();
console.log(`networkx from PyPI: ${nx.ver}\n  ${nx.url}`);

const py = await loadPyodide({
  indexURL: INDEX_URL,
  stdout: (s) => process.stdout.write("[py] " + s + "\n"),
  stderr: (s) => process.stderr.write("[py:err] " + s + "\n"),
});
await py.loadPackage("micropip");

// D5 dbt-extractor mock (needed so micropip's resolver is happy with the requirement).
await py.runPythonAsync(`
import micropip
micropip.add_mock_package(
    "dbt-extractor", "0.5.1",
    modules={"dbt_extractor": (
        "class ExtractionError(Exception):\\n    pass\\n\\n"
        "def py_extract_from_source(source):\\n    raise ExtractionError('stub')\\n"
    )},
)
`);

py.globals.set("NX_URL", nx.url);
py.globals.set("PINS_JSON", JSON.stringify(PINS));

const out = await py.runPythonAsync(`
import micropip, json, traceback

async def go():
    # 1) install networkx FIRST, from the explicit PyPI URL -> bypasses the lockfile's bad build
    await micropip.install([NX_URL])
    # 2) now install the dbt pins; networkx is already satisfied, so the dist build is skipped
    await micropip.install(json.loads(PINS_JSON), keep_going=True)
    # micropip.list() = ONLY what's actually installed (closure), each with its real source URL
    installed = micropip.list()
    return {
        name: {"version": meta.version, "source": meta.source}
        for name, meta in installed.items()
    }

try:
    pkgs = await go()
    _result = {"ok": True, "packages": pkgs}
except Exception:
    _result = {"ok": False, "error": traceback.format_exc()}
json.dumps(_result)
`);

const res = JSON.parse(out);
if (!res.ok) {
  console.error("INSTALL FAILED:\n" + res.error);
  process.exit(1);
}

const pkgs = res.packages;
const names = Object.keys(pkgs).sort();

writeFileSync(join(__dir, "wheelhouse-lock.json"), JSON.stringify(pkgs, null, 2));

// Report: actual installed closure, split by where the wheel comes from.
const SPURIOUS = ["matplotlib", "numpy", "pillow", "contourpy", "fonttools", "kiwisolver", "cycler"];
console.log(`\n=== installed closure: ${names.length} packages ===`);
for (const n of names) {
  const p = pkgs[n];
  const flag = SPURIOUS.includes(n.toLowerCase()) ? "   <-- SPURIOUS" : "";
  console.log(`  ${n.padEnd(28)} ${String(p.version).padEnd(12)} ${p.source || "(builtin/mock)"}${flag}`);
}
const leaked = names.filter((n) => SPURIOUS.includes(n.toLowerCase()));
console.log(
  leaked.length
    ? `\n⚠️  matplotlib stack present: ${leaked.join(", ")}`
    : `\n✅ trim worked: no matplotlib/numpy/Pillow in the installed closure`
);
console.log(`networkx version installed: ${pkgs.networkx?.version}  (source: ${pkgs.networkx?.source})`);
console.log(`\nwrote wheelhouse-lock.json (${names.length} packages)`);
process.exit(0);
