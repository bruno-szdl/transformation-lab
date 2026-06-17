/** Normalize an unknown thrown value into a human-readable message. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  try {
    return String(e)
  } catch {
    return 'Unknown error'
  }
}
