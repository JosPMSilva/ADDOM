import {
  ensureModelRegistryEntry,
  normalizeEditorFilePath,
  setModelRegistryContent,
  setModelRegistrySavedContent,
} from './editor-model-registry.js'

export function createOpenReadOnlyContentAction({
  set,
  get,
  nextTabId,
  onRegistryChange,
}) {
  return ({
    identity = '',
    filePath = '',
    label = '',
    language = 'plaintext',
    content = '',
  } = {}) => {
    const normalizedIdentity = String(identity || '').trim()
    const normalizedPath = normalizeEditorFilePath(filePath)
    if (!normalizedIdentity) return { ok: false, reason: 'missing_identity' }
    if (!normalizedPath) return { ok: false, reason: 'missing_file_path' }

    const modelUri = `addom-readonly://document/${encodeURIComponent(normalizedIdentity)}`
    const existing = get().tabs.find((tab) => tab.modelUri === modelUri)
    const id = existing?.id || nextTabId()
    const normalizedLanguage = String(language || '').trim().toLowerCase() || 'plaintext'
    const normalizedLabel = String(label || '').trim() || normalizedPath.split('/').pop() || 'Document'
    const normalizedContent = String(content ?? '')

    ensureModelRegistryEntry({
      projectFolder: '',
      filePath: normalizedPath,
      uri: modelUri,
      language: normalizedLanguage,
    })
    setModelRegistrySavedContent(modelUri, normalizedContent)
    setModelRegistryContent(modelUri, normalizedContent)

    const tab = {
      id,
      filePath: normalizedPath,
      label: normalizedLabel,
      modelUri,
      language: normalizedLanguage,
      readOnly: true,
      fileEncoding: 'utf8',
      loading: false,
      error: null,
      dirty: false,
      externalChanged: false,
      externalChangedAt: 0,
      externalChangedSource: '',
    }
    set((state) => ({
      tabs: existing
        ? state.tabs.map((candidate) => candidate.id === id ? tab : candidate)
        : [...state.tabs, tab],
      activeTab: id,
    }))
    onRegistryChange()
    return { ok: true, existing: !!existing, tabId: id, modelUri }
  }
}
