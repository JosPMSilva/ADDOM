const MATCH_HIGHLIGHT = 'addom-document-search-match'
const ACTIVE_HIGHLIGHT = 'addom-document-search-active'
const HIGHLIGHT_STYLE_ID = 'addom-document-search-highlight-styles'

function normalizedQuery(value = '') {
  return String(value || '').trim().toLocaleLowerCase()
}

export function findDocumentSearchOffsets(value = '', query = '') {
  const text = String(value || '').toLocaleLowerCase()
  const needle = normalizedQuery(query)
  if (!needle) return []
  const offsets = []
  let cursor = 0
  while (cursor <= text.length - needle.length) {
    const index = text.indexOf(needle, cursor)
    if (index < 0) break
    offsets.push(index)
    cursor = index + needle.length
  }
  return offsets
}

export function moveDocumentSearchIndex(currentIndex = -1, total = 0, direction = 1) {
  const count = Math.max(0, Number(total) || 0)
  if (!count) return -1
  const current = Number.isFinite(Number(currentIndex)) ? Number(currentIndex) : -1
  const step = Number(direction) < 0 ? -1 : 1
  if (current < 0) return step < 0 ? count - 1 : 0
  return (current + step + count) % count
}

export function collectDocumentSearchRanges(root, query = '') {
  const documentRef = root?.ownerDocument
  const nodeFilter = documentRef?.defaultView?.NodeFilter
  if (!root || !documentRef?.createTreeWalker || !nodeFilter) return []
  const needle = normalizedQuery(query)
  if (!needle) return []
  const ranges = []
  const walker = documentRef.createTreeWalker(root, nodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const offsets = findDocumentSearchOffsets(node.nodeValue, needle)
    for (const offset of offsets) {
      const range = documentRef.createRange()
      range.setStart(node, offset)
      range.setEnd(node, offset + needle.length)
      ranges.push(range)
    }
    node = walker.nextNode()
  }
  return ranges
}

export function observeDocumentSearchChanges(
  root,
  onChange,
  Observer = globalThis.MutationObserver,
) {
  if (!root || typeof onChange !== 'function' || typeof Observer !== 'function') return () => {}
  const observer = new Observer(onChange)
  observer.observe(root, { childList: true, subtree: true, characterData: true })
  return () => observer.disconnect()
}

export function clearDocumentSearchHighlights() {
  const highlights = globalThis.CSS?.highlights
  highlights?.delete?.(MATCH_HIGHLIGHT)
  highlights?.delete?.(ACTIVE_HIGHLIGHT)
}

export function renderDocumentSearchHighlights(ranges = [], activeIndex = -1) {
  clearDocumentSearchHighlights()
  const highlights = globalThis.CSS?.highlights
  const HighlightConstructor = globalThis.Highlight
  if (!highlights?.set || typeof HighlightConstructor !== 'function' || !ranges.length) return
  const documentRef = ranges[0]?.startContainer?.ownerDocument
  if (documentRef?.head && !documentRef.getElementById(HIGHLIGHT_STYLE_ID)) {
    const style = documentRef.createElement('style')
    style.id = HIGHLIGHT_STYLE_ID
    style.textContent = [
      `::highlight(${MATCH_HIGHLIGHT}) { color: var(--color-text-primary); background: var(--color-warning-bg-hover); }`,
      `::highlight(${ACTIVE_HIGHLIGHT}) { color: var(--color-surface); background: var(--color-warning); }`,
    ].join('\n')
    documentRef.head.append(style)
  }
  highlights.set(MATCH_HIGHLIGHT, new HighlightConstructor(...ranges))
  const activeRange = ranges[activeIndex]
  if (activeRange) highlights.set(ACTIVE_HIGHLIGHT, new HighlightConstructor(activeRange))
}

export function revealDocumentSearchRange(range = null) {
  const element = range?.commonAncestorContainer?.parentElement
  element?.scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: 'smooth' })
}
