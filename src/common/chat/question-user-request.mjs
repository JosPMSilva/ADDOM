function normalizeQuestionUserOption(option, index = 0) {
  if (typeof option === 'string') {
    const label = option.trim().slice(0, 240)
    if (!label) return null
    return {
      id: `option_${index + 1}`,
      label,
      description: '',
      recommended: false,
    }
  }

  if (!option || typeof option !== 'object' || Array.isArray(option)) return null

  const label = String(option.label || '').trim().slice(0, 240)
  if (!label) return null

  return {
    id: String(option.id || `option_${index + 1}`).trim().slice(0, 80) || `option_${index + 1}`,
    label,
    description: String(option.description || '').trim().slice(0, 500),
    recommended: option.recommended === true,
  }
}

function normalizeQuestionUserSource(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === 'openai_account_bridge'
    ? 'openai_account_bridge'
    : 'local_tool'
}

function normalizeQuestionUserAnswerMode(value = '', source = 'local_tool') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'bridge_response') return 'bridge_response'
  if (normalized === 'new_user_turn') return 'new_user_turn'
  return source === 'openai_account_bridge' ? 'bridge_response' : 'new_user_turn'
}

function normalizeQuestionUserId(value = '', max = 160) {
  return String(value || '').trim().slice(0, max)
}

function normalizeOriginMode(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === 'plan' || normalized === 'thinking' || normalized === 'execute'
    ? normalized
    : ''
}

export function normalizeQuestionUserRequest(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const header = String(value.header || '').trim().slice(0, 240)
  const question = String(value.question || '').trim().slice(0, 2_000)
  const source = normalizeQuestionUserSource(value.source)
  const answerMode = normalizeQuestionUserAnswerMode(value.answerMode, source)
  const requestId = normalizeQuestionUserId(value.requestId)
  const threadId = normalizeQuestionUserId(value.threadId)
  const turnId = normalizeQuestionUserId(value.turnId)
  const itemId = normalizeQuestionUserId(value.itemId)
  const originMode = normalizeOriginMode(value.originMode || value.mode)
  const responsePending = value.responsePending === true
  const options = Array.isArray(value.options)
    ? value.options
      .map((option, index) => normalizeQuestionUserOption(option, index))
      .filter(Boolean)
      .slice(0, 12)
    : []

  if (!header && !question && options.length === 0) return null

  return {
    header,
    question,
    options,
    source,
    answerMode,
    ...(requestId ? { requestId } : {}),
    ...(threadId ? { threadId } : {}),
    ...(turnId ? { turnId } : {}),
    ...(itemId ? { itemId } : {}),
    ...(originMode ? { originMode } : {}),
    ...(responsePending ? { responsePending: true } : {}),
  }
}
