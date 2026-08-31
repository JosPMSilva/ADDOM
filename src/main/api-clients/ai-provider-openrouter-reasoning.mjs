const REDACTED_REASONING = '[REDACTED]'

function normalizeDetailType(value = '') {
  return String(value || '').trim().toLowerCase()
}

function isEncryptedReasoningDetail(entry = null) {
  const type = normalizeDetailType(entry?.type)
  return type === 'reasoning.encrypted' || type.endsWith('.encrypted')
}

function isBlankOrRedacted(text = '') {
  const trimmed = String(text || '').trim()
  return !trimmed || trimmed === REDACTED_REASONING
}

/**
 * Extract visible reasoning text from OpenRouter `reasoning_details` entries.
 * Skips encrypted / redacted payloads that have no user-visible content.
 */
export function extractTextFromOpenRouterReasoningDetails(details = []) {
  if (!Array.isArray(details) || details.length === 0) return ''

  const chunks = []
  for (const entry of details) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    if (isEncryptedReasoningDetail(entry)) continue

    const type = normalizeDetailType(entry.type)
    let text = ''
    if (type === 'reasoning.summary' || type.endsWith('.summary')) {
      text = String(entry.summary ?? entry.text ?? '')
    } else if (type === 'reasoning.text' || type.endsWith('.text') || !type) {
      text = String(entry.text ?? entry.summary ?? '')
    } else {
      text = String(entry.text ?? entry.summary ?? '')
    }

    if (isBlankOrRedacted(text)) continue
    chunks.push(text)
  }

  return chunks.join('')
}

/**
 * Pull live reasoning text from an OpenRouter raw SSE chunk.
 * Returns empty when `reasoning` / `reasoning_content` is already present so the
 * AI SDK `reasoning-delta` path owns emission and we avoid duplicates.
 */
export function extractOpenRouterReasoningFromRawChunk(rawValue = null) {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return ''

  const choice = Array.isArray(rawValue.choices) ? rawValue.choices[0] : null
  if (!choice || typeof choice !== 'object') return ''

  const delta = choice.delta && typeof choice.delta === 'object' ? choice.delta : null
  const message = choice.message && typeof choice.message === 'object' ? choice.message : null
  const source = delta || message
  if (!source) return ''

  // Treat blank/whitespace as absent so we do not suppress reasoning_details.
  if (
    String(source.reasoning_content ?? '').trim().length > 0
    || String(source.reasoning ?? '').trim().length > 0
  ) {
    return ''
  }

  return extractTextFromOpenRouterReasoningDetails(source.reasoning_details)
}
