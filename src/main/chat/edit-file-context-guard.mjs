const INSPECTION_TOOL_NAMES = new Set(['read_file', 'view_file_range'])

export function normalizeToolPathForEditGuard(rawPath = '', platform = process.platform) {
  const trimmed = String(rawPath ?? '').trim()
  if (!trimmed) return ''
  const normalized = trimmed
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/')
  return platform === 'win32' ? normalized.toLowerCase() : normalized
}

export function shouldBlockEditFileWithoutInspection({
  toolName = '',
  toolInput = {},
  inspectedPaths = new Set(),
  platform = process.platform,
} = {}) {
  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  if (normalizedToolName !== 'edit_file') {
    return { blocked: false, normalizedPath: '', message: '' }
  }

  const normalizedPath = normalizeToolPathForEditGuard(toolInput?.path || '', platform)
  if (!normalizedPath || inspectedPaths.has(normalizedPath)) {
    return { blocked: false, normalizedPath, message: '' }
  }

  const displayPath = String(toolInput?.path || '').trim() || normalizedPath
  return {
    blocked: true,
    normalizedPath,
    message:
      `Tool call blocked: edit_file requires a prior read_file or view_file_range for ${displayPath} in this turn. `
      + 'Read the file first, then retry edit_file with exact old_text from the current file content.',
  }
}

export function recordInspectedPathForTurn({
  toolName = '',
  toolInput = {},
  decision = 'denied',
  isError = false,
  inspectedPaths = new Set(),
  platform = process.platform,
} = {}) {
  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  if (!INSPECTION_TOOL_NAMES.has(normalizedToolName)) return ''
  if (decision !== 'approved' || isError) return ''

  const normalizedPath = normalizeToolPathForEditGuard(toolInput?.path || '', platform)
  if (!normalizedPath) return ''
  inspectedPaths.add(normalizedPath)
  return normalizedPath
}
