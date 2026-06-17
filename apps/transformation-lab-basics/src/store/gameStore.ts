import { create } from 'zustand'
import { parseCommand } from '../engine/commandParser'
import { execute, resolveSelection } from '../engine/runner'
import { previewModel, plan, materializeModels, syncProjectFiles } from '../engine/executor'
import { getLessonById, getLastLessonId, taskKey, lessons } from '../lessons'
import type { TerminalLine } from '../engine/runner'
import { registerCsv, resetDb } from '../engine/duckdb'
import { setEngineOutputSink, isEngineBooted, bakeWarehouse, restoreWarehouse } from '../engine/engine'
import { modelColumnsFromCatalog } from '../engine/artifacts'
import { errorMessage } from '../engine/errors'
import { safeStorage } from './safeStorage'
import { ALL_PANELS, type PanelKey, type LastRunInfo } from '../engine/types'
import i18n from '../i18n'
import { localizedInitialFiles } from '../i18n/useLocalizedLesson'

export type BottomTab = 'commands' | 'results'

/** Lifecycle of the one-time ~40 MB engine boot (Pyodide + dbt-core + dbt-duckdb). */
export type BootState = 'idle' | 'booting' | 'ready' | 'error'

export interface PreviewResult {
  name: string
  columns: string[]
  rows: unknown[][]
  rowCount: number
}

export type { TerminalLine }

let checkTasksTimer: ReturnType<typeof setTimeout> | null = null

// Lessons whose STARTING warehouse we've baked this session (see engine.bakeWarehouse). Once a
// lesson has been set up once, later loads (Reset, revisits) restore the bake instead of re-running
// seeds + pre-ran models. Per-session (cleared on full reload), keyed by lesson id.
const bakedLessons = new Set<number>()
const bakeKey = (id: number) => `lesson${id}`

const SEEN_PANELS_KEY = 'transformation-lab-seen-panels'
const PROGRESS_KEY = 'transformation-lab-progress'
const THEME_KEY = 'transformation-lab-theme'

function loadSeenPanels(): Set<PanelKey> {
  const raw = safeStorage.getItem(SEEN_PANELS_KEY)
  if (!raw) return new Set()
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((v): v is PanelKey => ALL_PANELS.includes(v as PanelKey)))
  } catch {
    return new Set()
  }
}

function persistSeenPanels(seen: Set<PanelKey>): void {
  safeStorage.setItem(SEEN_PANELS_KEY, JSON.stringify([...seen]))
}

interface PersistedProgress {
  currentLessonId: number
  // The last real lesson (id >= 1) the learner opened. Drives the home page's
  // "Continue" button, which must survive `currentLessonId` dropping back to 0
  // (the home/chooser sentinel) when they return to `/`.
  lastLessonId: number
  completedTasks: string[]
  correctQuizzes: number[]
}

function loadProgress(): PersistedProgress | null {
  const raw = safeStorage.getItem(PROGRESS_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const p = parsed as Record<string, unknown>
    const currentLessonId = typeof p.currentLessonId === 'number' ? p.currentLessonId : 0
    // Migrate pre-chooser saves: they stored the last lesson in `currentLessonId`.
    const lastLessonId =
      typeof p.lastLessonId === 'number'
        ? p.lastLessonId
        : currentLessonId > 0
          ? currentLessonId
          : 0
    const completedTasks = Array.isArray(p.completedTasks)
      ? p.completedTasks.filter((v): v is string => typeof v === 'string')
      : []
    const correctQuizzes = Array.isArray(p.correctQuizzes)
      ? p.correctQuizzes.filter((v): v is number => typeof v === 'number')
      : []
    return { currentLessonId, lastLessonId, completedTasks, correctQuizzes }
  } catch {
    return null
  }
}

function persistProgress(state: Pick<StoreState, 'currentLessonId' | 'lastLessonId' | 'completedTasks' | 'correctQuizzes'>): void {
  const payload: PersistedProgress = {
    currentLessonId: state.currentLessonId,
    lastLessonId: state.lastLessonId,
    completedTasks: [...state.completedTasks],
    correctQuizzes: [...state.correctQuizzes],
  }
  safeStorage.setItem(PROGRESS_KEY, JSON.stringify(payload))
}

