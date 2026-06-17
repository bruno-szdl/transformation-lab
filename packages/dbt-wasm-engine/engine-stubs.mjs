// engine-stubs.mjs - the environment-agnostic heart of the dbt-in-Pyodide engine.
//
// These are the Python stubs (Decisions D5/D11/D12/D13/D14) that make real dbt-core + dbt-duckdb
// run under WebAssembly. They are pure strings + two tiny apply helpers - NO Node imports - so the
// SAME source of truth is shared by both the Node harness (`boot.mjs`) and the browser Web Worker
// (`web/worker.js`). Only the surrounding plumbing (how Pyodide is loaded, where wheels come from)
// differs per environment; the engine semantics live here.
//
// Call order around install:  registerExtractorMock(py)  ->  <install wheels>  ->  applyEngineStubs(py)
// (D11/D12/D14 must precede any dbt import; D13 imports dbt-duckdb so it runs last.)

// D5: dbt-extractor stub - py_extract_from_source ALWAYS raises ExtractionError, so dbt falls
// back to its full Python-Jinja rendering path (the high-fidelity path). Avoids a Rust wheel.
export const DBT_EXTRACTOR_MOCK = `
import micropip
micropip.add_mock_package(
    "dbt-extractor", "0.5.1",
    modules={
        "dbt_extractor": (
            "class ExtractionError(Exception):\\n"
            "    pass\\n"
            "\\n"
            "def py_extract_from_source(source):\\n"
            "    raise ExtractionError('dbt-extractor stub (D5): forcing full Python-Jinja render')\\n"
        )
    },
)
`;

// D11: _multiprocessing stub. Pyodide's CPython omits the _multiprocessing C extension, but
// dbt-adapters' base/connections.py does `from multiprocessing.synchronize import RLock`, and
// synchronize.py imports _multiprocessing unconditionally (SemLock/sem_unlink). With threads:1
// (D6) there is never any real cross-process synchronization, so SemLock is backed by threading
// primitives - reentrant and correct for single-threaded use. This clears the #1 boot risk.
export const MULTIPROCESSING_STUB = String.raw`
import sys, threading
from types import ModuleType

_mp = ModuleType("_multiprocessing")
RECURSIVE_MUTEX, SEMAPHORE = 0, 1

class SemLock:
    SEM_VALUE_MAX = 2 ** 31 - 1

    def __init__(self, kind, value, maxvalue, name, unlink):
        self.kind = kind
        self.maxvalue = maxvalue
        # name=None mimics the forking-enabled case: synchronize.py then SKIPS resource-tracker
        # registration (which would import _posixshmem and spawn a tracker subprocess - neither
        # exists in Pyodide). Nothing to clean up in a single process anyway.
        self.name = None
        self.handle = 0
        if kind == RECURSIVE_MUTEX:
            self._lock = threading.RLock()
        else:
            self._lock = threading.Semaphore(value if value is not None else 1)
        self._count_val = 0
        self._owner = None

    def acquire(self, block=True, timeout=None):
        ok = self._lock.acquire(block) if timeout is None else self._lock.acquire(block, timeout)
        if ok:
            self._count_val += 1
            self._owner = threading.get_ident()
        return bool(ok)

    def release(self):
        if self._count_val > 0:
            self._count_val -= 1
        if self._count_val == 0:
            self._owner = None
        self._lock.release()

    def __enter__(self):
        return self.acquire()

    def __exit__(self, *args):
        return self.release()

    def _count(self):
        return self._count_val

    def _is_mine(self):
        return self._owner == threading.get_ident() and self._count_val > 0

    def _get_value(self):
        return 1 if self._count_val == 0 else 0

    def _is_zero(self):
        return self._count_val == 0

    def _after_fork(self):
        pass

    @classmethod
    def _rebuild(cls, *state):
        raise NotImplementedError("SemLock unpickling unsupported in Pyodide (_multiprocessing stub)")

def sem_unlink(name):
    pass

def _noop(*a, **k):
    return None

_mp.SemLock = SemLock
_mp.sem_unlink = sem_unlink
_mp.closesocket = _noop   # Windows-only PipeConnection attrs, never reached on emscripten
_mp.send = _noop
_mp.recv = _noop
_mp.flags = {}
sys.modules["_multiprocessing"] = _mp

# Defensive: _posixshmem is also a missing C extension, imported by multiprocessing's
# resource_tracker / shared_memory. With name=None above we never hit resource-tracker on
# dbt's path, but stub it so any stray import doesn't crash. (No shared memory is ever used.)
_shm = ModuleType("_posixshmem")
_shm.shm_open = _noop
_shm.shm_unlink = _noop
sys.modules["_posixshmem"] = _shm
`;

// D12: make concurrent.futures.ThreadPoolExecutor run submitted work SYNCHRONOUSLY (inline,
// no worker threads). Pyodide's default build can't start OS threads at all, so a pooled
// executor would die with "can't start new thread". Running inline is the only option - and
// it lets dbt use its normal MultiThreadedExecutor (max_workers=threads), whose connection_named
// correctly opens/closes a connection per task. (The alternative, dbt's --single-threaded mode,
// uses a NO-OP connection_named that leaves dbt-duckdb reusing a released/closed cursor ->
// "Connection already closed!". So we deliberately DON'T pass --single-threaded.)
export const SYNC_EXECUTOR_STUB = String.raw`
import concurrent.futures
from concurrent.futures import Future as _Future

def _sync_submit(self, fn, /, *args, **kwargs):
    f = _Future()
    if not f.set_running_or_notify_cancel():
        return f
    try:
        f.set_result(fn(*args, **kwargs))
    except BaseException as exc:
        f.set_exception(exc)
    return f

def _noop_shutdown(self, wait=True, *, cancel_futures=False):
    return None

# ThreadPoolExecutor is the concrete class dbt-common's MultiThreadedExecutor inherits.
concurrent.futures.ThreadPoolExecutor.submit = _sync_submit
concurrent.futures.ThreadPoolExecutor.shutdown = _noop_shutdown
`;

