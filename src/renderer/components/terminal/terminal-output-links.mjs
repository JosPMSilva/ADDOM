import {
  normalizeEditorFilePath,
  normalizeEditorProjectFolder,
  resolveWorkspaceRelativeFilePath,
} from '../../store/editor-model-registry.js'

const FILE_REFERENCE_PATTERN = /(^|[\s([{"'`])((?:(?:[A-Za-z]:[\\/])|(?:\/)|(?:\.{1,2}[\\/])|(?:[A-Za-z0-9_@.-]+[\\/]))[^\s"'<>|()[\]{};,]*?[A-Za-z0-9_@.-]+\.[A-Za-z0-9]{1,12}(?::\d{1,7}){0,2}|[A-Za-z0-9_@.-]+\.[A-Za-z0-9]{1,12}(?::\d{1,7}){1,2})/g

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function normalizePositiveLocation(value = '', fallback = 1) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 1) return fallback
  return Math.round(numeric)
}

function splitFileLocation(reference = '') {
  const raw = asTrimmedString(reference)
  const locationMatch = raw.match(/^(.*?)(?::(\d{1,7})(?::(\d{1,7}))?)$/)
  if (!locationMatch) {
    return { filePath: raw, line: 1, column: 1 }
  }
  return {
    filePath: asTrimmedString(locationMatch[1]),
    line: normalizePositiveLocation(locationMatch[2], 1),
    column: normalizePositiveLocation(locationMatch[3], 1),
  }
}

function isAbsoluteFilePath(filePath = '') {
  const normalized = asTrimmedString(filePath)
  return /^[A-Za-z]:[\\/]/.test(normalized) || normalized.startsWith('/')
}

export function resolveTerminalWorkspaceFileReference(reference = '', projectFolder = '') {
  const normalizedProjectFolder = normalizeEditorProjectFolder(projectFolder)
  if (!normalizedProjectFolder) return null

  const { filePath, line, column } = splitFileLocation(reference)
  if (!filePath || /:\/\//.test(filePath)) return null

  if (isAbsoluteFilePath(filePath)) {
    const normalizedAbsolutePath = normalizeEditorFilePath(filePath)
    const projectPrefix = `${normalizedProjectFolder}/`
    if (!normalizedAbsolutePath.startsWith(projectPrefix)) return null
    const relativePath = normalizedAbsolutePath.slice(projectPrefix.length)
    if (!relativePath) return null
    return { filePath: relativePath, line, column }
  }

  const relativePath = resolveWorkspaceRelativeFilePath(normalizedProjectFolder, filePath)
  if (!relativePath) return null
  return { filePath: relativePath, line, column }
}

export function findTerminalWorkspaceFileLinks(lineText = '', projectFolder = '') {
  const text = String(lineText || '')
  const links = []
  for (const match of text.matchAll(FILE_REFERENCE_PATTERN)) {
    const prefix = String(match[1] || '')
    const reference = String(match[2] || '')
    const resolved = resolveTerminalWorkspaceFileReference(reference, projectFolder)
    if (!resolved) continue
    links.push({
      ...resolved,
      text: reference,
      startIndex: Number(match.index || 0) + prefix.length,
      endIndex: Number(match.index || 0) + prefix.length + reference.length,
    })
  }
  return links
}

export function createTerminalWorkspaceLinkProvider({
  terminal = null,
  getProjectFolder = null,
  onOpenWorkspaceFileLink = null,
} = {}) {
  return {
    provideLinks(bufferLineNumber, callback) {
      const line = terminal?.buffer?.active?.getLine?.(bufferLineNumber)
      const lineText = typeof line?.translateToString === 'function'
        ? line.translateToString(true)
        : ''
      const projectFolder = typeof getProjectFolder === 'function' ? getProjectFolder() : ''
      const links = findTerminalWorkspaceFileLinks(lineText, projectFolder).map((link) => ({
        range: {
          start: { x: link.startIndex + 1, y: bufferLineNumber + 1 },
          end: { x: link.endIndex + 1, y: bufferLineNumber + 1 },
        },
        text: link.text,
        decorations: {
          pointerCursor: true,
          underline: true,
        },
        activate() {
          onOpenWorkspaceFileLink?.({
            filePath: link.filePath,
            line: link.line,
            column: link.column,
            text: link.text,
          })
        },
      }))
      callback(links.length > 0 ? links : undefined)
    },
  }
}
