// @dbt-wasm/engine - the generic engine Web Worker (project-agnostic RPC).
//
// Boots Pyodide from a CDN, installs the vendored wheelhouse over HTTP, applies the shared
// wasm-compat stubs (D5/D11–D14, from ../engine-stubs.mjs), then services request/response RPC
// messages from the main-thread client (src/client.js):
//
//   {id, type:"boot",        payload:{pyodideIndexUrl?, wheelhouseUrl?}} -> {bootSeconds}
//   {id, type:"writeFiles",  payload:{ "<rel>": "<content>", ... }}      -> {written}
//   {id, type:"invoke",      payload:["build","--select","x", ...]}      -> {success, nodes, exception?, fatal?}
//   {id, type:"readArtifact",payload:"target/manifest.json"}            -> string | null
//   {id, type:"reset"}                                                   -> {ok:true}
//
// Plus fire-and-forget broadcasts (no id): {type:"status",phase} and {type:"log",stream,line}.

import { registerExtractorMock, applyEngineStubs } from "../engine-stubs.mjs";

const DEFAULT_CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
const PROJECT_DIR = "/project";

let py = null;
let wheelhouseUrl = "/wheelhouse/";

// Resolve the active warehouse db path from /project/profiles.yml (the duckdb target dbt will use)
// so query()/reset() hit the SAME DuckDB file dbt writes to - even if a lesson edits the path. We
// return the path string VERBATIM (no abspath): dbt-duckdb just passes `path` to duckdb.connect, so
// a relative path resolves against the process cwd identically for dbt and for us (same process).
// Falls back to the default warehouse on a missing/malformed/non-duckdb profile, so a broken profile
// yields a clean dbt error (educational), not a silently desynced catalog. (D30)
const RESOLVE_WAREHOUSE_PY = `
def _resolve_warehouse_path(project_dir):
    import os
    default = os.path.join(project_dir, "warehouse.duckdb")
    try:
        import yaml
        prof_p = os.path.join(project_dir, "profiles.yml")
        if not os.path.exists(prof_p):
            return default
        with open(prof_p) as _f:
            profiles = yaml.safe_load(_f) or {}
        if not isinstance(profiles, dict):
            return default
        # Which profile does dbt_project.yml select? (fall back to the sole profile if unambiguous)
        profile_name = None
        proj_p = os.path.join(project_dir, "dbt_project.yml")
        if os.path.exists(proj_p):
            with open(proj_p) as _f:
                proj = yaml.safe_load(_f) or {}
            if isinstance(proj, dict):
                profile_name = proj.get("profile")
        prof = None
        if profile_name and isinstance(profiles.get(profile_name), dict):
            prof = profiles[profile_name]
        else:
            _dk = [k for k, v in profiles.items() if isinstance(v, dict)]
            if len(_dk) == 1:
                prof = profiles[_dk[0]]
        if not isinstance(prof, dict):
            return default
        outputs = prof.get("outputs")
        if not isinstance(outputs, dict) or not outputs:
            return default
        target = prof.get("target")
        if target not in outputs:
            target = next(iter(outputs)) if len(outputs) == 1 else None
        out = outputs.get(target) if target is not None else None
        if not isinstance(out, dict) or out.get("type") != "duckdb":
            return default
        path = out.get("path")
        if not isinstance(path, str) or not path:
            return default
        return path
    except Exception:
        return default
`;

const post = (msg) => self.postMessage(msg);
const log = (line, stream = "out") => post({ type: "log", stream, line });
const status = (phase) => post({ type: "status", phase });

async function boot(opts = {}) {
  const cdn = opts.pyodideIndexUrl || DEFAULT_CDN;
  wheelhouseUrl = opts.wheelhouseUrl || wheelhouseUrl;

  status("loading-pyodide");
  const t0 = performance.now();
  // @vite-ignore: this is a runtime CDN URL - bundlers must not try to resolve/bundle it.
  const { loadPyodide } = await import(/* @vite-ignore */ cdn + "pyodide.mjs");
  py = await loadPyodide({
    indexURL: cdn,
    stdout: (s) => log(s, "out"),
    stderr: (s) => log(s, "err"),
  });

  status("loading-micropip");
  await py.loadPackage("micropip");
  await registerExtractorMock(py); // D5 - before install

  status("installing-wheelhouse");
  const manifest = await (await fetch(wheelhouseUrl + "wheelhouse.json")).json();
  await py.loadPackage(manifest.pyodidePackages); // 25 dist packages from the CDN
  const urls = Object.values(manifest.packages).map(
    (p) => new URL(wheelhouseUrl + p.file, self.location.href).href
  );
  py.globals.set("WHEEL_URLS", JSON.stringify(urls));
  const res = JSON.parse(
    await py.runPythonAsync(`
import micropip, json, traceback
_r = None
try:
    await micropip.install(json.loads(WHEEL_URLS), deps=False)   # D20: no resolver
    _r = {"ok": True}
except Exception:
    _r = {"ok": False, "error": traceback.format_exc()}
json.dumps(_r)
`)
  );
  if (!res.ok) throw new Error("wheelhouse install failed:\n" + res.error);

  status("applying-stubs");
  await applyEngineStubs(py); // D11/D12/D14 then D13

  py.globals.set("PROJECT_DIR", PROJECT_DIR);
  await py.runPythonAsync(`import os; os.makedirs(PROJECT_DIR, exist_ok=True)`);

  return { bootSeconds: Number(((performance.now() - t0) / 1000).toFixed(1)) };
}

