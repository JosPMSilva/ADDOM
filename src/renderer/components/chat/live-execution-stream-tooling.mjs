import { stripAnsiControlSequences } from './ansi-output.mjs'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function resolveActivity(event = {}) {
  return event?.activity && typeof event.activity === 'object' ? event.activity : {}
}

function resolveEventKind(event = {}) {
  const activity = resolveActivity(event)
  return normalizeLower(activity?.eventKind || event?.eventKind)
}

function resolveToolName(event = {}) {
  const activity = resolveActivity(event)
  return normalizeText(activity?.toolName || event?.toolName)
}

function resolveToolInput(event = {}) {
  const activity = resolveActivity(event)
  return activity?.toolInput && typeof activity.toolInput === 'object' ? activity.toolInput : {}
}

function resolveTerminalSessionPayload(event = {}) {
  const activity = resolveActivity(event)
  return activity?.terminalSession && typeof activity.terminalSession === 'object'
    ? activity.terminalSession
    : {}
}

export function resolveTerminalSessionLabel(event = {}) {
  const terminalSession = resolveTerminalSessionPayload(event)
  const toolInput = resolveToolInput(event)
  return normalizeText(terminalSession?.displayName || terminalSession?.sessionId || toolInput?.sessionId || '')
}

function resolveTerminalSurfaceLabel(surface = '') {
  const normalizedSurface = normalizeLower(surface)
  if (normalizedSurface === 'chat_dock') return 'Chat dock'
  if (normalizedSurface === 'terminal_panel') return 'Terminal browser'
  return ''
}

export function normalizePathLabel(value = '') {
  const normalized = normalizeText(value).replace(/\\/g, '/')
  if (!normalized) return ''
  if (normalized === '.') return 'project root'
  if (normalized.startsWith('./')) return normalized.slice(2)
  return normalized
}

function truncateText(value = '', max = 96) {
  const text = normalizeText(value).replace(/\s+/g, ' ')
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`
}

function truncatePreviewLine(value = '', max = 160) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`
}

export function resolvePathTarget(event = {}) {
  const activity = resolveActivity(event)
  const toolInput = resolveToolInput(event)
  return normalizePathLabel(activity?.fileChange?.filePath || toolInput?.path || '')
}

export function resolveRenameTargets(event = {}) {
  const toolInput = resolveToolInput(event)
  const oldPath = normalizePathLabel(toolInput?.old_path || resolveActivity(event)?.oldPath || '')
  const newPath = normalizePathLabel(toolInput?.new_path || resolveActivity(event)?.newPath || '')
  return { oldPath, newPath }
}

export function resolveUrlLabel(rawUrl = '') {
  const value = normalizeText(rawUrl)
  if (!value) return ''
  try {
    const parsed = new URL(value)
    const pathname = normalizeText(parsed.pathname || '')
    if (!pathname || pathname === '/') return parsed.hostname
    const shortPath = pathname.length <= 24 ? pathname : ''
    return shortPath ? `${parsed.hostname}${shortPath}` : parsed.hostname
  } catch {
    return value
  }
}

export function resolveDirectoryCount(event = {}) {
  const detail = normalizeText(event?.detail || resolveActivity(event)?.result || '')
  const match = detail.match(/Showing\s+(\d+)\s+entr(?:y|ies)\b/i)
  if (!match) return null
  return Number(match[1] || 0) || null
}

export function resolveSearchCount(event = {}) {
  const detail = normalizeText(event?.detail || resolveActivity(event)?.result || '')
  const match = detail.match(/Showing\s+(\d+)\s+match(?:\(es\)|es?)/i)
  if (!match) return null
  return Number(match[1] || 0) || null
}

export function resolveCommandScope(event = {}) {
  const toolInput = resolveToolInput(event)
  return normalizePathLabel(toolInput?.cwd || '.') || 'project root'
}

export function resolveCommandText(event = {}, sessionMeta = null) {
  const toolInput = resolveToolInput(event)
  return truncateText(toolInput?.command || sessionMeta?.commandText || '', 160)
}

