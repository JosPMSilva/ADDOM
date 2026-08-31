export const TERMINAL_CHAT_OUTPUT_MAX_CHARS = 12_000
export const TERMINAL_ERROR_OUTPUT_MAX_CHARS = 8_000
export const TERMINAL_SUMMARY_OUTPUT_MAX_CHARS = 16_000
export const TERMINAL_MEMORY_OUTPUT_MAX_CHARS = 10_000

const ANSI_PATTERN = new RegExp(
  String.raw`[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))`,
  'g',
)

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function normalizeTerminalText(value = '') {
  return String(value || '')
    .replace(ANSI_PATTERN, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

export function boundTerminalOutputText(value = '', maxChars = TERMINAL_CHAT_OUTPUT_MAX_CHARS) {
  const text = normalizeTerminalText(value)
  const limit = Math.max(1, Number(maxChars || TERMINAL_CHAT_OUTPUT_MAX_CHARS) || TERMINAL_CHAT_OUTPUT_MAX_CHARS)
  if (text.length <= limit) {
    return {
      text,
      truncated: false,
      maxChars: limit,
      originalCharCount: text.length,
    }
  }
  return {
    text: text.slice(text.length - limit),
    truncated: true,
    maxChars: limit,
    originalCharCount: text.length,
  }
}

export function extractTerminalOutputContext({
  mode = 'selected_or_visible',
  selectedText = '',
  visibleText = '',
  fullScrollbackText = '',
  rawOutput = '',
  maxChars = TERMINAL_CHAT_OUTPUT_MAX_CHARS,
} = {}) {
  const normalizedMode = asTrimmedString(mode).toLowerCase() || 'selected_or_visible'
  const candidates = {
    selection: selectedText,
    visible: visibleText,
    recent_tail: rawOutput || fullScrollbackText || visibleText,
    full_bounded: fullScrollbackText || rawOutput || visibleText,
    selected_or_visible: selectedText || visibleText || rawOutput || fullScrollbackText,
  }
  const sourceMode = Object.prototype.hasOwnProperty.call(candidates, normalizedMode)
    ? normalizedMode
    : 'selected_or_visible'
  const bounded = boundTerminalOutputText(candidates[sourceMode], maxChars)
  return {
    ...bounded,
    sourceMode,
  }
}

function getSessionTitle(session = null) {
  return asTrimmedString(session?.sessionTitle || session?.displayName || session?.displayLabelPrimary || session?.id || session?.sessionId)
}

function buildTerminalMetadataLines(session = null, output = null) {
  return [
    `Session: ${getSessionTitle(session) || 'terminal session'}`,
    session?.id || session?.sessionId ? `Session ID: ${asTrimmedString(session?.id || session?.sessionId)}` : '',
    session?.threadId ? `Thread ID: ${asTrimmedString(session.threadId)}` : '',
    session?.cwd ? `CWD: ${asTrimmedString(session.cwd)}` : '',
    session?.shell ? `Shell: ${asTrimmedString(session.shell)}` : '',
    output?.truncated ? `Output was trimmed to the last ${output.maxChars} characters.` : '',
  ].filter(Boolean)
}

export function buildTerminalChatDraftInjection({
  action = 'send',
  session = null,
  output = null,
} = {}) {
  const normalizedAction = asTrimmedString(action).toLowerCase() || 'send'
  const outputText = asTrimmedString(output?.text)
  if (!outputText) return null

  const instruction = normalizedAction === 'explain_error'
    ? 'Explain the last terminal error using this terminal context and the active project context.'
    : normalizedAction === 'summarize_session'
      ? 'Summarize this terminal session. Focus on commands run, important output, errors, and useful next steps.'
      : 'Use this terminal output as context for my next request.'
  const metadata = buildTerminalMetadataLines(session, output).join('\n')

  return {
    mode: 'append',
    source: 'terminal_output',
    composerBlocks: [
      { type: 'text', text: `${instruction}\n\n${metadata}`.trim() },
      { type: 'code', language: 'terminal', code: outputText },
    ],
    guardVisibleText: instruction,
    focusComposer: true,
  }
}

export function buildTerminalMemorySnapshotPayload({
  session = null,
  output = null,
  projectFolder = '',
  targetScope = 'thread',
  acceptedAt = Date.now(),
} = {}) {
  const outputText = asTrimmedString(output?.text)
  const sessionId = asTrimmedString(session?.id || session?.sessionId)
  const threadId = asTrimmedString(session?.threadId)
  const normalizedTargetScope = asTrimmedString(targetScope).toLowerCase() === 'project' ? 'project' : 'thread'
  if (!sessionId || !outputText) return null
  if (normalizedTargetScope === 'thread' && !threadId) return null

  const title = getSessionTitle(session) || sessionId
  const tags = [
    'terminal_summary',
    'terminal_session',
    `terminal_session:${sessionId}`,
  ]
  if (threadId) tags.push(`terminal_thread:${threadId}`)
  if (Number.isFinite(Number(acceptedAt)) && Number(acceptedAt) > 0) {
    tags.push(`terminal_accepted_at:${Math.round(Number(acceptedAt))}`)
  }

  const content = [
    'Live terminal snapshot saved by the user.',
    ...buildTerminalMetadataLines(session, output),
    '',
    outputText,
  ].join('\n')

  return {
    project: asTrimmedString(projectFolder || session?.project),
    topic: `Terminal snapshot: ${title}`,
    content,
    tags,
    source: 'terminal_summary',
    dataPolicy: 'standard',
    scope: normalizedTargetScope,
    threadId: normalizedTargetScope === 'thread' ? threadId : null,
    originThreadId: threadId || null,
    promotedAt: normalizedTargetScope === 'project' && threadId ? acceptedAt : null,
  }
}
