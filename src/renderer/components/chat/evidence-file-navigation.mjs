function normalizeSlashes(value = '') {
  return String(value || '').trim().replace(/\\/g, '/')
}

export function isMarkdownDocumentPath(filePath = '') {
  return /\.(?:md|markdown|mdx)$/i.test(String(filePath || '').trim())
}

export function resolveDocumentCompanionReferencePath({
  sourceKind = 'project',
  filePath = '',
} = {}) {
  return String(sourceKind || '').trim() === 'managed_plan'
    ? ''
    : normalizeSlashes(filePath).replace(/^\.\//, '')
}

export function resolveProjectDocumentCompanionTarget({
  projectId = '',
  filePath = '',
} = {}) {
  const normalizedProjectId = String(projectId || '').trim()
  const normalizedFilePath = normalizeSlashes(filePath).replace(/^\.\//, '')
  if (!normalizedProjectId || !normalizedFilePath || !isMarkdownDocumentPath(normalizedFilePath)) return null
  return {
    projectId: normalizedProjectId,
    filePath: normalizedFilePath,
  }
}

function isProjectFileReferenceToken(value = '') {
  const normalized = normalizeSlashes(value)
  if (
    !normalized
    || isAbsoluteLocalPath(normalized)
    || /^(?:https?|file):\/\//i.test(normalized)
    || normalized.startsWith('//')
  ) return false
  const location = splitLocationSuffix(normalized)
  const basename = String(location.path || '').split('/').pop() || ''
  if (!/^(?:\.[a-z0-9][a-z0-9._-]*|[a-z0-9_@()+-][a-z0-9_@()+.-]*)\.[a-z][a-z0-9._-]*$/i.test(basename)) return false
  const extension = basename.split('.').pop() || ''
  return extension.length >= 2 && (extension === extension.toLowerCase() || extension === extension.toUpperCase())
}

export function tokenizeProjectFileReferences(value = '') {
  const parts = String(value || '').match(/\s+|[^\s]+/g) || []
  const segments = []
  const append = (type, segmentValue) => {
    if (!segmentValue) return
    const previous = segments[segments.length - 1]
    if (type === 'text' && previous?.type === 'text') previous.value += segmentValue
    else segments.push({ type, value: segmentValue })
  }

  for (const part of parts) {
    if (/^\s+$/.test(part)) {
      append('text', part)
      continue
    }
    const leading = part.match(/^[([{"']+/)?.[0] || ''
    let candidate = part.slice(leading.length)
    const trailing = candidate.match(/[)\]}"',;!?]+$/)?.[0] || ''
    candidate = candidate.slice(0, trailing ? -trailing.length : undefined)
    const terminalPunctuation = candidate.endsWith('.') || candidate.endsWith(':') ? candidate.slice(-1) : ''
    if (terminalPunctuation) candidate = candidate.slice(0, -1)
    if (!isProjectFileReferenceToken(candidate)) {
      append('text', part)
      continue
    }
    append('text', leading)
    append('file', candidate)
    append('text', `${terminalPunctuation}${trailing}`)
  }
  return segments
}

function splitLocationSuffix(value = '') {
  const hashMatch = value.match(/^(.*)#L(\d+)$/i)
  if (hashMatch) {
    return {
      path: String(hashMatch[1] || '').trim(),
      line: Math.max(1, Number(hashMatch[2]) || 1),
      column: 1,
    }
  }
  const colonMatch = value.match(/^(.*):(\d+)(?::(\d+))?$/)
  if (!colonMatch) return { path: value, line: undefined, column: undefined }
  return {
    path: String(colonMatch[1] || '').trim(),
    line: Math.max(1, Number(colonMatch[2]) || 1),
    column: Math.max(1, Number(colonMatch[3]) || 1),
  }
}

function isAbsoluteLocalPath(value = '') {
  return /^[a-z]:\//i.test(value) || /^\/\/[^/]+\/[^/]+\//.test(value) || /^\/(?!\/)/.test(value)
}

function looksLikeFileName(value = '') {
  return /^(?:[^/.\s][^/]*\.[a-z0-9][a-z0-9._-]*|\.[a-z0-9][a-z0-9._-]*)$/i.test(value)
}

export function resolveAbsoluteEvidenceFileReference(value = '') {
  const location = splitLocationSuffix(normalizeSlashes(value))
  const absolutePath = location.path.replace(/^\/(?=[a-z]:\/)/i, '').replace(/\/+$/, '')
  if (!absolutePath || !isAbsoluteLocalPath(absolutePath)) {
    return { ok: false, reason: 'not_absolute' }
  }
  const lastSlashIndex = absolutePath.lastIndexOf('/')
  const directoryPath = lastSlashIndex > 0 ? absolutePath.slice(0, lastSlashIndex) : ''
  const filePath = lastSlashIndex >= 0 ? absolutePath.slice(lastSlashIndex + 1) : ''
  if (!directoryPath || !looksLikeFileName(filePath)) {
    return { ok: false, reason: 'not_file' }
  }
  return {
    ok: true,
    absolutePath,
    directoryPath,
    filePath,
    line: location.line,
    column: location.column,
  }
}

export async function readAbsoluteEvidenceFile(fileApi, value = '') {
  const resolved = resolveAbsoluteEvidenceFileReference(value)
  if (!resolved.ok) return resolved
  if (typeof fileApi?.readFile !== 'function') {
    return { ...resolved, ok: false, error: 'file_bridge_unavailable' }
  }
  try {
    const result = await fileApi.readFile(resolved.directoryPath, resolved.filePath)
    return result?.ok === true
      ? { ...resolved, ...result, ok: true }
      : { ...resolved, ok: false, error: String(result?.error || 'file_unavailable') }
  } catch {
    return { ...resolved, ok: false, error: 'file_unavailable' }
  }
}
