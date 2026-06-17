// @dbt-wasm/engine - the main-thread client. This is the package's public entry point.
//
// createDbtEngine() owns the Web Worker and exposes a small promise-based API. The Worker runs the
// real dbt-core + dbt-duckdb engine in Pyodide; this side just does RPC + streams output/status.
//
//   const dbt = createDbtEngine({ wheelhouseUrl: "/wheelhouse/", onOutput, onStatus });
//   await dbt.boot();
//   await dbt.writeFiles({ "dbt_project.yml": "...", "models/x.sql": "..." });
//   const res = await dbt.invoke(["build"]);
//   const manifest = JSON.parse(await dbt.readArtifact("target/manifest.json"));
//
// The worker is spawned with `new URL("./worker.js", import.meta.url)` so app bundlers (Vite)
// resolve and bundle it from the linked package; Pyodide itself loads from the CDN at runtime.

export function createDbtEngine(options = {}) {
  const { pyodideIndexUrl, wheelhouseUrl, onOutput, onStatus } = options;

  const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });

  let nextId = 1;
  const pending = new Map();

  worker.onmessage = (e) => {
    const m = e.data || {};
    if (m.type === "log") {
      onOutput?.(m.line, m.stream);
      return;
    }
    if (m.type === "status") {
      onStatus?.(m.phase);
      return;
    }
    if (m.id != null && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.ok) resolve(m.result);
      else reject(new Error(m.error));
    }
  };

  worker.onerror = (e) => {
    const err = new Error(`engine worker error: ${e.message || e}`);
    for (const { reject } of pending.values()) reject(err);
    pending.clear();
  };

  function call(type, payload) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, type, payload });
    });
  }

  return {
    /** Download Pyodide, install the dbt wheelhouse, apply the stubs. Resolves when dbt is runnable. */
    boot: () => call("boot", { pyodideIndexUrl, wheelhouseUrl }),
    /** Write a map of { "<relative path>": "<contents>" } into the in-memory project dir. */
    writeFiles: (files) => call("writeFiles", files),
    /** Replace the project's dbt-resource files with exactly this set: prunes models/seeds/snapshots/
     *  tests/analyses/macros first (so renames/deletes take effect), then writes. Raw CSVs + the db are kept. */
    syncProject: (files) => call("syncProject", files),
    /** Run dbt programmatically, e.g. invoke(["build", "--select", "my_model"]). */
    invoke: (args) => call("invoke", args),
    /** Run ad-hoc SQL against the project's warehouse (path resolved from profiles.yml); resolves to { columns, rows }. */
    query: (sql) => call("query", sql),
    /** Read a project file (e.g. "target/manifest.json"); resolves to its text, or null if absent. */
    readArtifact: (path) => call("readArtifact", path),
    /** Wipe the project for a fresh lesson/run: DROP the warehouse's objects + delete non-db files
     *  (the DuckDB file itself is kept - deleting it while a connection is open would abort wasm). */
    reset: () => call("reset"),
    /** Tear down the worker. */
    terminate: () => worker.terminate(),
  };
}
