import { useTranslation } from 'react-i18next'
import { useGameStore } from '../store/gameStore'
import { getLastLessonId } from '../lessons'
import { renderInline } from './Markdownish'

/**
 * Lesson 0: full-width article. A small hero (wordmark + tagline + top CTA)
 * sells the product immediately; the original SQLBolt-style explainer below
 * gives context for learners who want it before clicking through. All copy
 * flows through i18n; inline `code` / **bold** is rendered via Markdownish.
 */
export default function IntroPage() {
  const { t } = useTranslation()
  const loadLesson = useGameStore((s) => s.loadLesson)
  const completedTasks = useGameStore((s) => s.completedTasks)
  const last = getLastLessonId()
  const hasProgress = completedTasks.size > 0

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ background: 'var(--color-base)', color: 'var(--color-text)' }}
    >
      {/* ── HERO ────────────────────────────────────────────────────────────── */}
      <section
        style={{
          maxWidth: '760px',
          margin: '0 auto',
          padding: '48px 32px 28px',
          textAlign: 'center' as const,
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '10px', marginBottom: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '2rem',
              fontWeight: 700,
              color: 'var(--color-accent-orange)',
              letterSpacing: '-0.02em',
            }}
          >
            Analytics Engineering
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '2rem',
              fontWeight: 700,
              color: 'var(--color-text)',
              letterSpacing: '-0.02em',
            }}
          >
            Quest
          </span>
        </div>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '1.125rem',
            color: 'var(--color-text-secondary)',
            margin: '0 auto 6px',
            maxWidth: '540px',
            lineHeight: 1.45,
          }}
        >
          {t('intro.tagline').split(/(dbt)/).map((part, i) =>
            part === 'dbt' ? (
              <strong key={i} style={{ color: 'var(--color-accent-orange)', fontWeight: 700 }}>dbt</strong>
            ) : (
              part
            )
          )}
        </p>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.9375rem',
            color: 'var(--color-text-muted)',
            margin: '0 auto 24px',
            maxWidth: '540px',
            lineHeight: 1.55,
          }}
        >
          {t('intro.subTagline', { count: last })}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => void loadLesson(1)}
            className="btn-primary"
            style={{ fontSize: '0.9375rem', padding: '12px 22px' }}
          >
            {hasProgress ? t('intro.ctaContinue') : t('intro.ctaBegin')}
          </button>
          {hasProgress && (
            <button
              onClick={() => {
                if (window.confirm(t('intro.restartConfirm'))) {
                  try {
                    localStorage.removeItem('ae-quest-progress')
                    localStorage.removeItem('dbt-quest-progress')
                  } catch { /* ignore */ }
                  window.location.reload()
                }
              }}
              style={{
                background: 'transparent',
                color: 'var(--color-text-muted)',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                padding: '12px 18px',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.9375rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {t('intro.restart')}
            </button>
          )}
        </div>
      </section>

      {/* ── BODY (original SQLBolt-style explainer) ─────────────────────────── */}
      <article
        style={{
          maxWidth: '760px',
          margin: '0 auto',
          padding: '12px 32px 80px',
          fontFamily: 'var(--font-sans)',
          fontSize: '1rem',
          lineHeight: 1.65,
          color: 'var(--color-text-secondary)',
        }}
      >
        <p style={{ margin: '0 0 16px' }}>
          {t('intro.welcomeLead')}
          <strong style={{ color: 'var(--color-text)' }}>{t('intro.welcomeProduct')}</strong>
          {t('intro.welcomeMid')}
          <strong style={{ color: 'var(--color-accent-orange)', fontSize: '1.0625rem', fontWeight: 700 }}>{t('intro.welcomeDbt')}</strong>
          {t('intro.welcomeTail')}
          <a
            href="https://sqlbolt.com/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-accent-orange)', textDecoration: 'underline' }}
          >
            SQLBolt
          </a>
          {t('intro.welcomeSqlBoltAfter')}
        </p>

        <SectionHeader>{t('intro.whatIsDbt.heading')}</SectionHeader>
        <p style={{ margin: '0 0 16px' }}>{renderInline(t('intro.whatIsDbt.body'))}</p>

        <Aside title={t('intro.didYouKnow.title')}>
          {renderInline(t('intro.didYouKnow.body'))}
        </Aside>

        <p style={{ margin: '0 0 12px' }}>{renderInline(t('intro.dbtRun.intro'))}</p>
        <ol style={{ margin: '0 0 16px', paddingLeft: '0', listStyle: 'none' }}>
          <DbtRunStep>{renderInline(t('intro.dbtRun.step1'))}</DbtRunStep>
          <DbtRunStep>{renderInline(t('intro.dbtRun.step2'))}</DbtRunStep>
          <DbtRunStep>{renderInline(t('intro.dbtRun.step3'))}</DbtRunStep>
        </ol>
        <p style={{ margin: '0 0 16px' }}>{renderInline(t('intro.dbtRun.outro'))}</p>

        <SectionHeader>{t('intro.exampleDag.heading')}</SectionHeader>
        <p style={{ margin: '0 0 16px' }}>{t('intro.exampleDag.intro')}</p>
        <DagDiagram />
        <p style={{ margin: '16px 0' }}>{renderInline(t('intro.exampleDag.caption'))}</p>

        <SectionHeader>{t('intro.aboutLessons.heading')}</SectionHeader>
        <p style={{ margin: '0 0 16px' }}>{t('intro.aboutLessons.p1', { count: last })}</p>
        <p style={{ margin: '0 0 16px' }}>{t('intro.aboutLessons.p2')}</p>
        <p style={{ margin: '0 0 16px' }}>{t('intro.aboutLessons.p3')}</p>

        <SectionHeader>{t('intro.beforeYouStart.heading')}</SectionHeader>
        <p style={{ margin: '0 0 16px' }}>{renderInline(t('intro.beforeYouStart.body'))}</p>

        <div style={{ marginTop: '40px' }}>
          <button
            onClick={() => void loadLesson(1)}
            className="btn-primary"
            style={{ fontSize: '0.9375rem', padding: '12px 22px' }}
          >
            {hasProgress ? t('intro.ctaContinue') : t('intro.ctaBeginFull')}
          </button>
        </div>

        <Footer />
      </article>
    </div>
  )
}

