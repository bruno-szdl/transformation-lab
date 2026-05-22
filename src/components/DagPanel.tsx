import { useMemo, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeTypes,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import * as dagre from 'dagre'
import { buildDag, type NodeLayer, type DagNode, type DagEdge } from '../engine/dagBuilder'
import { useGameStore } from '../store/gameStore'
import { type GoalDagShape } from '../engine/types'
import { dag } from '@datagym/design/tokens'

// ── types ─────────────────────────────────────────────────────────────────────

export type { GoalDagShape }

type NodeStatus = 'idle' | 'ok' | 'fail' | 'error'
type Orientation = 'horizontal' | 'vertical'

interface ModelNodeData {
  label: string
  layer: NodeLayer
  status: NodeStatus
  hasCycle: boolean
  isDark: boolean
  orientation: Orientation
  /** Dimmed because a selector (typed or last-run) doesn't include this node. */
  isFaded: boolean
}

// ── constants ─────────────────────────────────────────────────────────────────

const NODE_W = 160
const NODE_H = 46

// Layer palettes are theme-aware. ReactFlow needs concrete hex strings (it can't
// resolve CSS variables in its style props), so the resolved hex literals come
// from the shared @datagym/design token package - staging is datagym blue,
// source/intermediate track the success/warning tokens.
const LAYER_PALETTE_DARK: Record<NodeLayer, string> = dag.layer.dark
const LAYER_PALETTE_LIGHT: Record<NodeLayer, string> = dag.layer.light

function layerColor(layer: NodeLayer, isDark: boolean): string {
  return (isDark ? LAYER_PALETTE_DARK : LAYER_PALETTE_LIGHT)[layer]
}

function layerBg(layer: NodeLayer, isDark: boolean): string {
  // 12 = ~7% alpha, matches the previous "barely tinted" feel in dark mode.
  return `${layerColor(layer, isDark)}12`
}

const FAIL_COLOR_DARK = dag.fail.dark
const FAIL_COLOR_LIGHT = dag.fail.light
const IDLE_DOT_DARK = dag.idleDot.dark
const IDLE_DOT_LIGHT = dag.idleDot.light

// ── custom node ───────────────────────────────────────────────────────────────

function ModelNode({ data }: { data: ModelNodeData }) {
  const { t } = useTranslation()
  const color = layerColor(data.layer, data.isDark)
  const bg = layerBg(data.layer, data.isDark)
  const failColor = data.isDark ? FAIL_COLOR_DARK : FAIL_COLOR_LIGHT
  const okColor = data.isDark ? LAYER_PALETTE_DARK.source : LAYER_PALETTE_LIGHT.source
  const idleColor = data.isDark ? IDLE_DOT_DARK : IDLE_DOT_LIGHT
  const borderColor = data.hasCycle ? failColor : color

  const statusDot =
    data.hasCycle || data.status === 'error'
      ? failColor
      : data.status === 'ok'
        ? okColor
        : data.status === 'fail'
          ? failColor
          : idleColor

  // Glyph reinforces the color so colour-blind users can tell pass / fail apart.
  const statusGlyph =
    data.hasCycle || data.status === 'error' || data.status === 'fail'
      ? '✗'
      : data.status === 'ok'
        ? '✓'
        : ''
  const statusLabel =
    data.hasCycle || data.status === 'error' || data.status === 'fail'
      ? t('dag.status.failed')
      : data.status === 'ok'
        ? t('dag.status.passed')
        : t('dag.status.notRun')

  return (
    <div
      className={data.hasCycle ? 'node-cycle' : ''}
      title={`${data.layer} - ${statusLabel}`}
      style={{
        background: 'var(--color-surface)',
        backgroundColor: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: '6px',
        paddingLeft: '14px',
        paddingRight: '12px',
        paddingTop: '9px',
        paddingBottom: '9px',
        width: NODE_W,
        minHeight: NODE_H,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        position: 'relative',
        opacity: data.isFaded ? 0.25 : 1,
        transition: 'opacity 150ms ease',
        // Layer color now reads as a 4px left edge bar — replaces the tiny
        // uppercase "STAGING / MART" pill that looked like a typo. The
        // legend in the intro already teaches the color → layer mapping.
        boxShadow: `inset 4px 0 0 0 ${color}`,
      }}
    >
      <Handle
        type="target"
        position={data.orientation === 'vertical' ? Position.Top : Position.Left}
        style={{ background: color, border: 'none', width: 8, height: 8 }}
      />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          color: 'var(--color-text)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.75rem',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {data.label}
      </div>

      <span
        aria-label={statusLabel}
        title={statusLabel}
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: statusDot,
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          fontSize: '0.5rem',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        {statusGlyph}
      </span>

      <Handle
        type="source"
        position={data.orientation === 'vertical' ? Position.Bottom : Position.Right}
        style={{ background: color, border: 'none', width: 8, height: 8 }}
      />
    </div>
  )
}

const nodeTypes: NodeTypes = { modelNode: ModelNode }

// ── dagre layout ──────────────────────────────────────────────────────────────

function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  orientation: Orientation,
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges }

  const g = new dagre.graphlib.Graph()
  const rankdir = orientation === 'vertical' ? 'TB' : 'LR'
  // Tighter ranksep when stacked vertically — vertical real estate is the constraint.
  const ranksep = orientation === 'vertical' ? 60 : 90
  g.setGraph({ rankdir, nodesep: 40, ranksep, marginx: 24, marginy: 24 })
  g.setDefaultEdgeLabel(() => ({}))

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }))
  edges.forEach((e) => g.setEdge(e.source, e.target))

  dagre.layout(g)

  return {
    nodes: nodes.map((n) => {
      const pos = g.node(n.id)
      return { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } }
    }),
    edges,
  }
}

