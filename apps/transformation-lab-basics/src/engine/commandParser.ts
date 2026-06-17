// Any dbt subcommand now flows through to real dbt (the engine runs genuine dbt-core), so the
// command "type" is just the subcommand string. A few commands (run/build/test/seed/snapshot/
// compile/show) still get rich UX (DAG highlight, lastRun-aware validators, Results preview) by
// name in runner.ts / the store, but the parser no longer whitelists.
export type CommandType = string

export interface SelectorTerm {
  method: 'fqn' | 'tag' | 'path'
  value: string
  upstream: boolean   // +term
  downstream: boolean // term+
}

// Comma-separated terms within one token are ANDed (intersection).
export interface SelectorGroup {
  terms: SelectorTerm[]
}

export interface ParsedCommand {
  type: CommandType
  select: SelectorGroup[]  // space-separated groups are ORed (union)
  exclude: SelectorGroup[]
  /** The full argv AFTER "dbt" (subcommand + every following token), forwarded verbatim to dbt. */
  args: string[]
  raw: string
}

export type ParseResult =
  | { ok: true; command: ParsedCommand }
  | { ok: false; error: string }

/**
 * Split a command line into tokens, respecting single/double quotes so JSON-in-quotes args like
 * `--vars '{"k": 1}'` and `--inline 'select 1'` survive as one token. Quotes are stripped; there's
 * no escape handling (sufficient for dbt's quoted-JSON args).
 */
function tokenize(input: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  let has = false
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null
      else cur += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      has = true
    } else if (/\s/.test(ch)) {
      if (has) { out.push(cur); cur = ''; has = false }
    } else {
      cur += ch
      has = true
    }
  }
  if (has) out.push(cur)
  return out
}

function parseSelectorTerm(raw: string): SelectorTerm {
  const upstream = raw.startsWith('+')
  const downstream = raw.endsWith('+')
  let value = raw.replace(/^\+/, '').replace(/\+$/, '')
  let method: 'fqn' | 'tag' | 'path' = 'fqn'
  if (value.startsWith('tag:')) {
    method = 'tag'
    value = value.slice(4)
  } else if (value.startsWith('path:')) {
    method = 'path'
    value = value.slice(5)
  } else if (value.includes('/')) {
    method = 'path'
  }
  return { method, value, upstream, downstream }
}

function parseSelectorGroup(token: string): SelectorGroup {
  return { terms: token.split(',').map(parseSelectorTerm) }
}

export function parseCommand(input: string): ParseResult {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: 'Empty command' }

  const parts = tokenize(trimmed)

  if (parts[0] !== 'dbt') {
    return {
      ok: false,
      error: `Commands start with "dbt", e.g. dbt run.`,
    }
  }

  const sub = parts[1]
  if (!sub) {
    return {
      ok: false,
      error: 'Missing subcommand, e.g. dbt run, dbt build, dbt test.',
    }
  }

  // Any subcommand is allowed - it's forwarded verbatim to real dbt. `args` is the full dbt argv
  // (subcommand + flags). The select/exclude scan below is best-effort UX only (DAG highlight +
  // lastRun); flags it doesn't recognize are ignored here but still carried in `args`.
  const type: CommandType = sub
  const args = parts.slice(1)
  const select: SelectorGroup[] = []
  const exclude: SelectorGroup[] = []

  let i = 2
  while (i < parts.length) {
    const flag = parts[i]

    if (flag === '--select' || flag === '-s') {
      const before = select.length
      i++
      while (i < parts.length && !parts[i].startsWith('-')) {
        select.push(parseSelectorGroup(parts[i]))
        i++
      }
      if (select.length === before)
        return { ok: false, error: '--select requires a model name' }
    } else if (flag === '--exclude') {
      const before = exclude.length
      i++
      while (i < parts.length && !parts[i].startsWith('-')) {
        exclude.push(parseSelectorGroup(parts[i]))
        i++
      }
      if (exclude.length === before)
        return { ok: false, error: '--exclude requires a model name' }
    } else {
      // Any other flag/token is opaque to the selector scan - it's already in `args`, forwarded
      // verbatim to real dbt. Just step over it.
      i++
    }
  }

  return { ok: true, command: { type, select, exclude, args, raw: trimmed } }
}
