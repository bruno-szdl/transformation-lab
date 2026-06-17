// test-browser.mjs - the Step 2.3 GATE: prove the engine boots and builds in a REAL browser.
// Spawns serve.mjs, drives the harness in headless Chromium (Playwright), waits for the page's
// window.__RESULT__ signal, and asserts PASS=3. Headless Chromium is real Chromium - Web Workers,
// wasm, and the CDN fetch all exercise the genuine browser path that Node could not.

import { spawn } from "node:child_process";
import { chromium } from "playwright";

const PORT = 5179;
const URL = `http://localhost:${PORT}/`;
const BOOT_TIMEOUT_MS = 240_000; // Pyodide download + wheel install + first dbt build, cold

const server = spawn("node", ["serve.mjs"], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: "inherit",
});

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(URL);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("static server did not come up");
}

let exitCode = 1;
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // surface page + worker diagnostics
  page.on("console", (msg) => console.log(`[browser:${msg.type()}]`, msg.text()));
  page.on("pageerror", (err) => console.log("[browser:pageerror]", err.message));

  console.log(`\nopening ${URL} in headless Chromium…`);
  await page.goto(URL, { waitUntil: "domcontentloaded" });

  // stream the live status line so the run isn't a black box
  let lastStatus = "";
  const statusTimer = setInterval(async () => {
    try {
      const s = await page.$eval("#status", (el) => el.textContent);
      if (s && s !== lastStatus) {
        lastStatus = s;
        console.log("  status:", s);
      }
    } catch {
      /* page navigating */
    }
  }, 500);

  await page.waitForFunction(() => window.__RESULT__ !== undefined, null, {
    timeout: BOOT_TIMEOUT_MS,
  });
  clearInterval(statusTimer);

  const result = await page.evaluate(() => window.__RESULT__);
  const verdict = await page.$eval("#verdict", (el) => el.textContent).catch(() => "");
  console.log("\n__RESULT__:", JSON.stringify(result));
  console.log("verdict   :", verdict.trim());

  const pass = result && result.pass === true && result.n === 3 && result.dbtVersion === "1.10.8";
  if (!pass) {
    const term = await page.$eval("#terminal", (el) => el.textContent).catch(() => "");
    console.log("\n--- dbt terminal (tail) ---\n" + term.split("\n").slice(-40).join("\n"));
  }

  console.log(
    "\n" + "=".repeat(72) + "\n" +
      (pass
        ? "STEP 2.3 GATE PASSED ✅ - real dbt booted & built in a browser Web Worker (PASS=3)"
        : "STEP 2.3 GATE FAILED ❌") +
      "\n" + "=".repeat(72)
  );
  exitCode = pass ? 0 : 1;
} catch (err) {
  console.error("\nGATE ERROR:", err.message);
  exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}

process.exit(exitCode);
