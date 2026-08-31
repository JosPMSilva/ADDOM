function normalizeToolName(value = '') {
  return String(value || '').trim().toLowerCase()
}

function stringifyStructured(value) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value ?? null, null, 2)
  } catch {
    return String(value ?? '')
  }
}

function formatQuestionResult(result = {}) {
  const header = String(result?.header || '').trim()
  const question = String(result?.question || '').trim()
  const options = Array.isArray(result?.options)
    ? result.options
      .map((option) => {
        const label = String(option?.label || '').trim()
        const description = String(option?.description || '').trim()
        if (!label) return ''
        return description ? `- ${label}: ${description}` : `- ${label}`
      })
      .filter(Boolean)
    : []
  return [
    header ? `${header}:` : 'Clarification needed:',
    question || 'The model needs user clarification before proceeding.',
    options.length > 0 ? options.join('\n') : '',
  ].filter(Boolean).join('\n')
}

function formatTerminalMemorySuggestionResult(result = {}) {
  const suggestion = result?.suggestion && typeof result.suggestion === 'object'
    ? result.suggestion
    : {}
  const summary = String(suggestion?.summary || '').trim()
  const reason = String(suggestion?.reason || '').trim()
  return [
    'Terminal memory suggestion prepared:',
    summary ? `Summary: ${summary}` : '',
    reason ? `Why it matters: ${reason}` : '',
  ].filter(Boolean).join('\n')
}

export function formatToolResultForDisplay(toolName = '', result = null) {
  if (typeof result === 'string') return result
  if (result == null) return ''
  if (typeof result !== 'object') return String(result)

  const normalizedToolName = normalizeToolName(toolName)
  if (
    (normalizedToolName === 'todo_read'
      || normalizedToolName === 'todo_write'
      || normalizedToolName === 'plan_read'
      || normalizedToolName === 'plan_update')
    && typeof result.summary === 'string'
  ) {
    return String(result.summary || '').trim()
  }
  if (normalizedToolName === 'question_user') {
    return formatQuestionResult(result)
  }
  if (normalizedToolName === 'terminal_memory_suggest') {
    return formatTerminalMemorySuggestionResult(result)
  }
  if (typeof result.message === 'string' && result.message.trim()) {
    return result.message.trim()
  }
  if (typeof result.summary === 'string' && result.summary.trim()) {
    return result.summary.trim()
  }
  return stringifyStructured(result)
}
