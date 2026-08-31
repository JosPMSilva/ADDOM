const SECRET_PATTERNS = [
  /crsr_[A-Za-z0-9_-]+/gi,
  /(CURSOR_(?:API_KEY|AUTH_TOKEN)\s*[=:]\s*)\S+/gi,
  /(authorization\s*:\s*bearer\s+)\S+/gi,
]

export function sanitizeCursorAgentText(value = '') {
  let text = String(value || '')
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, (_match, prefix = '') => `${prefix || ''}[redacted]`)
  }
  return text
}

export function sanitizeCursorAgentError(error = null) {
  return {
    code: String(error?.code || 'cursor_agent_error').trim(),
    message: sanitizeCursorAgentText(error?.message || error || 'Cursor Agent failed.'),
  }
}

