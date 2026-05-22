import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../store/gameStore'
import { renderInline } from './Markdownish'

/**
 * Celebration block shown in LessonPanel after the final lesson's tasks all
 * complete. Renders a small confetti burst (pure CSS, no library), a headline,
 * suggested next steps, and a share link. Replaces the previous one-line
 * "you've finished" success box.
 */
export default function CourseComplete() {
  const { t } = useTranslation()
  const [confetti] = useState(() => {
    const palette = ['var(--color-accent-orange)', 'var(--color-success)', 'var(--color-warning)', 'var(--color-text)']
    return Array.from({ length: 22 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 600,
      color: palette[i % palette.length],
      size: 4 + Math.random() * 4,
    }))
  })

  const loadLesson = useGameStore((s) => s.loadLesson)
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://analyticsengineering.quest')}`

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid var(--color-success-border)',
        background: 'var(--color-success-bg)',
        borderRadius: '8px',
        padding: '20px 18px 18px',
      }}
    >
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {confetti.map((c, i) => (
          <span
            key={i}
            className="sparkle"
            style={{
              left: `${c.left}%`,
              top: '50%',
              width: `${c.size}px`,
              height: `${c.size}px`,
              background: c.color,
              animationDelay: `${c.delay}ms`,
            }}
          />
        ))}
      </div>

      <div
        style={{
          color: 'var(--color-accent-orange)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.6875rem',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          fontWeight: 600,
          marginBottom: '8px',
        }}
      >
        {t('courseComplete.eyebrow')}
      </div>
      <h3
        style={{
          margin: '0 0 10px',
          color: 'var(--color-text)',
          fontFamily: 'var(--font-sans)',
          fontSize: '1.0625rem',
          fontWeight: 700,
          lineHeight: 1.3,
        }}
      >
        {t('courseComplete.title')}
      </h3>
      <p
        style={{
          margin: '0 0 14px',
          color: 'var(--color-text-secondary)',
          fontSize: '0.875rem',
          lineHeight: 1.6,
        }}
      >
        {renderInline(t('courseComplete.body'))}
      </p>

      <div style={{ marginBottom: '12px' }}>
        <SubLabel>{t('courseComplete.whatNext')}</SubLabel>
        <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <NextStep>
            {t('courseComplete.step1Lead')}
            <ExtLink href="https://docs.getdbt.com/docs/core/installation-overview">{t('courseComplete.step1Link')}</ExtLink>
          </NextStep>
          <NextStep>
            {t('courseComplete.step2Lead')}
            <ExtLink href="https://github.com/dbt-labs/jaffle-shop">{t('courseComplete.step2Link')}</ExtLink>
            {t('courseComplete.step2Tail')}
          </NextStep>
          <NextStep>
            {t('courseComplete.step3Lead')}
            <ExtLink href="https://docs.getdbt.com/docs/build/jinja-macros">{t('courseComplete.step3Macros')}</ExtLink>
            {t('courseComplete.step3Sep')}
            <ExtLink href="https://docs.getdbt.com/docs/build/incremental-models">{t('courseComplete.step3Incremental')}</ExtLink>
            {t('courseComplete.step3Sep')}
            <ExtLink href="https://docs.getdbt.com/docs/build/snapshots">{t('courseComplete.step3Snapshots')}</ExtLink>
            {t('courseComplete.step3Sep')}
            <ExtLink href="https://docs.getdbt.com/docs/build/packages">{t('courseComplete.step3Packages')}</ExtLink>
            {t('courseComplete.step3End')}
          </NextStep>
        </ul>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <a
          href={linkedInUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            fontSize: '0.8125rem',
            textDecoration: 'none',
          }}
        >
          {t('courseComplete.shareLinkedIn')}
        </a>
        <button
          onClick={() => void loadLesson(0)}
          style={{
            padding: '8px 14px',
            fontSize: '0.8125rem',
            color: 'var(--color-text-muted)',
            background: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
          }}
        >
          {t('courseComplete.backToIntro')}
        </button>
      </div>
    </div>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: 'var(--color-text-muted)',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.625rem',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}
    >
      {children}
    </div>
  )
}

function NextStep({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ display: 'flex', gap: '8px', color: 'var(--color-text-secondary)', fontSize: '0.8125rem', lineHeight: 1.55 }}>
      <span style={{ color: 'var(--color-accent-orange)', flexShrink: 0 }}>→</span>
      <span>{children}</span>
    </li>
  )
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'var(--color-accent-orange)', textDecoration: 'underline' }}
    >
      {children}
    </a>
  )
}
