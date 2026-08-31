import { formatDurationMs, formatTime } from '../../i18n/formatters.mjs'
import i18n from '../../i18n/init.mjs'
import { createRendererTranslator } from '../../i18n/index.mjs'

function getRendererTranslator() {
  return createRendererTranslator({
    locale: i18n?.resolvedLanguage || i18n?.language || 'en',
    namespaces: ['core'],
  })
}

export const CHAT_TIMELINE_WINDOW_SIZE = 320
export const CHAT_TIMELINE_WINDOW_STEP = 240
export const CHAT_PERF_SAMPLE_LIMIT = 240
export const CHAT_DRAFT_STORAGE_KEY = 'addom-chat-draft-by-thread-v1'
export const CHAT_DRAFT_SAVE_DEBOUNCE_MS = 320

export function normalizeStringArray(value, max = 12) {
  if (!Array.isArray(value)) return []
  const out = []
  const seen = new Set()
  for (const item of value) {
    if (out.length >= max) break
    const s = String(item ?? '').trim()
    if (!s || seen.has(s.toLowerCase())) continue
    seen.add(s.toLowerCase())
    out.push(s)
  }
  return out
}

export function normalizeInteger(value, { min = null, max = null } = {}) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  let out = Math.round(n)
  if (Number.isFinite(min)) out = Math.max(min, out)
  if (Number.isFinite(max)) out = Math.min(max, out)
  return out
}

export function normalizeRequestLimit(value, fallback = 12) {
  const n = normalizeInteger(value, { min: 1, max: 40 })
  return Number.isFinite(n) ? n : fallback
}

export function truncate(text, maxLen) {
  const s = String(text ?? '')
  return s.length > maxLen ? `${s.slice(0, maxLen)}...` : s
}

export function describeMemoryFilters(request = {}) {
  const parts = []
  if (Number.isFinite(request.sortIdFrom)) parts.push(`sortIdFrom=#${request.sortIdFrom}`)
  if (Number.isFinite(request.sortIdTo)) parts.push(`sortIdTo=#${request.sortIdTo}`)
  if (request.tags?.length) parts.push(`tags=[${request.tags.join(', ')}]`)
  if (request.sources?.length) parts.push(`sources=[${request.sources.join(', ')}]`)
  if (Number.isFinite(request.limit)) parts.push(`limit=${request.limit}`)
  return parts
}

export function describeArtifactFilters(request = {}) {
  const parts = []
  if (request.filePaths?.length) parts.push(`filePaths=[${request.filePaths.join(', ')}]`)
  if (request.includeRevisions === false) parts.push('includeRevisions=false')
  if (Number.isFinite(request.revisionsPerFile)) parts.push(`revisionsPerFile=${request.revisionsPerFile}`)
  if (Number.isFinite(request.fromRev)) parts.push(`fromRev=${request.fromRev}`)
  if (Number.isFinite(request.toRev)) parts.push(`toRev=${request.toRev}`)
  if (Number.isFinite(request.limit)) parts.push(`limit=${request.limit}`)
  return parts
}

export function trimResultText(value, maxChars = 1200) {
  const s = String(value ?? '').trim()
  if (!s) return ''
  return s.length > maxChars ? `${s.slice(0, maxChars)}\n... [truncated]` : s
}

export function getLatestAssistantNote(messages, maxChars = 4000) {
  if (!Array.isArray(messages) || messages.length === 0) return { messageId: '', note: '' }
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m?.role === 'assistant' && String(m?.content ?? '').trim().length > 0)
  if (!lastAssistant) return { messageId: '', note: '' }
  const note = String(lastAssistant.content ?? '').trim()
  if (!note) return { messageId: '', note: '' }
  return {
    messageId: String(lastAssistant.id ?? '').trim(),
    note: note.length > maxChars ? `${note.slice(0, maxChars)}...` : note,
  }
}

export function formatToolExecutionLabel(toolName, toolInput = {}) {
  const t = getRendererTranslator()
  if (toolName === 'run_command') {
    const cmd = String(toolInput.command ?? '').trim()
    return cmd
      ? t('chat.toolExecution.runningCommandWithCommand', { defaultValue: 'Running command: {{command}}', command: cmd })
      : t('chat.toolExecution.runningCommand', { defaultValue: 'Running command...' })
  }
  if (toolName === 'rename_file') {
    const oldPath = String(toolInput?.old_path || '').trim()
    const newPath = String(toolInput?.new_path || '').trim()
    if (oldPath && newPath) {
      return t('chat.toolExecution.renameFile', {
        defaultValue: 'Running: rename_file - {{oldPath}} -> {{newPath}}',
        oldPath,
        newPath,
      })
    }
  }
  if (toolName === 'browser_action') {
    const action = String(toolInput?.action || '').trim().toLowerCase()
    const url = String(toolInput?.url || '').trim()
    if (action === 'navigate' && url) return t('chat.toolExecution.browsingUrl', { defaultValue: 'Browsing: {{url}}', url })
    if (action) return t('chat.toolExecution.browserActionWithAction', { defaultValue: 'Browser: {{action}}', action })
    return t('chat.toolExecution.browserAction', { defaultValue: 'Browser action' })
  }
  // Show the file path for file-oriented tools
  const filePath = String(
    toolInput?.path || toolInput?.file_path || toolInput?.filepath || ''
  ).trim()
  if (filePath && (
    toolName === 'write_file' || toolName === 'read_file' || toolName === 'edit_file'
    || toolName === 'delete_file' || toolName === 'rename_file' || toolName === 'list_directory'
  )) {
    return t('chat.toolExecution.runningToolWithPath', {
      defaultValue: 'Running: {{toolName}} - {{filePath}}',
      toolName,
      filePath,
    })
  }
  return t('chat.toolExecution.runningTool', {
    defaultValue: 'Running: {{toolName}}',
    toolName,
  })
}

