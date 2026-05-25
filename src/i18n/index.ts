import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import pt from './locales/pt.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import it from './locales/it.json'

const SUPPORTED = ['en', 'pt', 'es', 'fr', 'de', 'it'] as const
type Supported = (typeof SUPPORTED)[number]

function detectBrowserLang(): Supported {
  const candidates = typeof navigator !== 'undefined'
    ? [...(navigator.languages ?? []), navigator.language].filter(Boolean)
    : []
  for (const tag of candidates) {
    const base = tag.toLowerCase().split('-')[0]
    if ((SUPPORTED as readonly string[]).includes(base)) return base as Supported
  }
  return 'en'
}

function langFromQuery(): Supported | null {
  if (typeof window === 'undefined') return null
  const param = new URLSearchParams(window.location.search).get('lang')
  if (!param) return null
  const base = param.toLowerCase().split('-')[0]
  return (SUPPORTED as readonly string[]).includes(base) ? (base as Supported) : null
}

// Lang resolution order: ?lang= query (lets hreflang URLs work for SEO) →
// localStorage preference → browser language → English fallback.
const saved = localStorage.getItem('transformation-lab-lang')
const initial: Supported =
  langFromQuery() ??
  ((SUPPORTED as readonly string[]).includes(saved ?? '')
    ? (saved as Supported)
    : detectBrowserLang())

// Keep <html lang="..."> in sync with the active language so SEO and a11y
// tools see the right locale on the current page.
if (typeof document !== 'undefined') {
  document.documentElement.lang = initial
  i18n.on('languageChanged', (lng) => {
    document.documentElement.lang = lng
  })
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { ui: en },
    pt: { ui: pt },
    es: { ui: es },
    fr: { ui: fr },
    de: { ui: de },
    it: { ui: it },
  },
  lng: initial,
  fallbackLng: 'en',
  defaultNS: 'ui',
  interpolation: { escapeValue: false },
})

export default i18n
