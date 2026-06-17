import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { safeStorage } from './store/safeStorage.ts'

// Apply saved theme before first render to prevent flash
const saved = safeStorage.getItem('transformation-lab-theme')
const prefersDark = !window.matchMedia('(prefers-color-scheme: light)').matches
const theme = saved ?? (prefersDark ? 'dark' : 'light')
if (theme === 'light') document.documentElement.dataset.theme = 'light'

// Plausible Analytics - shared DataGym.io site. Subdomains roll up to the
// datagym.io site in Plausible's dashboard. Prod-only so dev / preview builds
// don't pollute stats.
if (import.meta.env.PROD) {
  const script = document.createElement('script')
  script.async = true
  script.src = 'https://plausible.io/js/pa-c87gbF8nEAP4EwX23Wzfa.js'
  document.head.appendChild(script)
  const init = document.createElement('script')
  init.text =
    'window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()'
  document.head.appendChild(init)
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
