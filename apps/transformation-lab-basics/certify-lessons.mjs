// certify-lessons.mjs - Phase 2 certification gate.
//
// Boots the real dbt engine ONCE in headless Chromium, then drives lessons 2,4–14 to completion the
// way a perfect learner would: applies each lesson's canonical solution (edits / renames / opens
// files, runs the intended dbt commands), and asserts EVERY task validator passes against data REAL
// DBT PRODUCED. Lessons 1 & 3 are already covered by test-lesson.mjs; lesson 0 is the intro (no tasks).
//
// Run a subset by passing ids:  node certify-lessons.mjs 6 7 8
//
// Each lesson's step list is sequenced to match the lesson's intended flow, because several lessons
// are stateful (a test passes, then is made to fail, then fixed) and task completion is sticky -
// checkTasks runs after every command/edit so the right tasks lock in at the right moment.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { chromium } from 'playwright'

const APP_DIR = dirname(fileURLToPath(import.meta.url))
const PORT = 5182
const BASE = `http://localhost:${PORT}/`
const BOOT_TIMEOUT = 240_000
const CMD_TIMEOUT = 120_000

// ── canonical building blocks (mirror src/lessons/_canonical.ts) ────────────────────────────────
const STG_CUSTOMERS_HARDCODED = `select\n    id,\n    name,\n    email,\n    country\nfrom raw.customers`
const STG_CUSTOMERS_NO_COUNTRY = `select\n    id,\n    name,\n    email\nfrom raw.customers`
const STG_CUSTOMERS_SOURCED = `select\n    id,\n    name,\n    email,\n    country\nfrom {{ source('raw', 'customers') }}`
const STG_ORDERS_SOURCED = `select\n    id as order_id,\n    customer_id,\n    amount,\n    status,\n    created_at\nfrom {{ source('raw', 'orders') }}`
const DIM_CUSTOMERS_TABLE = `{{ config(materialized='table') }}\n\nselect * from {{ ref('stg_customers') }}`
const FCT_REVENUE_BY_CUSTOMER = `select\n    customer_id,\n    sum(amount) as revenue\nfrom {{ ref('int_paid_orders') }}\ngroup by customer_id`
const FCT_TABLE = `{{ config(materialized='table') }}\n\n${FCT_REVENUE_BY_CUSTOMER}`
const DIM_COUNTRIES = `select\n    code,\n    name,\n    region\nfrom {{ ref('countries') }}`

const SOURCES_YML = `version: 2\n\nsources:\n  - name: raw\n    tables:\n      - name: customers\n      - name: orders\n`

const SCHEMA_ID_ONLY = `version: 2\n\nmodels:\n  - name: stg_customers\n    columns:\n      - name: id\n        data_tests:\n          - not_null\n          - unique\n`

const SCHEMA_YML_L7 = `version: 2\n\nmodels:\n  - name: stg_customers\n    columns:\n      - name: id\n        data_tests:\n          - not_null\n          - unique\n      - name: email\n        data_tests:\n          - not_null\n`

const SCHEMA_YML_L8 = `version: 2\n\nmodels:\n  - name: stg_customers\n    columns:\n      - name: id\n        data_tests:\n          - not_null\n          - unique\n      - name: email\n        data_tests:\n          - not_null\n  - name: stg_orders\n    columns:\n      - name: order_id\n        data_tests:\n          - not_null\n          - unique\n      - name: customer_id\n        data_tests:\n          - relationships:\n              arguments:\n                to: ref('stg_customers')\n                field: id\n      - name: status\n        data_tests:\n          - accepted_values:\n              arguments:\n                values: ['paid', 'refunded', 'pending']\n`

