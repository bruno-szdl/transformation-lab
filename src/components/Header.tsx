import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore, lessonCompleted } from '../store/gameStore'
import { lessons, getLessonById } from '../lessons'
import { localizedLessonTitle } from '../i18n/useLocalizedLesson'
import { useIsMobile } from '../hooks/useIsMobile'

export default function Header() {
  const isMobile = useIsMobile()
  const { t } = useTranslation()
  return (
    <header
      className="flex items-center justify-between shrink-0"
      style={{
        height: '52px',
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: isMobile ? '0 10px' : '0 20px',
        gap: '8px',
      }}
    >
      <div className="flex items-center gap-2 min-w-0" style={{ flex: 1 }}>
        <DbtLogo />
        {!isMobile && (
          <>
            <div className="flex flex-col justify-center" style={{ gap: '1px' }}>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold tracking-tight" style={{ fontFamily: 'IBM Plex Sans, sans-serif', color: 'var(--color-accent-orange)', fontSize: '0.9375rem' }}>dbt</span>
                <span className="font-semibold tracking-tight" style={{ fontFamily: 'IBM Plex Sans, sans-serif', color: 'var(--color-text)', fontSize: '0.9375rem' }}>quest</span>
              </div>
              <span style={{ fontFamily: 'IBM Plex Sans, sans-serif', color: 'var(--color-muted)', fontSize: '0.625rem', lineHeight: 1 }}>
                {t('header.tagline')}
              </span>
            </div>
            <div className="w-px h-4 ml-1" style={{ background: 'var(--color-border)' }} />
          </>
        )}
        <LessonSelector compact={isMobile} />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <ExternalIconLink
          href="https://github.com/bruno-szdl/dbt-quest"
          label={t('header.githubLabel')}
        >
          <GitHubIcon />
        </ExternalIconLink>
        <ExternalIconLink
          href="https://www.linkedin.com/in/brunoszdl"
          label={t('header.linkedinLabel')}
        >
          <LinkedInIcon />
        </ExternalIconLink>
        <LangToggleButton />
        <ThemeToggleButton />
      </div>
    </header>
  )
}

function ExternalIconLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className="icon-btn flex items-center justify-center"
      style={{
        width: '28px',
        height: '28px',
        textDecoration: 'none',
      }}
    >
      {children}
    </a>
  )
}

function GitHubIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

function LinkedInIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M3.5 1.6A1.6 1.6 0 1 1 .3 1.6a1.6 1.6 0 0 1 3.2 0Zm.2 2.65H.05V15.7h3.65V4.25Zm5.83 0H5.9V15.7h3.6V9.7c0-3.35 4.36-3.62 4.36 0v6h3.6V8.45c0-5.62-6.43-5.42-7.96-2.65V4.25Z" />
    </svg>
  )
}

