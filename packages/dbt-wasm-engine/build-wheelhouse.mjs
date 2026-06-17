// build-wheelhouse.mjs - Step 2.1: vendor the PyPI-sourced wheels locally.
//
// Reads wheelhouse-lock.json (the resolved 53-package closure from explore-deps.mjs) and
// downloads ONLY the packages micropip fetched from PyPI - the dbt-* stack + agate/babel/
// protobuf/pydantic/networkx/… - into wheelhouse/. The other ~24 packages are `pyodide`-sourced
// and ship with the self-hosted dist, so they're not vendored here.
//
// Output: wheelhouse/<wheel>.whl  +  wheelhouse/wheelhouse.json (name -> {version, file}).
// boot.mjs installs from these (via emfs:) instead of hitting PyPI -> deterministic, no throttling.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";

const __dir = dirname(fileURLToPath(import.meta.url));
const WHEELHOUSE = join(__dir, "wheelhouse");
const lock = JSON.parse(readFileSync(join(__dir, "wheelhouse-lock.json"), "utf8"));

mkdirSync(WHEELHOUSE, { recursive: true });

// A real User-Agent + retry/backoff: bare fetch() bursts get throttled by PyPI and can return a
// 200 with a truncated/stale body (the bug that made dbt-semantic-interfaces look wheel-less).
const UA = { "User-Agent": "dbt-wasm-lab-wheelhouse/0.1 (+local build script)" };
async function fetchRetry(url, { json = false, tries = 5 } = {}) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return json ? await r.json() : Buffer.from(await r.arrayBuffer());
    } catch (e) {
      lastErr = e;
      if (i < tries) await new Promise((res) => setTimeout(res, 800 * i + Math.random() * 600));
    }
  }
  throw new Error(`fetch ${url} failed after ${tries} tries: ${lastErr?.message}`);
}

// Resolve a package name+version to a pure-python wheel URL on PyPI.
// NB: do NOT skip yanked wheels - the lock is the source of truth, and the resolver legitimately
// pins some yanked-but-valid versions (e.g. dbt-semantic-interfaces 0.9.2). We reproduce exactly.
async function pypiWheelUrl(name, version) {
  const j = await fetchRetry(`https://pypi.org/pypi/${name}/${version}/json`, { json: true });
  const wheels = (j.urls || []).filter((u) => u.packagetype === "bdist_wheel");
  if (wheels.some((u) => u.yanked)) console.log(`     (note: ${name}==${version} wheel is yanked on PyPI; vendoring anyway - matches the lock)`);
  // every PyPI-sourced package in our closure is pure-python; the compiled ones come from the dist
  const pure =
    wheels.find((u) => /-py3-none-any\.whl$/.test(u.filename)) ||
    wheels.find((u) => /-py2\.py3-none-any\.whl$/.test(u.filename)) ||
    wheels.find((u) => /-none-any\.whl$/.test(u.filename));
  if (!pure) {
    throw new Error(
      `${name}==${version}: no pure-python (-none-any) wheel on PyPI (only: ${wheels
        .map((w) => w.filename)
        .join(", ")})`
    );
  }
  return { url: pure.url, filename: pure.filename };
}

const isDist = ([, meta]) => (meta.source || "").toLowerCase() === "pyodide";
const toVendor = Object.entries(lock).filter((e) => !isDist(e));
// The 24 dist-sourced packages: boot loadPackage()s these by name from the self-hosted dist.
// Capturing them here means boot installs the EXACT closure with NO resolver (deps=False) - so
// the internal dbt protobuf<6 / >=6 conflict never has to be resolved at all.
const pyodidePackages = Object.entries(lock)
  .filter(isDist)
  .map(([name]) => name)
  .sort();

console.log(`vendoring ${toVendor.length} PyPI-sourced wheels into wheelhouse/ …\n`);

const manifest = {};
let totalBytes = 0;
for (const [name, meta] of toVendor) {
  let url, filename;
  if (/^https?:\/\//.test(meta.source || "")) {
    url = meta.source;
    filename = url.split("/").pop();
  } else {
    ({ url, filename } = await pypiWheelUrl(name, meta.version));
  }
  const dest = join(WHEELHOUSE, filename);
  let buf;
  if (existsSync(dest) && statSync(dest).size > 0) {
    buf = readFileSync(dest); // resumable: skip re-download
    console.log(`  ${(buf.length / 1024).toFixed(0).padStart(6)} KB  ${filename}  (cached)`);
  } else {
    buf = await fetchRetry(url);
    writeFileSync(dest, buf);
    console.log(`  ${(buf.length / 1024).toFixed(0).padStart(6)} KB  ${filename}`);
  }
  totalBytes += buf.length;
  manifest[name] = { version: meta.version, file: filename };
}

writeFileSync(
  join(WHEELHOUSE, "wheelhouse.json"),
  JSON.stringify(
    {
      pyodide: "0.27.7",
      generated: "explore-deps.mjs -> build-wheelhouse.mjs",
      // installed by boot via micropip (emfs:, deps=False)
      packages: manifest,
      // installed by boot via py.loadPackage() from the self-hosted dist
      pyodidePackages,
    },
    null,
    2
  )
);

console.log(
  `\n✅ wheelhouse built: ${toVendor.length} wheels, ${(totalBytes / 1024 / 1024).toFixed(1)} MB total`
);
console.log(`   + ${pyodidePackages.length} dist packages recorded for loadPackage()`);
console.log(`   wrote wheelhouse/wheelhouse.json`);
