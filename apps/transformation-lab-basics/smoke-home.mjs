// smoke-home.mjs - quick check that the new home/chooser page renders at `/`
// without runtime errors (the lesson gates only exercise /lesson/N).
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { chromium } from 'playwright'

const APP_DIR = dirname(fileURLToPath(import.meta.url))
const PORT = 5182
const BASE = `http://localhost:${PORT}/`

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: APP_DIR, stdio: 'inherit' })

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(BASE); if (r.ok) return } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('vite preview did not come up')
}

let exitCode = 1
let browser
const errors = []
try {
  await waitForServer()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  // Simulate a returning learner so the "Continue" path is exercised too.
  await page.addInitScript(() => {
    localStorage.setItem('transformation-lab-progress', JSON.stringify({ currentLessonId: 0, lastLessonId: 4, completedTasks: ['1.run'], correctQuizzes: [1] }))
  })
  await page.goto(BASE, { waitUntil: 'networkidle' })

  const text = await page.evaluate(() => document.body.innerText)
  const checks = {
    'wordmark': /Data Transformation/.test(text),
    'Basics card': /Basics/.test(text),
    'Intermediate card': /Intermediate/.test(text),
    'Advanced card': /Advanced/.test(text),
    'Coming soon chip': /Coming soon/i.test(text),
    'Continue (returning learner)': /Continue/.test(text),
    'lab chip lesson count': /lab\s*·\s*\d+\s*lessons/i.test(text),
  }
  // The engine must NOT boot just from viewing home.
  const bootedOverlay = await page.evaluate(() => document.body.innerText.includes('Setting up real dbt'))

  console.log('\n- home page render checks -')
  let allPass = true
  for (const [name, ok] of Object.entries(checks)) {
    console.log(`  ${ok ? '✅' : '❌'} ${name}`)
    if (!ok) allPass = false
  }
  console.log(`  ${!bootedOverlay ? '✅' : '❌'} engine did NOT boot on home view`)
  if (bootedOverlay) allPass = false

  // Clicking the live Basics card should navigate to /lesson/N (returning → lesson 4).
  await page.locator('.home-card--live').first().click()
  await page.waitForTimeout(500)
  const url = page.url()
  const navOk = /\/lesson\/4$/.test(url)
  console.log(`  ${navOk ? '✅' : '❌'} clicking Basics → ${url}`)
  if (!navOk) allPass = false

  if (errors.length) {
    console.log('\n  page errors:')
    for (const e of errors) console.log('   -', e)
    allPass = false
  }

  exitCode = allPass ? 0 : 1
  console.log(`\n${allPass ? 'SMOKE PASSED ✅' : 'SMOKE FAILED ❌'}`)
} catch (e) {
  console.error('smoke error:', e)
} finally {
  if (browser) await browser.close()
  preview.kill()
  process.exit(exitCode)
}