function formatEditFilePreviewDetail(toolInput = {}) {
  const oldPreview = String(toolInput.old_text_preview ?? toolInput.old_text ?? '').trim()
  const newPreview = String(toolInput.new_text_preview ?? toolInput.new_text ?? '').trim()
  if (!oldPreview && !newPreview) return ''
  const lines = []
  if (oldPreview) {
    lines.push('old_text_preview:')
    lines.push(oldPreview)
  }
  if (newPreview) {
    if (lines.length > 0) lines.push('')
    lines.push('new_text_preview:')
    lines.push(newPreview)
  }
  return lines.join('\n')
}

export function formatToolExecutionDetail(toolName, toolInput = {}) {
  if (toolName === 'edit_file') {
    return formatEditFilePreviewDetail(toolInput)
  }
  if (toolName === 'browser_action') {
    const action = String(toolInput?.action || '').trim().toLowerCase()
    const lines = [
      action ? `action: ${action}` : '',
      toolInput?.url ? `url: ${String(toolInput.url).trim()}` : '',
      toolInput?.selector ? `selector: ${String(toolInput.selector).trim()}` : '',
      toolInput?.direction ? `direction: ${String(toolInput.direction).trim().toLowerCase()}` : '',
      toolInput?.amount != null ? `amount: ${Number(toolInput.amount || 0) || 0}` : '',
      toolInput?.timeout_ms != null ? `timeout_ms: ${Number(toolInput.timeout_ms || 0) || 0}` : '',
      toolInput?.text_preview ? `text_preview: ${String(toolInput.text_preview)}` : '',
      toolInput?.code_preview ? `code_preview: ${String(toolInput.code_preview)}` : '',
    ].filter(Boolean)
    return lines.join('\n')
  }
  if (toolName !== 'run_command') return ''
  const cwd = String(toolInput.cwd ?? '.').trim() || '.'
  const shell = String(toolInput.shell ?? 'auto').trim() || 'auto'
  const timeoutMs = Number(toolInput.timeout_ms ?? 300_000) || 300_000
  const mode = toolInput.background ? 'background' : 'foreground'
  return `cwd: ${cwd}\nshell: ${shell}\ntimeout_ms: ${timeoutMs}\nmode: ${mode}`
}

export function formatToolResultLabel(toolName, decision, isError) {
  const t = getRendererTranslator()
  if (toolName === 'browser_action') {
    if (decision === 'denied') return t('chat.toolExecution.result.browserDenied', { defaultValue: 'browser_action - denied' })
    if (isError) return t('chat.toolExecution.result.browserFailed', { defaultValue: 'browser_action - failed' })
    return t('chat.toolExecution.result.browserDone', { defaultValue: 'browser_action - done' })
  }
  if (decision === 'denied') return t('chat.toolExecution.result.toolDenied', { defaultValue: '{{toolName}} - denied', toolName })
  if (isError) return t('chat.toolExecution.result.toolFailed', { defaultValue: '{{toolName}} - failed', toolName })
  return t('chat.toolExecution.result.toolDone', { defaultValue: '{{toolName}} - done', toolName })
}

export function formatToolResultDetail(toolName, toolInput = {}, result, isError, decision) {
  if (decision === 'denied') return ''
  const output = trimResultText(result, 1400)
  if (!output) return ''

  if (toolName === 'edit_file') {
    const previewDetail = formatEditFilePreviewDetail(toolInput)
    return previewDetail ? `${output}\n\n${previewDetail}` : output
  }

  if (toolName === 'browser_action') {
    const action = String(toolInput.action ?? '').trim().toLowerCase()
    const header = [
      action ? `action: ${action}` : null,
      toolInput?.url ? `url: ${String(toolInput.url).trim()}` : null,
      isError ? 'status: error' : 'status: success',
    ].filter(Boolean).join('\n')
    return header ? `${header}\n\n${output}` : output
  }

  if (toolName !== 'run_command') return output

  const cmd = String(toolInput.command ?? '').trim()
  const cwd = String(toolInput.cwd ?? '.').trim() || '.'
  const mode = toolInput.background ? 'background' : 'foreground'
  const header = [
    cmd ? `command: ${cmd}` : null,
    `cwd: ${cwd}`,
    `mode: ${mode}`,
    isError ? 'status: error' : 'status: success',
  ].filter(Boolean).join('\n')

  return `${header}\n\n${output}`
}

export function hasMissingDependencyHint(toolName, isError, decision, result, flagged) {
  if (toolName !== 'run_command' || !isError || decision === 'denied') return false
  if (flagged) return true
  const text = String(result ?? '')
  if (!text) return false
  if (/potential missing dependency\/module detected/i.test(text)) return true
  return /no module named|cannot find module|cannot find package|command not found|is not recognized as (an internal or external command|the name of a cmdlet)/i.test(text)
}

export function formatAgeMs(ms) {
  return formatDurationMs(ms, { fallback: '-' })
}

export function formatTimestamp(ts) {
  return formatTime(ts, { fallback: '-' })
}

export function formatTokenCompact(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}
