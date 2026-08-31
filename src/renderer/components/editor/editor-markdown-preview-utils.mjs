function safeDecodeURIComponent(value = '') {
  try {
    return decodeURIComponent(String(value || ''))
  } catch {
    return String(value || '')
  }
}

function normalizeSlashes(value = '') {
  return String(value || '').replace(/\\/g, '/')
}

function normalizeComparablePath(value = '') {
  const normalized = normalizeSlashes(String(value || '').trim()).replace(/\/+$/, '')
  if (!normalized) return ''
  return /^[a-z]:/i.test(normalized)
    ? `${normalized.slice(0, 1).toLowerCase()}${normalized.slice(1)}`
    : normalized
}

function hasDisallowedScheme(value = '') {
  return /^[a-z][a-z0-9+.-]*:/i.test(String(value || '').trim())
}

function isWindowsDriveAbsolutePath(value = '') {
  return /^[a-z]:(?:[\\/]|%2f|%5c)/i.test(String(value || '').trim())
}

function isDoubleSlashWindowsAbsolutePath(value = '') {
  return /^\/\/[a-z]:[\\/]/i.test(String(value || '').trim())
}

function isAbsoluteLocalPath(value = '') {
  const text = String(value || '').trim()
  if (!text) return false
  return (
    isWindowsDriveAbsolutePath(text)
    || /^\/[a-z]:[\\/]/i.test(text)
    || isDoubleSlashWindowsAbsolutePath(text)
    || /^\\\\/.test(text)
  )
}

function splitHrefParts(href = '') {
  const raw = String(href || '')
  const hashIndex = raw.indexOf('#')
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw
  const hash = hashIndex >= 0 ? raw.slice(hashIndex + 1) : ''
  const queryIndex = withoutHash.indexOf('?')
  const pathPart = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash
  const queryPart = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : ''
  return {
    pathPart,
    queryPart,
    hashPart: hash,
  }
}

function normalizeProjectRelativePath(filePath = '') {
  const source = normalizeSlashes(String(filePath || '').trim())
  if (!source) return ''
  const segments = source.split('/').filter(Boolean)
  return segments.join('/')
}

function joinProjectAbsolutePath(projectFolder = '', filePath = '') {
  const root = normalizeSlashes(String(projectFolder || '').trim()).replace(/\/+$/, '')
  const relativeFilePath = normalizeProjectRelativePath(filePath)
  if (!root) return ''
  if (!relativeFilePath) return root
  return `${root}/${relativeFilePath}`
}

function dirnameFromPath(filePath = '') {
  const normalized = normalizeSlashes(String(filePath || '').trim()).replace(/\/+$/, '')
  if (!normalized) return ''
  const lastSlashIndex = normalized.lastIndexOf('/')
  return lastSlashIndex > 0 ? normalized.slice(0, lastSlashIndex) : normalized
}

function parseFileLocationFragment(fragment = '') {
  const decoded = safeDecodeURIComponent(fragment || '').trim()
  if (!decoded) return {
    kind: 'none',
    anchor: '',
    line: undefined,
    column: undefined,
  }
  const lineMatch = decoded.match(/^L(\d+)$/i)
  if (lineMatch) {
    return {
      kind: 'line',
      anchor: '',
      line: Math.max(1, Number(lineMatch[1] || 1) || 1),
      column: 1,
    }
  }
  return {
    kind: 'anchor',
    anchor: decoded,
    line: undefined,
    column: undefined,
  }
}

function parseInlinePathLineSuffix(value = '') {
  const decoded = safeDecodeURIComponent(value || '').trim()
  if (!decoded) {
    return {
      path: '',
      line: undefined,
      column: undefined,
    }
  }
  const colonMatch = decoded.match(/^(.*):(\d+)$/)
  if (!colonMatch) {
    return {
      path: decoded,
      line: undefined,
      column: undefined,
    }
  }
  const nextPath = String(colonMatch[1] || '').trim()
  const nextLine = normalizeLineNumber(colonMatch[2])
  if (!nextPath || nextLine === undefined) {
    return {
      path: decoded,
      line: undefined,
      column: undefined,
    }
  }
  return {
    path: nextPath,
    line: nextLine,
    column: 1,
  }
}

function normalizeLineNumber(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 1) return undefined
  return Math.max(1, Math.round(numeric))
}

function normalizeResolvedLocation(line, column) {
  const normalizedLine = normalizeLineNumber(line)
  if (normalizedLine === undefined) {
    return {
      line: undefined,
      column: undefined,
    }
  }
  return {
    line: normalizedLine,
    column: normalizeLineNumber(column) || 1,
  }
}

