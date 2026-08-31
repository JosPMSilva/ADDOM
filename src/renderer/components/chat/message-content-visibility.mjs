export function hasVisibleMessageContent(message = null) {
  if (!message || typeof message !== 'object') return false
  const content = message.content
  if (Array.isArray(content)) {
    return content.some((part) => {
      if (!part || typeof part !== 'object') return false
      if (part.type === 'text') return String(part.text || '').trim().length > 0
      return true
    })
  }
  return String(content || '').trim().length > 0
}
