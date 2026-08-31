const AUTO_THREAD_TITLE_MAX_CHARS = 80

function trimAtWordBoundary(value, maxChars) {
  if (value.length <= maxChars) return value
  const clipped = value.slice(0, Math.max(1, maxChars - 1))
  const boundary = clipped.lastIndexOf(' ')
  return `${(boundary > 20 ? clipped.slice(0, boundary) : clipped).trim()}…`
}

function normalizePromptStart(prompt) {
  const lines = String(prompt ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('```'))
  const firstLine = lines[0] || ''
  const sentence = firstLine.match(/^(.+?[.!?])(?=\s|$)/)?.[1] || firstLine
  return sentence
    .replace(/^>\s*/, '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function removeConversationPrefix(value) {
  let title = value
  const prefixes = [
    /^(?:hi|hello|hey)[,!\s]+/i,
    /^(?:please\s+)?(?:can|could|would) you\s+/i,
    /^please\s+/i,
    /^i need(?: help)?(?: you)?(?: to| with)?\s+/i,
    /^i want(?: you)?(?: to)?\s+/i,
    /^help me(?: to)?\s+/i,
    /^(?:let's|we need to|we should)\s+/i,
  ]
  for (const prefix of prefixes) title = title.replace(prefix, '')
  return title.trim()
}

export function deriveThreadTitleFromPrompt(prompt) {
  const normalized = normalizePromptStart(prompt)
  if (!normalized || normalized.startsWith('/')) return ''
  if (/^(?:hi|hello|hey|yo|thanks|thank you)[!,.\s]*$/i.test(normalized)) return ''

  const title = removeConversationPrefix(normalized)
  if (!title || /^(?:hi|hello|hey|yo|thanks|thank you)[!,.\s]*$/i.test(title)) return ''
  const sentenceCaseTitle = `${title.charAt(0).toUpperCase()}${title.slice(1)}`
  return trimAtWordBoundary(sentenceCaseTitle, AUTO_THREAD_TITLE_MAX_CHARS)
}
