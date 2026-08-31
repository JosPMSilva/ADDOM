import { useEffect } from 'react'

let highlightThemePromise = null

export function ensureHighlightThemeLoaded() {
  if (import.meta.env.SSR) return Promise.resolve()
  if (!highlightThemePromise) {
    highlightThemePromise = import('../../styles/highlight-theme.css')
  }
  return highlightThemePromise
}

export function useHighlightTheme(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    void ensureHighlightThemeLoaded()
  }, [enabled])
}
