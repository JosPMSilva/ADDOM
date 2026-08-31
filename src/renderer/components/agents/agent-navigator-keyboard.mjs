/**
 * Tree-grammar keyboard resolution for the Agents navigator. Rows arrive already flattened, so
 * parent lookup walks backwards to the nearest shallower row.
 */
export function resolveNavigatorKeyCommand(key, { rows = [], index = 0 } = {}) {
  const rowCount = rows.length
  if (rowCount === 0) return { type: 'none' }
  const current = Math.min(Math.max(0, index), rowCount - 1)
  const row = rows[current]

  switch (key) {
    case 'ArrowDown':
      return current < rowCount - 1 ? { type: 'focus', index: current + 1 } : { type: 'none' }
    case 'ArrowUp':
      return current > 0 ? { type: 'focus', index: current - 1 } : { type: 'none' }
    case 'ArrowRight':
      if (row?.hasChildren && !row.expanded) return { type: 'expand', index: current }
      if (row?.hasChildren && current < rowCount - 1) return { type: 'focus', index: current + 1 }
      return { type: 'none' }
    case 'ArrowLeft': {
      if (row?.hasChildren && row.expanded) return { type: 'collapse', index: current }
      const parentIndex = findParentIndex(rows, current)
      return parentIndex >= 0 ? { type: 'focus', index: parentIndex } : { type: 'none' }
    }
    case 'Home':
      return { type: 'focus', index: 0 }
    case 'End':
      return { type: 'focus', index: rowCount - 1 }
    case 'Enter':
    case ' ':
      return { type: 'select', index: current }
    default:
      return { type: 'none' }
  }
}

export function findParentIndex(rows = [], index = 0) {
  const depth = Number(rows[index]?.depth || 0)
  if (depth === 0) return -1
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (Number(rows[cursor]?.depth || 0) < depth) return cursor
  }
  return -1
}