export function resolveSearchQuery(event = {}) {
  const toolInput = resolveToolInput(event)
  return normalizeText(toolInput?.query || '')
}

export function resolveRawResultText(event = {}) {
  const activity = resolveActivity(event)
  return stripAnsiControlSequences(String(event?.detail || activity?.result || '')).trim()
}

function splitNonEmptyLines(text = '') {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
}

function takePreviewLines(lines = [], limit = 3, { truncate = true } = {}) {
  const preview = []
  for (const line of Array.isArray(lines) ? lines : []) {
    const trimmed = truncate
      ? truncatePreviewLine(line)
      : String(line || '').trimEnd()
    if (!trimmed) continue
    preview.push(trimmed)
    if (preview.length >= limit) break
  }
  return preview
}

function getShellPreviewLines(sessionMeta = null, event = {}) {
  const stdout = String(
    sessionMeta?.outputByStream?.stdout
    || sessionMeta?.persistedPreviewByStream?.stdout
    || '',
  ).trim()
  const stderr = String(
    sessionMeta?.outputByStream?.stderr
    || sessionMeta?.persistedPreviewByStream?.stderr
    || '',
  ).trim()
  const source = stdout || stderr || resolveRawResultText(event)
  return splitNonEmptyLines(source)
}

function parseListDirectoryPreviewLines(event = {}) {
  const lines = splitNonEmptyLines(resolveRawResultText(event))
  return lines.filter((line) => /^\[(file|dir)\]\s+/i.test(line))
}

function parseReadPreviewLines(event = {}) {
  const toolName = resolveToolName(event)
  const lines = splitNonEmptyLines(resolveRawResultText(event))
  if (toolName === 'view_file_range') {
    return lines.filter((line, index) => index > 0)
  }
  return lines
}

function parseSearchPreviewLines(event = {}) {
  const lines = splitNonEmptyLines(resolveRawResultText(event))
  return lines.filter((line, index) => index > 0 && !line.startsWith('[More '))
}

function parseGrepPreviewLines(event = {}) {
  const lines = splitNonEmptyLines(resolveRawResultText(event))
  return lines.filter((line, index) => index > 0 && line !== '---')
}

function parseFindFilesPreviewLines(event = {}) {
  const lines = splitNonEmptyLines(resolveRawResultText(event))
  return lines.filter((line, index) => index > 0 && /^\[(file|dir)\]\s+/i.test(line))
}

function parseGitStatusPreviewLines(event = {}) {
  return splitNonEmptyLines(resolveRawResultText(event))
}

function parseGitDiffPreviewLines(event = {}) {
  const lines = splitNonEmptyLines(resolveRawResultText(event))
  const preferred = lines.filter((line) => (
    line.startsWith('diff --git ')
    || line.startsWith('--- ')
    || line.startsWith('+++ ')
    || line.startsWith('@@ ')
    || line.startsWith('@@@ ')
  ))
  return preferred.length > 0 ? preferred : lines
}

function parseGitLogPreviewLines(event = {}) {
  return splitNonEmptyLines(resolveRawResultText(event))
}

function parseGenericResultPreviewLines(event = {}) {
  return splitNonEmptyLines(resolveRawResultText(event))
}

