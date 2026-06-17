import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Adds standard modal accessibility:
 *  - traps Tab / Shift+Tab inside the dialog
 *  - autofocuses the first focusable child (or the container) on open
 *  - restores focus to whatever was focused before the modal opened
 *
 * Pass the returned ref to the dialog container. Only active while `open` is true.
 */
export function useModalA11y(open: boolean) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    const container = containerRef.current
    if (!container) return

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null

    const focusables = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    const initial = focusables[0] ?? container
    initial.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute('disabled'))
      if (items.length === 0) {
        e.preventDefault()
        container.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => {
      container.removeEventListener('keydown', onKeyDown)
      const prev = previouslyFocusedRef.current
      if (prev && typeof prev.focus === 'function') {
        try {
          prev.focus()
        } catch {
          // Element may have unmounted while modal was open.
        }
      }
    }
  }, [open])

  return containerRef
}
