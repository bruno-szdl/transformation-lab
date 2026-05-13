import type { NodeLayer } from './dagBuilder'

export interface GameState {
  files: Record<string, string>
  ranModels: Set<string>
  testResults: Record<string, 'pass' | 'fail' | 'untested'>
  shownModels: Set<string>
  /** Columns observed the last time each model was successfully run. */
  modelColumns: Record<string, string[]>
  /** Seeds that have been loaded via `dbt seed` in the current lesson. */
  loadedSeeds: Set<string>
  /** True if `dbt build` has completed without failures in the current lesson. */
  buildSucceeded: boolean
  /** How many times each snapshot has been run — kept for engine compatibility. */
  snapshotRunCounts: Record<string, number>
  /** Cumulative count of rows closed out by each snapshot. */
  snapshotClosedRows: Record<string, number>
  /** Files the learner has opened in the editor this lesson. */
  openedFiles: Set<string>
}

export interface GoalDagShape {
  nodes: Array<{ id: string; label: string; layer: NodeLayer }>
  edges: Array<{ source: string; target: string }>
}

/**
 * CSV blobs keyed by the source/table name they represent.
 *
 * - `source.table` form (e.g. `raw.users`) seeds a DuckDB table named
 *   `raw__users`, matching how source() compiles.
 * - A bare name (e.g. `my_seed`) seeds a DuckDB table named `my_seed`.
 */
export type Seeds = Record<string, string>

export interface Task {
  /** Stable id, unique within the lesson. Used for progress tracking. */
  id: string
  /** Short instruction shown to the learner (1-2 sentences). */
  prompt: string
  /** Optional hint revealed on demand. */
  hint?: string
  validate: (state: GameState) => boolean
}

export interface Quiz {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

/**
 * Side-panels that can be progressively introduced as lessons require them.
 * Editor + Console are always visible and not gated.
 */
export type PanelKey = 'files' | 'warehouse' | 'lineage'

export const ALL_PANELS: readonly PanelKey[] = ['files', 'warehouse', 'lineage']

export interface FurtherReadingLink {
  /** Short label, e.g. "ref() function" or "Materializations". */
  label: string
  /** Absolute URL — opens in a new tab. */
  url: string
}

export interface Lesson {
  id: number
  title: string
  /** Short conceptual explanation shown at the top of the lesson panel. */
  concept: string
  initialFiles: Record<string, string>
  seeds?: Seeds
  /** Models to silently materialize when the lesson loads. */
  preRanModels?: string[]
  tasks: Task[]
  quiz?: Quiz
  goal?: {
    dagShape?: GoalDagShape
  }
  /**
   * Panels this lesson needs in addition to whatever the learner has already
   * seen. Omit (or leave undefined) to show every panel — the safe default for
   * advanced lessons. Use `[]` to start with the bare minimum (lesson 1).
   */
  panels?: PanelKey[]
  /** Optional links to the official dbt docs (or similar), rendered at the
   * bottom of the lesson panel. Skip the field to render no section. */
  furtherReading?: FurtherReadingLink[]
}