interface StoreState {
  files: Record<string, string>
  activeFile: string | null
  openTabs: Set<string>
  ranModels: Set<string>
  shownModels: Set<string>
  compiledModels: Set<string>
  testResults: Record<string, 'pass' | 'fail' | 'untested'>
  modelColumns: Record<string, string[]>
  loadedSeeds: Set<string>
  buildSucceeded: boolean
  snapshotRunCounts: Record<string, number>
  snapshotClosedRows: Record<string, number>
  openedFiles: Set<string>
  terminalHistory: TerminalLine[]
  running: boolean

  /** Engine boot lifecycle - drives the full-screen loading overlay. `idle` until the
   *  first lesson/command needs the engine (lazy boot), then `booting` → `ready`/`error`. */
  bootState: BootState
  /** The latest boot phase reported by the engine (`loading-pyodide`, `installing-wheelhouse`, …). */
  bootPhase: string | null
  /** Boot failure message, set when `bootState === 'error'`. */
  bootError: string | null
  lastPreview: PreviewResult | null
  /** Details of the most recent run/build/compile/show command. */
  lastRun: LastRunInfo | null
  /** Models the lineage DAG should highlight (others fade). null = render all
   *  normally. Driven live by terminal input, then by the last run's selection. */
  dagSelection: Set<string> | null

  currentLessonId: number
  /** Last real lesson (id >= 1) opened; 0 if never. Powers the home "Continue". */
  lastLessonId: number
  /** Task progress, keyed as `<lessonId>.<taskId>`. */
  completedTasks: Set<string>
  /** Lesson ids whose quiz the learner answered correctly. */
  correctQuizzes: Set<number>
  /** Per-task hint reveal, keyed as `<lessonId>.<taskId>`. */
  revealedHints: Set<string>
  bottomTab: BottomTab

  /** Panels the learner has ever encountered. Persisted across reloads. */
  seenPanels: Set<PanelKey>
  /** Panels revealed by the current lesson load - drives the "New" pulse. */
  newlyRevealedPanels: Set<PanelKey>
  /** Increments on every loadLesson call; forces Monaco to remount. */
  editorKey: number

  setFileContent: (path: string, content: string) => void
  openFile: (path: string) => void
  closeTab: (path: string) => void
  createFile: (path: string, content: string) => void
  deleteFile: (path: string) => void
  renameFile: (oldPath: string, newPath: string) => boolean
  runCommand: (input: string) => Promise<void>
  showModel: (name: string) => Promise<void>
  setDagSelection: (selection: Set<string> | null) => void

  loadLesson: (id: number) => Promise<void>
  resetLesson: () => Promise<void>
  checkTasks: () => void
  revealHint: (lessonId: number, taskId: string) => void
  markQuizCorrect: (lessonId: number) => void
  setBottomTab: (tab: BottomTab) => void
  dismissPanelReveal: (panel: PanelKey) => void

  theme: 'dark' | 'light'
  toggleTheme: () => void
}

function seedTableName(key: string): string {
  return key
}

const initialProgress = loadProgress()