const SCHEMA_YML_L9 = `version: 2\n\nmodels:\n  - name: stg_customers\n    description: "One row per customer, cleaned from raw.customers."\n    columns:\n      - name: id\n        description: "Primary key. Stable across the customer lifecycle."\n        data_tests:\n          - not_null\n          - unique\n      - name: email\n        description: "Customer email. Used as the contact channel; never null."\n        data_tests:\n          - not_null\n  - name: stg_orders\n    description: "One row per order, cleaned from raw.orders."\n    columns:\n      - name: order_id\n        description: "Primary key."\n        data_tests:\n          - not_null\n          - unique\n      - name: customer_id\n        description: "FK to stg_customers.id."\n        data_tests:\n          - relationships:\n              arguments:\n                to: ref('stg_customers')\n                field: id\n      - name: status\n        description: "Order lifecycle: paid, refunded, or pending."\n        data_tests:\n          - accepted_values:\n              arguments:\n                values: ['paid', 'refunded', 'pending']\n  - name: fct_revenue_by_customer\n    description: "Total paid revenue per customer (refunds and pending excluded)."\n`

const SCHEMA_YML_L9_NO_PENDING = SCHEMA_YML_L9.replace("['paid', 'refunded', 'pending']", "['paid', 'refunded']")

const SINGULAR_NO_NEG = `select *\nfrom {{ ref('fct_revenue_by_customer') }}\nwhere revenue < 0\n`

