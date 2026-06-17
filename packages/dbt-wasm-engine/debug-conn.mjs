// debug-conn.mjs - trace dbt-duckdb's connection lifecycle to find what closes the connection
// before the first query. Boots the engine, monkeypatches LocalEnvironment + ConnectionManager
// with prints, then runs a single `dbt seed`.

import { bootDbt } from "./boot.mjs";

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
`,
};

const py = await bootDbt({ verbose: true });

py.globals.set("PROJECT_JSON", JSON.stringify(PROJECT));
await py.runPythonAsync(`
import os, json
for path, content in json.loads(PROJECT_JSON).items():
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").write(content)
`);

await py.runPythonAsync(`
import os, traceback
os.environ["DO_NOT_TRACK"] = "1"

# import the dbt-duckdb internals and wrap them with tracing
import dbt.adapters.duckdb.connections as C
import dbt.adapters.duckdb.environments as E
import dbt.adapters.duckdb.environments.local as L

def tag(msg):
    print("TRACE:", msg, flush=True)

_create = E.create
def create(creds):
    tag(f"environments.create()  path={creds.path!r}")
    env = _create(creds)
    return env
E.create = create

_handle = L.LocalEnvironment.handle
def handle(self):
    tag(f"LocalEnvironment.handle  before: count={self.handle_count} conn={self.conn!r}")
    h = _handle(self)
    tag(f"LocalEnvironment.handle  after:  count={self.handle_count} conn={self.conn!r}")
    return h
L.LocalEnvironment.handle = handle

_close = L.LocalEnvironment.close
def close(self):
    tag(f"LocalEnvironment.close  conn={self.conn!r}")
    for line in traceback.format_stack()[-6:-1]:
        print("        " + line.strip().split(chr(10))[0], flush=True)
    return _close(self)
L.LocalEnvironment.close = close

_notify = L.LocalEnvironment.notify_closed
def notify_closed(self):
    tag(f"LocalEnvironment.notify_closed  count={self.handle_count} keep_open={self._keep_open}")
    return _notify(self)
L.LocalEnvironment.notify_closed = notify_closed

_del = L.LocalEnvironment.__del__
def _safe_del(self):
    tag("LocalEnvironment.__del__")
    try:
        _del(self)
    except Exception:
        pass
L.LocalEnvironment.__del__ = _safe_del

_open = C.DuckDBConnectionManager.open.__func__
def open_(cls, connection):
    tag(f"ConnectionManager.open  state={connection.state} _ENV={cls._ENV!r}")
    return _open(cls, connection)
C.DuckDBConnectionManager.open = classmethod(open_)

_cmclose = C.DuckDBConnectionManager.close.__func__
def cmclose(cls, connection):
    tag(f"ConnectionManager.close  state={connection.state}")
    if connection.state == "open":
        for line in traceback.format_stack()[-8:-1]:
            print("        " + line.strip().split(chr(10))[0], flush=True)
    return _cmclose(cls, connection)
C.DuckDBConnectionManager.close = classmethod(cmclose)

# Also trace release/cleanup on the base manager to see the open->close pairing
import dbt.adapters.sql.connections as SQLC
_release = C.DuckDBConnectionManager.release
def release(self):
    tag("ConnectionManager.release")
    for line in traceback.format_stack()[-6:-1]:
        print("        " + line.strip().split(chr(10))[0], flush=True)
    return _release(self)
C.DuckDBConnectionManager.release = release

print("=== invoking dbt seed (single-threaded) ===", flush=True)
from dbt.cli.main import dbtRunner
res = dbtRunner().invoke(["--single-threaded", "seed",
                          "--project-dir", "/project", "--profiles-dir", "/project"])
print("=== seed success:", res.success, "===", flush=True)
`);
