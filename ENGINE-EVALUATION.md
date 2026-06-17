# Engine evaluation - dbt Fusion / dbt Core v2.0 (Rust) vs. the current dbt-core 1.x (Python/Pyodide)

> **Standalone evaluation doc.** Kept out of `CLAUDE.md`'s Decisions log on purpose - this is the long-form reasoning behind "should we migrate the engine?", written so we don't re-litigate it from scratch each time dbt Labs ships news. Update the **Status** line and **Last reviewed** when revisited.

- **Status:** ❌ Do **not** migrate yet. Stay on Python **dbt-core 1.10.8 + dbt-duckdb 1.9.6** in Pyodide (the certified, shipping engine - see CLAUDE.md D15).
- **Last reviewed:** 2026-06-02
- **Trigger for this review:** dbt Labs announced **dbt Core v2.0** on **2026-06-01** - the Rust runtime previously locked inside Fusion, now released **open-source under Apache 2.0** (currently *alpha*). This removed the licensing objection from the prior (pre-announcement) evaluation, so the question was re-opened.

---

## TL;DR

The interesting candidate is no longer "dbt Fusion" (proprietary/ELv2) but **dbt Core v2.0** - the *same* Rust runtime, now **Apache 2.0**. The licensing blocker is gone. But the **technical** blockers that decide feasibility for our hard constraint (real dbt + real DuckDB, **no backend, in a browser tab**) are all still in place:

1. **No `wasm32` / browser build exists.** v2.0 ships as native platform binaries (Linux/macOS/Windows), pulled by a pip launcher (`dbt system update`). No wasm, no embeddable-as-library SDK. And it's *alpha*.
2. **DuckDB is not a launch adapter for the Rust engine** (launch adapters: Snowflake/BigQuery/Databricks/Redshift). DuckDB-on-Rust is the **Fusion beta** (April 2026). The classic `dbt-duckdb` (`import duckdb`) we depend on targets the **Python** dbt-core 1.x - a *different* engine.
3. **Connectivity is ADBC native drivers** (`dbt-xdbc`), not `import duckdb`. A browser sandbox has no `dlopen`; bridging a wasm-compiled Rust adapter to **duckdb-wasm**'s JS API is unbuilt.
4. **Jinja is a Rust reimplementation** (`dbt-jinja`, a `minijinja` fork + extensions). Now Apache 2.0 and converging, but a fidelity tail vs. our current *real Python Jinja2*.

**Verdict:** keep the working Pyodide/dbt-core-1.x stack; **actively track** dbt Core v2.0 as the likely successor; do a cheap **go/no-go spike** only once *both* (a) a wasm/embeddable runtime build and (b) a browser-viable DuckDB path exist.

---

## Why the current architecture works (what any replacement must reproduce)

Our stack works because of one rare three-way alignment (CLAUDE.md D1/D2/D15):

- Pyodide ships a **DuckDB wasm wheel that *is* the Python client `dbt-duckdb` imports** (`import duckdb`, embedded, no socket).
- Real CPython → **real Python Jinja2** → near-total fidelity "for free" (the entire reason Route B beat a TS rewrite, D1).
- Everything collapses into **one wasm runtime** (Pyodide), driven via `dbtRunner().invoke([...])`.

Cost of that alignment: a ~40 MB first load, a multi-second cold start, and the hard-won `multiprocessing`/threading stubs (D11–D14). Any engine swap has to clear the same bar: **real dbt semantics + embedded DuckDB execution, entirely client-side, no backend.**

---

## What dbt Core v2.0 actually is (2026-06-01)

- The **Rust runtime inherited from dbt Fusion**, now **Apache 2.0** ("dbt Core"). Fusion's richer proprietary bits (SQL comprehension, column-level lineage, etc.) stay proprietary; the *runtime* (parser, language spec, adapter framework, artifacts incl. Parquet, docs) is the open part.
- Shipped as **two distributions**: `dbt-core` (OSS, Apache 2.0) and `dbt` (Fusion distribution, proprietary).
- **Alpha**, installed today via `pip install dbt-core==2.0.0-alpha.1` + `dbt system update` - i.e. a thin **launcher that fetches a native platform binary**, not a pure-Python/Rust-source wheel.
- Adapter framework is **ADBC + Arrow** (`dbt-xdbc` = Rust wrapper over ADBC/ODBC, to be Apache-2.0). Jinja is **`dbt-jinja`** (Rust, Apache 2.0).
- Headline perf: up to ~10× faster parse vs. Python dbt-core; "no JVM or Python required" for the binary.

---

## The decision matrix

