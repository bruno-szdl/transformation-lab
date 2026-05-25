# Data Transformation Lab - TODO

Public-facing punch list. Everything from the original (2026-04-26) review has shipped — see git history.

## v2 candidates
- [ ] `dbt_project.yml` lesson — slot after L11; teach folder-wide `+materialized:` and project-level config.
- [ ] Macros + `packages.yml` lesson — one trivial macro (e.g. `cents_to_dollars()`) + a paragraph on `dbt-utils`.
- [ ] Incremental models lesson — engine already simulates it; needs UX for the `is_incremental()` branch.
- [ ] Capstone mart: `fct_revenue_by_country` joining `int_paid_orders` + `stg_customers` + `dim_countries`. Makes L9's `relationships` test feel less academic and ties the three marts together.
- [ ] Mobile: swipe gestures between tabs; icons in bottom nav.
