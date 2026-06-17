import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../store/gameStore'
import { getLessonById } from '../lessons'
import { filterVisibleFiles, hiddenGlobsFor } from '../engine/fileVisibility'
import PanelRevealBadge from './PanelRevealBadge'

// ── tree types ────────────────────────────────────────────────────────────────

interface DirNode {
  type: 'dir'
  name: string
  path: string
  children: TreeNode[]
}

interface FileNode {
  type: 'file'
  name: string
  path: string
}

type TreeNode = DirNode | FileNode

function buildTree(files: Record<string, string>): TreeNode[] {
  const root: TreeNode[] = []
  const dirMap = new Map<string, DirNode>()

  for (const filePath of Object.keys(files).sort()) {
    const parts = filePath.split('/')
    let current = root

    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join('/')
      let dir = dirMap.get(dirPath)
      if (!dir) {
        dir = { type: 'dir', name: parts[i], path: dirPath, children: [] }
        dirMap.set(dirPath, dir)
        current.push(dir)
      }
      current = dir.children
    }

    const fileName = parts[parts.length - 1]
    // Render the folder(s) created above, but never the keeper file itself. This is the ONLY place
    // `.gitkeep` is hidden (it's intentionally NOT in DEFAULT_HIDDEN_GLOBS) - so a lesson can ship a
    // `<dir>/.gitkeep` to pre-create an empty folder that the learner can move/drop files into.
    if (fileName !== '.gitkeep') {
      current.push({ type: 'file', name: fileName, path: filePath })
    }
  }

  return root
}

function splitName(path: string): { dir: string; base: string } {
  const i = path.lastIndexOf('/')
  return i === -1
    ? { dir: '', base: path }
    : { dir: path.slice(0, i), base: path.slice(i + 1) }
}

function basenameWithoutExt(name: string): { stem: string; ext: string } {
  const i = name.lastIndexOf('.')
  return i === -1 || i === 0
    ? { stem: name, ext: '' }
    : { stem: name.slice(0, i), ext: name.slice(i) }
}

// ── icons ─────────────────────────────────────────────────────────────────────

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop() ?? ''
  const color =
    ext === 'sql'
      ? 'var(--color-accent-orange)'
      : ext === 'yml' || ext === 'yaml'
        ? 'var(--color-success)'
        : 'var(--color-text-muted)'
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill={color}
      style={{ flexShrink: 0, opacity: 0.85 }}
    >
      <path d="M2 1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5L7.5 1H2Zm0 1h5v3h3v6H2V2Z" />
    </svg>
  )
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="var(--color-muted)" style={{ flexShrink: 0 }}>
      {open ? (
        <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3h-6.5L6.092 1.337A1.75 1.75 0 0 0 4.843 1H1.75ZM0 11.25V5.5h14.5v7.75a.25.25 0 0 1-.25.25H1.75a.25.25 0 0 1-.25-.25ZM14.5 4H1.75a.25.25 0 0 0-.25.25V4h13V4ZM1.5 2.75A.25.25 0 0 1 1.75 2.5h3.093a.25.25 0 0 1 .178.073L6.5 4H1.5V2.75Z" />
      ) : (
        <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25V4.75A1.75 1.75 0 0 0 14.25 3h-6.5L6.092 1.337A1.75 1.75 0 0 0 4.843 1H1.75ZM1.5 2.75A.25.25 0 0 1 1.75 2.5h3.093a.25.25 0 0 1 .178.073L6.5 4H1.5V2.75Zm0 2.75h13v7.75a.25.25 0 0 1-.25.25H1.75a.25.25 0 0 1-.25-.25V5.5Z" />
      )}
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
        transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
        transition: 'transform 0.12s',
        flexShrink: 0,
        fill: 'none',
      }}
    >
      <path d="M2.5 1.5L5.5 4 2.5 6.5" stroke="var(--color-muted)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
      <path d="M7.75 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 7.75 2Z" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
      <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25a1.75 1.75 0 0 1 .445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064L11.189 6.25Zm2.183-3.13a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.232-1.233a.25.25 0 0 0 0-.354Z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.675l.66 6.6a.25.25 0 0 0 .249.225h5.19a.25.25 0 0 0 .249-.225l.66-6.6a.75.75 0 0 1 1.492.149l-.66 6.6A1.748 1.748 0 0 1 10.595 15h-5.19a1.75 1.75 0 0 1-1.741-1.575l-.66-6.6a.75.75 0 1 1 1.492-.15ZM6.5 1.75V3h3V1.75a.25.25 0 0 0-.25-.25h-2.5a.25.25 0 0 0-.25.25Z" />
    </svg>
  )
}

