import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../store/gameStore'
import type { PanelKey } from '../engine/types'

const AUTO_DISMISS_MS = 6000

/**
 * Small "New" pill rendered next to a panel header the first time the panel
 * becomes visible. Reads `newlyRevealedPanels` from the store; dismisses on
 * click or after AUTO_DISMISS_MS. Renders nothing once dismissed.
 */
export default function PanelRevealBadge({ panel }: { panel: PanelKey }) {
  const { t } = useTranslation()
  const isNew = useGameStore((s) => s.newlyRevealedPanels.has(panel))
  const dismiss = useGameStore((s) => s.dismissPanelReveal)

  useEffect(() => {
    if (!isNew) return
    const id = window.setTimeout(() => dismiss(panel), AUTO_DISMISS_MS)
    return () => window.clearTimeout(id)
  }, [isNew, panel, dismiss])

  if (!isNew) return null

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation()
        dismiss(panel)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); dismiss(panel) }
      }}
      aria-label={t('panel.newPanelAria', { panel })}
      className="badge-pulse-finite"
      style={{
        marginLeft: '6px',
        padding: '2px 8px',
        background: 'var(--color-accent-orange)',
        color: 'var(--color-on-accent)',
        borderRadius: '999px',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.625rem',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {t('panel.unlocked')}
    </span>
  )
}