export const useGameStore = create<StoreState>()(
    (set, get) => ({
      files: {},
      activeFile: null,
      openTabs: new Set<string>(),
      ranModels: new Set<string>(),
      shownModels: new Set<string>(),
      compiledModels: new Set<string>(),
      testResults: {},
      modelColumns: {},
      loadedSeeds: new Set<string>(),
      buildSucceeded: false,
      snapshotRunCounts: {},
      snapshotClosedRows: {},
      openedFiles: new Set<string>(),
      terminalHistory: [{ text: 'dtlab - loading...', color: 'gray' }],
      running: false,
      bootState: 'idle',
      bootPhase: null,
      bootError: null,
      lastPreview: null,
      lastRun: null,
      dagSelection: null,

      // Always start at the home/chooser (0); the App init effect immediately
      // loads the lesson the URL points to (or stays home at `/`).
      currentLessonId: 0,
      lastLessonId: initialProgress?.lastLessonId ?? 0,
      completedTasks: new Set<string>(initialProgress?.completedTasks ?? []),
      correctQuizzes: new Set<number>(initialProgress?.correctQuizzes ?? []),
      revealedHints: new Set<string>(),
      editorKey: 0,

      bottomTab: 'commands',

      seenPanels: loadSeenPanels(),
      newlyRevealedPanels: new Set<PanelKey>(),

      theme: (safeStorage.getItem(THEME_KEY) as 'dark' | 'light') ?? 'light',

      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        document.documentElement.dataset.theme = next === 'light' ? 'light' : ''
        safeStorage.setItem(THEME_KEY, next)
        set({ theme: next })
      },

      setFileContent: (path, content) => {
        set((s) => ({ files: { ...s.files, [path]: content } }))
        if (checkTasksTimer) clearTimeout(checkTasksTimer)
        checkTasksTimer = setTimeout(() => get().checkTasks(), 600)
      },

      openFile: (path) => {
        set((s) => ({
          activeFile: path,
          openTabs: s.openTabs.has(path) ? s.openTabs : new Set([...s.openTabs, path]),
          openedFiles: s.openedFiles.has(path)
            ? s.openedFiles
            : new Set([...s.openedFiles, path]),
        }))
        get().checkTasks()
      },

      closeTab: (path) => {
        set((s) => {
          const next = new Set(s.openTabs)
          next.delete(path)
          let activeFile = s.activeFile
          if (activeFile === path) {
            const tabs = [...s.openTabs]
            const idx = tabs.indexOf(path)
            const remaining = tabs.filter((t) => t !== path)
            activeFile = remaining[Math.min(idx, remaining.length - 1)] ?? null
          }
          return { openTabs: next, activeFile }
        })
      },

      createFile: (path, content) =>
        set((s) => ({
          files: { ...s.files, [path]: content },
          activeFile: path,
          openTabs: new Set([...s.openTabs, path]),
          openedFiles: new Set([...s.openedFiles, path]),
        })),

      deleteFile: (path) =>
        set((s) => {
          const files = { ...s.files }
          delete files[path]
          const nextTabs = new Set(s.openTabs)
          nextTabs.delete(path)
          const tabs = [...s.openTabs].filter((t) => t !== path)
          let activeFile = s.activeFile
          if (activeFile === path) {
            const idx = [...s.openTabs].indexOf(path)
            activeFile = tabs[Math.min(idx, tabs.length - 1)] ?? null
          }
          return { files, openTabs: nextTabs, activeFile }
        }),

      renameFile: (oldPath, newPath) => {
        const trimmed = newPath.trim()
        if (!trimmed || oldPath === trimmed) return false
        const s = get()
        if (!(oldPath in s.files)) return false
        if (trimmed in s.files) return false
        // Rebuild the object preserving insertion order - when we hit oldPath,
        // emit the new key with the same content instead.
        const files: Record<string, string> = {}
        for (const [k, v] of Object.entries(s.files)) {
          files[k === oldPath ? trimmed : k] = v
        }
        const nextTabs = new Set([...s.openTabs].map((t) => (t === oldPath ? trimmed : t)))
        set({
          files,
          activeFile: s.activeFile === oldPath ? trimmed : s.activeFile,
          openTabs: nextTabs,
        })
        get().checkTasks()
        return true
      },

      runCommand: async (input: string) => {
        if (get().running) return

        const cmdLine: TerminalLine = { text: `dtlab ❯ ${input}` }
        const parsed = parseCommand(input)

        if (!parsed.ok) {
          set((s) => ({
            terminalHistory: [
              ...s.terminalHistory,
              cmdLine,
              { text: `Error: ${parsed.error}`, color: 'red' as const },
              { text: '' },
            ],
          }))
          return
        }

        set((s) => ({
          running: true,
          terminalHistory: [...s.terminalHistory, cmdLine],
        }))

        try {
          const s = get()
          const result = await execute(
            parsed.command,
            {
              files: s.files,
              ranModels: s.ranModels,
              shownModels: s.shownModels,
              compiledModels: s.compiledModels,
              testResults: s.testResults,
              modelColumns: s.modelColumns,
              loadedSeeds: s.loadedSeeds,
              buildSucceeded: s.buildSucceeded,
              snapshotRunCounts: s.snapshotRunCounts,
              snapshotClosedRows: s.snapshotClosedRows,
              lastRun: s.lastRun,
            },
            // Stream dbt's output into the terminal as each line arrives, so a multi-second
            // command shows progress instead of dumping everything when it finishes.
            (lines) =>
              set((current) => ({ terminalHistory: [...current.terminalHistory, ...lines] })),
          )

          const newLastRun = result.updatedState.lastRun
          set((current) => ({
            terminalHistory: [...current.terminalHistory, ...result.lines],
            ranModels: result.updatedState.ranModels ?? current.ranModels,
            compiledModels: result.updatedState.compiledModels ?? current.compiledModels,
            testResults: result.updatedState.testResults ?? current.testResults,
            modelColumns: result.updatedState.modelColumns ?? current.modelColumns,
            loadedSeeds: result.updatedState.loadedSeeds ?? current.loadedSeeds,
            buildSucceeded: result.updatedState.buildSucceeded ?? current.buildSucceeded,
            snapshotRunCounts: result.updatedState.snapshotRunCounts ?? current.snapshotRunCounts,
            snapshotClosedRows: result.updatedState.snapshotClosedRows ?? current.snapshotClosedRows,
            lastRun: newLastRun ?? current.lastRun,
            // A command finished: pin the DAG highlight to exactly what that
            // command's selector resolves to - the same function the live
            // preview uses, so typing and running stay consistent. Typing a
            // new command overrides this via setDagSelection.
            dagSelection: resolveSelection(input, current.files),
          }))

          const showTerm = parsed.command.type === 'show' && parsed.command.select.length === 1
            ? parsed.command.select[0].terms[0]
            : null
          const showTarget = showTerm?.method === 'fqn' ? showTerm.value : null
          if (showTarget) {
            const latestRan = result.updatedState.ranModels ?? get().ranModels
            if (latestRan.has(showTarget)) {
              const target = showTarget
              try {
                const res = await previewModel(target, 20)
                set((cur) => ({
                  lastPreview: { name: target, columns: res.columns, rows: res.rows, rowCount: res.rowCount },
                  shownModels: new Set([...cur.shownModels, target]),
                  bottomTab: 'results',
                }))
              } catch {
                /* ignore */
              }
            }
          }
        } catch (e) {
          set((current) => ({
            terminalHistory: [
              ...current.terminalHistory,
              { text: `Unexpected error: ${errorMessage(e)}`, color: 'red' },
              { text: '' },
            ],
          }))
        } finally {
          set({ running: false })
          get().checkTasks()
        }
      },

      showModel: async (name: string) => {
        if (get().running) return
        set((s) => ({
          running: true,
          bottomTab: 'results',
          terminalHistory: [...s.terminalHistory, { text: `dtlab ❯ dbt show --select ${name}` }],
        }))
        try {
          if (!get().ranModels.has(name)) {
            set((s) => ({
              terminalHistory: [
                ...s.terminalHistory,
                { text: `Model "${name}" hasn't been run yet. Run 'dbt run' first.`, color: 'yellow' },
                { text: '' },
              ],
            }))
            return
          }
          const res = await previewModel(name, 20)
          set((s) => ({
            lastPreview: { name, columns: res.columns, rows: res.rows, rowCount: res.rowCount },
            shownModels: new Set([...s.shownModels, name]),
            terminalHistory: [
              ...s.terminalHistory,
              { text: `Preview of "${name}" - ${res.rowCount} row${res.rowCount !== 1 ? 's' : ''}. See the Results tab.`, color: 'gray' },
              { text: '' },
            ],
          }))
        } catch (e) {
          set((s) => ({
            terminalHistory: [
              ...s.terminalHistory,
              { text: errorMessage(e), color: 'red' },
              { text: '' },
            ],
          }))
        } finally {
          set({ running: false })
          get().checkTasks()
        }
      },

      setBottomTab: (tab) => set({ bottomTab: tab }),

      setDagSelection: (selection) => set({ dagSelection: selection }),

      loadLesson: async (id: number) => {
        const lesson = getLessonById(id)
        if (!lesson) return

        if (checkTasksTimer) {
          clearTimeout(checkTasksTimer)
          checkTasksTimer = null
        }

        const localizedFiles = localizedInitialFiles(lesson, i18n.language)
        const initialKeys = Object.keys(localizedFiles)
        const filesToOpen = lesson.openFiles ?? [initialKeys[0]].filter(Boolean)
        const firstFile = filesToOpen[0] ?? initialKeys[0] ?? null

        // Required panels for this lesson. Omitted = "show everything" (later
        // lessons don't need to opt in). Explicit `[]` is the minimum-UI case.
        const requiredPanels: PanelKey[] =
          lesson.panels ?? [...ALL_PANELS]
        const prevSeen = get().seenPanels
        const newlyRevealed = new Set<PanelKey>(
          requiredPanels.filter((p) => !prevSeen.has(p)),
        )
        const nextSeen = new Set<PanelKey>([...prevSeen, ...requiredPanels])
        if (newlyRevealed.size > 0) persistSeenPanels(nextSeen)

        set((s) => ({
          editorKey: s.editorKey + 1,
          files: localizedFiles,
          activeFile: firstFile,
          openTabs: filesToOpen.length > 0 ? new Set(filesToOpen) : new Set<string>(),
          ranModels: new Set<string>(),
          shownModels: new Set<string>(),
          compiledModels: new Set<string>(),
          testResults: {},
          modelColumns: {},
          loadedSeeds: new Set<string>(),
          buildSucceeded: false,
          snapshotRunCounts: {},
          snapshotClosedRows: {},
          openedFiles: firstFile ? new Set([firstFile]) : new Set<string>(),
          currentLessonId: id,
          // Remember the last real lesson for the home "Continue" button; id 0
          // (home) must not overwrite it.
          ...(id >= 1 ? { lastLessonId: id } : {}),
          lastPreview: null,
          lastRun: null,
          dagSelection: null,
          bottomTab: 'commands',
          running: true,
          seenPanels: nextSeen,
          newlyRevealedPanels: newlyRevealed,
          terminalHistory: [
            {
              text: isEngineBooted()
                ? 'Preparing the dbt project…'
                : 'Setting up the dbt environment… first load fetches ~40 MB, please wait.',
              color: 'gray',
            },
          ],
        }))
        persistProgress(get())

        try {
          const seeds = lesson.seeds ?? {}
          // Boot + warehouse work only when the lesson actually uses the engine - or once the
          // engine is already up (so a clean lesson switch always starts from a fresh warehouse).
          // The intro (no seeds / no pre-ran models) never pays the ~40 MB boot.
          const needsEngine =
            Object.keys(seeds).length > 0 || (lesson.preRanModels?.length ?? 0) > 0
          const preRanSet = new Set<string>()
          const preRanColumns: Record<string, string[]> = {}

          if (needsEngine || isEngineBooted()) {
            await resetDb() // boots the engine on first use, then wipes the warehouse + project
            await syncProjectFiles(localizedFiles) // write the lesson's model/seed/yaml files

            // Fast path: a lesson's starting warehouse is identical every load, so after baking it
            // once we restore the snapshot (~ms) instead of re-seeding + re-running pre-ran models.
            let restored = false
            if (needsEngine && bakedLessons.has(id)) {
              try {
                await restoreWarehouse(bakeKey(id))
                const cols = await modelColumnsFromCatalog()
                for (const n of lesson.preRanModels ?? []) {
                  if (cols[n]) { preRanSet.add(n); preRanColumns[n] = cols[n] }
                }
                restored = true
              } catch {
                restored = false // bake missing/corrupt - fall back to a full rebuild
              }
            }

            if (needsEngine && !restored) {
              for (const [key, csv] of Object.entries(seeds)) {
                await registerCsv(seedTableName(key), csv)
              }
              // Note: seeds/*.csv files declared in `initialFiles` are NOT pre-loaded.
              // They're checked-in CSVs the learner must materialize with `dbt seed`.
              if (lesson.preRanModels?.length) {
                const execPlan = plan(localizedFiles)
                const toRun = execPlan.sorted.filter((m) => lesson.preRanModels!.includes(m.name))
                const outcomes = await materializeModels(toRun)
                for (const o of outcomes) {
                  if (o.passed) {
                    preRanSet.add(o.name)
                    preRanColumns[o.name] = o.columns
                  }
                }
              }
              // Snapshot this starting warehouse so the next load of this lesson restores instantly.
              try {
                await bakeWarehouse(bakeKey(id))
                bakedLessons.add(id)
              } catch {
                /* baking is best-effort - a failure just means the next load rebuilds normally */
              }
            }
          }
          set({
            terminalHistory: [],
            ...(preRanSet.size ? { ranModels: preRanSet, modelColumns: preRanColumns } : {}),
          })
        } catch (e) {
          set((s) => ({
            terminalHistory: [
              ...s.terminalHistory,
              { text: `Failed to initialise DuckDB: ${errorMessage(e)}`, color: 'red' },
              { text: '' },
            ],
          }))
        } finally {
          set({ running: false })
        }
      },

      resetLesson: async () => {
        const { currentLessonId, completedTasks } = get()
        if (currentLessonId === null) return
        const prefix = `${currentLessonId}.`
        const pruned = new Set([...completedTasks].filter((k) => !k.startsWith(prefix)))
        set({ completedTasks: pruned })
        await get().loadLesson(currentLessonId)
      },

      checkTasks: () => {
        const s = get()
        const lesson = getLessonById(s.currentLessonId)
        if (!lesson) return

        const state = {
          files: s.files,
          ranModels: s.ranModels,
          shownModels: s.shownModels,
          compiledModels: s.compiledModels,
          testResults: s.testResults,
          modelColumns: s.modelColumns,
          loadedSeeds: s.loadedSeeds,
          buildSucceeded: s.buildSucceeded,
          snapshotRunCounts: s.snapshotRunCounts,
          snapshotClosedRows: s.snapshotClosedRows,
          openedFiles: s.openedFiles,
          lastRun: s.lastRun,
        }

        let changed = false
        const next = new Set(s.completedTasks)
        for (const task of lesson.tasks) {
          const key = taskKey(s.currentLessonId, task.id)
          if (next.has(key)) continue
          if (!task.validate(state)) break
          next.add(key)
          changed = true
        }
        if (changed) {
          set({ completedTasks: next })
          persistProgress({ ...get(), completedTasks: next })
        }
      },

      revealHint: (lessonId, taskId) =>
        set((s) => ({
          revealedHints: new Set([...s.revealedHints, taskKey(lessonId, taskId)]),
        })),

      markQuizCorrect: (lessonId) => {
        const next = new Set([...get().correctQuizzes, lessonId])
        set({ correctQuizzes: next })
        persistProgress({ ...get(), correctQuizzes: next })
      },

      dismissPanelReveal: (panel) =>
        set((s) => {
          if (!s.newlyRevealedPanels.has(panel)) return s
          const next = new Set(s.newlyRevealedPanels)
          next.delete(panel)
          return { newlyRevealedPanels: next }
        }),
    }),
)

