import { useTranslation } from 'react-i18next'
import { useGameStore } from '../store/gameStore'
import { getLessonById, getLastLessonId } from '../lessons'
import { renderInline } from './Markdownish'

/**
 * The subdomain landing page (rendered at `/`, i.e. `currentLessonId === 0`).
 * Replaces the old single-lab intro article: it frames the product once, then
 * lets the learner pick a stage. Today only Basics is live; Intermediate and
 * Advanced render as dashed "coming soon" cards so the path reads as a journey,
 * not three equal choices. Like the old intro, opening it never boots the
 * ~40 MB engine - that only happens once a lesson is loaded.
 */

type StageId = 'basics' | 'intermediate' | 'advanced'
const STAGE_ORDER: StageId[] = ['basics', 'intermediate', 'advanced']
const LIVE: Record<StageId, boolean> = { basics: true, intermediate: false, advanced: false }

export default function HomePage() {
  const { t } = useTranslation()
  const loadLesson = useGameStore((s) => s.loadLesson)
  const lastLessonId = useGameStore((s) => s.lastLessonId)
  const total = getLastLessonId()
  const hasProgress = lastLessonId >= 1
  const resumeTitle = hasProgress ? getLessonById(lastLessonId)?.title ?? '' : ''

  const startBasics = () => void loadLesson(hasProgress ? lastLessonId : 1)

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ background: 'var(--color-base)', color: 'var(--color-text)' }}
    >
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section style={{ maxWidth: '780px', margin: '0 auto', padding: '48px 32px 8px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '10px', marginBottom: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-accent-orange)', letterSpacing: '-0.02em' }}>
            Data Transformation
          </span>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
            Lab
          </span>
        </div>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '1.125rem', color: 'var(--color-text-secondary)', margin: '0 auto 6px', maxWidth: '560px', lineHeight: 1.45 }}>
          {t('home.tagline').split(/(dbt)/).map((part, i) =>
            part === 'dbt' ? <strong key={i} style={{ color: 'var(--color-accent-orange)', fontWeight: 700 }}>dbt</strong> : part,
          )}
        </p>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.9375rem', color: 'var(--color-text-muted)', margin: '0 auto', maxWidth: '560px', lineHeight: 1.55 }}>
          {t('home.subTagline')}
        </p>

        {/* Path: Basics ▸ Intermediate ▸ Advanced */}
        <nav className="home-path" aria-label={t('home.pathLabel')} style={{ marginTop: '28px' }}>
          {STAGE_ORDER.map((id) => (
            <span
              key={id}
              className={`home-pstep ${LIVE[id] ? 'home-pstep--current' : 'home-pstep--soon'}`}
            >
              <span className="home-pstep__name">{t(`home.stages.${id}.name`)}</span>
            </span>
          ))}
        </nav>
      </section>

      {/* ── STAGE CARDS ───────────────────────────────────────────────────── */}
      <section style={{ maxWidth: '780px', margin: '0 auto', padding: '24px 32px 8px' }}>
        <div className="home-cards">
          {STAGE_ORDER.map((id) => {
            const live = LIVE[id]
            const cardProps = live
              ? {
                  role: 'button' as const,
                  tabIndex: 0,
                  onClick: startBasics,
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startBasics() }
                  },
                }
              : { 'aria-disabled': true as const }
            return (
              <div key={id} className={`home-card ${live ? 'home-card--live' : 'home-card--soon'}`} {...cardProps}>
                <span className="home-card__edge" aria-hidden="true" />
                <span className={`home-chip ${live ? 'home-chip--lab' : 'home-chip--soon'}`}>
                  {live ? t('home.labChip', { count: total }) : t('home.comingSoon')}
                </span>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text)' }}>
                  {t(`home.stages.${id}.name`)}
                </h3>
                <p style={{ margin: 0, flexGrow: 1, fontSize: '0.875rem', lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                  {t(`home.stages.${id}.summary`)}
                </p>
                {live && (
                  <>
                    <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                      {hasProgress ? t('home.progress.inProgress', { n: lastLessonId, total }) : t('home.progress.notStarted')}
                    </p>
                    <span style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-accent-orange)' }}>
                      {hasProgress ? t('home.continue', { title: resumeTitle }) : t('home.start')}
                      <span className="home-card__arrow" aria-hidden="true">→</span>
                    </span>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {hasProgress && (
          <div style={{ marginTop: '14px', textAlign: 'center' }}>
            <button
              onClick={() => {
                if (window.confirm(t('home.restartConfirm'))) {
                  try { localStorage.removeItem('transformation-lab-progress') } catch { /* ignore */ }
                  window.location.reload()
                }
              }}
              style={{ background: 'transparent', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '8px 16px', fontFamily: 'var(--font-sans)', fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer' }}
            >
              {t('home.restart')}
            </button>
          </div>
        )}
      </section>

      {/* ── COMPACT PRIMER ────────────────────────────────────────────────── */}
      <article style={{ maxWidth: '720px', margin: '0 auto', padding: '24px 32px 16px', fontFamily: 'var(--font-sans)', fontSize: '0.9375rem', lineHeight: 1.65, color: 'var(--color-text-secondary)' }}>
        <PrimerHeading>{t('home.whatIsDbt.heading')}</PrimerHeading>
        <p style={{ margin: '0 0 18px' }}>{renderInline(t('home.whatIsDbt.body'))}</p>
        <PrimerHeading>{t('home.whyLearn.heading')}</PrimerHeading>
        <p style={{ margin: '0 0 18px' }}>{renderInline(t('home.whyLearn.body'))}</p>
        <Callout title={t('home.didYouKnow.title')}>{renderInline(t('home.didYouKnow.body'))}</Callout>
        <PrimerHeading>{t('home.beforeYouStart.heading')}</PrimerHeading>
        <p style={{ margin: 0 }}>{renderInline(t('home.beforeYouStart.body'))}</p>
      </article>

      <HomeFooter />
    </div>
  )
}

function PrimerHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)', margin: '0 0 8px' }}>
      {children}
    </h2>
  )
}

function Callout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        borderLeft: '3px solid var(--color-accent-orange)',
        background: 'var(--color-surface)',
        borderRadius: '0 8px 8px 0',
        padding: '12px 16px',
        margin: '0 0 18px',
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--color-text)', marginBottom: '4px' }}>{title}</div>
      <div>{children}</div>
    </div>
  )
}

