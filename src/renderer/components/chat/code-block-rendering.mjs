export const CODE_BLOCK_MAX_HIGHLIGHT_CHARS = 8000
export const CODE_BLOCK_MAX_HIGHLIGHT_LINES = 400
export const CHAT_SNIPPET_MAX_HIGHLIGHT_CHARS = 24000
export const CHAT_SNIPPET_MAX_HIGHLIGHT_LINES = 500
export const TURN_FILE_DIFF_MAX_HIGHLIGHT_CHARS = 120000
export const TURN_FILE_DIFF_MAX_HIGHLIGHT_LINES = 2000

export function countBlockLines(text) {
  const content = String(text ?? '')
  if (!content) return 0
  let lineCount = 1
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) lineCount += 1
  }
  return lineCount
}

export function countDisplayLines(text = '') {
  const content = String(text ?? '')
  if (!content) return 0
  const lines = content.split('\n')
  while (lines.length > 1 && lines.at(-1) === '') {
    lines.pop()
  }
  return lines.length
}

export function shouldHighlightBlockText(text, {
  maxChars = CODE_BLOCK_MAX_HIGHLIGHT_CHARS,
  maxLines = CODE_BLOCK_MAX_HIGHLIGHT_LINES,
} = {}) {
  const content = String(text ?? '')
  const lineCount = countBlockLines(content)
  return content.length <= maxChars && lineCount <= maxLines
}

export function getBlockRenderMetrics(text, limits = {}) {
  const content = String(text ?? '')
  const lineCount = countBlockLines(content)
  const displayLineCount = countDisplayLines(content)
  const highlightEnabled = shouldHighlightBlockText(content, limits)
  return {
    content,
    lineCount,
    displayLineCount,
    highlightEnabled,
  }
}