// D14: make multiprocessing.pool.ThreadPool (multiprocessing.dummy) run SYNCHRONOUSLY. dbt's node
// runner (execute_nodes -> DbtThreadPool) is a SEPARATE parallelism mechanism from dbt-common's
// executor: ThreadPool spawns worker threads AT CONSTRUCTION (_repopulate_pool -> Thread.start),
// which dies in Pyodide ("can't start new thread") even before any work is submitted. Replace its
// constructor + apply_async/apply with inline, threadless equivalents so nodes run sequentially.
export const THREADPOOL_STUB = String.raw`
import multiprocessing.pool as _mpp

class _SyncResult:
    def __init__(self, value=None, exc=None):
        self._value = value
        self._exc = exc
    def get(self, timeout=None):
        if self._exc is not None:
            raise self._exc
        return self._value
    def wait(self, timeout=None):
        return None
    def ready(self):
        return True
    def successful(self):
        return self._exc is None

def _pool_init(self, processes=None, initializer=None, initargs=(), *a, **k):
    self._state = "RUN"
    self._pool = []          # attrs Pool.__del__/__repr__ read during GC; avoid a noisy ignored error
    self._processes = processes or 1
    if initializer is not None:
        initializer(*initargs)   # run inline so dbt's invocation-context var gets set

def _pool_apply_async(self, func, args=(), kwds=None, callback=None, error_callback=None):
    kwds = kwds or {}
    try:
        result = func(*args, **kwds)
    except Exception as exc:
        if error_callback is not None:
            error_callback(exc)
        return _SyncResult(exc=exc)
    if callback is not None:
        callback(result)
    return _SyncResult(value=result)

def _pool_apply(self, func, args=(), kwds=None):
    return func(*args, **(kwds or {}))

def _pool_noop(self, *a, **k):
    return None

_mpp.ThreadPool.__init__ = _pool_init
_mpp.ThreadPool.apply_async = _pool_apply_async
_mpp.ThreadPool.apply = _pool_apply
_mpp.ThreadPool.close = _pool_noop
_mpp.ThreadPool.terminate = _pool_noop
_mpp.ThreadPool.join = _pool_noop
`;

// D13: dbt-duckdb single-thread connection fix. dbt's connections are THREAD-LOCAL; a normal
// `--threads 1` run still has two threads (main = "master", one worker), so a task's
// connection_named() release never disturbs the master connection. Pyodide has no threads, so
// everything collapses onto one thread: a task's release closes the cursor that later
// main-thread code reuses -> "Connection already closed!" (keep_open=True keeps the *connection*
// alive; only the cursor is closed in DuckDBConnectionWrapper.close).
//
// Fix has two parts:
//  (a) don't close the cursor on release - keep it alive for reuse by later main-thread code.
//  (b) give DuckDBConnectionWrapper a real rollback()/commit(). dbt's BaseConnectionManager.close
//      rolls back an open transaction via connection.handle.rollback(), but the stock wrapper has
//      NO rollback() - so _rollback_handle swallows the AttributeError and the duckdb transaction
//      LINGERS on our reused cursor, making the next BEGIN fail ("cannot start a transaction within
//      a transaction"). Issuing ROLLBACK/COMMIT as SQL on the cursor clears it. (Normally the cursor
//      is destroyed on close so the lingering txn is moot; with (a) it isn't, so we must clear it.)
export const DBT_DUCKDB_CONN_PATCH = String.raw`
import dbt.adapters.duckdb.environments.local as _L

def _patched_close(self):
    # keep the cursor alive for reuse; just account for the handle release.
    self._env.notify_closed()

def _patched_rollback(self):
    try:
        self._cursor.execute("ROLLBACK")
    except Exception:
        pass

def _patched_commit(self):
    try:
        self._cursor.execute("COMMIT")
    except Exception:
        pass

_L.DuckDBConnectionWrapper.close = _patched_close
_L.DuckDBConnectionWrapper.rollback = _patched_rollback
_L.DuckDBConnectionWrapper.commit = _patched_commit
`;

/** Register the D5 dbt-extractor mock. Must run BEFORE installing dbt wheels. */
export async function registerExtractorMock(py) {
  await py.runPythonAsync(DBT_EXTRACTOR_MOCK);
}

/**
 * Apply the wasm-compatibility stubs. Must run AFTER the dbt wheels are installed:
 * D11/D12/D14 patch stdlib before dbt imports them; D13 imports dbt-duckdb, so it runs last.
 */
export async function applyEngineStubs(py) {
  await py.runPythonAsync(MULTIPROCESSING_STUB);
  await py.runPythonAsync(SYNC_EXECUTOR_STUB);
  await py.runPythonAsync(THREADPOOL_STUB);
  await py.runPythonAsync(DBT_DUCKDB_CONN_PATCH);
}
