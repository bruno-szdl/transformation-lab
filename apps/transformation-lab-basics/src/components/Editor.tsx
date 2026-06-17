import MonacoEditor from '@monaco-editor/react'
import type { Monaco } from '@monaco-editor/react'
import type { editor as MonacoEditorNS, languages, IDisposable } from 'monaco-editor'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getYamlDiagnostics } from '../engine/tests'
import { useGameStore } from '../store/gameStore'

function detectLanguage(path: string): string {
  if (path.endsWith('.sql')) return 'sql'
  if (path.endsWith('.yml') || path.endsWith('.yaml')) return 'yaml'
  return 'plaintext'
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

let sqlCompletionProvider: IDisposable | null = null

function registerSqlCompletions(monaco: Monaco): void {
  if (sqlCompletionProvider) return
  sqlCompletionProvider = monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ["'", '"', '(', '.'],
    provideCompletionItems: (
      model: MonacoEditorNS.ITextModel,
      position: { lineNumber: number; column: number },
    ): languages.CompletionList => {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      }
      const state = useGameStore.getState()
      const tables = new Set<string>([
        ...Object.keys(state.modelColumns),
        ...state.loadedSeeds,
        ...state.ranModels,
      ])
      const columns = new Set<string>()
      for (const cols of Object.values(state.modelColumns)) {
        for (const c of cols) columns.add(c)
      }
      const suggestions: languages.CompletionItem[] = []
      for (const t of tables) {
        suggestions.push({
          label: t,
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: t,
          range,
          detail: 'model / seed',
        })
      }
      for (const c of columns) {
        suggestions.push({
          label: c,
          kind: monaco.languages.CompletionItemKind.Field,
          insertText: c,
          range,
          detail: 'column',
        })
      }
      return { suggestions }
    },
  })
}

