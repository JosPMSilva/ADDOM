import { asTrimmedString } from './terminal-session-manager-normalizers.mjs'
import { stripTerminalAnsi } from './terminal-session-output-text.mjs'
import { normalizeSurface } from './terminal-session-snapshots.mjs'

export function resolveSubmitSuffix(session = {}, platform = process.platform) {
  const shellKind = asTrimmedString(session?.shellKind).toLowerCase()
  if (platform === 'win32' && shellKind !== 'bash' && shellKind !== 'sh') return '\r'
  return '\n'
}

export function buildTerminalWritePayload(session = {}, text = '', { submit = false, platform = process.platform } = {}) {
  if (submit !== true || /[\r\n]\s*$/u.test(text)) return { payload: text, submitted: submit === true }
  return { payload: `${text}${resolveSubmitSuffix(session, platform)}`, submitted: true }
}

function looksLikePromptLine(line = '', shellKind = '') {
  const normalizedLine = String(line || '').replace(/\r/g, '').trimEnd()
  if (!normalizedLine) return false
  const normalizedShellKind = asTrimmedString(shellKind).toLowerCase()

  if (normalizedShellKind === 'powershell' && /^PS [^\n]*>\s*$/u.test(normalizedLine)) return true
  if (normalizedShellKind === 'cmd' && /^(?:[A-Za-z]:)?[^<>\n]*>\s*$/u.test(normalizedLine)) return true
  if ((normalizedShellKind === 'bash' || normalizedShellKind === 'sh') && /^[^\n]{0,200}[#$%]\s*$/u.test(normalizedLine)) return true
  return /^(?:PS [^\n]*>|(?:[A-Za-z]:)?[^<>\n]*>|[^\n]{0,200}[#$%])\s*$/u.test(normalizedLine)
}

function terminalTextTailLooksIdle(text = '', shellKind = '') {
  const tailText = stripTerminalAnsi(text)
  if (!tailText) return false
  const lines = tailText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  return looksLikePromptLine(lines[lines.length - 1] || '', shellKind)
}

export function markSessionIdleFromOutputBuffer(session = {}) {
  if (session.commandState !== 'running') return false
  const outputText = (Array.isArray(session.outputBuffer) ? session.outputBuffer : [])
    .map((entry) => String(entry?.data || ''))
    .join('')
  if (!terminalTextTailLooksIdle(outputText, session?.shellKind)) return false
  session.commandState = 'idle'
  return true
}

export function markSessionIdleFromVisibleSnapshot(session = {}) {
  const snapshot = session.visibleSnapshot || {}
  if (
    session.commandState !== 'running'
    || snapshot.available !== true
    || !snapshot.surface
    || snapshot.surface !== normalizeSurface(session.focusedSurface)
    || !terminalTextTailLooksIdle(snapshot.text, session.shellKind)
  ) {
    return false
  }
  session.commandState = 'idle'
  return true
}
