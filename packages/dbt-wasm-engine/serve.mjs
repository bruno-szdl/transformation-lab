// serve.mjs - a tiny zero-dependency static server for the browser harness.
// Serves the repo root so the worker can import /engine-stubs.mjs and fetch /wheelhouse/*.whl,
// while Pyodide itself loads from the CDN. `/` maps to web/index.html.
//
//   npm run serve   ->   http://localhost:5173/

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 5173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".whl": "application/octet-stream",
  ".wasm": "application/wasm",
  ".csv": "text/csv; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/") urlPath = "/web/index.html";
    const filePath = normalize(join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const data = await readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404).end("not found: " + req.url);
  }
});

server.listen(PORT, () => {
  console.log(`serving ${ROOT}\n  http://localhost:${PORT}/   (web/index.html)`);
});