function ensureBooted() {
  if (!py) throw new Error("engine not booted - call boot() first");
}

async function writeFiles(files) {
  ensureBooted();
  py.globals.set("FILES_JSON", JSON.stringify(files));
  py.globals.set("PROJECT_DIR", PROJECT_DIR);
  await py.runPythonAsync(`
import os, json
base = PROJECT_DIR
for rel, content in json.loads(FILES_JSON).items():
    path = os.path.join(base, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
`);
  return { written: Object.keys(files).length };
}

// Replace the project's dbt-resource files with exactly `files`: prune the standard resource dirs
// (models/seeds/snapshots/tests/analyses/macros - they're 100% caller-controlled) and then write the
// new set. This makes a rename/delete in the editor actually disappear from the in-Pyodide project;
// a plain writeFiles only ADDS, so a renamed model would linger and dbt would see a duplicate node.
// Raw CSVs (.lab_raw/*), target/, logs/ and the warehouse db are NOT pruned.
const RESOURCE_DIRS = ["models", "seeds", "snapshots", "tests", "analyses", "macros"];
async function syncProject(files) {
  ensureBooted();
  py.globals.set("FILES_JSON", JSON.stringify(files));
  py.globals.set("RESOURCE_DIRS_JSON", JSON.stringify(RESOURCE_DIRS));
  py.globals.set("PROJECT_DIR", PROJECT_DIR);
  await py.runPythonAsync(`
import os, json
base = PROJECT_DIR
# 1. Prune the resource dirs so stale (renamed/deleted) files don't survive.
for d in json.loads(RESOURCE_DIRS_JSON):
    p = os.path.join(base, d)
    if os.path.isdir(p):
        for root, dirs, fs in os.walk(p, topdown=False):
            for f in fs:
                try:
                    os.remove(os.path.join(root, f))
                except OSError:
                    pass
            for dd in dirs:
                try:
                    os.rmdir(os.path.join(root, dd))
                except OSError:
                    pass
# 2. Write the new set (recreates whatever should still exist).
for rel, content in json.loads(FILES_JSON).items():
    path = os.path.join(base, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as fh:
        fh.write(content)
`);
  return { written: Object.keys(files).length };
}

async function invoke(args) {
  ensureBooted();
  py.globals.set("ARGS_JSON", JSON.stringify(args));
  py.globals.set("PROJECT_DIR", PROJECT_DIR);
  // No --single-threaded (D17); telemetry off (D8). dbt writes target/* artifacts we read back.
  const out = await py.runPythonAsync(`
import os, json, traceback
os.environ["DO_NOT_TRACK"] = "1"
os.environ["DBT_SEND_ANONYMOUS_USAGE_STATS"] = "false"

args = json.loads(ARGS_JSON)
full = list(args) + ["--project-dir", PROJECT_DIR, "--profiles-dir", PROJECT_DIR]
out = {}
try:
    from dbt.cli.main import dbtRunner
    res = dbtRunner().invoke(full)
    out["success"] = bool(res.success)
    if res.exception is not None:
        out["exception"] = "".join(
            traceback.format_exception(type(res.exception), res.exception, res.exception.__traceback__)
        )
    try:
        out["nodes"] = [{"node": r.node.unique_id, "status": str(r.status)} for r in (res.result or [])]
    except Exception:
        out["nodes"] = []
except Exception:
    out["fatal"] = traceback.format_exc()
json.dumps(out)
`);
  return JSON.parse(out);
}

