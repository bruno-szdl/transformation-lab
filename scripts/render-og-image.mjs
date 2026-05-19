#!/usr/bin/env node
// Render public/og-image.svg → public/og-image.png (1200x630) using the
// system Chrome in headless mode. This avoids adding a heavyweight image
// dependency (sharp/puppeteer/playwright) just for one build artifact.
//
// Facebook, LinkedIn, and X do not render SVG OG images. PNG is required for
// reliable social previews.

import { existsSync, mkdtempSync, copyFileSync, rmSync, renameSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const ROOT = resolve(__dirname, '..')
const SVG = resolve(ROOT, 'public', 'og-image.svg')
const PNG = resolve(ROOT, 'public', 'og-image.png')

// Try Chrome candidates in order of preference.
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

function findChrome() {
  for (const c of CHROME_CANDIDATES) {
    if (existsSync(c)) return c
  }
  return null
}

function main() {
  if (!existsSync(SVG)) {
    console.error(`  ⚠ og-image.svg missing at ${SVG}, skipping PNG render`)
    return
  }

  const chrome = findChrome()
  if (!chrome) {
    console.error('  ⚠ No headless Chrome found — skipping og-image.png generation.')
    console.error('    Install Google Chrome or set up sharp/playwright manually.')
    console.error('    Tags will fall back to og-image.svg (broken on most social platforms).')
    return
  }

  // Chrome writes the screenshot next to its CWD by default, so use a temp
  // dir to avoid polluting the repo. We resize to exactly 1200x630.
  const tmp = mkdtempSync(join(tmpdir(), 'ae-og-'))
  try {
    const tmpPng = join(tmp, 'og.png')
    const args = [
      `"${chrome}"`,
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--default-background-color=00000000',
      '--window-size=1200,630',
      `--screenshot="${tmpPng}"`,
      `"file://${SVG}"`,
    ].join(' ')
    execSync(args, { stdio: 'pipe' })
    if (!existsSync(tmpPng)) {
      console.error('  ⚠ Chrome did not produce a screenshot — leaving SVG only.')
      return
    }
    // Atomic move into the public folder.
    copyFileSync(tmpPng, PNG)
    console.log(`  ✓ public/og-image.png (rendered from og-image.svg)`)

    // Also copy into dist/ if the build has already run.
    const distPng = resolve(ROOT, 'dist', 'og-image.png')
    if (existsSync(resolve(ROOT, 'dist'))) {
      copyFileSync(tmpPng, distPng)
      console.log(`  ✓ dist/og-image.png`)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main()
