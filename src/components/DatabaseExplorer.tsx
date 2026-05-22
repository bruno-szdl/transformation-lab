import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { runQuery } from '../engine/duckdb'
import { useGameStore } from '../store/gameStore'
import PanelRevealBadge from './PanelRevealBadge'

interface CatalogEntry {
  schema: string
  name: string
  type: 'BASE TABLE' | 'VIEW'
}

interface SchemaGroup {
  schema: string
  tables: CatalogEntry[]
  views: CatalogEntry[]
}

function TableIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="var(--color-warning)" style={{ flexShrink: 0, opacity: 0.9 }}>
      <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25V1.75ZM6.5 6.5v8h7.75a.25.25 0 0 0 .25-.25V6.5H6.5Zm0-1.5h8V1.75a.25.25 0 0 0-.25-.25H6.5V5Zm-1.5 1.5H1.5v7.75c0 .138.112.25.25.25H5V6.5ZM5 5V1.5H1.75a.25.25 0 0 0-.25.25V5H5Z" />
    </svg>
  )
}

function ViewIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" style={{ flexShrink: 0, opacity: 0.9, fill: 'var(--color-icon-accent)' }}>
      <path d="M8 2C4.6 2 1.8 4.1.2 7.1a1 1 0 0 0 0 1.8C1.8 11.9 4.6 14 8 14s6.2-2.1 7.8-5.1a1 1 0 0 0 0-1.8C14.2 4.1 11.4 2 8 2Zm0 10a5 5 0 1 1 0-10A5 5 0 0 1 8 12Zm0-8a3 3 0 1 0 0 6A3 3 0 0 0 8 4Z" />
    </svg>
  )
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      style={{
        flexShrink: 0,
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 0.12s ease',
        fill: 'none',
      }}
    >
      <path d="M2 1 l4 3 -4 3" stroke="var(--color-muted)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SchemaIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="var(--color-muted)" style={{ flexShrink: 0 }}>
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z" />
    </svg>
  )
}

function SchemaSection({ group }: { group: SchemaGroup }) {
  const [expanded, setExpanded] = useState(true)
  return (
    <div style={{ paddingLeft: '12px' }}>
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '2px 4px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          width: '100%',
        }}
      >
        <ChevronIcon expanded={expanded} />
        <SchemaIcon />
        <span
          style={{
            color: 'var(--color-text-muted)',
            fontSize: '0.6875rem',
            fontFamily: 'JetBrains Mono, monospace',
          }}
        >
          {group.schema}
        </span>
      </button>

      {expanded && (
        <div style={{ paddingLeft: '14px' }}>
          {group.tables.map((t) => (
            <CatalogRow key={t.name} entry={t} />
          ))}
          {group.views.map((v) => (
            <CatalogRow key={v.name} entry={v} />
          ))}
        </div>
      )}
    </div>
  )
}

function CatalogRow({ entry }: { entry: CatalogEntry }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '2px 4px',
        borderRadius: '3px',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {entry.type === 'BASE TABLE' ? <TableIcon /> : <ViewIcon />}
      <span
        style={{
          color: 'var(--color-text-secondary)',
          fontSize: '0.6875rem',
          fontFamily: 'JetBrains Mono, monospace',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={entry.name}
      >
        {entry.name}
      </span>
    </div>
  )
}

export default function DatabaseExplorer() {
  const { t } = useTranslation()
  const running = useGameStore((s) => s.running)
  const currentLevelId = useGameStore((s) => s.currentLessonId)
  const [groups, setGroups] = useState<SchemaGroup[]>([])
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (running) return
    async function refresh() {
      try {
        const result = await runQuery(
          `SELECT table_schema, table_name, table_type
           FROM information_schema.tables
           WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
           ORDER BY table_schema = 'main' DESC, table_schema, table_type DESC, table_name`,
        )
        const map = new Map<string, SchemaGroup>()
        for (const [schema, name, type] of result.rows) {
          const s = schema as string
          if (!map.has(s)) map.set(s, { schema: s, tables: [], views: [] })
          const g = map.get(s)!
          const entry: CatalogEntry = { schema: s, name: name as string, type: type as 'BASE TABLE' | 'VIEW' }
          if (entry.type === 'BASE TABLE') g.tables.push(entry)
          else g.views.push(entry)
        }
        setGroups([...map.values()])
      } catch {
        setGroups([])
      }
    }
    refresh()
  }, [running, currentLevelId])

  const totalEntries = groups.reduce((n, g) => n + g.tables.length + g.views.length, 0)

  return (
    <div
      style={{
        borderTop: '1px solid var(--color-border-subtle)',
        background: 'var(--color-base)',
        flex: collapsed ? '0 0 auto' : '1 1 0',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          width: '100%',
          flexShrink: 0,
        }}
      >
        <ChevronIcon expanded={!collapsed} />
        <span
          className="flex items-center"
          style={{
            color: 'var(--color-text-muted)',
            fontSize: '0.625rem',
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {t('database.header')}
          <PanelRevealBadge panel="warehouse" />
        </span>
        {totalEntries > 0 && (
          <span
            style={{
              marginLeft: 'auto',
              color: 'var(--color-muted)',
              fontSize: '0.625rem',
              fontFamily: 'JetBrains Mono, monospace',
            }}
          >
            {totalEntries}
          </span>
        )}
      </button>

      {/* Scrollable content */}
      {!collapsed && (
        <div style={{ overflowY: 'auto', flex: 1, paddingBottom: '6px' }}>
          {totalEntries === 0 ? (
            <div
              style={{
                padding: '4px 16px 8px',
                color: 'var(--color-muted)',
                fontSize: '0.6875rem',
                fontFamily: 'var(--font-sans)',
                fontStyle: 'italic',
              }}
            >
              {t('database.empty')}
            </div>
          ) : (
            groups.map((g) => <SchemaSection key={g.schema} group={g} />)
          )}
        </div>
      )}
    </div>
  )
}