// ── inline inputs ─────────────────────────────────────────────────────────────

/**
 * Inline input for creating a file inside a specific folder. Renders a
 * non-editable folder-prefix label and an editable filename field. Auto-suffix
 * `.sql` if the typed name has no extension.
 */
function CreateInDirInput({
  dirPath,
  depth,
  onCommit,
  onCancel,
  hasConflict,
}: {
  dirPath: string
  depth: number
  onCommit: (name: string) => void
  onCancel: () => void
  hasConflict: (name: string) => boolean
}) {
  const [value, setValue] = useState('')
  const [flash, setFlash] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const indent = 8 + depth * 14
  const cancelRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = () => {
    const name = value.trim()
    if (!name) {
      onCancel()
      return
    }
    const final = /\.[a-zA-Z0-9]+$/.test(name) ? name : `${name}.sql`
    if (hasConflict(final)) {
      setFlash(true)
      window.setTimeout(() => setFlash(false), 1000)
      return
    }
    onCommit(final)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: `3px 8px 3px ${indent}px`,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.6875rem',
        background: 'var(--color-border-subtle)',
      }}
    >
      <FileIcon name={value || '.sql'} />
      <span style={{ color: 'var(--color-muted)' }}>{dirPath}/</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit() }
          else if (e.key === 'Escape') {
            cancelRef.current = true
            onCancel()
          }
        }}
        onBlur={() => {
          if (cancelRef.current) { cancelRef.current = false; return }
          submit()
        }}
        placeholder="filename"
        spellCheck={false}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'var(--color-surface)',
          border: `1px solid ${flash ? 'var(--color-fail)' : 'var(--color-accent-orange-dim)'}`,
          borderRadius: '3px',
          color: 'var(--color-text)',
          fontSize: '0.6875rem',
          fontFamily: 'JetBrains Mono, monospace',
          padding: '2px 5px',
          outline: 'none',
          transition: 'border-color 0.15s',
        }}
      />
    </div>
  )
}

/**
 * Inline rename input that replaces a FileItem's label. Pre-fills with the
 * filename; auto-selects the stem (everything before the last dot) so the
 * learner can retype without nuking the extension.
 */
function RenameInput({
  initialName,
  depth,
  onCommit,
  onCancel,
  hasConflict,
}: {
  initialName: string
  depth: number
  onCommit: (name: string) => void
  onCancel: () => void
  hasConflict: (name: string) => boolean
}) {
  const [value, setValue] = useState(initialName)
  const [flash, setFlash] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const indent = 8 + depth * 14
  const cancelRef = useRef(false)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    const { stem } = basenameWithoutExt(initialName)
    el.setSelectionRange(0, stem.length)
  }, [initialName])

  const submit = () => {
    const name = value.trim()
    if (!name || name === initialName) {
      onCancel()
      return
    }
    if (hasConflict(name)) {
      setFlash(true)
      window.setTimeout(() => setFlash(false), 1000)
      return
    }
    onCommit(name)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: `3px 8px 3px ${indent}px`,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: '0.6875rem',
        background: 'var(--color-border-subtle)',
      }}
    >
      <FileIcon name={value} />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); submit() }
          else if (e.key === 'Escape') {
            cancelRef.current = true
            onCancel()
          }
        }}
        onBlur={() => {
          if (cancelRef.current) { cancelRef.current = false; return }
          submit()
        }}
        spellCheck={false}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'var(--color-surface)',
          border: `1px solid ${flash ? 'var(--color-fail)' : 'var(--color-accent-orange-dim)'}`,
          borderRadius: '3px',
          color: 'var(--color-text)',
          fontSize: '0.6875rem',
          fontFamily: 'JetBrains Mono, monospace',
          padding: '2px 5px',
          outline: 'none',
          transition: 'border-color 0.15s',
        }}
      />
    </div>
  )
}

// ── tree nodes ────────────────────────────────────────────────────────────────

interface ItemProps {
  node: TreeNode
  depth: number
  activeFile: string | null
  renaming: string | null
  creatingInDir: string | null
  alwaysShowActions: boolean
  files: Record<string, string>
  dragOverDir: string | null
  onOpen: (path: string) => void
  onDelete: (path: string) => void
  onCreateInDir: (dirPath: string) => void
  onCommitCreate: (dirPath: string, name: string) => void
  onCancelCreate: () => void
  onStartRename: (path: string) => void
  onCommitRename: (oldPath: string, newName: string) => void
  onCancelRename: () => void
  onDragStart: (path: string) => void
  onDragEnd: () => void
  onDragEnterDir: (dirPath: string) => void
  onDragLeaveDir: (dirPath: string) => void
  onDropOnDir: (dirPath: string) => void
}

