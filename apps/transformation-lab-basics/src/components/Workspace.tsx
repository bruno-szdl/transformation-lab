import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../store/gameStore'
import { getLessonById } from '../lessons'
import { ALL_PANELS } from '../engine/types'
import Editor from './Editor'
import FileExplorer from './FileExplorer'
import DatabaseExplorer from './DatabaseExplorer'
import LessonPanel from './LessonPanel'
import TerminalPanel from './TerminalPanel'
import ResultsPanel from './ResultsPanel'
import DagPanel from './DagPanel'
import PanelRevealBadge from './PanelRevealBadge'

/**
 * Main workspace for lessons 1+. Three columns:
 *   - Lesson (instructions, task checklist, quiz)
 *   - Context: Files / Warehouse / Lineage stacked top-to-bottom
 *   - Editor + bottom console (Commands / Results)
 *
 * Every split has a drag handle. Defaults are tuned so the common case works
 * without resizing. State is local to the component - sizes don't persist
 * across reloads (matching our no-persistence policy).
 */
export default function Workspace() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [lessonWidth, setLessonWidth] = useState(340)
  const [contextWidth, setContextWidth] = useState(220)
  const currentLessonId = useGameStore((s) => s.currentLessonId)
  const lessonPanels = getLessonById(currentLessonId)?.panels ?? ALL_PANELS
  const showFiles = lessonPanels.includes('files')
  const showWarehouse = lessonPanels.includes('warehouse')
  const showLineage = lessonPanels.includes('lineage')
  const showContextColumn = showFiles || showWarehouse || showLineage

  return (
    <div ref={rootRef} className="flex-1 flex overflow-hidden">
      <ColumnFixed width={lessonWidth} background="var(--color-surface)">
        <LessonPanel />
      </ColumnFixed>

      <VerticalResizer onDelta={(dx) => setLessonWidth((w) => clamp(w + dx, 260, 520))} />

      {showContextColumn && (
        <>
          <ColumnFixed width={contextWidth} background="var(--color-base)">
            <ContextColumn
              showFiles={showFiles}
              showWarehouse={showWarehouse}
              showLineage={showLineage}
            />
          </ColumnFixed>
          <VerticalResizer onDelta={(dx) => setContextWidth((w) => clamp(w + dx, 160, 380))} />
        </>
      )}

      <div className="flex-1 flex flex-col overflow-hidden" style={{ minWidth: 0 }}>
        <WorkArea />
      </div>
    </div>
  )
}

// ── columns ───────────────────────────────────────────────────────────────────

function ColumnFixed({
  width,
  background,
  children,
}: {
  width: number
  background: string
  children: React.ReactNode
}) {
  return (
    <aside
      className="flex flex-col shrink-0 overflow-hidden"
      style={{ width, background, borderRight: '1px solid var(--color-border)' }}
    >
      {children}
    </aside>
  )
}

/**
 * Variable composition of Files / Warehouse / Lineage. Each block is only
 * rendered when the learner has unlocked it (see `seenPanels` in the store).
 * The last visible block flexes to fill remaining space; earlier blocks have
 * a fixed (draggable) height. Files and Warehouse render their own headers;
 * Lineage adds an outer one with a "New" reveal badge.
 */
function ContextColumn({
  showFiles,
  showWarehouse,
  showLineage,
}: {
  showFiles: boolean
  showWarehouse: boolean
  showLineage: boolean
}) {
  const [filesHeight, setFilesHeight] = useState(220)
  const [warehouseHeight, setWarehouseHeight] = useState(220)

  type BlockSpec = {
    key: 'files' | 'warehouse' | 'lineage'
    height: number
    onResize: (dy: number) => void
    render: () => React.ReactNode
  }

  const blocks: BlockSpec[] = []
  if (showFiles) {
    blocks.push({
      key: 'files',
      height: filesHeight,
      onResize: (dy) => setFilesHeight((h) => clamp(h + dy, 80, 600)),
      render: () => <FileExplorer />,
    })
  }
  if (showWarehouse) {
    blocks.push({
      key: 'warehouse',
      height: warehouseHeight,
      onResize: (dy) => setWarehouseHeight((h) => clamp(h + dy, 80, 600)),
      render: () => <DatabaseExplorer />,
    })
  }
  if (showLineage) {
    blocks.push({
      key: 'lineage',
      height: 0, // unused - lineage is always the flexing block when shown
      onResize: () => {},
      render: () => (
        <LineageBlock />
      ),
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {blocks.map((block, idx) => {
        const isLast = idx === blocks.length - 1
        const borderTop = idx > 0
        const containerStyle = isLast
          ? { flex: 1, minHeight: 0 }
          : { height: block.height, flexShrink: 0 }
        return (
          <div key={`block-${block.key}`} style={{ display: 'contents' }}>
            <div
              className="flex flex-col overflow-hidden"
              style={{
                ...containerStyle,
                borderTop: borderTop ? '1px solid var(--color-border)' : undefined,
              }}
            >
              {block.render()}
            </div>
            {!isLast && <HorizontalResizer onDelta={block.onResize} />}
          </div>
        )
      })}
    </div>
  )
}

function BlockHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-center shrink-0"
      style={{
        height: '26px',
        padding: '0 12px',
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        color: 'var(--color-text-muted)',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.625rem',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.1em',
      }}
    >
      {children}
    </div>
  )
}