function looksLikeSupportedRelativeFileReferencePath(filePath = '') {
  const decoded = safeDecodeURIComponent(filePath || '').trim()
  if (!decoded) return false
  if (/\s/.test(decoded)) return false
  if (decoded.includes('\0') || decoded.includes('?') || decoded.includes('#')) return false
  if (decoded.startsWith('/') || decoded.startsWith('//')) return false
  if (isAbsoluteLocalPath(decoded)) return false
  if (hasDisallowedScheme(decoded)) return false
  const normalized = normalizeSlashes(decoded).replace(/\/+$/, '')
  if (!normalized) return false
  const filename = normalized.split('/').pop() || ''
  return /^[^/]+\.[a-z0-9._-]+$/i.test(filename)
}

function parseSupportedFileReferenceText(text = '') {
  const decoded = safeDecodeURIComponent(text || '').trim()
  if (!decoded) return { ok: false, reason: 'empty_href' }

  let candidatePath = decoded
  let line

  const hashMatch = decoded.match(/^(.*)#L(\d+)$/i)
  if (hashMatch) {
    candidatePath = String(hashMatch[1] || '').trim()
    line = normalizeLineNumber(hashMatch[2])
  } else {
    const inlineLocation = parseInlinePathLineSuffix(decoded)
    candidatePath = inlineLocation.path
    line = inlineLocation.line
  }

  if (!looksLikeSupportedRelativeFileReferencePath(candidatePath)) {
    return { ok: false, reason: 'unsupported_file_reference_label' }
  }

  return {
    ok: true,
    href: line ? `${candidatePath}#L${line}` : candidatePath,
  }
}

function resolveAbsoluteProjectFilePath(projectFolder = '', absolutePath = '') {
  const normalizedProjectFolder = normalizeComparablePath(projectFolder)
  const normalizedAbsolutePath = normalizeComparablePath(
    String(absolutePath || '')
      .replace(/^\/\/(?=[a-z]:[\\/])/i, '')
      .replace(/^\/(?=[a-z]:[\\/])/i, ''),
  )
  if (!normalizedAbsolutePath) return { ok: false, reason: 'empty_target_path' }
  if (!normalizedProjectFolder) return { ok: false, reason: 'missing_project_context' }

  const comparableProjectFolder = normalizedProjectFolder.toLowerCase()
  const comparableAbsolutePath = normalizedAbsolutePath.toLowerCase()

  if (comparableAbsolutePath === comparableProjectFolder) {
    return { ok: false, reason: 'path_not_allowed' }
  }

  const projectPrefix = `${comparableProjectFolder}/`
  if (!comparableAbsolutePath.startsWith(projectPrefix)) {
    return { ok: false, reason: 'path_not_allowed' }
  }

  const filePath = normalizeProjectRelativePath(normalizedAbsolutePath.slice(normalizedProjectFolder.length + 1))
  if (!filePath) return { ok: false, reason: 'empty_target_path' }
  return { ok: true, filePath }
}

function resolveProjectFileTarget({
  targetPath = '',
  currentFilePath = '',
  projectFolder = '',
} = {}) {
  const decodedPath = safeDecodeURIComponent(targetPath || '')
  const normalizedProjectFolder = normalizeComparablePath(projectFolder)
  const normalizedDecodedPath = normalizeComparablePath(decodedPath)
  const normalizedCurrent = normalizeProjectRelativePath(currentFilePath)
  const currentSegments = normalizedCurrent ? normalizedCurrent.split('/') : []
  const baseSegments = decodedPath.startsWith('/')
    ? []
    : currentSegments.slice(0, Math.max(0, currentSegments.length - 1))

  if (decodedPath.startsWith('/') && hasDisallowedScheme(decodedPath.slice(1)) && !isWindowsDriveAbsolutePath(decodedPath.slice(1))) {
    return { ok: false, reason: 'unsafe_href' }
  }
  if (decodedPath.startsWith('//') && !isDoubleSlashWindowsAbsolutePath(decodedPath)) {
    return { ok: false, reason: 'unsafe_href' }
  }
  if (hasDisallowedScheme(decodedPath) && !isWindowsDriveAbsolutePath(decodedPath)) {
    return { ok: false, reason: 'unsafe_href' }
  }

  const isPosixAbsoluteWithinProject = !!(
    normalizedProjectFolder
    && normalizedDecodedPath
    && normalizedProjectFolder.startsWith('/')
    && (
      normalizedDecodedPath === normalizedProjectFolder
      || normalizedDecodedPath.startsWith(`${normalizedProjectFolder}/`)
    )
  )

  return (isAbsoluteLocalPath(decodedPath) || isPosixAbsoluteWithinProject)
    ? resolveAbsoluteProjectFilePath(projectFolder, decodedPath)
    : joinAndNormalizeRelativePath(
        baseSegments,
        decodedPath.startsWith('/') ? decodedPath.replace(/^\/+/, '') : decodedPath,
      )
}

function buildResolvedProjectFileLink({
  filePath = '',
  projectFolder = '',
  anchor = '',
  line = undefined,
  column = undefined,
} = {}) {
  const absolutePath = joinProjectAbsolutePath(projectFolder, filePath)
  const directoryPath = dirnameFromPath(absolutePath)
  const normalizedLocation = normalizeResolvedLocation(line, column)

  return {
    ok: true,
    kind: 'file',
    filePath,
    absolutePath,
    directoryPath,
    anchor: String(anchor || '').trim(),
    line: normalizedLocation.line,
    column: normalizedLocation.column,
  }
}

function joinAndNormalizeRelativePath(baseSegments = [], incomingPath = '') {
  const candidate = normalizeSlashes(incomingPath)
  const normalizedCandidate = safeDecodeURIComponent(candidate)
  if (!normalizedCandidate) return { ok: false, reason: 'empty_target_path' }
  if (normalizedCandidate.includes('\0')) return { ok: false, reason: 'invalid_character' }
  if (isAbsoluteLocalPath(normalizedCandidate)) return { ok: false, reason: 'absolute_local_path_disallowed' }

  const rawSegments = normalizedCandidate.split('/')
  const next = [...baseSegments]
  for (const rawSegment of rawSegments) {
    const segment = String(rawSegment || '').trim()
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (next.length === 0) return { ok: false, reason: 'path_escapes_project_root' }
      next.pop()
      continue
    }
    next.push(segment)
  }

  if (next.length === 0) return { ok: false, reason: 'empty_target_path' }
  return { ok: true, filePath: next.join('/') }
}

