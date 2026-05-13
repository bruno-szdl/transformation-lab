import { useGameStore } from '../store/gameStore'

/**
 * Lesson 0: pure-prose introduction. Rendered as a full-width article
 * instead of the four-panel IDE. Mirrors SQLBolt's first-page pattern.
 */
export default function IntroPage() {
  const loadLesson = useGameStore((s) => s.loadLesson)

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ background: 'var(--color-base)', color: 'var(--color-text)' }}
    >
      <article
        style={{
          maxWidth: '760px',
          margin: '0 auto',
          padding: '48px 32px 80px',
          fontFamily: 'IBM Plex Sans, sans-serif',
          fontSize: '1rem',
          lineHeight: 1.65,
          color: 'var(--color-text-secondary)',
        }}
      >
        <h1
          style={{
            fontSize: '2rem',
            fontWeight: 700,
            margin: '0 0 24px',
            color: 'var(--color-text)',
            letterSpacing: '-0.01em',
          }}
        >
          Introduction to dbt
        </h1>
        <p style={{ margin: '0 0 16px' }}>
          Welcome to <strong style={{ color: 'var(--color-text)' }}>dbt-quest</strong>, a series of
          short, interactive lessons designed to help you learn{' '}
          <strong style={{ color: 'var(--color-text)' }}>dbt</strong> right in your browser. No
          installs, no warehouse setup. Just SQL, a fake project, and a real DuckDB engine running
          on this page.
        </p>

        <SectionHeader>What is dbt?</SectionHeader>
        <p style={{ margin: '0 0 16px' }}>
          dbt is the open-source tool data teams use to turn raw warehouse tables into trustworthy,
          documented, tested models. It sits on top of any SQL warehouse (Snowflake, Databricks, igQuery,
          Postgres, DuckDB, …) and gives you a way to manage your transformation SQL <em>as code</em>:
          version-controlled, modular, and testable.
        </p>

        <Aside title="Did you know?">
          dbt projects are just folders of <code>.sql</code> and <code>.yml</code> files. No proprietary syntax. If you can write SQL, you can write dbt. But dbt turns those files into something bigger: a managed, tested, documented, version-controlled transformation framework with full lineage.
        </Aside>

        <SectionHeader>The mental model</SectionHeader>
        <p style={{ margin: '0 0 12px' }}>
          A dbt project is a folder full of <code>.sql</code> files. Each file is a{' '}
          <code>SELECT</code> statement (what dbt calls a <strong style={{ color: 'var(--color-text)' }}>model</strong>).
          You run <code>dbt run</code> and dbt:
        </p>
        <ol style={{ margin: '0 0 16px', paddingLeft: '24px' }}>
          <li>Reads every model in the folder</li>
          <li>Parses each model's <code>ref()</code> calls to figure out which model depends on which (the <strong style={{ color: 'var(--color-text)' }}>DAG</strong>)</li>
          <li>Materializes each one as a view or table in the warehouse, in dependency order</li>
        </ol>
        <p style={{ margin: '0 0 16px' }}>
          That's the core idea. Everything else (tests, docs, sources, materializations, snapshots)
          is built on top of those primitives.
        </p>

        <SectionHeader>An example DAG</SectionHeader>
        <p style={{ margin: '0 0 16px' }}>
          Real pipelines have several layers. A common pattern looks like this:
        </p>
        <DagDiagram />
        <p style={{ margin: '16px 0' }}>
          The arrows are <code>ref()</code> calls in SQL. dbt reads them, builds the graph above,
          and runs the models left-to-right.
        </p>

        <SectionHeader>The workspace</SectionHeader>
        <p style={{ margin: '0 0 16px' }}>
          When you start lesson 1, the page splits into three columns. Here's what each region does:
        </p>
        <WorkspaceMock />
        <p style={{ margin: '8px 0 16px', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
          You won't see every panel on lesson 1. They fade in as the lessons need them. By the
          time you've built a few models, the full layout above will be on screen.
        </p>

        <SectionHeader>About the lessons</SectionHeader>
        <p style={{ margin: '0 0 16px' }}>
          There are 12 short lessons. Each one introduces a single concept, then gives you 3–5
          small tasks to apply it. The tasks share one workspace — files you create in task 1
          are still there in task 2.
        </p>
        <p style={{ margin: '0 0 16px' }}>
          Across lessons, every chapter is a <strong style={{ color: 'var(--color-text)' }}>snapshot
          of the same fictional dbt project</strong>, picking up where the previous one left off.
          When lesson 5 opens, the staging models from lessons 1–3 are already in your editor; by
          lesson 12 you'll have a full staging → intermediate → marts pipeline with tests, docs,
          and seeds. Each lesson resets to its own clean snapshot, so you can jump ahead or replay
          any chapter without breaking progress.
        </p>
        <p style={{ margin: '0 0 16px' }}>
          Go at your pace, edit the SQL freely, and don't worry about breaking things. Every
          lesson has a "Reset lesson" button in the top bar. If you get stuck, every task has a
          "Show hint" button.
        </p>
        <p style={{ margin: '0 0 16px' }}>
          By the end you'll be ready to open any real dbt project and contribute on day one.
        </p>

        <div style={{ marginTop: '40px' }}>
          <button
            onClick={() => void loadLesson(1)}
            style={{
              background: 'var(--color-success)',
              color: '#0d1117',
              border: 'none',
              borderRadius: '6px',
              padding: '12px 22px',
              fontFamily: 'IBM Plex Sans, sans-serif',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          >
            Begin Lesson 1: Your first dbt model ›
          </button>
        </div>

        <Footer />
      </article>
    </div>
  )
}

function Footer() {
  return (
    <footer
      style={{
        marginTop: '64px',
        paddingTop: '20px',
        borderTop: '1px solid var(--color-border-subtle)',
        textAlign: 'center' as const,
        fontFamily: 'IBM Plex Sans, sans-serif',
        fontSize: '0.8125rem',
        color: 'var(--color-text-muted)',
      }}
    >
      <div>
        Built by Bruno Lima
        {' · '}
        <FooterLink href="https://github.com/bruno-szdl/dbt-quest">GitHub</FooterLink>
        {' · '}
        <FooterLink href="https://www.linkedin.com/in/brunoszdl">LinkedIn</FooterLink>
      </div>
      <div style={{ marginTop: '6px', fontSize: '0.75rem' }}>
        Open-source · Issues and PRs welcome
      </div>
    </footer>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: 'var(--color-text-muted)',
        textDecoration: 'none',
        borderBottom: '1px solid var(--color-border)',
        paddingBottom: '1px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--color-accent-orange)'
        e.currentTarget.style.borderBottomColor = 'var(--color-accent-orange-dim)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--color-text-muted)'
        e.currentTarget.style.borderBottomColor = 'var(--color-border)'
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
          const t = nodes.find((n) => n.id === to)!
          const a = pos(f)
          const b = pos(t)
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
        <LegendDot color={layerColor.source} label="source" />
        <LegendDot color={layerColor.staging} label="staging" />
        <LegendDot color={layerColor.intermediate} label="intermediate" />
        <LegendDot color={layerColor.mart} label="mart" />
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

function WorkspaceMock() {
  return (
    <div style={{ margin: '8px 0 20px' }}>
      <div
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          background: 'var(--color-surface)',
          padding: '10px',
          display: 'grid',
          gridTemplateColumns: '130px 130px 1fr',
          gridTemplateRows: '54px 54px 54px',
          gap: '6px',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.6875rem',
          color: 'var(--color-text-muted)',
        }}
      >
        {/* Left column: Lesson panel spans all three rows */}
        <div style={{ gridColumn: '1 / 2', gridRow: '1 / 4' }}>
          <MockCell label="① Lesson" full />
        </div>
        {/* Middle column: Files / Warehouse / Lineage, one per row */}
        <MockCell label="② Files" />
        <MockCell label="③ Warehouse" />
        <MockCell label="④ Lineage" />
        {/* Right column: Editor (rows 1-2) + Console (row 3) */}
        <div style={{ gridColumn: '3 / 4', gridRow: '1 / 3' }}>
          <MockCell label="⑤ Editor" emphasis full />
        </div>
        <MockCell label="⑥ Console" />
      </div>
      <ol style={{ margin: '14px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Bullet n={1} title="Lesson">
          The concept, the task checklist, the end-of-lesson quiz, and a "Next lesson →" button.
          Your guide through every step.
        </Bullet>
        <Bullet n={2} title="Files">
          The dbt project tree. Models live under <code>models/</code>, tests under{' '}
          <code>tests/</code>, raw CSV seeds under <code>seeds/</code>. Hover a file for rename
          and delete; double-click or press F2 to rename inline.
        </Bullet>
        <Bullet n={3} title="Warehouse">
          The DuckDB database that's running on this page. As you build models, they appear here as
          tables and views (proof that your SQL actually ran).
        </Bullet>
        <Bullet n={4} title="Lineage">
          The DAG. Every <code>ref()</code> call in your SQL becomes an arrow between two models,
          updated live as you edit.
        </Bullet>
        <Bullet n={5} title="Editor">
          Monaco (the same editor as VS Code). Tabs at the top for every open file. Edits save
          instantly; no save button.
        </Bullet>
        <Bullet n={6} title="Console">
          A terminal where you type <code>dbt run</code>, <code>dbt test</code>,{' '}
          <code>dbt build</code>, and a Results tab that shows row previews from{' '}
          <code>dbt show</code>.
        </Bullet>
      </ol>
    </div>
  )
}

function MockCell({ label, emphasis, full }: { label: string; emphasis?: boolean; full?: boolean }) {
  return (
    <div
      style={{
        height: full ? '100%' : undefined,
        background: emphasis ? 'var(--color-accent-bg)' : 'var(--color-base)',
        border: `1px solid ${emphasis ? 'var(--color-accent-orange-dim)' : 'var(--color-border)'}`,
        borderRadius: '5px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px',
        textAlign: 'center' as const,
        color: emphasis ? 'var(--color-accent-orange)' : 'var(--color-text-muted)',
      }}
    >
      {label}
    </div>
  )
}

function Bullet({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li style={{ display: 'flex', gap: '12px' }}>
      <span
        style={{
          flexShrink: 0,
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          background: 'var(--color-accent-bg)',
          border: '1px solid var(--color-accent-orange-dim)',
          color: 'var(--color-accent-orange)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.6875rem',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: '1px',
        }}
      >
        {n}
      </span>
      <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9375rem', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--color-text)' }}>{title}.</strong> {children}
      </div>
    </li>
  )
}