function DbtRunStep({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ display: 'flex', gap: '8px', marginBottom: '3px' }}>
      <span style={{ color: 'var(--color-accent-orange)', flexShrink: 0 }}>→</span>
      <span>{children}</span>
    </li>
  )
}

function Footer() {
  const { t } = useTranslation()
  return (
    <footer
      style={{
        marginTop: '64px',
        paddingTop: '20px',
        borderTop: '1px solid var(--color-border-subtle)',
        textAlign: 'center' as const,
        fontFamily: 'var(--font-sans)',
        fontSize: '0.8125rem',
        color: 'var(--color-text-muted)',
      }}
    >
      <div>
        {t('intro.footer.builtBy')}
        {' · '}
        <FooterLink href="https://github.com/bruno-szdl/analytics-engineering-quest">GitHub</FooterLink>
        {' · '}
        <FooterLink href="https://www.linkedin.com/in/brunoszdl">LinkedIn</FooterLink>
        {' · '}
        <InternalLink href="/privacy">Privacy</InternalLink>
      </div>
      <div style={{ marginTop: '6px', fontSize: '0.75rem' }}>
        {t('intro.footer.tag')}
      </div>
    </footer>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-link">
      {children}
    </a>
  )
}

function InternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-link"
      onClick={(e) => {
        e.preventDefault()
        window.history.pushState(null, '', href)
        window.dispatchEvent(new PopStateEvent('popstate'))
      }}
    >
      {children}
    </a>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        margin: '36px 0 14px',
        paddingBottom: '6px',
        borderBottom: '1px solid var(--color-border-subtle)',
        fontSize: '1.25rem',
        fontWeight: 600,
        color: 'var(--color-text)',
        letterSpacing: '-0.005em',
      }}
    >
      {children}
    </h2>
  )
}

