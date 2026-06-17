/**
 * Wrapper around localStorage that swallows errors thrown when storage is
 * unavailable (Safari private mode, disabled cookies, quota exceeded).
 * Reads return null on failure; writes fail silently. Callers should treat the
 * absence of a value as "use defaults" and not as a hard error.
 */
export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value)
    } catch {
      // ignore
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch {
      // ignore
    }
  },
}