function LineageBlock() {
  const { t } = useTranslation()
  const currentLessonId = useGameStore((s) => s.currentLessonId)
  const lesson = getLessonById(currentLessonId)
  return (
    <div className="flex flex-col h-full min-h-0">
      <BlockHeader>
        {t('workspace.lineage')}
        <PanelRevealBadge panel="lineage" />
      </BlockHeader>
      <div className="flex-1 overflow-hidden min-h-0">
        <DagPanel embedded orientation="vertical" goalShape={lesson?.goal?.dagShape} />
      </div>
    </div>
  )
}

// ── work area ─────────────────────────────────────────────────────────────────

function WorkArea() {
  const [bottomHeight, setBottomHeight] = useState(240)

  return (
    <>
      <div className="flex-1 overflow-hidden">
        <Editor />
      </div>

      <HorizontalResizer onDelta={(dy) => setBottomHeight((h) => clamp(h - dy, 120, 600))} />

      <div
        className="flex flex-col shrink-0"
        style={{
          height: bottomHeight,
          background: 'var(--color-base)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <Console />
      </div>
    </>
  )
}

/**
 * The bottom-right region: Commands ↔ Results tabs. Reads/writes
 * `bottomTab` in the store so `dbt show` can auto-switch the view.
 */
function Console() {
  const tab = useGameStore((s) => s.bottomTab)
  const setTab = useGameStore((s) => s.setBottomTab)
  const { t } = useTranslation()
  const tabs = [
    { key: 'commands' as const, label: t('workspace.commands') },
    { key: 'results' as const, label: t('workspace.results') },
  ]
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div
        className="flex items-center shrink-0"
        style={{
          height: '34px',
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          paddingLeft: '8px',
        }}
      >
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center px-3 h-full"
            style={{
              background: 'transparent',
              border: 'none',
              borderTop: tab === key ? '2px solid var(--color-accent-orange)' : '2px solid transparent',
              color: tab === key ? 'var(--color-text)' : 'var(--color-text-muted)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.6875rem',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.08em',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === 'commands' && <TerminalPanel embedded />}
        {tab === 'results' && <ResultsPanel />}
      </div>
    </div>
  )
}

// ── resizers ──────────────────────────────────────────────────────────────────

function VerticalResizer({ onDelta }: { onDelta: (dx: number) => void }) {
  const dragging = useRef(false)
  const lastX = useRef(0)

  const onDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    lastX.current = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - lastX.current
      lastX.current = e.clientX
      if (dx !== 0) onDelta(dx)
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onDelta])

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onDown}
      style={{ width: '4px', cursor: 'col-resize', background: 'var(--color-border)', flexShrink: 0 }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-muted)' }}
      onMouseLeave={(e) => { if (!dragging.current) e.currentTarget.style.background = 'var(--color-border)' }}
    />
  )
}

function HorizontalResizer({ onDelta }: { onDelta: (dy: number) => void }) {
  const dragging = useRef(false)
  const lastY = useRef(0)

  const onDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    lastY.current = e.clientY
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const dy = e.clientY - lastY.current
      lastY.current = e.clientY
      if (dy !== 0) onDelta(dy)
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onDelta])

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      onMouseDown={onDown}
      style={{ height: '4px', cursor: 'row-resize', background: 'var(--color-border)', flexShrink: 0 }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-muted)' }}
      onMouseLeave={(e) => { if (!dragging.current) e.currentTarget.style.background = 'var(--color-border)' }}
    />
  )
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
