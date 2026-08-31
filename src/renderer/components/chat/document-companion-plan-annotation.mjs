function slugifyHeading(value = '') {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160)
}

function stableTextHash(value = '') {
  let hash = 0x811c9dc5
  for (const character of String(value || '')) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function createPlanAnnotationBlockId(node, kind = 'block', blockText = '') {
  const normalizedKind = slugifyHeading(kind) || 'block'
  const offset = Number(node?.position?.start?.offset)
  if (Number.isFinite(offset) && offset >= 0) return `${normalizedKind}-${offset}`
  const line = Number(node?.position?.start?.line)
  const column = Number(node?.position?.start?.column)
  if (Number.isFinite(line) && Number.isFinite(column)) {
    return `${normalizedKind}-${line}-${column}`
  }
  return `${normalizedKind}-${stableTextHash(blockText)}`
}

export function hasPlanAnnotationTextSelection(root, selection = globalThis.getSelection?.()) {
  if (!root || !selection || selection.isCollapsed || selection.rangeCount < 1) return false
  try {
    return selection.getRangeAt(0)?.intersectsNode?.(root) === true
  } catch {
    return false
  }
}

function visibleHeadingLabel(heading) {
  const clonedHeading = heading?.cloneNode?.(true)
  if (clonedHeading) {
    for (const action of clonedHeading.querySelectorAll?.('[data-plan-annotation-action="true"]') || []) {
      action.remove?.()
    }
    const label = String(clonedHeading.textContent || '').trim()
    if (label) return label
  }
  return String(heading?.textContent || '').trim()
}

export function resolvePlanAnnotationHeadingContext(root, targetNode) {
  if (!root || !targetNode || typeof root.querySelectorAll !== 'function') {
    return { anchor: '', label: '' }
  }
  let nearest = null
  for (const heading of root.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    if (typeof heading?.contains === 'function' && heading.contains(targetNode)) {
      nearest = heading
      break
    }
    const position = typeof heading?.compareDocumentPosition === 'function' ? heading.compareDocumentPosition(targetNode) : 0
    if ((position & 4) === 4) nearest = heading
  }
  if (!nearest) return { anchor: '', label: '' }
  const label = visibleHeadingLabel(nearest)
  return {
    anchor: String(nearest.id || '').trim() || slugifyHeading(label),
    label,
  }
}

export function resolvePlanAnnotationHeadingAnchor(root, targetNode) {
  return resolvePlanAnnotationHeadingContext(root, targetNode).anchor
}
