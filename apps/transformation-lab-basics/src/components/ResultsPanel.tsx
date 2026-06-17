import { useTranslation } from 'react-i18next'
import { useGameStore } from '../store/gameStore'

export default function ResultsPanel() {
  const { t } = useTranslation()
  const lastPreview = useGameStore((s) => s.lastPreview)

  if (!lastPreview) {
    return <EmptyState />
  }

  const { name, columns, rows, rowCount } = lastPreview

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-base)' }}>
      <div
        className="flex items-center gap-2 shrink-0"
        style={{ padding: '6px 16px', background: 'var(--color-base)', borderBottom: '1px solid var(--color-border)' }}
      >
        <span
          style={{
            color: 'var(--color-text-muted)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.625rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          {t('results.header')}
        </span>
        <span style={{ color: 'var(--color-muted)' }}>·</span>
        <span
          style={{
            color: 'var(--color-accent-orange)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.6875rem',
          }}
        >
          {name}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            color: 'var(--color-muted)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.625rem',
          }}
        >
          {t(rowCount === 1 ? 'results.rowsOne' : 'results.rowsMany', { shown: rows.length, total: rowCount })}
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: 'var(--color-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6875rem' }}
          >
            {t('results.noRows')}
          </div>
        ) : (
          <table
            style={{
              borderCollapse: 'collapse',
              width: '100%',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.75rem',
            }}
          >
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c}
                    style={{
                      textAlign: 'left',
                      padding: '8px 14px',
                      background: 'var(--color-surface)',
                      borderBottom: '1px solid var(--color-border)',
                      color: 'var(--color-text-muted)',
                      fontWeight: 500,
                      fontSize: '0.625rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      position: 'sticky',
                      top: 0,
                    }}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr
                  key={ri}
                  style={{
                    background: ri % 2 === 0 ? 'transparent' : 'var(--color-border-subtle)',
                  }}
                >
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{
                        padding: '6px 14px',
                        borderBottom: '1px solid var(--color-border-subtle)',
                        color: cell === null || cell === undefined ? 'var(--color-muted)' : 'var(--color-text)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {cell === null || cell === undefined ? 'NULL' : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  const { t } = useTranslation()
  return (
    <div
      className="flex flex-col items-center justify-center h-full gap-3"
      style={{ opacity: 0.55 }}
    >
      <ResultsIcon />
      <span
        style={{
          color: 'var(--color-text-muted)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.6875rem',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
        }}
      >
        {t('results.empty')}
      </span>
      <span
        style={{
          color: 'var(--color-muted)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.625rem',
          textAlign: 'center',
          lineHeight: '1.6',
          maxWidth: '280px',
        }}
      >
        {t('results.emptyHintLead')}<span style={{ color: 'var(--color-text-muted)' }}>{t('results.emptyHintShow')}</span>
        <br />
        {t('results.emptyHintOr')}<span style={{ color: 'var(--color-text-muted)' }}>{t('results.emptyHintCmd')}</span>{t('results.emptyHintEnd')}
      </span>
    </div>
  )
}

function ResultsIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.2">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <line x1="1.5" y1="6" x2="14.5" y2="6" />
      <line x1="5" y1="2.5" x2="5" y2="13.5" />
      <line x1="10" y1="2.5" x2="10" y2="13.5" />
    </svg>
  )
}
