export function buildOpenRouterSearchGroups(visibilityView = {}) {
  const namespaceRows = Array.isArray(visibilityView?.namespaceRows) ? visibilityView.namespaceRows : []
  return namespaceRows
    .filter((row) => Array.isArray(row?.models) && row.models.length > 0)
    .map((row) => ({
      namespace: String(row.namespace || ''),
      label: String(row.label || row.namespace || ''),
      models: row.models,
    }))
}

export function findOpenRouterNamespaceRow(visibilityView = {}, namespace = '') {
  const normalizedNamespace = String(namespace || '').trim().toLowerCase()
  return (Array.isArray(visibilityView?.namespaceRows) ? visibilityView.namespaceRows : [])
    .find((row) => String(row?.namespace || '').trim().toLowerCase() === normalizedNamespace) || null
}