function bootStatusMessage(phase: string): string {
  switch (phase) {
    case 'loading-pyodide':
      return 'Setting up the Python runtime…'
    case 'loading-micropip':
      return 'Setting up packages…'
    case 'installing-wheelhouse':
      return 'Setting up dbt-core + dbt-duckdb…'
    case 'applying-stubs':
      return 'Finalizing the environment…'
    default:
      return phase
  }
}

// Test hook: expose the store to the headless lesson gate when ?e2e is present (prod-safe; the
// flag has to be opted into via the URL, so a normal visit never attaches anything to window).
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('e2e')) {
  ;(window as unknown as { __GAME_STORE?: typeof useGameStore }).__GAME_STORE = useGameStore
}

// Stream the engine's boot lifecycle into the terminal so the first (slow) load shows progress,
// and mirror it into `bootState`/`bootPhase` which drive the full-screen <BootOverlay>.
// dbt's per-command stdout streams via runCommand's live `onLine` sink (see execute above), so only
// boot status surfaces through this global sink.
setEngineOutputSink((o) => {
  if (o.kind === 'boot') {
    if (o.state === 'start') {
      useGameStore.setState({ bootState: 'booting', bootPhase: null, bootError: null })
    } else if (o.state === 'ready') {
      useGameStore.setState({ bootState: 'ready', bootPhase: null })
    } else {
      useGameStore.setState({ bootState: 'error', bootError: o.error ?? 'Unknown error' })
    }
    return
  }
  if (o.kind !== 'status') return
  useGameStore.setState((s) => ({
    bootPhase: o.phase,
    terminalHistory: [...s.terminalHistory, { text: bootStatusMessage(o.phase), color: 'gray' }],
  }))
})

/** True when the lesson has tasks and every one is complete. Informational
 *  lessons (tasks.length === 0, e.g. the intro) never report as "completed"
 *  - they don't count toward progress. */
export function lessonCompleted(completedTasks: Set<string>, lessonId: number): boolean {
  const lesson = getLessonById(lessonId)
  if (!lesson || lesson.tasks.length === 0) return false
  return lesson.tasks.every((t) => completedTasks.has(taskKey(lessonId, t.id)))
}

export function totalLessonsCompleted(completedTasks: Set<string>): number {
  return lessons.filter((l) => lessonCompleted(completedTasks, l.id)).length
}

/** Lessons that count toward progress (i.e. have at least one task). */
export function totalTrackedLessons(): number {
  return lessons.filter((l) => l.tasks.length > 0).length
}

export { getLastLessonId }
