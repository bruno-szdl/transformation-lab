import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import Header from './components/Header'
import LabBar from './components/LabBar'
import BootOverlay from './components/BootOverlay'
import HomePage from './components/HomePage'
import PrivacyPage from './components/PrivacyPage'
import { useGameStore } from './store/gameStore'
import { useIsMobile } from './hooks/useIsMobile'

// The lesson workspace pulls in the heavy deps (reactflow lineage graph, the Monaco editor wrapper,
// the database explorer). The intro (lesson 0) - the common first paint - needs none of it, so we
// code-split the workspace into its own chunk and load it only when a lesson is opened (by which
// point the ~40 MB engine boot dominates anyway). Keeps the initial bundle lean.
const Workspace = lazy(() => import('./components/Workspace'))
const MobileLayout = lazy(() => import('./components/MobileLayout'))

type ParsedRoute = { kind: 'lesson'; lessonId: number | null } | { kind: 'privacy' }

function parsePathname(pathname: string): ParsedRoute {
  if (pathname.startsWith('/privacy')) return { kind: 'privacy' }
  const m = pathname.match(/^\/lesson\/(\d+)\/?$/)
  if (m) {
    const n = Number(m[1])
    return { kind: 'lesson', lessonId: Number.isFinite(n) ? n : null }
  }
  return { kind: 'lesson', lessonId: null }
}

/**
 * Migrate legacy hash URLs (`#/lesson/3`, `#/privacy`) to clean paths so old
 * links keep working. Runs once at startup, rewrites history in-place.
 * Returns the resulting pathname so the caller can use it directly.
 */
function migrateLegacyHashOnce(): string {
  const hash = window.location.hash
  if (!hash) return window.location.pathname
  const lessonMatch = hash.match(/^#\/lesson\/(\d+)$/)
  if (lessonMatch) {
    const target = `/lesson/${lessonMatch[1]}`
    window.history.replaceState(null, '', target)
    return target
  }
  if (hash.startsWith('#/privacy')) {
    window.history.replaceState(null, '', '/privacy')
    return '/privacy'
  }
  return window.location.pathname
}

export default function App() {
  const loadLesson = useGameStore((s) => s.loadLesson)
  const currentLessonId = useGameStore((s) => s.currentLessonId)
  const theme = useGameStore((s) => s.theme)
  const initializedRef = useRef(false)
  const isMobile = useIsMobile()
  // `pathname` is the single source of truth for routing. It is updated by:
  //   1. popstate (browser back/forward, or a manual dispatchEvent('popstate'))
  //   2. the currentLessonId effect, which mirrors store → URL → state.
  const [pathname, setPathname] = useState(() => migrateLegacyHashOnce())

  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : ''
  }, [theme])

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    const parsed = parsePathname(pathname)
    // The home/chooser page (id 0) is always the landing at `/`. A deep link to
    // `/lesson/N` opens that lesson directly; returning learners resume via the
    // home page's "Continue" button (driven by the persisted `lastLessonId`),
    // not an automatic redirect into their last lesson.
    const resumeId = parsed.kind === 'lesson' ? parsed.lessonId ?? 0 : 0
    loadLesson(resumeId).catch((err) => {
      console.error('Failed to initialise lesson on startup:', err)
    })
  }, [loadLesson, pathname])

  useEffect(() => {
    if (!initializedRef.current) return
    // Mirror the store's lesson into the URL. This also handles "click the
    // logo while on /privacy" - currentLessonId changes (or stays at 0), and
    // we switch the URL back to a lesson route. The setPathname below makes
    // the render react to that, without setState being called by an external
    // event listener (linting flags setState-inside-effect, but here the
    // effect is *the* place state must converge with the URL).
    const target = currentLessonId === 0 ? '/' : `/lesson/${currentLessonId}`
    if (window.location.pathname !== target) {
      window.history.replaceState(null, '', target)
    }
    if (pathname !== target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPathname(target)
    }
  }, [currentLessonId, pathname])

  useEffect(() => {
    const onPopState = () => {
      const next = window.location.pathname
      setPathname(next)
      const parsed = parsePathname(next)
      if (parsed.kind === 'lesson') {
        const id = parsed.lessonId ?? 0
        if (id !== useGameStore.getState().currentLessonId) {
          loadLesson(id).catch(() => undefined)
        }
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [loadLesson])

  const route = parsePathname(pathname).kind
  const isHome = currentLessonId === 0

  if (isMobile) {
    return (
      <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--color-base)' }}>
        <BootOverlay />
        <LabBar />
        <Header />
        <div className="flex-1 overflow-y-auto">
          {route === 'privacy' ? <PrivacyPage /> : (isHome ? <HomePage /> : (
            <Suspense fallback={null}><MobileLayout /></Suspense>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: 'var(--color-base)' }}>
      <BootOverlay />
      <LabBar />
      <Header />
      {route === 'privacy' ? <PrivacyPage /> : (isHome ? <HomePage /> : (
        <Suspense fallback={null}><Workspace /></Suspense>
      ))}
    </div>
  )
}