export function sanitizePreviewHref(href = '') {
  const raw = String(href || '').trim()
  if (!raw) return '#'
  if (raw.startsWith('#')) return raw
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('//') && !isDoubleSlashWindowsAbsolutePath(raw)) return '#'
  if (hasDisallowedScheme(raw) && !isWindowsDriveAbsolutePath(raw)) return '#'
  return raw
}

export function isExternalHttpHref(href = '') {
  return /^https?:\/\//i.test(String(href || '').trim())
}

export function isSupportedPreviewImageSrc(src = '') {
  const raw = String(src || '').trim()
  if (!raw) return false
  return /^https?:\/\//i.test(raw) || /^data:/i.test(raw) || /^blob:/i.test(raw)
}

export function resolveWorkspaceRelativeMarkdownHref({ href = '', currentFilePath = '' } = {}) {
  const rawHref = String(href || '').trim()
  if (!rawHref) return { ok: false, reason: 'empty_href' }

  const sanitizedHref = sanitizePreviewHref(rawHref)
  if (sanitizedHref === '#' && rawHref !== '#') {
    return { ok: false, reason: 'unsafe_href' }
  }

  if (isExternalHttpHref(sanitizedHref)) {
    return { ok: true, kind: 'external', href: sanitizedHref }
  }

  if (sanitizedHref.startsWith('#')) {
    return {
      ok: true,
      kind: 'anchor',
      anchor: safeDecodeURIComponent(sanitizedHref.slice(1)),
    }
  }

  const { pathPart, hashPart } = splitHrefParts(sanitizedHref)
  let decodedPath = safeDecodeURIComponent(pathPart || '')
  let location = parseFileLocationFragment(hashPart)
  if (location.kind === 'none') {
    const inlineLocation = parseInlinePathLineSuffix(decodedPath)
    decodedPath = inlineLocation.path
    if (inlineLocation.line !== undefined) {
      location = {
        kind: 'line',
        anchor: '',
        line: inlineLocation.line,
        column: inlineLocation.column,
      }
    }
  }
  const normalizedCurrent = normalizeProjectRelativePath(currentFilePath)
  const currentSegments = normalizedCurrent ? normalizedCurrent.split('/') : []
  const baseSegments = decodedPath.startsWith('/')
    ? []
    : currentSegments.slice(0, Math.max(0, currentSegments.length - 1))

  if (decodedPath.startsWith('/') && hasDisallowedScheme(decodedPath.slice(1))) {
    return { ok: false, reason: 'unsafe_href' }
  }
  if (decodedPath.startsWith('//') && !isDoubleSlashWindowsAbsolutePath(decodedPath)) {
    return { ok: false, reason: 'unsafe_href' }
  }
  if (hasDisallowedScheme(decodedPath) && !isWindowsDriveAbsolutePath(decodedPath)) {
    return { ok: false, reason: 'unsafe_href' }
  }

  const targetResult = isAbsoluteLocalPath(decodedPath)
    ? { ok: false, reason: 'absolute_local_path_disallowed' }
    : joinAndNormalizeRelativePath(
        baseSegments,
        decodedPath.startsWith('/') ? decodedPath.replace(/^\/+/, '') : decodedPath,
      )
  if (!targetResult.ok) return targetResult

  return {
    ok: true,
    kind: 'file',
    filePath: targetResult.filePath,
    anchor: location.kind === 'anchor' ? location.anchor : '',
    line: location.kind === 'line' ? location.line : undefined,
    column: location.kind === 'line' ? location.column : undefined,
  }
}

