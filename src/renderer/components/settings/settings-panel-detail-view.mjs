export function resolveSettingsDetailView(activeSections = [], detailViewId = '') {
  const normalizedId = String(detailViewId || '').trim()
  if (!normalizedId) return null
  for (const section of activeSections) {
    const view = section?.detailViews?.[normalizedId]
    if (view && typeof view.render === 'function') return view
  }
  return null
}
