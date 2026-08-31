export function buildMergePreviewSections({
  mergedContent = '',
  oursLoaded = false,
  oursContent = '',
  theirsLoaded = false,
  theirsContent = '',
} = {}) {
  const nextMergedContent = String(mergedContent ?? '')
  const sections = []

  if (oursLoaded) {
    sections.push({
      id: 'ours',
      label: 'Your write -> merge result',
      prevContent: String(oursContent ?? ''),
      newContent: nextMergedContent,
    })
  }

  if (theirsLoaded) {
    sections.push({
      id: 'theirs',
      label: 'Other write -> merge result',
      prevContent: String(theirsContent ?? ''),
      newContent: nextMergedContent,
    })
  }

  return sections
}
