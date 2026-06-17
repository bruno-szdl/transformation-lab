// spike.mjs - Step 0 GATE (CLAUDE.md): can real dbt-core + dbt-duckdb load & import inside
// Pyodide at all? Headless Node so we read tracebacks directly. The engine setup (pinned wheel
// set + D5/D11/D12/D14 stubs) lives in boot.mjs; this file is just the import gate on top of it.
//
// GATE: `import duckdb` and `import dbt.cli.main` must succeed. The #1 risk was multiprocessing
// (Pyodide ships no _multiprocessing C extension) - cleared by the D11 threading-backed stub.

import { bootDbt } from "./boot.mjs";

function banner(t) {
  console.log("\n" + "=".repeat(72) + "\n" + t + "\n" + "=".repeat(72));
}

banner("Boot engine (Pyodide 0.27.7 + dbt-core 1.10.8 + dbt-duckdb 1.9.6 + stubs)");
const py = await bootDbt({ verbose: true });

banner("THE GATE: import duckdb, then import dbt.cli.main");
const importReport = await py.runPythonAsync(`
import json, traceback
report = {}

try:
    import duckdb
    report["duckdb_import"] = {"ok": True, "version": getattr(duckdb, "__version__", "?")}
except Exception:
    report["duckdb_import"] = {"ok": False, "error": traceback.format_exc()}

try:
    import dbt.cli.main
    from dbt.version import __version__ as dbtv
    report["dbt_import"] = {"ok": True, "version": dbtv}
except Exception:
    report["dbt_import"] = {"ok": False, "error": traceback.format_exc()}

try:
    from dbt.cli.main import dbtRunner
    dbtRunner()
    report["dbtRunner_construct"] = {"ok": True}
except Exception:
    report["dbtRunner_construct"] = {"ok": False, "error": traceback.format_exc()}

json.dumps(report)
`);
const ir = JSON.parse(importReport);

banner("RESULT");
for (const [k, v] of Object.entries(ir)) {
  if (v.ok) {
    console.log(`  ✅ ${k}  ${v.version ? "(" + v.version + ")" : ""}`);
  } else {
    console.log(`  ❌ ${k}`);
    console.log(v.error.split("\n").map((l) => "       " + l).join("\n"));
  }
}

const clean = ir.duckdb_import?.ok && ir.dbt_import?.ok;
banner(clean ? "GATE PASSED ✅  - dbt-core + dbt-duckdb import clean in Pyodide" : "GATE FAILED ❌");
process.exit(clean ? 0 : 1);