| Dimension | Current: dbt-core 1.x (Py/Pyodide) | dbt Core v2.0 (Rust) - *for our browser use case* |
|---|---|---|
| **License** | Apache 2.0 ✅ | Apache 2.0 ✅ *(was ELv2 under Fusion - now resolved)* |
| **Runs in browser, no backend** | ✅ Proven, certified (15 lessons, 5 gates) | ❌ No wasm build; native binaries only |
| **DuckDB execution** | ✅ `import duckdb` wasm wheel, embedded | ❌ ADBC native driver; no in-browser path; not a v2 launch adapter |
| **Jinja fidelity** | ✅ Real Python Jinja2 | 🟡 Rust `dbt-jinja` reimpl (converging) |
| **Maturity** | ✅ Stable (1.10.8) | ❌ Alpha (2026-06-01) |
| **Boot size / cold start** | 🟡 ~40 MB, multi-second | 🟢 *Potentially* far smaller/faster **if** a wasm build existed |
| **Strategic direction** | 🟡 Drifts toward maintenance over time | ✅ The stated future of dbt, and open |

The two ❌ rows in the v2.0 column are the whole story: it cannot run in our environment today, regardless of how good it is.

---

## What changed vs. what didn't

**Changed (genuinely):**
- Licensing: the Rust runtime is **Apache 2.0** now, not ELv2 → a wasm port / building on it is no longer legally off-limits.
- Strategic weight: v2.0 is positioned as canonical dbt going forward, and it's open source.

**Did *not* change (still blocks a browser switch):**
- No `wasm32`/embeddable build; alpha-stage; docs "to be populated."
- DuckDB-on-Rust is beta and connects via **ADBC native drivers**, not `import duckdb`.
- No `duckdb-wasm` ↔ Rust-adapter bridge exists.
- Jinja is a reimplementation (fidelity tail).

---

## The real opportunity (why this is worth tracking, not dismissing)

An **Apache-2.0 Rust runtime is a far cleaner `wasm32` target than our current stack.** Today's architecture is a heroic workaround *because* dbt-core 1.x is Python (Pyodide + CPython + the D11–D14 multiprocessing stubs + 40 MB). A Rust engine compiled to wasm could plausibly be **a fraction of the size with a much faster cold start**, and it would be the *actual* future dbt rather than a pinned legacy version. That prize is now legally reachable; it wasn't before.

Two unknowns gate it, and both are spikeable:
- **(a) Can the v2.0 runtime (or a subset) compile to `wasm32`?** Its deps - `tokio` async, networking, ADBC/`xdbc` native-driver loading - need wasm-compat work; the adapter layer is the hard part. The Apache-2.0 source is in the `dbt-core` repo, so this is at least *attemptable*.
- **(b) Can DuckDB execution work in-browser for it?** Either bridge **duckdb-wasm** (JS/wasm) into the Rust adapter, or rely on a pluggable adapter contract that can call out to JS - instead of loading a native ADBC driver.

---

## Recommendation & revisit plan

1. **Now:** stay on Python **dbt-core 1.10.8 + dbt-duckdb 1.9.6** in Pyodide. It's the only thing that satisfies real-dbt + real-DuckDB + no-backend + browser today, and it's certified.
2. **Posture:** upgrade from "ignore (proprietary)" to **actively track dbt Core v2.0**. Watch for two triggers:
   - a **`wasm32` / embeddable-library** build (or community proof one can be produced from the Apache-2.0 source), **and**
   - a **browser-viable DuckDB path** for the Rust engine (duckdb-wasm bridge, or a JS-callable adapter contract).
3. **When both land - and not before - run a go/no-go spike** (same pattern as the Step-0 boot spike, CLAUDE.md): compile the runtime to wasm, execute one trivial model against duckdb-wasm in a browser tab. Cheap to falsify; derisks the whole bet before any port.
4. **Strategic watch-item (slow-burning):** as v2.0 becomes canonical and Python dbt-core 1.x drifts to maintenance, "real dbt" will increasingly *mean* the Rust engine - which gradually weakens our D1 "real Python Jinja2 fidelity for free" rationale (eventually `dbt-jinja` in Rust *is* the reference). Not urgent; the reason to track rather than dismiss.

---

## Sources

- [dbt Core v2 is here: still open source, now rebuilt for what's next](https://docs.getdbt.com/blog/dbt-core-v2-is-here)
- [Upgrading to dbt Core v2.0](https://docs.getdbt.com/docs/dbt-versions/core-upgrade/upgrading-to-v2)
- [Meet the dbt Fusion Engine](https://docs.getdbt.com/blog/dbt-fusion-engine)
- [The Components of the dbt Fusion engine (ADBC/`xdbc`, `minijinja`)](https://docs.getdbt.com/blog/dbt-fusion-engine-components)
- [New code, new license: understanding the Fusion/Core license change](https://www.getdbt.com/blog/new-code-new-license-understanding-the-new-license-for-the-dbt-fusion-engine)
- [dbt-labs/dbt-fusion (GitHub)](https://github.com/dbt-labs/dbt-fusion)
- [[FEAT] dbt-duckdb Adapter · Issue #110](https://github.com/dbt-labs/dbt-fusion/issues/110)
- [Fusion DuckDB beta - Fusion Diaries, April 2026](https://github.com/dbt-labs/dbt-fusion/discussions/1535)
- [duckdb/dbt-duckdb (Python adapter, targets dbt-core ≥ 1.8.x)](https://github.com/duckdb/dbt-duckdb)