export default function Editor() {
  const { t } = useTranslation()
  const files = useGameStore((s) => s.files)
  const activeFile = useGameStore((s) => s.activeFile)
  const openFile = useGameStore((s) => s.openFile)
  const closeTab = useGameStore((s) => s.closeTab)
  const setFileContent = useGameStore((s) => s.setFileContent)
  const theme = useGameStore((s) => s.theme)
  const editorKey = useGameStore((s) => s.editorKey)
  const openTabs = useGameStore((s) => s.openTabs)

  const tabPaths = [...openTabs].filter((p) => p in files)

  const yamlErrors = useMemo(() => {
    const diags = getYamlDiagnostics(files)
    const byPath: Record<string, string[]> = {}
    for (const d of diags) {
      if (!(d.path in byPath)) byPath[d.path] = []
      const msg = d.code === 'syntax'
        ? t('yamlDiagnostics.syntax', { message: d.raw ?? '' })
        : t(`yamlDiagnostics.${d.code}`, { column: d.column })
      byPath[d.path].push(msg)
    }
    return byPath
  }, [files, t])

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-base)' }}>
      <div
        className="flex items-end shrink-0 overflow-x-auto"
        style={{ background: 'var(--color-surface)', minHeight: '36px', borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2 px-3 shrink-0" style={{ height: '36px' }}>
          <EditorIcon />
          <span
            style={{
              color: 'var(--color-text-muted)',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.6875rem',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            editor
          </span>
        </div>

        <div className="flex items-end h-full">
          {tabPaths.map((path) => {
            const isActive = path === activeFile
            return (
              <div
                key={path}
                className="flex items-center shrink-0 group"
                style={{
                  height: '36px',
                  background: isActive ? 'var(--color-base)' : 'transparent',
                  borderRight: '1px solid var(--color-border)',
                  borderTop: isActive ? '1px solid var(--color-accent-orange)' : '1px solid transparent',
                }}
              >
                <button
                  title={yamlErrors[path] ? `YAML: ${yamlErrors[path].join(' | ')}` : path}
                  onClick={() => openFile(path)}
                  className="flex items-center gap-1.5 cursor-pointer"
                  style={{
                    height: '100%',
                    padding: '0 6px 0 12px',
                    background: 'transparent',
                    border: 'none',
                    color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
                    fontSize: '0.6875rem',
                    fontFamily: 'JetBrains Mono, monospace',
                    outline: 'none',
                  }}
                >
                  <FileIcon path={path} />
                  <span>{basename(path)}</span>
                  {yamlErrors[path] && (
                    <span style={{ color: 'var(--color-warning)', fontSize: '0.65rem', lineHeight: 1 }}>⚠</span>
                  )}
                </button>
                <button
                  title={t('files.closeTab')}
                  onClick={(e) => { e.stopPropagation(); closeTab(path) }}
                  className="flex items-center justify-center cursor-pointer"
                  style={{
                    width: '20px',
                    height: '20px',
                    marginRight: '4px',
                    flexShrink: 0,
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '3px',
                    color: 'var(--color-muted)',
                    fontSize: '0.75rem',
                    lineHeight: 1,
                    outline: 'none',
                    opacity: isActive ? 1 : 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1'
                    e.currentTarget.style.background = 'var(--color-border-subtle)'
                    e.currentTarget.style.color = 'var(--color-text)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = isActive ? '1' : '0'
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--color-muted)'
                  }}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {activeFile && yamlErrors[activeFile] && (
        <div
          className="shrink-0 flex items-start gap-2 px-3 py-1.5"
          style={{
            background: 'var(--color-warning-bg)',
            borderBottom: '1px solid var(--color-warning-border)',
            color: 'var(--color-warning)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '0.6875rem',
            lineHeight: 1.5,
          }}
        >
          <span style={{ flexShrink: 0 }}>⚠</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {yamlErrors[activeFile].map((msg, i) => (
              <span key={i}>{msg}</span>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {activeFile === null ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 opacity-30 select-none">
            <EditorIcon size={32} />
            <span
              style={{
                color: 'var(--color-text-muted)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.6875rem',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
              }}
            >
              {t('files.noFileOpen')}
            </span>
          </div>
        ) : (
          <MonacoEditor
            key={`${editorKey}-${activeFile}`}
            height="100%"
            language={detectLanguage(activeFile)}
            theme={theme === 'dark' ? 'vs-dark' : 'light'}
            defaultValue={files[activeFile] ?? ''}
            onChange={(val) => setFileContent(activeFile, val ?? '')}
            onMount={(editor, monaco) => {
              registerSqlCompletions(monaco)
              editor.focus()
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              padding: { top: 8 },
              acceptSuggestionOnCommitCharacter: false,
              wordBasedSuggestions: 'off',
              quickSuggestions: false,
              suggestOnTriggerCharacters: true,
              editContext: false,
            }}
          />
        )}
      </div>
    </div>
  )
}

function EditorIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={{ color: 'var(--color-muted)' }}>
      <path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 1-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75V1.75Zm7.251 10.324.004-5.073-.002-2.253A2.25 2.25 0 0 0 5.003 2.5H1.5v9h3.757a3.75 3.75 0 0 1 1.994.574ZM8.755 4.75l-.004 7.322a3.752 3.752 0 0 1 1.992-.572H14.5v-9h-3.495a2.25 2.25 0 0 0-2.25 2.25Z" />
    </svg>
  )
}

function FileIcon({ path }: { path: string }) {
  const ext = path.split('.').pop() ?? ''
  const color =
    ext === 'sql'
      ? 'var(--color-accent-orange)'
      : ext === 'yml' || ext === 'yaml'
        ? 'var(--color-success)'
        : 'var(--color-text-muted)'
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill={color} style={{ opacity: 0.8, flexShrink: 0 }}>
      <path d="M2 1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5L7.5 1H2Zm0 1h5v3h3v6H2V2Z" />
    </svg>
  )
}
