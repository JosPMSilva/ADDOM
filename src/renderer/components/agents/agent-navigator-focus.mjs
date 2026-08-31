export function settleAgentNavigatorFocus({ index, rowRefs }) {
  const row = rowRefs.get(index)
  if (!row) return false
  row.focus()
  row.scrollIntoView?.({ block: 'nearest' })
  return true
}

export function focusAgentNavigatorIndex({
  index,
  rowRefs,
  viewport,
  rowHeight = 46,
  requestFrame,
}) {
  const focusRow = () => settleAgentNavigatorFocus({ index, rowRefs })
  if (focusRow()) return true
  if (!viewport || typeof requestFrame !== 'function') return false
  viewport.scrollTop = Math.max(0, index * rowHeight)
  requestFrame(() => {
    if (!focusRow()) requestFrame(focusRow)
  })
  return true
}