// ── per-lesson solutions. Each step: {edit}|{run}|{open}|{rename}. ───────────────────────────────
const LESSONS = {
  2: {
    tasks: ['create', 'create-emails', 'lineage', 'compile', 'run'],
    steps: [
      { edit: {
        'models/dim_customers.sql': `select * from {{ ref('stg_customers') }}\n`,
        'models/customer_emails.sql': `select id, email from {{ ref('stg_customers') }}\n`,
      } },
      { run: 'dbt compile --select customer_emails' },
      { run: 'dbt run' },
    ],
  },
  4: {
    tasks: ['table', 'table-fct', 'view', 'run'],
    steps: [
      { edit: {
        'models/dim_customers.sql': DIM_CUSTOMERS_TABLE,
        'models/fct_revenue_by_customer.sql': FCT_TABLE,
      } },
      { run: 'dbt run' },
    ],
  },
  5: {
    tasks: ['edit-stg', 'select-one', 'select-short-flag', 'run-all'],
    steps: [
      { edit: { 'models/stg_customers.sql': STG_CUSTOMERS_NO_COUNTRY } },
      { run: 'dbt run --select stg_customers' },
      { run: 'dbt run -s dim_customers' },
      { run: 'dbt run' },
    ],
  },
  6: {
    tasks: ['declare-customers', 'declare-orders', 'use-source-customers', 'use-source-orders', 'run'],
    steps: [
      { edit: {
        'models/sources.yml': SOURCES_YML,
        'models/stg_customers.sql': STG_CUSTOMERS_SOURCED,
        'models/stg_orders.sql': STG_ORDERS_SOURCED,
      } },
      { run: 'dbt run' },
    ],
  },
  7: {
    tasks: ['inspect', 'seed', 'ref', 'run', 'show'],
    steps: [
      { open: 'seeds/countries.csv' },
      { edit: { 'models/dim_countries.sql': DIM_COUNTRIES } },
      { run: 'dbt seed' },
      { run: 'dbt run' },
      { run: 'dbt show --select dim_countries' },
    ],
  },
  8: {
    tasks: ['not-null', 'unique', 'run-tests', 'email-test', 'inspect', 'fix-sql', 'fix-test'],
    steps: [
      { edit: { 'models/schema.yml': SCHEMA_ID_ONLY } },
      { run: 'dbt test' },
      { edit: { 'models/schema.yml': SCHEMA_YML_L7 } },
      { run: 'dbt test' },
      { run: 'dbt show --select stg_customers' },
      { edit: { 'models/stg_customers.sql': `${STG_CUSTOMERS_SOURCED}\nwhere email is not null\n` } },
      { run: 'dbt run --select stg_customers' },
      { run: 'dbt test' },
    ],
  },
  9: {
    tasks: ['accepted', 'rel', 'see-fail', 'inspect', 'fix-sql', 'fix-test'],
    steps: [
      { edit: { 'models/schema.yml': SCHEMA_YML_L8 } },
      { run: 'dbt test' },
      { run: 'dbt show --select stg_orders' },
      { edit: { 'models/stg_orders.sql': `${STG_ORDERS_SOURCED}\nwhere status in ('paid', 'refunded', 'pending')\n` } },
      { run: 'dbt run --select stg_orders' },
      { run: 'dbt test' },
    ],
  },
  10: {
    tasks: ['model-desc', 'col-desc', 'mart-desc'],
    steps: [
      { edit: { 'models/schema.yml': SCHEMA_YML_L9 } },
    ],
  },
  11: {
    tasks: ['move-staging', 'move-intermediate', 'move-marts', 'run'],
    steps: [
      { rename: ['models/stg_customers.sql', 'models/staging/stg_customers.sql'] },
      { rename: ['models/stg_orders.sql', 'models/staging/stg_orders.sql'] },
      { rename: ['models/int_paid_orders.sql', 'models/intermediate/int_paid_orders.sql'] },
      { rename: ['models/dim_customers.sql', 'models/marts/dim_customers.sql'] },
      { rename: ['models/dim_countries.sql', 'models/marts/dim_countries.sql'] },
      { rename: ['models/fct_revenue_by_customer.sql', 'models/marts/fct_revenue_by_customer.sql'] },
      { run: 'dbt run' },
    ],
  },
  12: {
    tasks: ['union', 'fix-and-downstream', 'upstream', 'build-all'],
    steps: [
      { run: 'dbt run --select stg_customers stg_orders' },
      { edit: { 'models/staging/stg_customers.sql': `${STG_CUSTOMERS_SOURCED}\nwhere email is not null\n` } },
      { run: 'dbt build --select stg_customers+' },
      { run: 'dbt run --select +fct_revenue_by_customer' },
      { run: 'dbt build' },
    ],
  },
  13: {
    tasks: ['inspect', 'see-fail', 'show', 'fix-sql', 'add-test', 'build'],
    steps: [
      { open: 'tests/no_future_signups.sql' },
      { run: 'dbt build' },
      { run: 'dbt show --select stg_orders' },
      { edit: { 'models/staging/stg_orders.sql': `${STG_ORDERS_SOURCED}\nwhere created_at <= current_date\n` } },
      { run: 'dbt run --select stg_orders' },
      { edit: { 'tests/no_negative_revenue.sql': SINGULAR_NO_NEG } },
      { run: 'dbt build' },
    ],
  },
  14: {
    tasks: ['build', 'fct', 'tests', 'skip'],
    steps: [
      { run: 'dbt build' },
      { edit: { 'models/staging/_schema.yml': SCHEMA_YML_L9_NO_PENDING } },
      { run: 'dbt build' },
    ],
  },
}

const wanted = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n))
const order = (wanted.length ? wanted : [2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]).filter((id) => LESSONS[id])

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: APP_DIR,
  stdio: 'inherit',
})

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(BASE)).ok) return } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('vite preview did not come up')
}

