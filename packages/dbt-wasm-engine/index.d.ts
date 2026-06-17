// Type definitions for @dbt-wasm/engine (the implementation is buildless ESM in src/).

/** Per-node outcome from a dbt invocation (model/seed/test/snapshot unique_id + dbt status). */
export interface DbtNodeResult {
  node: string;
  status: string;
}

/** Result of a single `invoke()` - mirrors dbt's programmatic `dbtRunner().invoke()` result. */
export interface DbtInvokeResult {
  /** dbt's overall success flag for the command. */
  success?: boolean;
  /** Per-node results when the command produced any (run/build/test/seed/snapshot). */
  nodes?: DbtNodeResult[];
  /** Formatted traceback of a handled dbt exception, if the command failed inside dbt. */
  exception?: string;
  /** Formatted traceback of an unexpected error before/around the invocation. */
  fatal?: string;
}

/** Result of a `query()` - a table of rows read back from the warehouse. */
export interface DbtQueryResult {
  /** Column names, in select order. */
  columns: string[];
  /** Row tuples (one array per row), aligned to `columns`. Non-JSON cells are stringified. */
  rows: unknown[][];
}

/** Lifecycle phases emitted during boot()/invoke() via onStatus. */
export type DbtEnginePhase =
  | "loading-pyodide"
  | "loading-micropip"
  | "installing-wheelhouse"
  | "applying-stubs"
  | (string & {});

export interface CreateDbtEngineOptions {
  /** Pyodide CDN/dist base URL (trailing slash). Defaults to the pinned jsDelivr 0.27.7 dist. */
  pyodideIndexUrl?: string;
  /** Base URL the vendored wheels + wheelhouse.json are served from (trailing slash). Default "/wheelhouse/". */
  wheelhouseUrl?: string;
  /** Receives dbt's streamed stdout/stderr lines. */
  onOutput?: (line: string, stream: "out" | "err") => void;
  /** Receives boot/run lifecycle phase changes. */
  onStatus?: (phase: DbtEnginePhase) => void;
}

export interface DbtEngine {
  boot(): Promise<{ bootSeconds: number }>;
  writeFiles(files: Record<string, string>): Promise<{ written: number }>;
  /** Replace the project's dbt-resource files with exactly `files`: prunes models/seeds/snapshots/
   *  tests/analyses/macros (so editor renames/deletes take effect) then writes. Raw CSVs + db kept. */
  syncProject(files: Record<string, string>): Promise<{ written: number }>;
  invoke(args: string[]): Promise<DbtInvokeResult>;
  /** Run ad-hoc SQL against the project's warehouse (previews, catalog, raw-table setup). The db
   *  path is resolved from the active profiles.yml, so it tracks a lesson-edited duckdb `path:`. */
  query(sql: string): Promise<DbtQueryResult>;
  readArtifact(path: string): Promise<string | null>;
  /** Clear the warehouse (DROP its objects) + delete non-db project files. The DuckDB file is kept. */
  reset(): Promise<{ ok: true }>;
  terminate(): void;
}

/**
 * Create a dbt engine backed by a Web Worker running real dbt-core + dbt-duckdb in Pyodide.
 * Call boot() once, then writeFiles()/invoke()/readArtifact() as needed.
 */
export function createDbtEngine(options?: CreateDbtEngineOptions): DbtEngine;
