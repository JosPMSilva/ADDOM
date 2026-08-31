import { isLikelyLongRunningCommand } from './command-tools-command-classifier.mjs'

const DEFAULT_MAX_COMMAND_OUTPUT_CHARS = 200_000
const TRUNCATED_STREAM_TAIL_PREVIEW_CHARS = 1_800
const TRUNCATED_STREAM_TAIL_PREVIEW_MAX_LINES = 16

export function appendOutput(state, chunk, maxChars = DEFAULT_MAX_COMMAND_OUTPUT_CHARS) {
  if (!chunk) return
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)
  if (!text) return
  state.totalChars = Math.max(0, Number(state.totalChars || 0)) + text.length
  state.newlineCount = Math.max(0, Number(state.newlineCount || 0)) + countChar(text, '\n')
  state.maxChars = Number.isFinite(Number(state.maxChars)) ? Number(state.maxChars) : maxChars
  state.tailPreview = appendTailPreview(state.tailPreview, text, TRUNCATED_STREAM_TAIL_PREVIEW_CHARS)
  const remaining = maxChars - state.text.length
  if (remaining <= 0) {
    state.truncated = true
    return
  }
  if (text.length > remaining) {
    state.text += text.slice(0, remaining)
    state.truncated = true
    return
  }
  state.text += text
}

function countChar(text, ch) {
  let count = 0
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === ch) count += 1
  }
  return count
}

function appendTailPreview(prev, next, maxChars) {
  const combined = `${String(prev || '')}${String(next || '')}`
  if (combined.length <= maxChars) return combined
  return combined.slice(combined.length - maxChars)
}

function estimateStreamLineCount(state) {
  const totalChars = Math.max(0, Number(state?.totalChars || 0))
  if (totalChars === 0) return 0
  return Math.max(1, Math.max(0, Number(state?.newlineCount || 0)) + 1)
}

function trimTailPreviewLines(text, maxLines = TRUNCATED_STREAM_TAIL_PREVIEW_MAX_LINES) {
  const normalized = String(text || '').replace(/\r\n/g, '\n')
  if (!normalized.trim()) return ''
  const lines = normalized.trimEnd().split('\n')
  const sliced = lines.slice(Math.max(0, lines.length - maxLines))
  return sliced.join('\n').trimEnd()
}

function formatStream(name, state) {
  const body = state.text.trimEnd()
  if (!body) return ''
  const maxChars = Number.isFinite(Number(state?.maxChars)) ? Number(state.maxChars) : DEFAULT_MAX_COMMAND_OUTPUT_CHARS
  const suffix = state.truncated ? `\n[${name} truncated at ${maxChars} chars]` : ''
  return `${name}:\n${body}${suffix}`
}

function buildTruncatedStreamSummary(name, state) {
  if (!state?.truncated) return ''
  const capturedChars = Math.max(0, String(state?.text || '').length)
  const totalChars = Math.max(capturedChars, Number(state?.totalChars || 0))
  const omittedChars = Math.max(0, totalChars - capturedChars)
  const lineCount = estimateStreamLineCount(state)
  const tailPreview = trimTailPreviewLines(state?.tailPreview)
  const parts = [
    `- ${name}: captured ${capturedChars.toLocaleString()} / ${totalChars.toLocaleString()} chars`,
  ]
  if (omittedChars > 0) parts[0] += ` (omitted ${omittedChars.toLocaleString()})`
  parts[0] += `, ~${lineCount.toLocaleString()} line${lineCount === 1 ? '' : 's'}`
  if (tailPreview) {
    parts.push(`  tail preview (${Math.min(TRUNCATED_STREAM_TAIL_PREVIEW_MAX_LINES, Math.max(1, tailPreview.split('\n').length))} line${tailPreview.includes('\n') ? 's' : ''}):`)
    for (const line of tailPreview.split('\n')) {
      parts.push(`    ${line}`)
    }
  }
  return parts.join('\n')
}

function buildTruncationHint(stdoutState, stderrState) {
  if (!stdoutState?.truncated && !stderrState?.truncated) return ''
  const summaries = [
    buildTruncatedStreamSummary('stdout', stdoutState),
    buildTruncatedStreamSummary('stderr', stderrState),
  ].filter(Boolean)
  const tailTip = summaries.length > 0
    ? 'A small tail preview is included above to help spot the final error/log lines.'
    : ''
  return [
    '',
    'Hint: Command output was truncated to protect context usage.',
    'Re-run with narrower scope (for example: add filters, tail/head, or grep/select).',
    tailTip,
    summaries.length > 0 ? '\nTruncation summary:\n' + summaries.join('\n') : '',
  ].filter(Boolean).join('\n')
}

export function formatSuccessOutput(stdoutState, stderrState) {
  const stdoutBlock = formatStream('stdout', stdoutState)
  const stderrBlock = formatStream('stderr', stderrState)
  const merged = stdoutBlock && stderrBlock ? `${stdoutBlock}\n\n${stderrBlock}` : (stdoutBlock || stderrBlock || '(command completed with no output)')
  return `${merged}${buildTruncationHint(stdoutState, stderrState)}`
}

export function formatFailureOutput(stdoutState, stderrState) {
  const stdoutBlock = formatStream('stdout', stdoutState)
  const stderrBlock = formatStream('stderr', stderrState)
  const merged = stdoutBlock && stderrBlock ? `${stdoutBlock}\n\n${stderrBlock}` : (stdoutBlock || stderrBlock || 'No output captured.')
  return `${merged}${buildTruncationHint(stdoutState, stderrState)}`
}

export function buildBackgroundFailureHints({ command, candidateLabel }) {
  const hints = []
  const cmd = String(command ?? '').trim()
  const cmdLower = cmd.toLowerCase()
  const shellLabel = String(candidateLabel ?? '').toLowerCase()
  const longRunning = isLikelyLongRunningCommand(cmd)
  if (/^npx(\s|$)/i.test(cmd) && !/\s--yes(\s|$)/i.test(cmd)) {
    hints.push('`npx` can fail in non-interactive/background runs when confirmation is required. Try adding `--yes`.')
  }
  if (process.platform === 'win32' && (shellLabel === 'bash' || shellLabel === 'wsl' || shellLabel === 'sh')) {
    hints.push('On Windows, this shell may not have Node/npm in PATH. Try `shell: "auto"` or `shell: "powershell"`.')
    if (/\bpython3?(\s|$)|\bpy(\s|$)/.test(cmdLower)) {
      hints.push('On Windows, this shell may also miss Python in PATH. Try `shell: "auto"`/`"powershell"` or use `py -m ...` (or `python -m ...`).')
    }
  }
  if (process.platform === 'win32' && /\bpython3?(\s|$)|\bpy(\s|$)/.test(cmdLower)) {
    hints.push('For Python local servers on Windows, `shell: "cmd"` is often more reliable than `powershell` in background mode.')
  }
  if (longRunning) {
    hints.push('Keep `background: true` for server/watch commands. If launch fails, retry with another shell instead of switching to foreground.')
  } else {
    hints.push('Run once in foreground (`background: false`) to capture full stderr for diagnosis.')
  }
  return hints
}