function LessonSelector({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const currentLessonId = useGameStore((s) => s.currentLessonId)
  const completedTasks = useGameStore((s) => s.completedTasks)
  const loadLesson = useGameStore((s) => s.loadLesson)
  const lesson = getLessonById(currentLessonId)
  const { t, i18n } = useTranslation()
  const lang = i18n.language

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={containerRef} style={{ position: 'relative', minWidth: 0, flex: compact ? 1 : 'initial' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2"
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          background: 'transparent',
          border: 'none',
          padding: '4px 6px',
          borderRadius: '5px',
          cursor: 'pointer',
          maxWidth: '100%',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(128,128,128,0.08)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', fontFamily: 'IBM Plex Sans, sans-serif' }}>{t('header.lesson')}</span>
        <span
          className="font-semibold px-2.5 py-0.5 rounded"
          style={{
            background: 'var(--color-accent-bg)',
            border: '1px solid var(--color-accent-orange-dim)',
            color: 'var(--color-accent-orange)',
            fontSize: '0.8125rem',
            fontFamily: 'JetBrains Mono, monospace',
            flexShrink: 0,
          }}
        >
          {currentLessonId || '-'}
        </span>
        {lesson && (
          <>
            <span style={{ color: 'var(--color-muted)', fontSize: '0.75rem', flexShrink: 0 }}>-</span>
            <span
              style={{
                color: 'var(--color-text-muted)',
                fontSize: '0.75rem',
                fontFamily: 'IBM Plex Sans, sans-serif',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {localizedLessonTitle(lesson, lang)}
            </span>
          </>
        )}
        <svg
          width="10"
          height="10"
          viewBox="0 0 16 16"
          fill="none"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s', color: 'var(--color-muted)' }}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('header.lessonsAria')}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '6px',
            // Cap to viewport width minus a small breathing margin so the
            // dropdown never overflows on a 320px device.
            width: 'min(300px, calc(100vw - 24px))',
            maxHeight: 'calc(100vh - 80px)',
            overflowY: 'auto',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          }}
        >
          {lessons.map((l) => {
            const isCurrent = l.id === currentLessonId
            const isCompleted = lessonCompleted(completedTasks, l.id)
            return (
              <button
                key={l.id}
                onClick={() => { void loadLesson(l.id); setOpen(false) }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '6px 8px',
                  background: isCurrent ? 'var(--color-accent-bg)' : 'transparent',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  textAlign: 'left' as const,
                }}
                onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = 'rgba(128,128,128,0.08)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isCurrent ? 'var(--color-accent-bg)' : 'transparent' }}
              >
                <span
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.625rem',
                    color: isCurrent ? 'var(--color-accent-orange)' : isCompleted ? 'var(--color-success)' : 'var(--color-muted)',
                    width: '18px',
                    textAlign: 'right' as const,
                    flexShrink: 0,
                  }}
                >
                  {l.id}
                </span>
                <span
                  style={{
                    fontFamily: 'IBM Plex Sans, sans-serif',
                    fontSize: '0.75rem',
                    color: isCurrent ? 'var(--color-text)' : 'var(--color-text-muted)',
                    flex: 1,
                  }}
                >
                  {localizedLessonTitle(l, lang)}
                </span>
                {isCompleted && (
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8.5l3 3 7-7" stroke="var(--color-success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DbtLogo() {
  return (
    <span style={{ color: 'var(--color-accent-orange)', display: 'flex' }}>
      <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="6" fill="currentColor" fillOpacity="0.12" />
        <path d="M8 23 L16 9 L24 23" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="8" cy="23" r="2" fill="currentColor" />
        <circle cx="16" cy="9" r="2" fill="currentColor" />
        <circle cx="24" cy="23" r="2" fill="currentColor" />
        <line x1="8" y1="23" x2="24" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
      </svg>
    </span>
  )
}

const LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
]

function LangToggleButton() {
  const { i18n, t } = useTranslation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0]

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const choose = (code: string) => {
    void i18n.changeLanguage(code)
    localStorage.setItem('dbt-quest-lang', code)
    setOpen(false)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={t('header.changeLanguage')}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="icon-btn flex items-center justify-center gap-1"
        style={{
          height: '28px',
          padding: '0 7px',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.625rem',
          letterSpacing: '0.05em',
        }}
      >
        <GlobeIcon />
        {current.code.toUpperCase()}
        <svg
          width="8"
          height="8"
          viewBox="0 0 16 16"
          fill="none"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={t('header.changeLanguage')}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '4px',
            minWidth: '140px',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          }}
        >
          {LANGUAGES.map((l) => {
            const isCurrent = l.code === current.code
            return (
              <button
                key={l.code}
                onClick={() => choose(l.code)}
                role="option"
                aria-selected={isCurrent}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '6px 8px',
                  background: isCurrent ? 'var(--color-accent-bg)' : 'transparent',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  textAlign: 'left' as const,
                }}
                onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = 'rgba(128,128,128,0.08)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isCurrent ? 'var(--color-accent-bg)' : 'transparent' }}
              >
                <span
                  style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '0.625rem',
                    color: isCurrent ? 'var(--color-accent-orange)' : 'var(--color-muted)',
                    width: '20px',
                    flexShrink: 0,
                    letterSpacing: '0.05em',
                  }}
                >
                  {l.code.toUpperCase()}
                </span>
                <span
                  style={{
                    fontFamily: 'IBM Plex Sans, sans-serif',
                    fontSize: '0.75rem',
                    color: isCurrent ? 'var(--color-text)' : 'var(--color-text-muted)',
                    flex: 1,
                  }}
                >
                  {l.label}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function GlobeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.3" />
      <ellipse cx="8" cy="8" rx="2.5" ry="6.25" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.75 8h12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function ThemeToggleButton() {
  const { t } = useTranslation()
  const theme = useGameStore((s) => s.theme)
  const toggleTheme = useGameStore((s) => s.toggleTheme)
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? t('header.lightMode') : t('header.darkMode')}
      className="icon-btn flex items-center justify-center"
      style={{
        width: '28px',
        height: '28px',
      }}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM8 0a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V.75A.75.75 0 0 1 8 0Zm0 13a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 13ZM2.343 2.343a.75.75 0 0 1 1.061 0l1.06 1.061a.75.75 0 0 1-1.06 1.06l-1.061-1.06a.75.75 0 0 1 0-1.061Zm9.193 9.193a.75.75 0 0 1 1.06 0l1.061 1.06a.75.75 0 0 1-1.06 1.061l-1.061-1.06a.75.75 0 0 1 0-1.061ZM16 8a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 16 8ZM3 8a.75.75 0 0 1-.75.75H.75a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 3 8Zm10.657-5.657a.75.75 0 0 1 0 1.061l-1.061 1.06a.75.75 0 0 1-1.06-1.06l1.06-1.061a.75.75 0 0 1 1.061 0Zm-9.193 9.193a.75.75 0 0 1 0 1.06l-1.06 1.061a.75.75 0 0 1-1.061-1.06l1.06-1.061a.75.75 0 0 1 1.061 0Z" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M9.598 1.591a.749.749 0 0 1 .785-.175 7.001 7.001 0 1 1-8.967 8.967.75.75 0 0 1 .961-.96 5.5 5.5 0 0 0 7.046-7.046.75.75 0 0 1 .175-.786Z" />
    </svg>
  )
}

