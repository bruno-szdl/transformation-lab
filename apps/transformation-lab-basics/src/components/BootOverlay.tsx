/**
 * Full-screen loading overlay for the one-time engine boot.
 *
 * The first time a lesson (or a typed dbt command) needs the engine, `@dbt-wasm/engine`
 * downloads & installs ~40 MB (Pyodide + dbt-core + dbt-duckdb) inside a Web Worker - a
 * ~10–30 s cold start (all in-browser - nothing is installed on the user's machine). This overlay
 * covers the whole app for that duration so the learner knows the environment is still setting up
 * and doesn't try to run commands before dbt is ready.
 *
 * It is driven entirely by `bootState`/`bootPhase` in the store (set from the engine's boot
 * lifecycle events). Boot is lazy: the overlay stays unmounted until the engine actually starts.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../store/gameStore'

// Each known boot phase maps to a target %. We can't observe real bytes, so the bar eases toward
// the current phase's target and waits there until the next phase bumps it - a single JS-driven
// value feeds both the bar width and the number so they never disagree (nprogress-style creep).
const PHASE_PCT: Record<string, number> = {
  'loading-pyodide': 22,
  'loading-micropip': 32,
  'installing-wheelhouse': 90,
  'applying-stubs': 97,
}

export default function BootOverlay() {
  const { t } = useTranslation()
  const bootState = useGameStore((s) => s.bootState)
  const bootPhase = useGameStore((s) => s.bootPhase)
  const bootError = useGameStore((s) => s.bootError)

  // `mounted` keeps the overlay in the tree through a short fade-out once boot is ready.
  const [mounted, setMounted] = useState(false)
  const [leaving, setLeaving] = useState(false)
  // `pct` is the single eased value behind both the bar width and the number.
  const [pct, setPct] = useState(0)

  const isError = bootState === 'error'
  const isReady = bootState === 'ready'

  useEffect(() => {
    if (bootState === 'booting' || bootState === 'error') {
      setMounted(true)
      setLeaving(false)
      return
    }
    if (bootState === 'ready' && mounted) {
      // Let the bar snap to 100%, then fade out and unmount.
      setLeaving(true)
      const id = setTimeout(() => setMounted(false), 550)
      return () => clearTimeout(id)
    }
  }, [bootState, mounted])

  // Ease the displayed % toward the current phase's target (or 100% when ready). Asymptotic creep
  // keeps it moving without ever overshooting the phase, so a slow install still feels alive.
  useEffect(() => {
    if (!mounted || isError) return
    if (isReady) {
      setPct(100) // snap to full so the brief "Ready!" frame shows a complete bar
      return
    }
    const target = bootPhase ? PHASE_PCT[bootPhase] ?? 8 : 6
    const id = setInterval(() => {
      setPct((p) => (p >= target ? p : Math.min(target, p + Math.max(0.25, (target - p) * 0.06))))
    }, 180)
    return () => clearInterval(id)
  }, [mounted, isError, isReady, bootPhase])

  if (!mounted) return null

  const phaseLabel = isReady
    ? t('boot.ready')
    : !bootPhase
      ? t('boot.starting')
      : bootPhase === 'loading-pyodide'
        ? t('boot.loadingPyodide')
        : bootPhase === 'loading-micropip'
          ? t('boot.loadingMicropip')
          : bootPhase === 'installing-wheelhouse'
            ? t('boot.installing')
            : bootPhase === 'applying-stubs'
              ? t('boot.finalizing')
              : bootPhase

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!isReady && !isError}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'var(--color-base)',
        opacity: leaving ? 0 : 1,
        transition: 'opacity 450ms ease',
        pointerEvents: leaving ? 'none' : 'auto',
      }}
    >
      <div
        style={{
          width: 'min(420px, 100%)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '14px',
          padding: '28px 26px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
          textAlign: 'center',
        }}
      >
        {isError ? (
          <ErrorMark />
        ) : isReady ? (
          <ReadyMark />
        ) : (
          <span
            className="boot-spinner"
            aria-hidden="true"
            style={{
              display: 'inline-block',
              width: '34px',
              height: '34px',
              borderRadius: '50%',
              border: '3px solid var(--color-accent-orange-dim)',
              borderTopColor: 'var(--color-accent-orange)',
            }}
          />
        )}

        <h2
          style={{
            margin: '16px 0 6px',
            fontFamily: 'var(--font-sans)',
            fontSize: '0.95rem',
            fontWeight: 600,
            color: 'var(--color-text)',
          }}
        >
          {isError ? t('boot.errorTitle') : t('boot.title')}
        </h2>

        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: '0.8125rem',
            color: 'var(--color-text-muted)',
            minHeight: '1.2em',
          }}
        >
          {isError ? t('boot.errorHint') : phaseLabel}
        </p>

        {!isError && (
          <>
            <div
              style={{
                marginTop: '18px',
                height: '8px',
                width: '100%',
                background: 'var(--color-accent-bg)',
                borderRadius: '999px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: 'var(--color-accent-orange)',
                  borderRadius: '999px',
                  transition: 'width 200ms linear',
                }}
              />
            </div>
            <div
              style={{
                marginTop: '8px',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.6875rem',
                color: 'var(--color-muted)',
                textAlign: 'right',
              }}
            >
              {Math.round(pct)}%
            </div>
          </>
        )}

        {isError ? (
          <pre
            style={{
              marginTop: '14px',
              maxHeight: '160px',
              overflow: 'auto',
              textAlign: 'left',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.6875rem',
              color: 'var(--color-fail, #e5484d)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {bootError}
          </pre>
        ) : (
          <p
            style={{
              marginTop: '14px',
              fontFamily: 'var(--font-sans)',
              fontSize: '0.6875rem',
              lineHeight: 1.5,
              color: 'var(--color-muted)',
            }}
          >
            {t('boot.note')}
          </p>
        )}
      </div>
    </div>
  )
}

function ReadyMark() {
  return (
    <span
      aria-hidden="true"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-success)' }}
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M7.5 12.5l3 3 6-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

function ErrorMark() {
  return (
    <span
      aria-hidden="true"
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-fail, #e5484d)' }}
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1.1" fill="currentColor" />
      </svg>
    </span>
  )
}
