import React from 'react'
import rendererI18n, { resolveActiveRendererUiLocale } from './init.mjs'
import { createRendererTranslator } from './index.mjs'
import useSettingsStore from '../store/useSettingsStore.js'

export function useRendererTranslation(namespaces = ['core']) {
  const uiLocale = useSettingsStore((state) => state.uiLocale)
  const [i18nEpoch, setI18nEpoch] = React.useState(0)
  const normalizedNamespaces = React.useMemo(
    () => (
      Array.isArray(namespaces) && namespaces.length > 0
        ? namespaces.map((namespace) => String(namespace || '').trim()).filter(Boolean)
        : ['core']
    ),
    [namespaces],
  )
  const resolvedLocale = React.useMemo(() => {
    void i18nEpoch
    const activeLocale = String(rendererI18n.resolvedLanguage || rendererI18n.language || '').trim()
    return activeLocale || resolveActiveRendererUiLocale(uiLocale)
  }, [i18nEpoch, uiLocale])

  React.useEffect(() => {
    const notify = () => setI18nEpoch((value) => value + 1)
    rendererI18n.on('initialized', notify)
    rendererI18n.on('languageChanged', notify)
    rendererI18n.on('loaded', notify)
    return () => {
      rendererI18n.off('initialized', notify)
      rendererI18n.off('languageChanged', notify)
      rendererI18n.off('loaded', notify)
    }
  }, [])

  const fallbackT = React.useMemo(() => createRendererTranslator({
    locale: resolvedLocale,
    namespaces: normalizedNamespaces,
  }), [resolvedLocale, normalizedNamespaces])

  const t = React.useMemo(() => {
    void i18nEpoch
    if (!rendererI18n.isInitialized) {
      return fallbackT
    }

    const fixedT = rendererI18n.getFixedT(resolvedLocale, normalizedNamespaces)
    return (key, options = {}) => fixedT(key, options)
  }, [fallbackT, i18nEpoch, normalizedNamespaces, resolvedLocale])

  return { t }
}

export default useRendererTranslation
