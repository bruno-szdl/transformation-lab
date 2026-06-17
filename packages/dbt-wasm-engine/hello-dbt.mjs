// hello-dbt.mjs - Step 1 (CLAUDE.md). Minimal real dbt project in Pyodide's MEMFS, run end to
// end with the programmatic dbtRunner (D4), then read back the REAL target/manifest.json.
//
// profile: duckdb, :memory:, threads:1 (D6), telemetry off (D8).

import { bootDbt } from "./boot.mjs";

function banner(t) {
  console.log("\n" + "=".repeat(72) + "\n" + t + "\n" + "=".repeat(72));
}

// --- The minimal project (one seed + one model on top of it) ---------------
const PROJECT = {
  "/project/dbt_project.yml": `name: hello
version: "1.0.0"
config-version: 2
profile: hello
model-paths: ["models"]
seed-paths: ["seeds"]
flags:
  send_anonymous_usage_stats: false
`,
  "/project/profiles.yml": `hello:
  target: dev
  outputs:
    dev:
      type: duckdb
      path: "/project/warehouse.duckdb"
      threads: 1
`,
  "/project/seeds/raw_customers.csv": `id,name
1,Alice
2,Bob
3,Carol
`,
  "/project/models/customers.sql": `select id, name from {{ ref('raw_customers') }}
`,
  "/project/models/customer_count.sql": `select count(*) as n_customers from {{ ref('customers') }}
`,
};

banner("Step 1: boot engine (Pyodide + dbt-core 1.10.8 + dbt-duckdb 1.9.6)");
const py = await bootDbt({ verbose: true });

banner("write minimal project into MEMFS");
py.globals.set("PROJECT_JSON", JSON.stringify(PROJECT));
await py.runPythonAsync(`
import os, json
files = json.loads(PROJECT_JSON)
for path, content in files.items():
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
print("wrote:", *sorted(files.keys()), sep="\\n  ")
`);

banner("invoke: dbtRunner().invoke(['seed']) then (['build'])");
const runJson = await py.runPythonAsync(`
import os, json, traceback
# telemetry off (D8), belt-and-suspenders alongside the yaml config
os.environ["DO_NOT_TRACK"] = "1"
os.environ["DBT_SEND_ANONYMOUS_USAGE_STATS"] = "false"

# NOTE: we do NOT pass --single-threaded. With the D12 synchronous-ThreadPoolExecutor patch,
# dbt uses its normal MultiThreadedExecutor (max_workers=threads=1) running inline, which keeps
# correct per-task connection_named semantics (single-threaded mode's no-op connection_named
# leaves dbt-duckdb reusing a closed cursor -> "Connection already closed!").
ARGS = ["--project-dir", "/project", "--profiles-dir", "/project"]
out = {"steps": []}
try:
    from dbt.cli.main import dbtRunner
    runner = dbtRunner()
    for cmd in (["seed"], ["build"]):
        res = runner.invoke(cmd + ARGS)
        step = {"cmd": cmd[0], "success": bool(res.success)}
        if res.exception is not None:
            step["exception"] = "".join(
                traceback.format_exception(type(res.exception), res.exception, res.exception.__traceback__)
            )
        # summarize per-node results when present
        try:
            step["nodes"] = [
                {"node": r.node.unique_id, "status": str(r.status)} for r in (res.result or [])
            ]
        except Exception:
            pass
        out["steps"].append(step)
        if not res.success:
            break
except Exception:
    out["fatal"] = traceback.format_exc()
json.dumps(out)
`);
const run = JSON.parse(runJson);

banner("RESULT");
if (run.fatal) {
  console.log("FATAL before/within invoke:\n" + run.fatal);
}
for (const s of run.steps || []) {
  console.log(`  ${s.success ? "✅" : "❌"} dbt ${s.cmd}`);
  for (const n of s.nodes || []) console.log(`        ${n.status.padEnd(8)} ${n.node}`);
  if (s.exception) console.log(s.exception.split("\n").map((l) => "      " + l).join("\n"));
}

const allOk = (run.steps || []).length > 0 && run.steps.every((s) => s.success) && !run.fatal;

// --- Read back the REAL manifest dbt wrote (this is dbt's true lineage) -----
if (allOk) {
  banner("read target/manifest.json (dbt's real artifacts)");
  const manifestSummary = await py.runPythonAsync(`
import json
m = json.load(open("/project/target/manifest.json"))
nodes = m.get("nodes", {})
summary = {
    "dbt_schema_version": m.get("metadata", {}).get("dbt_schema_version"),
    "dbt_version": m.get("metadata", {}).get("dbt_version"),
    "node_count": len(nodes),
    "nodes": sorted(nodes.keys()),
    # dbt's resolved lineage (depends_on) - the thing we'd render as the DAG in Step 2
    "lineage": {
        uid: n.get("depends_on", {}).get("nodes", [])
        for uid, n in nodes.items()
    },
}
json.dumps(summary, indent=2)
`);
  console.log(manifestSummary);

  // Also prove the model actually executed against DuckDB by checking run_results.
  const ranOk = await py.runPythonAsync(`
import json
rr = json.load(open("/project/target/run_results.json"))
json.dumps([{ "node": r["unique_id"], "status": r["status"] } for r in rr.get("results", [])])
`);
  console.log("\nrun_results.json:", ranOk);
}

banner(allOk ? "STEP 1 PASSED ✅  - real dbt built a project against DuckDB in the browser engine"
             : "STEP 1 FAILED ❌");
process.exit(allOk ? 0 : 1);