// ── data → RF nodes/edges ─────────────────────────────────────────────────────

function toRfNodes(
  dagNodes: DagNode[],
  ranModels: Set<string>,
  testResults: Record<string, 'pass' | 'fail' | 'untested'>,
  isDark: boolean,
  orientation: Orientation,
  selection: Set<string> | null,
): Node[] {
  return dagNodes.map((n) => {
    let status: NodeStatus = 'idle'
    if (n.hasCycle) {
      status = 'error'
    } else if (n.layer !== 'source' && ranModels.has(n.id)) {
      status = testResults[n.id] === 'fail' ? 'fail' : 'ok'
    }
    // With an active selection, fade every node the selector misses — including
    // sources. resolveSelection already decides which node kinds a given command
    // can highlight, so the panel just trusts the set.
    const isFaded = selection !== null && !selection.has(n.id)
    return {
      id: n.id,
      type: 'modelNode',
      position: { x: 0, y: 0 },
      data: { label: n.label, layer: n.layer, status, hasCycle: n.hasCycle, isDark, orientation, isFaded } satisfies ModelNodeData,
    }
  })
}

function toRfEdges(dagEdges: DagEdge[], isDark: boolean): Edge[] {
  const edgeColor = isDark ? dag.edge.dark : dag.edge.light
  return dagEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor, width: 16, height: 16 },
    style: { stroke: edgeColor, strokeWidth: 1.5 },
  }))
}

// ── inner canvas ──────────────────────────────────────────────────────────────

interface DagCanvasProps {
  rfNodes: Node[]
  rfEdges: Edge[]
  isDark: boolean
}

function DagCanvas({ rfNodes, rfEdges, isDark }: DagCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)
  const rfRef = useRef<ReactFlowInstance | null>(null)
  const prevCount = useRef(rfNodes.length)

  useEffect(() => {
    setNodes(rfNodes)
  }, [rfNodes, setNodes])

  useEffect(() => {
    setEdges(rfEdges)
  }, [rfEdges, setEdges])

  useEffect(() => {
    if (rfNodes.length !== prevCount.current) {
      prevCount.current = rfNodes.length
      const t = setTimeout(() => rfRef.current?.fitView({ padding: 0.25, duration: 300 }), 60)
      return () => clearTimeout(t)
    }
  }, [rfNodes.length])

  const onInit = useCallback((instance: ReactFlowInstance) => {
    rfRef.current = instance
    instance.fitView({ padding: 0.25 })
  }, [])

  const bgDotColor = isDark ? dag.bgDot.dark : dag.bgDot.light
  const controlsBg = isDark ? dag.controlsBg.dark : dag.controlsBg.light
  const controlsBorder = isDark ? dag.controlsBorder.dark : dag.controlsBorder.light

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onInit={onInit}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
        style={{ background: 'transparent', zIndex: 1 }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color={bgDotColor}
          style={{ opacity: 0.5 }}
        />
        <Controls
          style={{
            background: controlsBg,
            border: `1px solid ${controlsBorder}`,
            borderRadius: '6px',
          }}
        />
      </ReactFlow>
    </div>
  )
}

// ── empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  const { t } = useTranslation()
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none"
      style={{ opacity: 0.25 }}
    >
      <DagPlaceholderIcon />
      <span
        style={{
          color: 'var(--color-text-muted)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: '0.6875rem',
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
        }}
      >
        {t('dag.empty')}
      </span>
      <span
        style={{ color: 'var(--color-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.625rem' }}
      >
        {t('dag.emptyHint')}
      </span>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

interface DagPanelProps {
  goalShape?: GoalDagShape
  embedded?: boolean
  orientation?: Orientation
}

export default function DagPanel({ embedded = false, orientation = 'horizontal' }: DagPanelProps) {
  const { t } = useTranslation()
  const files = useGameStore((s) => s.files)
  const ranModels = useGameStore((s) => s.ranModels)
  const testResults = useGameStore((s) => s.testResults)
  const dagSelection = useGameStore((s) => s.dagSelection)
  const theme = useGameStore((s) => s.theme)
  const isDark = theme === 'dark'

  const { rfNodes, rfEdges } = useMemo(() => {
    const { nodes: dagNodes, edges: dagEdges } = buildDag(files)
    const rawNodes = toRfNodes(dagNodes, ranModels, testResults, isDark, orientation, dagSelection)
    const rawEdges = toRfEdges(dagEdges, isDark)
    const { nodes, edges } = applyDagreLayout(rawNodes, rawEdges, orientation)
    return { rfNodes: nodes, rfEdges: edges }
  }, [files, ranModels, testResults, isDark, orientation, dagSelection])

  const isEmpty = rfNodes.length === 0

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-dag-bg)' }}>
      {/* Header — suppressed when embedded, since BottomPanel draws its own tab bar */}
      {!embedded && (
      <div
        className="flex items-center justify-between gap-2 px-4 shrink-0"
        style={{ height: '36px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: 'var(--color-muted)' }}>
            <DagIcon />
          </span>
          <span
            style={{
              color: 'var(--color-text-muted)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.6875rem',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            {t('dag.header')}
          </span>
        </div>

      </div>
      )}

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden">
        {isEmpty ? (
          <EmptyState />
        ) : (
          <DagCanvas rfNodes={rfNodes} rfEdges={rfEdges} isDark={isDark} />
        )}
      </div>
    </div>
  )
}

// ── icons ─────────────────────────────────────────────────────────────────────

function DagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25V2.75A1.75 1.75 0 0 0 14.25 1H1.75ZM1.5 2.75a.25.25 0 0 1 .25-.25h12.5a.25.25 0 0 1 .25.25v10.5a.25.25 0 0 1-.25.25H1.75a.25.25 0 0 1-.25-.25V2.75ZM11 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-6 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm3 3.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-6 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm9 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
    </svg>
  )
}

function DagPlaceholderIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 48 48" fill="none">
      <circle cx="12" cy="24" r="5" stroke="var(--color-text-muted)" strokeWidth="1.5" />
      <circle cx="36" cy="12" r="5" stroke="var(--color-text-muted)" strokeWidth="1.5" />
      <circle cx="36" cy="36" r="5" stroke="var(--color-text-muted)" strokeWidth="1.5" />
      <line x1="17" y1="22" x2="31" y2="14" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeDasharray="3 2" />
      <line x1="17" y1="26" x2="31" y2="34" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeDasharray="3 2" />
    </svg>
  )
}