function DirItem({ node, depth, ...rest }: ItemProps & { node: DirNode }) {
  const [expanded, setExpanded] = useState(true)
  const [hovered, setHovered] = useState(false)
  const indent = 8 + depth * 14
  const isCreatingHere = rest.creatingInDir === node.path
  const isDragOver = rest.dragOverDir === node.path
  const showActions = hovered || rest.alwaysShowActions || isCreatingHere

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; rest.onDragEnterDir(node.path) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) rest.onDragLeaveDir(node.path) }}
      onDrop={(e) => { e.preventDefault(); rest.onDropOnDir(node.path) }}
    >
      <div
        style={{ position: 'relative' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 w-full"
          style={{
            padding: `3px 28px 3px ${indent}px`,
            background: isDragOver ? 'var(--color-accent-bg)' : 'transparent',
            border: 'none',
            borderLeft: `2px solid ${isDragOver ? 'var(--color-accent-orange)' : 'transparent'}`,
            cursor: 'pointer',
            color: 'var(--color-text-secondary)',
            fontSize: '0.6875rem',
            fontFamily: 'JetBrains Mono, monospace',
            textAlign: 'left',
            userSelect: 'none',
            boxSizing: 'border-box',
          }}
          onMouseEnter={(e) => { if (!isDragOver) e.currentTarget.style.background = 'var(--color-border-subtle)' }}
          onMouseLeave={(e) => { if (!isDragOver) e.currentTarget.style.background = 'transparent' }}
        >
          <ChevronIcon expanded={expanded} />
          <FolderIcon open={expanded} />
          <span style={{ marginLeft: '4px' }}>{node.name}</span>
        </button>

        {showActions && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (!expanded) setExpanded(true)
              rest.onCreateInDir(node.path)
            }}
            title={`New file in ${node.path}/`}
            style={{
              position: 'absolute',
              right: '5px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-muted)',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '3px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-orange)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-muted)' }}
          >
            <PlusIcon />
          </button>
        )}
      </div>

      {expanded && (
        <>
          {isCreatingHere && (
            <CreateInDirInput
              dirPath={node.path}
              depth={depth + 1}
              onCommit={(name) => rest.onCommitCreate(node.path, name)}
              onCancel={rest.onCancelCreate}
              hasConflict={(name) => `${node.path}/${name}` in rest.files}
            />
          )}
          {node.children.map((child) => (
            <TreeItem key={child.path} {...rest} node={child} depth={depth + 1} />
          ))}
        </>
      )}
    </div>
  )
}

function FileItem({ node, depth, ...rest }: ItemProps & { node: FileNode }) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const isActive = node.path === rest.activeFile
  const indent = 8 + depth * 14
  const isRenaming = rest.renaming === node.path
  const showActions = hovered || rest.alwaysShowActions

  if (isRenaming) {
    const { dir, base } = splitName(node.path)
    return (
      <RenameInput
        initialName={base}
        depth={depth}
        onCommit={(name) => rest.onCommitRename(node.path, dir ? `${dir}/${name}` : name)}
        onCancel={rest.onCancelRename}
        hasConflict={(name) => {
          const newPath = dir ? `${dir}/${name}` : name
          return newPath !== node.path && newPath in rest.files
        }}
      />
    )
  }

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; rest.onDragStart(node.path) }}
        onDragEnd={rest.onDragEnd}
        onClick={() => rest.onOpen(node.path)}
        onDoubleClick={() => rest.onStartRename(node.path)}
        className="flex items-center gap-1.5 w-full"
        style={{
          padding: `3px 44px 3px ${indent}px`,
          background: isActive ? 'var(--color-accent-bg)' : 'transparent',
          border: 'none',
          borderLeft: `2px solid ${isActive ? 'var(--color-accent-orange)' : 'transparent'}`,
          cursor: 'grab',
          color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
          fontSize: '0.6875rem',
          fontFamily: 'JetBrains Mono, monospace',
          textAlign: 'left',
          boxSizing: 'border-box',
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = 'var(--color-border-subtle)'
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = 'transparent'
        }}
      >
        <FileIcon name={node.name} />
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {node.name}
        </span>
      </button>

      {showActions && (
        <div
          style={{
            position: 'absolute',
            right: '4px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); rest.onStartRename(node.path) }}
            title={t('files.rename')}
            style={iconButtonStyle()}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-orange)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-muted)' }}
          >
            <PencilIcon />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); rest.onDelete(node.path) }}
            title={t('files.delete')}
            style={iconButtonStyle()}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-fail)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-muted)' }}
          >
            <TrashIcon />
          </button>
        </div>
      )}
    </div>
  )
}