function HomeFooter() {
  const { t } = useTranslation()
  const theme = useGameStore((s) => s.theme)
  const logoSrc = theme === 'light' ? '/brand/logo.svg' : '/brand/logo-light.svg'
  return (
    <footer style={{ maxWidth: '720px', margin: '0 auto', padding: '8px 32px 64px', textAlign: 'center', fontFamily: 'var(--font-sans)', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
      <div style={{ marginBottom: '14px' }}>
        <a
          href="https://datagym.io"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', color: 'var(--color-text-muted)', textDecoration: 'none', fontWeight: 600 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-orange)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)' }}
        >
          <img src={logoSrc} alt="" aria-hidden style={{ height: '14px', width: 'auto' }} />
          A DataGym.io Lab
        </a>
      </div>
      <div style={{ width: '32px', height: '1px', background: 'var(--color-border-subtle)', margin: '0 auto 14px' }} />
      <div>
        {t('intro.footer.builtBy')}
        {' · '}
        <a href="https://github.com/bruno-szdl/transformation-lab" target="_blank" rel="noopener noreferrer" className="text-link">GitHub</a>
        {' · '}
        <a href="https://www.linkedin.com/in/brunoszdl" target="_blank" rel="noopener noreferrer" className="text-link">LinkedIn</a>
        {' · '}
        <a href="/privacy" onClick={(e) => { e.preventDefault(); window.history.pushState(null, '', '/privacy'); window.dispatchEvent(new PopStateEvent('popstate')) }} className="text-link">Privacy</a>
      </div>
      <div style={{ marginTop: '6px', fontSize: '0.75rem' }}>{t('intro.footer.tag')}</div>
    </footer>
  )
}
