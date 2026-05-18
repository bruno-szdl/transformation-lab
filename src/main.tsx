import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { safeStorage } from './store/safeStorage.ts'

// Apply saved theme before first render to prevent flash
const saved = safeStorage.getItem('ae-quest-theme') ?? safeStorage.getItem('dbt-quest-theme')
const prefersDark = !window.matchMedia('(prefers-color-scheme: light)').matches
const theme = saved ?? (prefersDark ? 'dark' : 'light')
if (theme === 'light') document.documentElement.dataset.theme = 'light'

// Cloudflare Web Analytics — only loads when VITE_CF_ANALYTICS_TOKEN is set at
// build time, so dev / preview builds never ping the prod beacon.
const cfToken = import.meta.env.VITE_CF_ANALYTICS_TOKEN
if (cfToken) {
  const script = document.createElement('script')
  script.defer = true
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js'
  script.setAttribute('data-cf-beacon', JSON.stringify({ token: cfToken }))
  document.head.appendChild(script)
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
