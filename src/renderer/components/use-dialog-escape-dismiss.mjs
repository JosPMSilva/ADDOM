import { useEffect } from 'react'

export function useDialogEscapeDismiss(active, dialogRef, onDismiss) {
  useEffect(() => {
    if (!active) return undefined
    const dialog = dialogRef?.current
    if (!dialog || typeof dialog.addEventListener !== 'function') return undefined

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
      event.preventDefault()
      onDismiss?.()
    }

    dialog.addEventListener('keydown', handleKeyDown)
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown)
    }
  }, [active, dialogRef, onDismiss])
}