function buildGitCommandPreview(toolName = '', toolInput = {}) {
  const pathLabel = normalizePathLabel(toolInput?.path || '.')
  if (toolName === 'git_status') {
    const parts = ['git status']
    if (toolInput?.short !== false) parts.push('--short', '--branch')
    if (toolInput?.show_untracked === false) parts.push('--untracked-files=no')
    if (pathLabel && pathLabel !== 'project root') parts.push('--', pathLabel)
    return parts.join(' ')
  }
  if (toolName === 'git_diff') {
    const contextLines = Number(toolInput?.context_lines ?? 3) || 3
    const parts = ['git diff', `--unified=${contextLines}`]
    if (toolInput?.staged) parts.push('--staged')
    if (pathLabel && pathLabel !== 'project root') parts.push('--', pathLabel)
    return parts.join(' ')
  }
  if (toolName === 'git_log') {
    const maxCount = Number(toolInput?.max_count ?? 20) || 20
    const parts = ['git log', `--max-count=${maxCount}`, '--date=short', '--pretty=format:%h %ad %s (%an)']
    if (pathLabel && pathLabel !== 'project root') parts.push('--', pathLabel)
    return parts.join(' ')
  }
  if (toolName === 'git_commit') {
    const message = truncateText(toolInput?.message_preview || '', 80)
    const rawPaths = Array.isArray(toolInput?.paths) ? toolInput.paths.map(normalizePathLabel).filter(Boolean) : []
    if (toolInput?.add_all) return `git add --all && git commit -m "${message || '...'}"`
    if (rawPaths.length > 0) return `git add -- ${rawPaths.join(' ')} && git commit -m "${message || '...'}"`
    return `git commit -m "${message || '...'}"`
  }
  if (toolName === 'git_checkout_file') {
    const pathValue = normalizePathLabel(toolInput?.path || '')
    const refValue = normalizeText(toolInput?.ref || 'HEAD') || 'HEAD'
    return pathValue ? `git restore --source=${refValue} -- ${pathValue}` : `git restore --source=${refValue}`
  }
  return ''
}

function resolveToolPreviewLines(toolName = '', event = {}, sessionMeta = null) {
  const terminalSession = resolveTerminalSessionPayload(event)
  if (toolName.startsWith('terminal_session_')) {
    const outputPreview = normalizeText(terminalSession?.outputPreview || '')
    return outputPreview ? splitNonEmptyLines(outputPreview) : []
  }
  if (toolName === 'run_command' || toolName === 'local_shell') {
    return getShellPreviewLines(sessionMeta, event)
  }
  if (toolName === 'list_directory') return parseListDirectoryPreviewLines(event)
  if (toolName === 'read_file' || toolName === 'view_file_range') return parseReadPreviewLines(event)
  if (toolName === 'search_code') return parseSearchPreviewLines(event)
  if (toolName === 'grep_file') return parseGrepPreviewLines(event)
  if (toolName === 'find_files') return parseFindFilesPreviewLines(event)
  if (toolName === 'git_status') return parseGitStatusPreviewLines(event)
  if (toolName === 'git_diff') return parseGitDiffPreviewLines(event)
  if (toolName === 'git_log') return parseGitLogPreviewLines(event)
  if (toolName === 'git_commit' || toolName === 'git_checkout_file') return parseGenericResultPreviewLines(event)
  if (toolName === 'fetch_page' || toolName === 'browser_action' || toolName === 'apply_artifact_revision') return parseGenericResultPreviewLines(event)
  if (toolName === 'edit_file') {
    const toolInput = resolveToolInput(event)
    const lines = []
    const oldPreview = normalizeText(toolInput?.old_text_preview || '')
    const newPreview = normalizeText(toolInput?.new_text_preview || '')
    if (oldPreview) lines.push(`old: ${truncatePreviewLine(oldPreview)}`)
    if (newPreview) lines.push(`new: ${truncatePreviewLine(newPreview)}`)
    return lines
  }
  return parseGenericResultPreviewLines(event)
}

function buildPreviewPayload(lines = []) {
  const expanded = takePreviewLines(lines, 80, { truncate: false })
  const preview = takePreviewLines(expanded, 3, { truncate: true })
  const collapsible = expanded.length > preview.length || expanded.some((line) => line.length > 160)
  return {
    preview,
    previewExpanded: collapsible ? expanded : preview,
    previewCollapsible: collapsible,
  }
}

