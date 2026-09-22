export const DOCUMENT_COMPANION_TOOLBAR_PADDING = 24
export const DOCUMENT_COMPANION_TOOLBAR_GAP = 8
export const DOCUMENT_COMPANION_SEARCH_MIN_WIDTH = 160
export const SAVED_COPY_STATUS_DURATION_MS = 3_000

export function resolveDocumentSearchPresentation({
  compact = false,
  focused = false,
  query = '',
} = {}) {
  if (!compact) return 'inline'
  return focused || String(query || '').trim() ? 'overlay' : 'button'
}

export function shouldShowDocumentCompanionSearch({
  toolbarWidth = 0,
  actionsWidth = 0,
} = {}) {
  const width = Number(toolbarWidth)
  const actions = Number(actionsWidth)
  if (!(width > 0) || !(actions >= 0)) return true
  return width
    - DOCUMENT_COMPANION_TOOLBAR_PADDING
    - DOCUMENT_COMPANION_TOOLBAR_GAP
    - actions >= DOCUMENT_COMPANION_SEARCH_MIN_WIDTH
}
