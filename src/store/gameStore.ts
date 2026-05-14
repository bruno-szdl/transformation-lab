import { create } from 'zustand'
import { parseCommand } from '../engine/commandParser'
import { execute, resolveSelection } from '../engine/runner'
import { previewModel, plan, materializeModels } from '../engine/executor'
import { getLessonById, getLastLessonId, taskKey, lessons } from '../lessons'
import type { TerminalLine } from '../engine/runner'
import { registerCsv, resetDb } from '../engine/duckdb'
import { errorMessage } from '../engine/errors'
import { safeStorage } from './safeStorage'
import { ALL_PANELS, type PanelKey, type LastRunInfo } from '../engine/types'

export type BottomTab = 'commands' | 'results'

export interface PreviewResult {
  name: string
  columns: string[]
  rows: unknown[][]
  rowCount: number
}

export type { TerminalLine }

let checkTasksTimer: ReturnType<typeof setTimeout> | null = null

const SEEN_PANELS_KEY = 'dbt-quest-seen-panels'

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
  lastPreview: PreviewResult | null
  /** Details of the most recent run/build/compile/show command. */
  lastRun: LastRunInfo | null
  /** Models the lineage DAG should highlight (others fade). null = render all
   *  normally. Driven live by terminal input, then by the last run's selection. */
  dagSelection: Set<string> | null

  currentLessonId: number
  /** Task progress, keyed as `<lessonId>.<taskId>`. */
  completedTasks: Set<string>
  /** Lesson ids whose quiz the learner answered correctly. */
  correctQuizzes: Set<number>
  /** Per-task hint reveal, keyed as `<lessonId>.<taskId>`. */
  revealedHints: Set<string>
  bottomTab: BottomTab

  /** Panels the learner has ever encountered. Persisted across reloads. */
  seenPanels: Set<PanelKey>
  /** Panels revealed by the current lesson load — drives the "New" pulse. */
  newlyRevealedPanels: Set<PanelKey>

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
      terminalHistory: [{ text: 'dbt-quest — loading...', color: 'gray' }],
      running: false,
      lastPreview: null,
      lastRun: null,
      dagSelection: null,

      currentLessonId: 0,
      completedTasks: new Set<string>(),
      correctQuizzes: new Set<number>(),
      revealedHints: new Set<string>(),

      bottomTab: 'commands',

      seenPanels: loadSeenPanels(),
      newlyRevealedPanels: new Set<PanelKey>(),

      theme: (safeStorage.getItem('dbt-quest-theme') as 'dark' | 'light') ?? 'light',

      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        document.documentElement.dataset.theme = next === 'light' ? 'light' : ''
        safeStorage.setItem('dbt-quest-theme', next)
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
        // Rebuild the object preserving insertion order — when we hit oldPath,
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

        const cmdLine: TerminalLine = { text: `type here > ${input}` }
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
          const result = await execute(parsed.command, {
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
          })

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
            // command's selector resolves to — the same function the live
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
          terminalHistory: [...s.terminalHistory, { text: `type here > dbt show --select ${name}` }],
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
              { text: `Preview of "${name}" — ${res.rowCount} row${res.rowCount !== 1 ? 's' : ''}. See the Results tab.`, color: 'gray' },
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

        const initialKeys = Object.keys(lesson.initialFiles)
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

        set({
          files: { ...lesson.initialFiles },
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
          lastPreview: null,
          lastRun: null,
          dagSelection: null,
          bottomTab: 'commands',
          running: true,
          seenPanels: nextSeen,
          newlyRevealedPanels: newlyRevealed,
          terminalHistory: [
            { text: 'Preparing DuckDB…', color: 'gray' },
          ],
        })

        try {
          await resetDb()
          const seeds = lesson.seeds ?? {}
          for (const [key, csv] of Object.entries(seeds)) {
            await registerCsv(seedTableName(key), csv)
          }
          // Note: seeds/*.csv files declared in `initialFiles` are NOT pre-loaded.
          // They're checked-in CSVs the learner must materialize with `dbt seed`.
          const preRanSet = new Set<string>()
          const preRanColumns: Record<string, string[]> = {}
          if (lesson.preRanModels?.length) {
            const execPlan = plan(lesson.initialFiles)
            const toRun = execPlan.sorted.filter((m) => lesson.preRanModels!.includes(m.name))
            const outcomes = await materializeModels(toRun)
            for (const o of outcomes) {
              if (o.passed) {
                preRanSet.add(o.name)
                preRanColumns[o.name] = o.columns
              }
            }
          }
          set((s) => ({
            terminalHistory: [],
            ...(preRanSet.size ? { ranModels: preRanSet, modelColumns: preRanColumns } : {}),
          }))
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
        if (changed) set({ completedTasks: next })
      },

      revealHint: (lessonId, taskId) =>
        set((s) => ({
          revealedHints: new Set([...s.revealedHints, taskKey(lessonId, taskId)]),
        })),

      markQuizCorrect: (lessonId) =>
        set((s) => ({
          correctQuizzes: new Set([...s.correctQuizzes, lessonId]),
        })),

      dismissPanelReveal: (panel) =>
        set((s) => {
          if (!s.newlyRevealedPanels.has(panel)) return s
          const next = new Set(s.newlyRevealedPanels)
          next.delete(panel)
          return { newlyRevealedPanels: next }
        }),
    }),
)

/** True when the lesson has tasks and every one is complete. Informational
 *  lessons (tasks.length === 0, e.g. the intro) never report as "completed"
 *  — they don't count toward progress. */
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