function Aside({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--color-accent-bg)',
        border: '1px solid var(--color-accent-orange-dim)',
        borderRadius: '6px',
        padding: '12px 16px',
        margin: '20px 0',
      }}
    >
      <div
        style={{
          color: 'var(--color-accent-orange)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.6875rem',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.08em',
          marginBottom: '6px',
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: '0.9375rem', lineHeight: 1.6 }}>{children}</div>
    </div>
  )
}

function DagDiagram() {
  const { t } = useTranslation()
  const nodes: { id: string; label: string; layer: string; x: number; y: number }[] = [
    { id: 'raw_customers', label: 'raw.customers', layer: 'source', x: 0, y: 0 },
    { id: 'raw_orders', label: 'raw.orders', layer: 'source', x: 0, y: 1 },
    { id: 'stg_customers', label: 'stg_customers', layer: 'staging', x: 1, y: 0 },
    { id: 'stg_orders', label: 'stg_orders', layer: 'staging', x: 1, y: 1 },
    { id: 'int_orders_joined', label: 'int_orders_joined', layer: 'intermediate', x: 2, y: 0.5 },
    { id: 'fct_revenue', label: 'fct_revenue', layer: 'mart', x: 3, y: 0.5 },
  ]
  const edges: [string, string][] = [
    ['raw_customers', 'stg_customers'],
    ['raw_orders', 'stg_orders'],
    ['stg_customers', 'int_orders_joined'],
    ['stg_orders', 'int_orders_joined'],
    ['int_orders_joined', 'fct_revenue'],
  ]
  const colWidth = 150
  const rowHeight = 60
  const nodeW = 130
  const nodeH = 34
  const padX = 12
  const padY = 18
  const W = colWidth * 4 + padX * 2 - (colWidth - nodeW)
  const H = rowHeight * 2 + padY * 2

  const layerColor: Record<string, string> = {
    source: 'var(--color-text-muted)',
    staging: 'var(--color-accent-orange)',
    intermediate: 'var(--color-warning)',
    mart: 'var(--color-success)',
  }

  const pos = (n: typeof nodes[number]) => ({
    cx: padX + n.x * colWidth + nodeW / 2,
    cy: padY + n.y * rowHeight + nodeH / 2,
  })

  return (
    <div
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        background: 'var(--color-surface)',
        padding: '12px',
        overflowX: 'auto' as const,
      }}
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', margin: '0 auto', maxWidth: '100%' }}>
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L0,8 L8,4 z" fill="var(--color-text-muted)" />
          </marker>
        </defs>
        {edges.map(([from, to]) => {
          const f = nodes.find((n) => n.id === from)!
          const tn = nodes.find((n) => n.id === to)!
          const a = pos(f)
          const b = pos(tn)
          const x1 = a.cx + nodeW / 2
          const x2 = b.cx - nodeW / 2 - 4
          return (
            <line
              key={`${from}-${to}`}
              x1={x1}
              y1={a.cy}
              x2={x2}
              y2={b.cy}
              stroke="var(--color-text-muted)"
              strokeWidth="1.2"
              markerEnd="url(#arrow)"
              opacity="0.6"
            />
          )
        })}
        {nodes.map((n) => {
          const p = pos(n)
          return (
            <g key={n.id} transform={`translate(${p.cx - nodeW / 2}, ${p.cy - nodeH / 2})`}>
              <rect
                width={nodeW}
                height={nodeH}
                rx={5}
                fill="var(--color-base)"
                stroke={layerColor[n.layer]}
                strokeWidth="1.4"
              />
              <text
                x={nodeW / 2}
                y={nodeH / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="JetBrains Mono, monospace"
                fontSize="11"
                fill="var(--color-text)"
              >
                {n.label}
              </text>
            </g>
          )
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', marginTop: '10px', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
        <LegendDot color={layerColor.source} label={t('intro.exampleDag.legend.source')} />
        <LegendDot color={layerColor.staging} label={t('intro.exampleDag.legend.staging')} />
        <LegendDot color={layerColor.intermediate} label={t('intro.exampleDag.legend.intermediate')} />
        <LegendDot color={layerColor.mart} label={t('intro.exampleDag.legend.mart')} />
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      <span style={{ width: '10px', height: '10px', borderRadius: '3px', border: `1.5px solid ${color}`, display: 'inline-block' }} />
      {label}
    </span>
  )
}