// Run arbitrary SQL against the project's warehouse and return {columns, rows}.
// The warehouse path is RESOLVED from the active /project/profiles.yml (D30), so editing the
// profile's duckdb `path:` keeps this read pointed at the same file dbt writes to. A fresh read-write
// duckdb.connect to that file coexists with dbt's own connection (DuckDB shares the database instance
// for same-config connections within one process - verified), so this works whether dbt has run yet
// or not. Used for `dbt show` previews, the warehouse catalog (DatabaseExplorer), and materializing
// a lesson's pre-existing raw/source tables.
async function query(sql) {
  ensureBooted();
  py.globals.set("SQL", sql);
  py.globals.set("PROJECT_DIR", PROJECT_DIR);
  const out = await py.runPythonAsync(`
import os, json, traceback, duckdb
${RESOLVE_WAREHOUSE_PY}
_path = _resolve_warehouse_path(PROJECT_DIR)
_r = None
_con = None
try:
    _con = duckdb.connect(_path)
    _cur = _con.execute(SQL)
    if _cur.description:
        _cols = [d[0] for d in _cur.description]
        _rows = _cur.fetchall()
    else:
        _cols, _rows = [], []
    # default=str coerces Decimal/date/datetime/etc. into JSON-safe strings.
    _r = {"ok": True, "columns": _cols, "rows": _rows}
except Exception:
    _r = {"ok": False, "error": traceback.format_exc()}
finally:
    if _con is not None:
        _con.close()
json.dumps(_r, default=str)
`);
  const res = JSON.parse(out);
  if (!res.ok) throw new Error("query failed:\n" + res.error);
  return { columns: res.columns, rows: res.rows };
}

async function readArtifact(relPath) {
  ensureBooted();
  py.globals.set("REL", relPath);
  py.globals.set("PROJECT_DIR", PROJECT_DIR);
  const out = await py.runPythonAsync(`
import os, json
p = os.path.join(PROJECT_DIR, REL)
json.dumps(open(p).read() if os.path.exists(p) else None)
`);
  return JSON.parse(out); // file contents as string, or null if missing
}

async function reset() {
  ensureBooted();
  py.globals.set("PROJECT_DIR", PROJECT_DIR);
  // Reset to an empty project. CRITICAL: never delete a DuckDB file while a connection is open on it
  // (dbt keeps connections alive - D13) - deleting an open db file corrupts DuckDB and aborts the
  // wasm runtime (D26). So we clear the warehouse by DROPping its objects via SQL, and delete only
  // the non-database project files. The warehouse path is RESOLVED from the active profiles.yml (D30)
  // so a lesson that edited the duckdb `path:` gets the right db dropped + preserved.
  await py.runPythonAsync(`
import os, duckdb
${RESOLVE_WAREHOUSE_PY}
_wh = _resolve_warehouse_path(PROJECT_DIR)
_keep = os.path.basename(_wh)

# 1. Drop every user object (views first, then tables, then non-builtin schemas).
if os.path.exists(_wh):
    _con = duckdb.connect(_wh)
    try:
        _tbls = _con.execute(
            "select table_schema, table_name, table_type from information_schema.tables "
            "where table_schema not in ('information_schema','pg_catalog')"
        ).fetchall()
        for sch, name, ttype in sorted(_tbls, key=lambda r: 0 if r[2] == 'VIEW' else 1):
            kw = 'VIEW' if ttype == 'VIEW' else 'TABLE'
            try:
                _con.execute('DROP %s IF EXISTS "%s"."%s" CASCADE' % (kw, sch, name))
            except Exception:
                pass
        _schemas = _con.execute(
            "select schema_name from information_schema.schemata "
            "where schema_name not in ('information_schema','pg_catalog','main','temp','system')"
        ).fetchall()
        for row in _schemas:
            try:
                _con.execute('DROP SCHEMA IF EXISTS "%s" CASCADE' % row[0])
            except Exception:
                pass
    finally:
        _con.close()

# 2. Remove project files, preserving any DuckDB database file (the active warehouse + its sidecars,
#    plus any db file a prior lesson's custom path created). Deleting an open db file would abort the
#    wasm runtime (D26); a now-inactive custom db is harmless (objects already dropped while active).
def _is_db_file(name):
    return (".duckdb" in name) or (name == _keep) or name.startswith(_keep + ".")
if os.path.isdir(PROJECT_DIR):
    for root, dirs, files in os.walk(PROJECT_DIR, topdown=False):
        for f in files:
            if _is_db_file(f):
                continue
            try:
                os.remove(os.path.join(root, f))
            except OSError:
                pass
        for d in dirs:
            try:
                os.rmdir(os.path.join(root, d))
            except OSError:
                pass
os.makedirs(PROJECT_DIR, exist_ok=True)
`);
  return { ok: true };
}

const HANDLERS = { boot, writeFiles, syncProject, invoke, query, readArtifact, reset };

self.onmessage = async (e) => {
  const { id, type, payload } = e.data || {};
  const handler = HANDLERS[type];
  if (!handler) {
    post({ id, ok: false, error: `unknown request type: ${type}` });
    return;
  }
  try {
    const result = await handler(payload);
    post({ id, ok: true, result });
  } catch (err) {
    post({ id, ok: false, error: String((err && err.stack) || err) });
  }
};
