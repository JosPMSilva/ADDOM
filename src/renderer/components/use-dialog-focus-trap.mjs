import { useEffect } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function getFocusableElements(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return []
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((element) => element && element.getAttribute('aria-hidden') !== 'true')
}

export function useDialogFocusTrap(active, dialogRef, options) {
  const restoreFocus = options?.restoreFocus !== false
  const focusContainer = options?.initialFocus === 'container'
  useEffect(() => {
    if (!active) return undefined
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined

    const dialog = dialogRef?.current
    if (!dialog) return undefined

    const previousFocus = document.activeElement
    const focusable = getFocusableElements(dialog)
    const initialTarget = focusContainer ? dialog : (focusable[0] || dialog)
    initialTarget?.focus?.()

    const handleKeyDown = (event) => {
      if (event.key !== 'Tab') return

      const nodes = getFocusableElements(dialog)
      if (nodes.length === 0) {
        event.preventDefault()
        dialog.focus?.()
        return
      }

      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey) {
        if (activeElement === first || activeElement === dialog) {
          event.preventDefault()
          last.focus?.()
        }
        return
      }

      if (activeElement === last) {
        event.preventDefault()
        first.focus?.()
      }
    }

    dialog.addEventListener('keydown', handleKeyDown)
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown)
      if (restoreFocus) previousFocus?.focus?.()
    }
  }, [active, dialogRef, focusContainer, restoreFocus])
}