function iconButtonStyle(): React.CSSProperties {
  return {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-muted)',
    padding: '2px',
    display: 'flex',
    alignItems: 'center',
    borderRadius: '3px',
  }
}

function TreeItem(props: ItemProps) {
  if (props.node.type === 'dir') {
    return <DirItem {...props} node={props.node} />
  }
  return <FileItem {...props} node={props.node} />
}

// ── main component ────────────────────────────────────────────────────────────

export default function FileExplorer() {
  const { t } = useTranslation()
  const files = useGameStore((s) => s.files)
  const currentLessonId = useGameStore((s) => s.currentLessonId)
  const activeFile = useGameStore((s) => s.activeFile)
  const openFile = useGameStore((s) => s.openFile)
  const createFile = useGameStore((s) => s.createFile)
  const deleteFile = useGameStore((s) => s.deleteFile)
  const renameFile = useGameStore((s) => s.renameFile)

  // Root-level create (full path required - caters to creating new folders).
  const [creating, setCreating] = useState(false)
  const [newPath, setNewPath] = useState('')
  const [focusTick, setFocusTick] = useState(0)
  const rootInputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef(false)

  // In-folder create + inline rename state (mutually exclusive with each other
  // and with root create, since all consume the same input attention).
  const [creatingInDir, setCreatingInDir] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)

  const [draggedPath, setDraggedPath] = useState<string | null>(null)
  const [dragOverDir, setDragOverDir] = useState<string | null>(null)

  // Touch / no-hover devices always show row actions (otherwise users can't
  // discover them without a hover state).
  const alwaysShowActions = typeof window !== 'undefined'
    && window.matchMedia('(hover: none)').matches

  useEffect(() => {
    if (creating) {
      rootInputRef.current?.focus()
      const el = rootInputRef.current
      if (el) el.setSelectionRange(el.value.length, el.value.length)
    }
  }, [creating, focusTick])

  // F2 to rename the active file, as long as focus isn't trapped by an
  // editable input (e.g. Monaco). We bail when the active element is inside
  // any input, textarea, or contenteditable so we don't fight other widgets.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F2') return
      if (renaming || creatingInDir || creating) return
      if (!activeFile) return
      const t = document.activeElement as HTMLElement | null
      if (t) {
        const tag = t.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return
        if (t.closest('.monaco-editor')) return
      }
      e.preventDefault()
      setRenaming(activeFile)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeFile, renaming, creatingInDir, creating])

  const submitRootCreate = useCallback(() => {
    const path = newPath.trim()
    if (path && !path.endsWith('/') && !(path in files)) createFile(path, '')
    setCreating(false)
    setNewPath('')
  }, [newPath, createFile, files])

  const startCreateInDir = useCallback((dirPath: string) => {
    setCreating(false)
    setRenaming(null)
    setCreatingInDir(dirPath)
  }, [])

  const startCreateAtRoot = useCallback(() => {
    setCreatingInDir(null)
    setRenaming(null)
    setNewPath('')
    setCreating((c) => !c)
    setFocusTick((t) => t + 1)
  }, [])

  const commitCreateInDir = useCallback((dirPath: string, name: string) => {
    const fullPath = `${dirPath}/${name}`
    if (!(fullPath in files)) createFile(fullPath, '')
    setCreatingInDir(null)
  }, [createFile, files])

  const startRename = useCallback((path: string) => {
    setCreating(false)
    setCreatingInDir(null)
    setRenaming(path)
  }, [])

  const commitRename = useCallback((oldPath: string, newPath: string) => {
    renameFile(oldPath, newPath)
    setRenaming(null)
  }, [renameFile])

  const handleDragStart = useCallback((path: string) => setDraggedPath(path), [])
  const handleDragEnd = useCallback(() => { setDraggedPath(null); setDragOverDir(null) }, [])
  const handleDragEnterDir = useCallback((dirPath: string) => setDragOverDir(dirPath), [])
  const handleDragLeaveDir = useCallback((dirPath: string) => {
    setDragOverDir((cur) => cur === dirPath ? null : cur)
  }, [])
  const handleDropOnDir = useCallback((dirPath: string) => {
    if (draggedPath) {
      const base = draggedPath.split('/').pop()!
      const newPath = `${dirPath}/${base}`
      if (newPath !== draggedPath) renameFile(draggedPath, newPath)
    }
    setDraggedPath(null)
    setDragOverDir(null)
  }, [draggedPath, renameFile])

  // Lesson-controlled simplification (D30): hide infra/scaffolding from the TREE only. The full
  // `files` map is still passed to rows (so name-conflict checks see hidden files too) and still
  // syncs to dbt - hidden ≠ absent, a learner can `ref()` a hidden model.
  const hiddenGlobs = useMemo(
    () => hiddenGlobsFor(getLessonById(currentLessonId)?.hiddenGlobs),
    [currentLessonId],
  )
  const visibleFiles = useMemo(
    () => filterVisibleFiles(files, hiddenGlobs),
    [files, hiddenGlobs],
  )
  const tree = buildTree(visibleFiles)

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ width: '100%', background: 'var(--color-base)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{ height: '36px', padding: '0 8px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}
      >
        <span
          className="flex items-center"
          style={{
            color: 'var(--color-text-muted)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.625rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          {t('files.header')}
          <PanelRevealBadge panel="files" />
        </span>
        <button
          onClick={startCreateAtRoot}
          title={t('files.newFile')}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: creating ? 'var(--color-accent-orange)' : 'var(--color-muted)',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '3px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-text)'
            e.currentTarget.style.background = 'var(--color-border-subtle)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = creating ? 'var(--color-accent-orange)' : 'var(--color-muted)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688ZM8.75 7a.75.75 0 0 1 .75.75v1.5h1.5a.75.75 0 0 1 0 1.5h-1.5v1.5a.75.75 0 0 1-1.5 0v-1.5h-1.5a.75.75 0 0 1 0-1.5h1.5v-1.5A.75.75 0 0 1 8.75 7Z" />
          </svg>
        </button>
      </div>

      {/* Root-level new-file input */}
      {creating && (
        <div
          className="shrink-0"
          style={{ padding: '6px 8px', background: 'var(--color-base)', borderBottom: '1px solid var(--color-border)' }}
        >
          <input
            ref={rootInputRef}
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitRootCreate()
              } else if (e.key === 'Escape') {
                cancelRef.current = true
                setCreating(false)
                setNewPath('')
              }
            }}
            onBlur={() => {
              if (cancelRef.current) {
                cancelRef.current = false
                return
              }
              submitRootCreate()
            }}
            placeholder="models/staging/name.sql"
            spellCheck={false}
            style={{
              width: '100%',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-accent-orange-dim)',
              borderRadius: '3px',
              color: 'var(--color-text)',
              fontSize: '0.6875rem',
              fontFamily: 'JetBrains Mono, monospace',
              padding: '4px 6px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div
            style={{
              color: 'var(--color-muted)',
              fontSize: '0.5625rem',
              fontFamily: 'JetBrains Mono, monospace',
              marginTop: '3px',
            }}
          >
            {t('files.createHint')}
          </div>
        </div>
      )}

      {/* Tree */}
      <div data-testid="file-tree" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: '4px' }}>
        {tree.length === 0 ? (
          <div
            style={{
              color: 'var(--color-muted)',
              fontSize: '0.625rem',
              fontFamily: 'JetBrains Mono, monospace',
              padding: '16px 8px',
              textAlign: 'center',
              lineHeight: '1.6',
            }}
          >
            {t('files.emptyLine1')}
            <br />
            {t('files.emptyLine2')}
          </div>
        ) : (
          tree.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              activeFile={activeFile}
              renaming={renaming}
              creatingInDir={creatingInDir}
              alwaysShowActions={alwaysShowActions}
              files={files}
              dragOverDir={dragOverDir}
              onOpen={openFile}
              onDelete={deleteFile}
              onCreateInDir={startCreateInDir}
              onCommitCreate={commitCreateInDir}
              onCancelCreate={() => setCreatingInDir(null)}
              onStartRename={startRename}
              onCommitRename={commitRename}
              onCancelRename={() => setRenaming(null)}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragEnterDir={handleDragEnterDir}
              onDragLeaveDir={handleDragLeaveDir}
              onDropOnDir={handleDropOnDir}
            />
          ))
        )}
      </div>
    </div>
  )
}