let exitCode = 1
let browser
const results = []
try {
  await waitForServer()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log('[browser:pageerror]', e.message))

  const firstId = order[0]
  console.log(`\nbooting real dbt engine + loading lesson ${firstId} (first load ~40 MB)…`)
  await page.goto(`${BASE}lesson/${firstId}?e2e=1`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    (id) => { const s = window.__GAME_STORE && window.__GAME_STORE.getState(); return !!s && s.currentLessonId === id && s.running === false },
    firstId, { timeout: BOOT_TIMEOUT },
  )
  console.log('engine ready.\n')

  const loadLesson = async (id) => {
    await page.evaluate(async (i) => { await window.__GAME_STORE.getState().loadLesson(i) }, id)
    await page.waitForFunction(
      (i) => { const s = window.__GAME_STORE.getState(); return s.currentLessonId === i && s.running === false },
      id, { timeout: BOOT_TIMEOUT },
    )
  }
  const runCmd = async (cmd) => {
    await page.evaluate(async (c) => { await window.__GAME_STORE.getState().runCommand(c) }, cmd)
    await page.waitForFunction(() => window.__GAME_STORE.getState().running === false, null, { timeout: CMD_TIMEOUT })
  }
  const edit = async (map) => {
    await page.evaluate((m) => {
      const set = window.__GAME_STORE.getState().setFileContent
      for (const [p, c] of Object.entries(m)) set(p, c)
      window.__GAME_STORE.getState().checkTasks()
    }, map)
  }
  const open = async (path) => { await page.evaluate((p) => window.__GAME_STORE.getState().openFile(p), path) }
  const rename = async ([oldP, newP]) => {
    await page.evaluate(([o, n]) => { window.__GAME_STORE.getState().renameFile(o, n); window.__GAME_STORE.getState().checkTasks() }, [oldP, newP])
  }
  const completedFor = (id) => page.evaluate((lid) => {
    const s = window.__GAME_STORE.getState()
    return {
      completed: [...s.completedTasks].filter((k) => k.startsWith(lid + '.')).map((k) => k.slice(String(lid).length + 1)).sort(),
      buildSucceeded: s.buildSucceeded,
      ranModels: [...s.ranModels].sort(),
      loadedSeeds: [...s.loadedSeeds].sort(),
      testResults: s.testResults,
      tail: s.terminalHistory.filter((l) => l.text).slice(-4).map((l) => l.text),
    }
  }, id)

  for (const id of order) {
    console.log(`- lesson ${id} -`)
    if (id !== firstId) await loadLesson(id)
    for (const step of LESSONS[id].steps) {
      if (step.edit) await edit(step.edit)
      else if (step.run) { console.log(`   → ${step.run}`); await runCmd(step.run) }
      else if (step.open) await open(step.open)
      else if (step.rename) await rename(step.rename)
    }
    const snap = await completedFor(id)
    const want = LESSONS[id].tasks
    const missing = want.filter((t) => !snap.completed.includes(t))
    const pass = missing.length === 0
    results.push({ id, pass, missing })
    console.log(`   tasks ${snap.completed.length}/${want.length}` +
      (pass ? '  ✅' : `  ❌ missing: ${missing.join(', ')}`))
    if (!pass) {
      console.log(`     buildSucceeded=${snap.buildSucceeded} ran=[${snap.ranModels.join(',')}] seeds=[${snap.loadedSeeds.join(',')}] tests=${JSON.stringify(snap.testResults)}`)
      const full = await page.evaluate(() => window.__GAME_STORE.getState().terminalHistory.filter((l) => l.text).slice(-30).map((l) => l.text))
      console.log('     ── last 30 terminal lines ──')
      for (const l of full) console.log('       ' + l)
    }
    console.log('')
  }

  const allPass = results.every((r) => r.pass)
  console.log('='.repeat(72))
  for (const r of results) console.log(`  lesson ${String(r.id).padStart(2)} : ${r.pass ? 'PASS ✅' : 'FAIL ❌ (' + r.missing.join(', ') + ')'}`)
  console.log('='.repeat(72))
  console.log(allPass
    ? `CERTIFICATION PASSED ✅ - lessons ${order.join(', ')} complete end-to-end on REAL dbt`
    : `CERTIFICATION FAILED ❌ - ${results.filter((r) => !r.pass).map((r) => r.id).join(', ')}`)
  console.log('='.repeat(72))
  exitCode = allPass ? 0 : 1
} catch (err) {
  console.error('\nCERTIFY ERROR:', err && err.stack ? err.stack : err)
} finally {
  if (browser) await browser.close()
  preview.kill('SIGTERM')
}
process.exit(exitCode)
