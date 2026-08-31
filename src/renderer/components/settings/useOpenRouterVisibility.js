import { startTransition, useDeferredValue, useEffect, useState, useMemo, useCallback } from 'react'
import {
  areOpenRouterModelCatalogVisibilityEqual,
  buildOpenRouterVisibilityView,
  normalizeOpenRouterModelCatalogVisibility,
  resolveOpenRouterNamespaceVisibility,
} from '../../../common/api-clients/model-catalog-visibility.mjs'

export function useOpenRouterVisibility({ models = [], value = null, onChange = () => {} }) {
  const [search, setSearch] = useState('')
  const [draftValue, setDraftValue] = useState(() => normalizeOpenRouterModelCatalogVisibility(value))
  const deferredSearch = useDeferredValue(search)
  const normalizedValue = useMemo(
    () => normalizeOpenRouterModelCatalogVisibility(draftValue),
    [draftValue],
  )
  const rawModels = useMemo(
    () => (Array.isArray(models) ? models : []),
    [models],
  )

  useEffect(() => {
    const nextNormalizedValue = normalizeOpenRouterModelCatalogVisibility(value)
    setDraftValue((currentValue) => (
      areOpenRouterModelCatalogVisibilityEqual(currentValue, nextNormalizedValue)
        ? currentValue
        : nextNormalizedValue
    ))
  }, [value])

  const summaryView = useMemo(() => buildOpenRouterVisibilityView({
    models: rawModels,
    visibility: normalizedValue,
  }), [normalizedValue, rawModels])

  const visibilityView = useMemo(() => {
    if (!String(deferredSearch || '').trim()) return summaryView
    return buildOpenRouterVisibilityView({
      models: rawModels,
      visibility: normalizedValue,
      search: deferredSearch,
    })
  }, [deferredSearch, normalizedValue, rawModels, summaryView])

  const totalModels = rawModels.length
  const shownModels = summaryView.visibleModels.length
  const enabledModels = summaryView.baseVisibleCount
  const hasActiveDisplayFilters = !!(
    String(search || '').trim()
    || normalizedValue.filters?.reviewedOnly
    || normalizedValue.filters?.toolsOnly
    || normalizedValue.filters?.reasoningOnly
    || normalizedValue.filters?.visionOnly
  )

  const updateVisibility = useCallback((nextOpenRouterVisibility) => {
    const normalizedNextValue = normalizeOpenRouterModelCatalogVisibility(nextOpenRouterVisibility)
    setDraftValue((currentValue) => (
      areOpenRouterModelCatalogVisibilityEqual(currentValue, normalizedNextValue)
        ? currentValue
        : normalizedNextValue
    ))
    startTransition(() => {
      onChange({
        openrouter: normalizedNextValue,
      })
    })
  }, [onChange])

  const setNamespaceVisibility = useCallback((namespace, enabled) => {
    const normalizedNamespace = String(namespace || '').trim().toLowerCase()
    if (!normalizedNamespace) return
    const nextVisibility = {
      ...normalizedValue,
      namespaceVisibility: {
        ...normalizedValue.namespaceVisibility,
      },
    }
    if (enabled === normalizedValue.defaultVisible) delete nextVisibility.namespaceVisibility[normalizedNamespace]
    else nextVisibility.namespaceVisibility[normalizedNamespace] = enabled
    updateVisibility(nextVisibility)
  }, [normalizedValue, updateVisibility])

  const setModelVisibility = useCallback((routeId, namespace, enabled) => {
    const normalizedRouteId = String(routeId || '').trim()
    const normalizedNamespace = String(namespace || '').trim().toLowerCase()
    if (!normalizedRouteId || !normalizedNamespace) return
    const nextVisibility = {
      ...normalizedValue,
      modelOverrides: {
        ...normalizedValue.modelOverrides,
      },
    }
    const inheritedNamespaceVisible = resolveOpenRouterNamespaceVisibility(normalizedValue, normalizedNamespace)
    if (enabled === inheritedNamespaceVisible) delete nextVisibility.modelOverrides[normalizedRouteId]
    else nextVisibility.modelOverrides[normalizedRouteId] = enabled
    updateVisibility(nextVisibility)
  }, [normalizedValue, updateVisibility])

  const setFilters = useCallback((nextFilters = {}) => {
    updateVisibility({
      ...normalizedValue,
      filters: {
        ...normalizedValue.filters,
        ...nextFilters,
      },
    })
  }, [normalizedValue, updateVisibility])

  const handleToggleFilter = useCallback((key) => {
    const normalizedKey = String(key || '').trim()
    if (!normalizedKey) return
    setFilters({
      [normalizedKey]: !normalizedValue.filters?.[normalizedKey],
    })
  }, [normalizedValue.filters, setFilters])

  const applyQuickAction = useCallback((action) => {
    switch (String(action || '').trim()) {
      case 'show_all':
        updateVisibility({
          defaultVisible: true,
          namespaceVisibility: {},
          modelOverrides: {},
          filters: {
            reviewedOnly: false,
            toolsOnly: false,
            reasoningOnly: false,
            visionOnly: false,
          },
        })
        return
      case 'hide_all':
        updateVisibility({
          defaultVisible: false,
          namespaceVisibility: {},
          modelOverrides: {},
          filters: {
            reviewedOnly: false,
            toolsOnly: false,
            reasoningOnly: false,
            visionOnly: false,
          },
        })
        return
      case 'reset':
        updateVisibility(normalizeOpenRouterModelCatalogVisibility({}))
        return
      default:
    }
  }, [updateVisibility])

  return {
    search,
    setSearch,
    normalizedValue,
    summaryView,
    visibilityView,
    totalModels,
    shownModels,
    enabledModels,
    hasActiveDisplayFilters,
    setNamespaceVisibility,
    setModelVisibility,
    handleToggleFilter,
    applyQuickAction,
  }
}
