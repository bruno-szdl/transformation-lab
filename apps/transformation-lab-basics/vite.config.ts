import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // @dbt-wasm/engine spawns a module Web Worker via `new Worker(new URL('./worker.js', import.meta.url))`.
  // Excluding it from esbuild pre-bundling keeps it as source so Vite's worker pipeline handles the
  // worker chunk (and its CDN dynamic import) correctly.
  optimizeDeps: { exclude: ['@dbt-wasm/engine'] },
})
