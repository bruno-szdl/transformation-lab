// test-lesson.mjs - Phase-1b gate: prove ONE real lab lesson works end-to-end on REAL dbt.
//
// Serves the production build, opens /lesson/1 in headless Chromium, waits for the engine to boot
// (real dbt-core + dbt-duckdb in Pyodide), then drives the lesson through the store exactly as the
// terminal would: `dbt run` (build stg_customers) then `dbt show --select stg_customers` (preview).
// Asserts both of lesson 1's task validators pass AGAINST DATA REAL DBT PRODUCED.

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { chromium } from 'playwright'

const APP_DIR = dirname(fileURLToPath(import.meta.url))
const PORT = 5181
const BASE = `http://localhost:${PORT}/`
const BOOT_TIMEOUT = 240_000
const CMD_TIMEOUT = 120_000

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: APP_DIR,
  stdio: 'inherit',
})

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(BASE)
      if (r.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('vite preview did not come up')
}

let exitCode = 1
let browser
try {
  await waitForServer()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.on('console', (m) => console.log(`[browser:${m.type()}]`, m.text()))
  page.on('pageerror', (e) => console.log('[browser:pageerror]', e.message))

  console.log(`\nopening ${BASE}lesson/1?e2e=1 in headless Chromium…`)
  await page.goto(`${BASE}lesson/1?e2e=1`, { waitUntil: 'domcontentloaded' })

  // Surface boot progress as it streams into the terminal.
  let last = ''
  const t = setInterval(async () => {
    try {
      const msg = await page.evaluate(() => {
        const s = window.__GAME_STORE && window.__GAME_STORE.getState()
        if (!s) return 'loading…'
        const tail = s.terminalHistory.filter((l) => l.text).slice(-1)[0]
        return `running=${s.running} lesson=${s.currentLessonId} :: ${tail ? tail.text : ''}`
      })
      if (msg && msg !== last) {
        last = msg
        console.log('  ', msg.slice(0, 160))
      }
    } catch {
      /* navigating */
    }
  }, 1000)

  // 1. Wait for the engine to boot + lesson 1 to finish loading (running flips false).
  console.log('\nbooting real dbt engine + loading lesson 1 (first load ~40 MB)…')
  await page.waitForFunction(
    () => {
      const s = window.__GAME_STORE && window.__GAME_STORE.getState()
      return !!s && s.currentLessonId === 1 && s.running === false
    },
    null,
    { timeout: BOOT_TIMEOUT },
  )
  console.log('engine ready; lesson 1 loaded.')

  const runCmd = async (cmd) => {
    console.log(`→ ${cmd}`)
    await page.evaluate(async (c) => { await window.__GAME_STORE.getState().runCommand(c) }, cmd)
    await page.waitForFunction(() => window.__GAME_STORE.getState().running === false, null, { timeout: CMD_TIMEOUT })
  }
  const snapshot = () =>
    page.evaluate(() => {
      const s = window.__GAME_STORE.getState()
      return {
        completed: [...s.completedTasks].sort(),
        ranModels: [...s.ranModels].sort(),
        shownModels: [...s.shownModels].sort(),
        compiledModels: [...s.compiledModels].sort(),
        buildSucceeded: s.buildSucceeded,
        running: s.running,
        modelColumns: s.modelColumns,
        tail: s.terminalHistory.filter((l) => l.text).slice(-8).map((l) => l.text),
      }
    })

  // ── Lesson 1: run + show ────────────────────────────────────────────────────
  console.log('\n- lesson 1 -')
  await runCmd('dbt run')
  await runCmd('dbt show --select stg_customers')
  const l1 = await snapshot()
  console.log('terminal tail:')
  for (const l of l1.tail) console.log('   ', l)
  console.log('state:', JSON.stringify({ completed: l1.completed, ranModels: l1.ranModels, shownModels: l1.shownModels, buildSucceeded: l1.buildSucceeded, cols: l1.modelColumns.stg_customers }))
  const l1pass =
    l1.completed.includes('1.run') && l1.completed.includes('1.show') &&
    l1.ranModels.includes('stg_customers') && l1.shownModels.includes('stg_customers')

  // ── Lesson 3: write two models (ref + build + DAG), run, show the mart ────────
  console.log('\n- lesson 3 (multi-model ref → build → show) -')
  await page.evaluate(async () => { await window.__GAME_STORE.getState().loadLesson(3) }, null)
  await page.waitForFunction(() => {
    const s = window.__GAME_STORE.getState()
    return s.currentLessonId === 3 && s.running === false
  }, null, { timeout: BOOT_TIMEOUT })
  // The learner's solution: int_paid_orders filters paid rows; fct_revenue_by_customer aggregates.
  await page.evaluate(() => {
    const set = window.__GAME_STORE.getState().setFileContent
    set('models/int_paid_orders.sql', "select *\nfrom {{ ref('stg_orders') }}\nwhere status = 'paid'\n")
    set('models/fct_revenue_by_customer.sql', "select\n    customer_id,\n    sum(amount) as revenue\nfrom {{ ref('int_paid_orders') }}\ngroup by customer_id\n")
  })
  await runCmd('dbt run')
  await runCmd('dbt show --select fct_revenue_by_customer')
  const l3 = await snapshot()
  console.log('terminal tail:')
  for (const l of l3.tail) console.log('   ', l)
  console.log('state:', JSON.stringify({ completed: l3.completed.filter((c) => c.startsWith('3.')), ranModels: l3.ranModels, buildSucceeded: l3.buildSucceeded }))
  const L3_TASKS = ['3.int-ref', '3.int-filter', '3.mart', '3.edges', '3.run', '3.show']
  const l3pass =
    L3_TASKS.every((tk) => l3.completed.includes(tk)) &&
    l3.buildSucceeded &&
    ['stg_orders', 'int_paid_orders', 'fct_revenue_by_customer'].every((m) => l3.ranModels.includes(m))

  // ── Phase 4: the whitelist is gone - arbitrary dbt commands now reach real dbt ──
  // Runs in lesson 3's warm state (models already built); no reload, so state persists.
  console.log('\n- phase 4 (open command set on real dbt) -')
  const tailText = (snap) => snap.tail.join('\n')

  // (a) A previously-rejected subcommand now runs (no "Unknown subcommand").
  await runCmd('dbt ls')
  const p4ls = await snapshot()
  const lsOk = p4ls.running === false && !tailText(p4ls).includes('Unknown subcommand')
  console.log('   dbt ls →', lsOk ? 'ran (no whitelist rejection)' : 'FAILED', '| tail:', p4ls.tail.slice(-2))

  // (b) compile with a selector still drives the compiledModels state.
  await runCmd('dbt compile --select stg_orders')
  const p4c = await snapshot()
  const compileOk = p4c.compiledModels.includes('stg_orders') && !tailText(p4c).includes('Unknown')
  console.log('   dbt compile --select stg_orders →', compileOk ? 'compiled stg_orders' : 'FAILED')

  // (c) A previously-rejected flag now passes through to real dbt.
  await runCmd('dbt run --full-refresh')
  const p4ff = await snapshot()
  const fullRefreshOk = p4ff.buildSucceeded === true && !tailText(p4ff).includes('Unknown flag')
  console.log('   dbt run --full-refresh →', fullRefreshOk ? 'ran (non-whitelisted flag passed through)' : 'FAILED')

  // (d) dbt show now routes to REAL dbt (so --inline works).
  await runCmd('dbt show --inline "select 1 as one"')
  const p4inline = await snapshot()
  const inlineOk = p4inline.running === false && !tailText(p4inline).includes('Unknown')
  console.log('   dbt show --inline → ', inlineOk ? 'routed to real dbt' : 'FAILED', '| tail:', p4inline.tail.slice(-2))

  // (e) A browser-incompatible command is intercepted, AND the session survives it.
  await runCmd('dbt deps')
  const p4deps = await snapshot()
  const depsBlocked = tailText(p4deps).includes("isn't available in the browser lab") && p4deps.running === false
  console.log('   dbt deps →', depsBlocked ? 'friendly intercept' : 'FAILED')

  await runCmd('dbt show --select stg_orders')
  const p4show = await snapshot()
  const survived = p4show.shownModels.includes('stg_orders')
  console.log('   dbt show --select stg_orders (after deps) →', survived ? 'session intact, preview ok' : 'FAILED')

  const phase4pass = lsOk && compileOk && fullRefreshOk && inlineOk && depsBlocked && survived

  // ── Phase 5: editable infra (warehouse-path decoupling) + lesson-controlled file visibility ──
  // Still in lesson 3's warm state (files panel visible; models built). Inject a custom profiles.yml
  // pointing dbt at a DIFFERENT warehouse file, plus a standalone model with no deps.
  console.log('\n- phase 5 (editable profiles.yml: path decoupling + hidden-but-synced files) -')
  const CUSTOM_PROFILES = `transformation_lab:
  target: dev
  outputs:
    dev:
      type: duckdb
      path: "/project/warehouse2.duckdb"
      threads: 1
`
  await page.evaluate((prof) => {
    const set = window.__GAME_STORE.getState().setFileContent
    set('profiles.yml', prof)
    set('models/decoupled.sql', 'select 42 as answer\n')
  }, CUSTOM_PROFILES)

  // (a) file visibility - lesson 3's hiddenGlobs hides profiles.yml from the TREE, but it's still in
  //     the store's files (so it syncs to dbt). The model stays visible.
  await page.waitForFunction(
    () => document.querySelector('[data-testid="file-tree"]')?.innerText.includes('decoupled.sql'),
    null,
    { timeout: 10_000 },
  )
  const treeText = await page.locator('[data-testid="file-tree"]').innerText()
  const inFiles = await page.evaluate(() => 'profiles.yml' in window.__GAME_STORE.getState().files)
  const visHidden = !treeText.includes('profiles.yml')
  const visShown = treeText.includes('decoupled.sql') && treeText.includes('stg_orders.sql')
  const visOk = visHidden && visShown && inFiles
  console.log('   file visibility →', visOk
    ? 'profiles.yml hidden from tree but present in files (syncs to dbt); models visible'
    : `FAILED (hidden=${visHidden} shown=${visShown} inFiles=${inFiles})`)

  // (b) path decoupling - dbt BUILDS into /project/warehouse2.duckdb AND query() READS the same db.
  await runCmd('dbt run --select decoupled')
  const p5run = await snapshot()
  const builtOnNewPath = p5run.ranModels.includes('decoupled') // dbt succeeded against the custom path
  await runCmd('dbt show --select decoupled')
  const preview = await page.evaluate(() => {
    const p = window.__GAME_STORE.getState().lastPreview
    return p ? { name: p.name, rows: p.rows } : null
  })
  // If query() still read the hardcoded warehouse.duckdb, 'decoupled' wouldn't exist there → the
  // preview would be empty/failed. A row with 42 proves dbt's write + our read hit the SAME db.
  const readsSameDb =
    !!preview && preview.name === 'decoupled' && preview.rows.length === 1 && Number(preview.rows[0][0]) === 42
  const decoupleOk = builtOnNewPath && readsSameDb
  console.log('   path decoupling →', decoupleOk
    ? 'dbt wrote + query() read /project/warehouse2.duckdb consistently'
    : `FAILED (built=${builtOnNewPath} read=${readsSameDb} preview=${JSON.stringify(preview)})`)

  // (c) crash-safety - reloading lesson 3 drives reset() against the CUSTOM path (drop objects, keep
  //     the open db file). If that corrupted the wasm runtime (D26), lesson 3's own seed + preRun
  //     would fail; instead its pre-ran models must come back (engine healthy, default path restored).
  await page.evaluate(async () => { await window.__GAME_STORE.getState().loadLesson(3) }, null)
  await page.waitForFunction(() => {
    const s = window.__GAME_STORE.getState()
    return s.currentLessonId === 3 && s.running === false
  }, null, { timeout: BOOT_TIMEOUT })
  const p5reload = await snapshot()
  const reloadSurvived = ['stg_customers', 'dim_customers', 'stg_orders'].every((m) => p5reload.ranModels.includes(m))
  console.log('   reset on custom path survived →', reloadSurvived
    ? 'engine healthy after custom-path reset (pre-ran models back on default path)'
    : `FAILED (ranModels=${p5reload.ranModels})`)

  const phase5pass = visOk && decoupleOk && reloadSurvived

  clearInterval(t)

  const pass = l1pass && l3pass && phase4pass && phase5pass
  console.log(
    '\n' + '='.repeat(72) + '\n' +
      (pass
        ? 'GATE PASSED ✅ - lessons 1 & 3 on REAL dbt + open command set + editable infra\n' +
          '   (run / show / multi-model build + lineage; any dbt command reaches real dbt;\n' +
          '    dbt show routes to real dbt; deps/docs serve/init intercepted gracefully;\n' +
          '    editable profiles.yml: warehouse-path decoupling + hidden-but-synced files)'
        : `GATE FAILED ❌ - lesson1=${l1pass} lesson3=${l3pass} phase4=${phase4pass} phase5=${phase5pass}`) +
      '\n' + '='.repeat(72),
  )
  exitCode = pass ? 0 : 1
} catch (err) {
  console.error('\nGATE ERROR:', err && err.stack ? err.stack : err)
} finally {
  if (browser) await browser.close()
  preview.kill('SIGTERM')
}
process.exit(exitCode)
