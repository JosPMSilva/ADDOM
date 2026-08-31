const modelRegistry = new Map()

function stripFileUri(value = '') {
  const raw = String(value || '').trim()
  if (!/^file:/i.test(raw)) return raw
  try {
    const parsed = new URL(raw)
    let pathname = decodeURIComponent(parsed.pathname || '')
    if (/^\/[A-Za-z]:/.test(pathname)) pathname = pathname.slice(1)
    return pathname
  } catch {
    return raw
  }
}

function normalizeWindowsDrive(pathname = '') {
  return String(pathname || '').replace(/^([a-z]):/, (_, drive) => `${drive.toUpperCase()}:`)
}

export function normalizeEditorProjectFolder(projectFolder = '') {
  return normalizeWindowsDrive(
    stripFileUri(projectFolder)
      .replace(/\\/g, '/')
      .replace(/\/+$/, '')
      .trim(),
  )
}

export function normalizeEditorFilePath(filePath = '') {
  let normalized = stripFileUri(filePath)
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .trim()
  if (/^\/[A-Za-z]:/.test(normalized)) {
    normalized = normalized.slice(1)
  }
  return normalizeWindowsDrive(normalized)
}

export function resolveWorkspaceRelativeFilePath(projectFolder = '', filePath = '') {
  const normalizedProjectFolder = normalizeEditorProjectFolder(projectFolder)
  const normalizedFilePath = normalizeEditorFilePath(filePath)
  if (!normalizedFilePath) return ''
  if (!normalizedProjectFolder) return normalizedFilePath.replace(/^\/+/, '')
  if (normalizedFilePath === normalizedProjectFolder) return ''
  const projectPrefix = `${normalizedProjectFolder}/`
  if (normalizedFilePath.startsWith(projectPrefix)) {
    return normalizedFilePath.slice(projectPrefix.length)
  }
  return normalizedFilePath.replace(/^\/+/, '')
}

export function buildWorkspaceAbsoluteFilePath(projectFolder = '', filePath = '') {
  const normalizedProjectFolder = normalizeEditorProjectFolder(projectFolder)
  const normalizedFilePath = resolveWorkspaceRelativeFilePath(normalizedProjectFolder, filePath)
  if (!normalizedProjectFolder || !normalizedFilePath) return ''
  return normalizeWindowsDrive(`${normalizedProjectFolder}/${normalizedFilePath}`.replace(/\/{2,}/g, '/'))
}

function ensureAbsoluteFilePathPrefix(pathname = '') {
  if (!pathname) return '/'
  if (/^[A-Za-z]:/.test(pathname)) return `/${pathname}`
  return pathname.startsWith('/') ? pathname : `/${pathname}`
}

export function buildCanonicalFileUri(projectFolder = '', filePath = '') {
  const absolutePath = buildWorkspaceAbsoluteFilePath(projectFolder, filePath)
  if (!absolutePath) return ''
  return encodeURI(`file://${ensureAbsoluteFilePathPrefix(absolutePath)}`)
}

function normalizeLanguage(language = '') {
  return String(language || '').trim().toLowerCase() || 'plaintext'
}

function readModelValue(model) {
  if (model && typeof model.getValue === 'function') {
    return String(model.getValue() || '')
  }
  if (model && typeof model.value === 'string') {
    return String(model.value)
  }
  return ''
}

function writeModelValue(model, content) {
  if (!model || typeof model.setValue !== 'function') return
  const nextContent = String(content ?? '')
  if (readModelValue(model) === nextContent) return
  model.setValue(nextContent)
}

function safeDisposeModel(model) {
  if (!model || typeof model.dispose !== 'function') return
  try {
    model.dispose()
  } catch {
    // Best-effort cleanup only.
  }
}

function createEntry({ projectFolder, filePath, uri, language }) {
  return {
    projectFolder: normalizeEditorProjectFolder(projectFolder),
    filePath: resolveWorkspaceRelativeFilePath(projectFolder, filePath),
    uri: String(uri || '').trim(),
    language: normalizeLanguage(language),
    savedContent: '',
    currentContent: '',
    model: null,
  }
}

export function ensureModelRegistryEntry({ projectFolder, filePath, uri, language }) {
  const normalizedUri = String(uri || '').trim()
  if (!normalizedUri) return null
  const existingEntry = modelRegistry.get(normalizedUri)
  if (existingEntry) {
    if (projectFolder) existingEntry.projectFolder = normalizeEditorProjectFolder(projectFolder)
    if (filePath) existingEntry.filePath = resolveWorkspaceRelativeFilePath(existingEntry.projectFolder || projectFolder, filePath)
    if (language) existingEntry.language = normalizeLanguage(language)
    return existingEntry
  }
  const nextEntry = createEntry({ projectFolder, filePath, uri: normalizedUri, language })
  modelRegistry.set(normalizedUri, nextEntry)
  return nextEntry
}

export function getModelRegistryEntry(uri = '') {
  return modelRegistry.get(String(uri || '').trim()) || null
}

export function setModelRegistryModel(uri = '', model = null) {
  const entry = getModelRegistryEntry(uri)
  if (!entry) return null
  entry.model = model || null
  if (entry.model) {
    entry.currentContent = readModelValue(entry.model)
  }
  return entry
}

export function getModelRegistryModel(uri = '') {
  return getModelRegistryEntry(uri)?.model || null
}

export function readModelRegistryContent(uri = '') {
  const entry = getModelRegistryEntry(uri)
  if (!entry) return ''
  return entry.model ? readModelValue(entry.model) : String(entry.currentContent || '')
}

export function setModelRegistryContent(uri = '', content = '') {
  const entry = getModelRegistryEntry(uri)
  if (!entry) return ''
  const nextContent = String(content ?? '')
  if (entry.model) {
    writeModelValue(entry.model, nextContent)
    entry.currentContent = readModelValue(entry.model)
  } else {
    entry.currentContent = nextContent
  }
  return entry.currentContent
}

export function setModelRegistrySavedContent(uri = '', content = '') {
  const entry = getModelRegistryEntry(uri)
  if (!entry) return ''
  entry.savedContent = String(content ?? '')
  return entry.savedContent
}

export function syncModelRegistryLanguage(uri = '', language = '') {
  const entry = getModelRegistryEntry(uri)
  if (!entry) return null
  entry.language = normalizeLanguage(language)
  return entry
}

export function isModelRegistryDirty(uri = '') {
  const entry = getModelRegistryEntry(uri)
  if (!entry) return false
  return readModelRegistryContent(uri) !== String(entry.savedContent || '')
}

export function removeModelRegistryEntry(uri = '') {
  const normalizedUri = String(uri || '').trim()
  if (!normalizedUri) return false
  const entry = modelRegistry.get(normalizedUri)
  if (!entry) return false
  safeDisposeModel(entry.model)
  modelRegistry.delete(normalizedUri)
  return true
}

export function clearModelRegistry() {
  for (const entry of modelRegistry.values()) {
    safeDisposeModel(entry.model)
  }
  modelRegistry.clear()
}

export function getModelRegistrySnapshot() {
  return Array.from(modelRegistry.values()).map((entry) => ({
    uri: entry.uri,
    filePath: entry.filePath,
    projectFolder: entry.projectFolder,
    language: entry.language,
    savedContent: String(entry.savedContent || ''),
    currentContent: readModelRegistryContent(entry.uri),
    dirty: isModelRegistryDirty(entry.uri),
    hasModel: !!entry.model,
  }))
}