export function resolveToolCopy(toolName = '', phase = 'start') {
  const normalized = normalizeLower(toolName)
  const fallbackName = normalizeText(toolName).replace(/[_-]+/g, ' ').trim()
  if (!fallbackName) return ''
  if (normalized === 'terminal_session_open') return phase === 'start' ? 'Opening terminal' : 'Opened terminal'
  if (normalized === 'terminal_session_read_snapshot') return phase === 'start' ? 'Reading terminal output' : 'Read terminal output'
  if (normalized === 'terminal_session_attach') return phase === 'start' ? 'Reusing terminal session' : 'Terminal session reused'
  if (normalized === 'terminal_session_write') return phase === 'start' ? 'Writing to terminal' : 'Wrote to terminal'
  if (normalized === 'terminal_session_wait_for_output') return phase === 'start' ? 'Waiting for terminal output' : 'Terminal wait completed'
  if (normalized === 'terminal_session_resize') return phase === 'start' ? 'Resizing terminal session' : 'Terminal session resized'
  if (normalized === 'terminal_session_signal') return phase === 'start' ? 'Signaling terminal session' : 'Terminal session signaled'
  if (normalized === 'terminal_session_close') return phase === 'start' ? 'Closing terminal' : 'Closed terminal'
  if (normalized === 'run_command' || normalized === 'local_shell') {
    if (phase === 'start') return 'Running command'
    if (phase === 'failed') return 'Command failed'
    if (phase === 'denied') return 'Command denied'
    return 'Command finished'
  }
  if (normalized === 'list_directory') return phase === 'start' ? 'Listing files' : 'Listed files'
  if (normalized === 'read_file' || normalized === 'view_file_range') return phase === 'start' ? 'Reading file' : 'Read file'
  if (normalized === 'write_file') return phase === 'start' ? 'Writing file' : 'File written'
  if (normalized === 'edit_file') return phase === 'start' ? 'Updating file' : 'File updated'
  if (normalized === 'create_directory') return phase === 'start' ? 'Creating folder' : 'Folder created'
  if (normalized === 'delete_file') return phase === 'start' ? 'Deleting file' : 'File deleted'
  if (normalized === 'rename_file') return phase === 'start' ? 'Renaming file' : 'File renamed'
  if (normalized === 'rollback_file') return phase === 'start' ? 'Rolling back file' : 'File rolled back'
  if (normalized === 'search_code') return phase === 'start' ? 'Searching files' : 'Search completed'
  if (normalized === 'grep_file') return phase === 'start' ? 'Searching file' : 'Search completed'
  if (normalized === 'find_files') return phase === 'start' ? 'Finding files' : 'Files found'
  if (normalized === 'git_status') return 'Git status'
  if (normalized === 'git_diff') return 'Git diff'
  if (normalized === 'git_log') return 'Git log'
  if (normalized === 'git_commit') return phase === 'start' ? 'Creating commit' : 'Commit created'
  if (normalized === 'git_checkout_file') return phase === 'start' ? 'Restoring file' : 'File restored'
  if (normalized === 'fetch_page') return phase === 'start' ? 'Fetching page' : 'Page fetched'
  if (normalized === 'browser_action') return phase === 'start' ? 'Running browser action' : 'Browser action complete'
  if (normalized === 'apply_artifact_revision') return phase === 'start' ? 'Applying revision' : 'Revision applied'
  if (phase === 'start') return `${fallbackName[0].toUpperCase()}${fallbackName.slice(1)}`
  if (phase === 'failed') return `${fallbackName[0].toUpperCase()}${fallbackName.slice(1)} failed`
  if (phase === 'denied') return `${fallbackName[0].toUpperCase()}${fallbackName.slice(1)} denied`
  return `${fallbackName[0].toUpperCase()}${fallbackName.slice(1)} done`
}

