function normalizedBlockIdSet(blocks = []) {
  return new Set(
    (Array.isArray(blocks) ? blocks : [])
      .map((block) => String(block?.id || '').trim())
      .filter(Boolean),
  )
}

export function filterEligibleEditorPreludeEntries(entries = [], composerBlocks = [], fallbackComposerText = '') {
  const blockIds = normalizedBlockIdSet(composerBlocks)
  const fallbackText = String(fallbackComposerText || '')

  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const entryBlockIds = Array.isArray(entry?.blockIds)
      ? entry.blockIds.map((id) => String(id || '').trim()).filter(Boolean)
      : []
    if (entryBlockIds.length > 0) {
      return entryBlockIds.some((id) => blockIds.has(id))
    }

    const segmentIds = Array.isArray(entry?.segmentIds)
      ? entry.segmentIds.map((id) => String(id || '').trim()).filter(Boolean)
      : []
    if (segmentIds.length > 0) {
      return segmentIds.some((id) => blockIds.has(id))
    }

    const guard = String(entry?.guardVisibleText || '').trim()
    if (!guard) return false
    return fallbackText.includes(guard)
  })
}

