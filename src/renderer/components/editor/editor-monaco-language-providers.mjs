import {
  buildEditorServicePayload,
  getEditorServiceApi,
  isSameModelUri,
  mapEditorServiceLocation,
  mapEditorServiceRange,
  normalizeEditorServiceState,
} from './editor-monaco-service-helpers.mjs'

export function registerEditorServiceLanguageProviders({
  monaco,
  model,
  projectFolder,
  tabFilePath,
  tabLanguage,
  onServiceStateChange,
}) {
  const api = getEditorServiceApi()
  const languageId = String(model?.getLanguageId?.() || tabLanguage || 'plaintext').trim().toLowerCase()
  if (!api || !languageId || !model) {
    return { dispose() {} }
  }

  const requestService = async (kind, requestModel, position) => {
    if (!isSameModelUri(requestModel?.uri, model.uri)) return null
    const payload = buildEditorServicePayload({
      kind,
      model: requestModel,
      projectFolder,
      tabFilePath,
      tabLanguage,
    })
    if (!payload) return null
    if (position) {
      payload.lineNumber = Math.max(1, Number(position.lineNumber || 1) || 1)
      payload.column = Math.max(1, Number(position.column || 1) || 1)
    }
    try {
      const result = await api.request(payload)
      if (result?.serviceState) {
        onServiceStateChange?.(normalizeEditorServiceState(result.serviceState))
      }
      return result
    } catch {
      return null
    }
  }

  const hoverDisposable = monaco.languages.registerHoverProvider(languageId, {
    async provideHover(requestModel, position) {
      const result = await requestService('hover', requestModel, position)
      if (!result?.ok || !result?.available) return null
      const contents = Array.isArray(result.contents) ? result.contents : []
      if (contents.length === 0) return null
      return {
        contents,
        range: mapEditorServiceRange(monaco, result.range),
      }
    },
  })

  const definitionDisposable = monaco.languages.registerDefinitionProvider(languageId, {
    async provideDefinition(requestModel, position) {
      const result = await requestService('definition', requestModel, position)
      if (!result?.ok || !result?.available) return []
      return (Array.isArray(result.locations) ? result.locations : [])
        .map((location) => mapEditorServiceLocation(monaco, location))
        .filter(Boolean)
    },
  })

  const referencesDisposable = monaco.languages.registerReferenceProvider(languageId, {
    async provideReferences(requestModel, position) {
      const result = await requestService('references', requestModel, position)
      if (!result?.ok || !result?.available) return []
      return (Array.isArray(result.locations) ? result.locations : [])
        .map((location) => mapEditorServiceLocation(monaco, location))
        .filter(Boolean)
    },
  })

  return {
    dispose() {
      hoverDisposable?.dispose?.()
      definitionDisposable?.dispose?.()
      referencesDisposable?.dispose?.()
    },
  }
}