export function resolveProjectMarkdownLink({
  href = '',
  currentFilePath = '',
  projectFolder = '',
} = {}) {
  const rawHref = String(href || '').trim()
  if (!rawHref) return { ok: false, reason: 'empty_href' }

  const sanitizedHref = sanitizePreviewHref(rawHref)
  if (sanitizedHref === '#' && rawHref !== '#') {
    return { ok: false, reason: 'unsafe_href' }
  }

  if (isExternalHttpHref(sanitizedHref)) {
    return { ok: true, kind: 'external', href: sanitizedHref }
  }

  if (sanitizedHref.startsWith('#')) {
    return {
      ok: true,
      kind: 'anchor',
      anchor: safeDecodeURIComponent(sanitizedHref.slice(1)),
    }
  }

  const { pathPart, hashPart } = splitHrefParts(sanitizedHref)
  let decodedPath = safeDecodeURIComponent(pathPart || '')
  let location = parseFileLocationFragment(hashPart)
  if (location.kind === 'none') {
    const inlineLocation = parseInlinePathLineSuffix(decodedPath)
    decodedPath = inlineLocation.path
    if (inlineLocation.line !== undefined) {
      location = {
        kind: 'line',
        anchor: '',
        line: inlineLocation.line,
        column: inlineLocation.column,
      }
    }
  }
  const targetResult = resolveProjectFileTarget({
    targetPath: decodedPath,
    currentFilePath,
    projectFolder,
  })
  if (!targetResult.ok) return targetResult

  return buildResolvedProjectFileLink({
    filePath: targetResult.filePath,
    projectFolder,
    anchor: location.kind === 'anchor' ? location.anchor : '',
    line: location.kind === 'line' ? location.line : undefined,
    column: location.kind === 'line' ? location.column : undefined,
  })
}

export function resolveProjectFileReference({
  href = '',
  label = '',
  filePath = '',
  line = undefined,
  column = undefined,
  currentFilePath = '',
  projectFolder = '',
} = {}) {
  const rawHref = String(href || '').trim()
  if (rawHref) {
    return resolveProjectMarkdownLink({
      href: rawHref,
      currentFilePath,
      projectFolder,
    })
  }

  const rawFilePath = String(filePath || '').trim()
  if (rawFilePath) {
    if (line === undefined && column === undefined) {
      const recoveredFilePath = parseSupportedFileReferenceText(rawFilePath)
      if (recoveredFilePath.ok) {
        return resolveProjectMarkdownLink({
          href: recoveredFilePath.href,
          currentFilePath,
          projectFolder,
        })
      }
    }

    const inlineLocation = parseInlinePathLineSuffix(rawFilePath)
    const targetResult = resolveProjectFileTarget({
      targetPath: inlineLocation.path,
      currentFilePath,
      projectFolder,
    })
    if (!targetResult.ok) return targetResult
    return buildResolvedProjectFileLink({
      filePath: targetResult.filePath,
      projectFolder,
      line: line ?? inlineLocation.line,
      column: column ?? inlineLocation.column,
    })
  }

  const recovered = parseSupportedFileReferenceText(label)
  if (recovered.ok) {
    return resolveProjectMarkdownLink({
      href: recovered.href,
      currentFilePath,
      projectFolder,
    })
  }

  return { ok: false, reason: recovered.reason || 'empty_href' }
}

export function slugifyMarkdownHeading(text = '') {
  const source = String(text || '').trim().toLowerCase()
  if (!source) return 'section'
  const normalized = source
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
  return normalized || 'section'
}
