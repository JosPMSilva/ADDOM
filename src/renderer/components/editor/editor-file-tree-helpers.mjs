function normalizeExpandedDirs(expandedDirs) {
  if (expandedDirs instanceof Set) return expandedDirs
  if (Array.isArray(expandedDirs)) return new Set(expandedDirs)
  return new Set()
}

export function flattenVisibleTree(tree = [], expandedDirs = new Set()) {
  const expanded = normalizeExpandedDirs(expandedDirs)
  const rows = []

  function visit(nodes, depth = 0, parentPath = '') {
    for (const node of Array.isArray(nodes) ? nodes : []) {
      const path = String(node?.path || '').trim()
      if (!path) continue
      const isDir = node?.type === 'dir'
      const open = isDir && expanded.has(path)
      rows.push({
        ...node,
        depth,
        parentPath,
        open,
      })
      if (isDir && open) {
        visit(node.children, depth + 1, path)
      }
    }
  }

  visit(tree, 0, '')
  return rows
}

export function resolveFileTreeKeyboardNavigation({
  tree = [],
  expandedDirs = new Set(),
  focusedPath = '',
  key = '',
} = {}) {
  const visibleNodes = flattenVisibleTree(tree, expandedDirs)
  if (visibleNodes.length === 0) return null

  const currentIndex = Math.max(0, visibleNodes.findIndex((node) => node.path === focusedPath))
  const current = visibleNodes[currentIndex] || visibleNodes[0]
  const keyText = String(key || '')

  if (keyText === 'ArrowDown') {
    const next = visibleNodes[Math.min(currentIndex + 1, visibleNodes.length - 1)]
    return next ? { focusPath: next.path } : null
  }

  if (keyText === 'ArrowUp') {
    const prev = visibleNodes[Math.max(currentIndex - 1, 0)]
    return prev ? { focusPath: prev.path } : null
  }

  if (keyText === 'Home') {
    return { focusPath: visibleNodes[0].path }
  }

  if (keyText === 'End') {
    return { focusPath: visibleNodes[visibleNodes.length - 1].path }
  }

  if (keyText === 'ArrowRight') {
    if (current.type !== 'dir') return null
    if (!current.open) {
      return {
        focusPath: current.path,
        action: { type: 'toggleDir', path: current.path },
      }
    }
    const child = visibleNodes[currentIndex + 1]
    if (child?.parentPath === current.path) {
      return { focusPath: child.path }
    }
    return null
  }

  if (keyText === 'ArrowLeft') {
    if (current.type === 'dir' && current.open) {
      return {
        focusPath: current.path,
        action: { type: 'toggleDir', path: current.path },
      }
    }
    if (current.parentPath) {
      return { focusPath: current.parentPath }
    }
    return null
  }

  if (keyText === 'Enter' || keyText === ' ' || keyText === 'Spacebar') {
    if (current.type === 'dir') {
      return {
        focusPath: current.path,
        action: { type: 'toggleDir', path: current.path },
      }
    }
    if (current.isText) {
      return {
        focusPath: current.path,
        action: { type: 'openFile', path: current.path },
      }
    }
    return null
  }

  return null
}