export function resolveRowDetail(event = {}, rowType = '', sessionMeta = null) {
  const toolName = resolveToolName(event)
  const toolInput = resolveToolInput(event)
  const pathLabel = resolvePathTarget(event)
  const terminalSession = resolveTerminalSessionPayload(event)
  if (rowType === 'warning' || rowType === 'error') {
    return normalizeText(event?.detail)
  }
  if (toolName.startsWith('terminal_session_')) {
    const sessionId = normalizeText(terminalSession?.sessionId || toolInput?.sessionId || '')
    const displayName = normalizeText(terminalSession?.displayName || sessionId || '')
    const cwd = normalizePathLabel(terminalSession?.cwd || toolInput?.cwd || toolInput?.workdir || '')
    const shell = normalizeText(terminalSession?.shell || terminalSession?.shellKind || toolInput?.shell || '')
    const size = (
      Number(terminalSession?.cols || toolInput?.cols || 0) > 0
      && Number(terminalSession?.rows || toolInput?.rows || 0) > 0
    )
      ? `${Number(terminalSession?.cols || toolInput?.cols || 0)}x${Number(terminalSession?.rows || toolInput?.rows || 0)}`
      : ''
    const signal = normalizeText(terminalSession?.signal || toolInput?.signal || '')
    const sinceSequence = Number(terminalSession?.sinceSequence || toolInput?.sinceSequence || 0) || 0
    const inputBytes = Number(terminalSession?.inputBytes || 0) || 0
    return [
      displayName && displayName !== sessionId ? `label: ${displayName}` : '',
      sessionId ? `session: ${sessionId}` : '',
      cwd ? `cwd: ${cwd}` : '',
      shell ? `shell: ${shell}` : '',
      size ? `size: ${size}` : '',
      signal ? `signal: ${signal}` : '',
      sinceSequence > 0 ? `since: ${sinceSequence}` : '',
      inputBytes > 0 ? `bytes: ${inputBytes}` : '',
      resolveTerminalSurfaceLabel(terminalSession?.liveSurface || '')
        ? `surface: ${resolveTerminalSurfaceLabel(terminalSession?.liveSurface || '')}`
        : '',
      terminalSession?.userTakeoverAvailable === true ? 'takeover: available' : '',
    ].filter(Boolean).join(' | ')
  }
  if (toolName === 'run_command' || toolName === 'local_shell') {
    const command = resolveCommandText(event, sessionMeta)
    const cwd = resolveCommandScope(event)
    const shell = normalizeText(toolInput?.shell || 'auto') || 'auto'
    return [command, `cwd: ${cwd} | shell: ${shell}`].filter(Boolean).join('\n')
  }
  if (toolName.startsWith('git_')) {
    return buildGitCommandPreview(toolName, toolInput)
  }
  if (toolName === 'list_directory') {
    const extras = []
    if (pathLabel) extras.push(`path: ${pathLabel}`)
    if (toolInput?.depth != null) extras.push(`depth: ${Number(toolInput.depth || 0) || 1}`)
    if (toolInput?.limit != null) extras.push(`limit: ${Number(toolInput.limit || 0) || 200}`)
    return extras.join(' | ')
  }
  if (toolName === 'read_file') {
    return pathLabel ? `path: ${pathLabel}` : ''
  }
  if (toolName === 'view_file_range') {
    const start = Number(toolInput?.start_line || 1) || 1
    const end = Number(toolInput?.end_line || start) || start
    return [`path: ${pathLabel}`, `lines: ${start}-${end}`].filter(Boolean).join(' | ')
  }
  if (toolName === 'write_file' || toolName === 'create_directory' || toolName === 'delete_file' || toolName === 'rollback_file') {
    const lines = []
    if (pathLabel) lines.push(`path: ${pathLabel}`)
    const revisionId = normalizeText(toolInput?.revision_id || '')
    if (revisionId) lines.push(`revision: ${revisionId}`)
    return lines.join(' | ')
  }
  if (toolName === 'edit_file') {
    return pathLabel ? `path: ${pathLabel}` : ''
  }
  if (toolName === 'rename_file') {
    const { oldPath, newPath } = resolveRenameTargets(event)
    return [oldPath ? `from: ${oldPath}` : '', newPath ? `to: ${newPath}` : ''].filter(Boolean).join(' | ')
  }
  if (toolName === 'search_code') {
    const query = resolveSearchQuery(event)
    return [`query: "${query}"`, pathLabel ? `path: ${pathLabel}` : ''].filter(Boolean).join(' | ')
  }
  if (toolName === 'grep_file') {
    const pattern = normalizeText(toolInput?.pattern || '')
    const ctx = Number(toolInput?.context_lines || 0) || 0
    return [
      pathLabel ? `path: ${pathLabel}` : '',
      pattern ? `pattern: "${pattern}"` : '',
      ctx > 0 ? `context: ${ctx}` : '',
    ].filter(Boolean).join(' | ')
  }
  if (toolName === 'find_files') {
    const pattern = normalizeText(toolInput?.pattern || '')
    const type = normalizeText(toolInput?.type || 'file')
    return [
      pattern ? `pattern: "${pattern}"` : '',
      pathLabel ? `path: ${pathLabel}` : '',
      type ? `type: ${type}` : '',
    ].filter(Boolean).join(' | ')
  }
  if (toolName === 'fetch_page') {
    const url = resolveUrlLabel(toolInput?.url || '')
    return url ? `url: ${url}` : ''
  }
  if (toolName === 'browser_action') {
    const action = normalizeText(toolInput?.action || '').toLowerCase()
    const lines = [
      action ? `action: ${action}` : '',
      toolInput?.url ? `url: ${resolveUrlLabel(toolInput.url)}` : '',
      toolInput?.selector ? `selector: ${normalizeText(toolInput.selector)}` : '',
      toolInput?.query ? `query: ${truncateText(toolInput.query, 80)}` : '',
      toolInput?.mode ? `mode: ${normalizeText(toolInput.mode)}` : '',
      toolInput?.label ? `label: ${normalizeText(toolInput.label)}` : '',
      toolInput?.level ? `level: ${normalizeText(toolInput.level)}` : '',
      toolInput?.status ? `status: ${normalizeText(toolInput.status)}` : '',
      toolInput?.type || toolInput?.resource_type ? `type: ${normalizeText(toolInput.type || toolInput.resource_type)}` : '',
      toolInput?.element_index != null ? `element: ${normalizeText(toolInput.element_index)}` : '',
      toolInput?.limit != null ? `limit: ${normalizeText(toolInput.limit)}` : '',
    ].filter(Boolean)
    return lines.join(' | ')
  }
  if (toolName === 'apply_artifact_revision') {
    const revisionId = normalizeText(toolInput?.revision_id || '')
    const reason = truncateText(toolInput?.reason || '', 120)
    return [
      revisionId ? `revision: ${revisionId}` : '',
      reason ? `reason: ${reason}` : '',
    ].filter(Boolean).join(' | ')
  }
  const genericParts = Object.entries(toolInput || {})
    .map(([key, value]) => {
      if (value == null) return ''
      if (Array.isArray(value)) {
        const rendered = value.map((item) => normalizeText(item)).filter(Boolean).join(', ')
        return rendered ? `${key}: ${truncateText(rendered, 80)}` : ''
      }
      if (typeof value === 'object') return ''
      return `${key}: ${truncateText(String(value), 80)}`
    })
    .filter(Boolean)
    .slice(0, 3)
  return genericParts.join(' | ')
}

export function resolveRowPreview(event = {}, rowType = '', sessionMeta = null) {
  const eventKind = resolveEventKind(event)
  if ((rowType === 'warning' || rowType === 'error') && eventKind === 'runtime_diagnostics') {
    const lines = splitNonEmptyLines(resolveRawResultText(event))
    return {
      preview: [],
      previewExpanded: lines,
      previewCollapsible: lines.length > 0,
    }
  }
  if (rowType !== 'tool_result' && rowType !== 'tool_progress') return buildPreviewPayload([])
  return buildPreviewPayload(resolveToolPreviewLines(resolveToolName(event), event, sessionMeta))
}
