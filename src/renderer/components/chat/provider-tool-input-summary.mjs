/**
 * Provider tool input-summary activity identity helpers.
 * Buffer keys stay on `provider_tool_input:*`; canonical session uses `stepId`.
 */

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeProviderToolName(payload = {}, fallback = 'tool') {
  const value = String(payload?.toolName || '').trim()
  return value || fallback
}

/** Stable buffer key for tool-input-start/delta coalescing (not the canonical session id). */
export function resolveProviderToolInputActivityId(payload = {}) {
  const turnId = normalizeId(payload?.turnId)
  const toolCallId = normalizeId(payload?.toolCallId)
  if (turnId && toolCallId) return `provider_tool_input:${turnId}:${toolCallId}`

  const toolName = normalizeProviderToolName(payload, 'tool').toLowerCase().replace(/[^a-z0-9_-]+/g, '_')
  const round = Number(payload?.round || 0) || 0
  if (turnId) return `provider_tool_input:${turnId}:${toolName}:${round}`
  if (toolCallId) return `provider_tool_input:${toolCallId}`
  if (toolName) return `provider_tool_input:${toolName}:${round}`
  return ''
}

/**
 * Live "collecting input" row. Shares `provider_tool:${turnId}:${toolCallId}` + `stepId`
 * with tool output so start+result collapse to one canonical session.
 */
export function buildOpenAIProviderToolInputSummaryActivity(payload = {}, translateText = null) {
  const translate = typeof translateText === 'function'
    ? translateText
    : (_key, defaultValue, options = {}) => {
      const toolName = options?.toolName
      if (toolName != null && String(defaultValue || '').includes('{{toolName}}')) {
        return String(defaultValue).replace(/\{\{\s*toolName\s*\}\}/g, String(toolName))
      }
      return String(defaultValue || '')
    }
  const toolName = normalizeProviderToolName(payload, 'tool')
  const toolCallId = normalizeId(payload?.toolCallId)
  const turnId = normalizeId(payload?.turnId)
  const stableId = toolCallId && turnId
    ? `provider_tool:${turnId}:${toolCallId}`
    : resolveProviderToolInputActivityId(payload)
  const toolInput = payload?.toolInput && typeof payload.toolInput === 'object'
    ? payload.toolInput
    : null
  return {
    ...(stableId ? { id: stableId } : {}),
    coalesce: true,
    type: 'provider_tool',
    threadId: payload?.threadId,
    turnId: payload?.turnId,
    eventKind: 'provider_tool_status',
    providerId: payload?.providerId,
    model: payload?.model,
    toolName,
    ...(toolInput ? { toolInput } : {}),
    ...(toolCallId ? { stepId: toolCallId } : {}),
    label: translate(
      'core:executionStream.bridge.providerTool.input',
      'Provider tool input: {{toolName}}',
      { toolName: toolName || 'tool' },
    ),
    detail: translate(
      'core:executionStream.bridge.providerTool.collectingInput',
      'Collecting provider tool input...',
    ),
  }
}
