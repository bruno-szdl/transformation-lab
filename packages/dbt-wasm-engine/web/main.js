// web/main.js - the engine package's own dev/test harness. Drives the PUBLIC API
// (createDbtEngine) exactly as a real app would, so the headless browser gate doubles as the
// smoke test for the client + worker. Owns its own "hello" project (the engine is project-agnostic).

import { createDbtEngine } from "../src/client.js";

const $ = (id) => document.getElementById(id);
const terminal = $("terminal");
const statusEl = $("status");
const verdictEl = $("verdict");
const lineageEl = $("lineage");
const buildBtn = $("build");

const PHASE_TEXT = {
  "loading-pyodide": "downloading Pyodide (CPython→wasm) from CDN…",
  "loading-micropip": "loading micropip…",
  "installing-wheelhouse": "installing dbt + duckdb wheels…",
  "applying-stubs": "applying wasm-compat stubs (D5/D11–D14)…",
};

function term(line) {
  terminal.appendChild(document.createTextNode(line + "\n"));
  terminal.scrollTop = terminal.scrollHeight;
}

const dbt = createDbtEngine({
  wheelhouseUrl: "/wheelhouse/",
  onOutput: (line) => term(line),
  onStatus: (phase) => (statusEl.textContent = PHASE_TEXT[phase] || phase),
});

// The minimal "hello" project (same shape as hello-dbt.mjs). Models come from the editable UI.
function projectFiles() {
  return {
    "dbt_project.yml": `name: hello
version: "1.0.0"
config-version: 2
profile: hello
model-paths: ["models"]
seed-paths: ["seeds"]
flags:
  send_anonymous_usage_stats: false
`,
    "profiles.yml": `hello:
  target: dev
  outputs:
    dev:
      type: duckdb
      path: "/project/warehouse.duckdb"
      threads: 1
`,
    "seeds/raw_customers.csv": $("seed").value + "\n",
    "models/customers.sql": $("m1").value,
    "models/customer_count.sql": $("m2").value,
  };
}

function renderLineage(lineage) {
  lineageEl.innerHTML = "";
  const short = (uid) => uid.split(".").slice(2).join(".") || uid;
  for (const [uid, deps] of Object.entries(lineage)) {
    const li = document.createElement("li");
    li.innerHTML = deps.length
      ? `${deps.map(short).join(", ")} <span class="arrow">→</span> <strong>${short(uid)}</strong>`
      : `<strong>${short(uid)}</strong> <span class="arrow">(source)</span>`;
    lineageEl.appendChild(li);
  }
}

async function build() {
  buildBtn.disabled = true;
  verdictEl.textContent = "";
  verdictEl.className = "";
  lineageEl.innerHTML = "";
  try {
    await dbt.reset();
    await dbt.writeFiles(projectFiles());
    const seed = await dbt.invoke(["seed"]);
    const built = seed.success ? await dbt.invoke(["build"]) : seed;

    const rr = JSON.parse((await dbt.readArtifact("target/run_results.json")) || "null");
    const runResults = (rr?.results || []).map((r) => ({ node: r.unique_id, status: r.status }));
    const n = runResults.filter((r) => r.status === "success").length;
    const ok = !!built.success && !seed.fatal && !built.fatal && n > 0;

    if (ok) {
      const manifest = JSON.parse(await dbt.readArtifact("target/manifest.json"));
      const lineage = Object.fromEntries(
        Object.entries(manifest.nodes).map(([uid, node]) => [uid, node.depends_on?.nodes ?? []])
      );
      renderLineage(lineage);
      window.__RESULT__ = { pass: true, n, dbtVersion: manifest.metadata?.dbt_version || null };
      verdictEl.textContent = `✅ PASS=${n} - real dbt built ${n} nodes against DuckDB-wasm, in your browser`;
      verdictEl.className = "pass";
    } else {
      for (const s of [seed, built]) if (s.exception) term(s.exception);
      for (const s of [seed, built]) if (s.fatal) term(s.fatal);
      window.__RESULT__ = { pass: false, n, dbtVersion: null };
      verdictEl.textContent = "❌ build failed - see terminal output";
      verdictEl.className = "fail";
    }
    statusEl.textContent = "engine ready - edit a model and Build again";
  } catch (err) {
    term(String(err));
    window.__RESULT__ = { pass: false, n: 0, error: String(err) };
    verdictEl.textContent = "❌ engine error - see terminal";
    verdictEl.className = "fail";
  } finally {
    buildBtn.disabled = false;
  }
}

buildBtn.addEventListener("click", build);

(async () => {
  const { bootSeconds } = await dbt.boot();
  statusEl.textContent = `engine ready (booted in ${bootSeconds}s) - building…`;
  await build(); // auto-run once so the headless gate sees a result without clicking
})();
