function normalizeString(value = '') {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeFinalText(value = '') {
  return typeof value === 'string' ? value : ''
}

function normalizePositiveInteger(value, fallbackValue = 0) {
  const parsed = Number(value)
  if (Number.isInteger(parsed) && parsed > 0) return parsed
  return Number.isInteger(fallbackValue) && fallbackValue > 0 ? fallbackValue : 0
}

function buildDeterministicPartId(messageId = '', appendOrder = 0) {
  return `${normalizeString(messageId) || 'message'}:final-document:${normalizePositiveInteger(appendOrder, 1)}`
}

function normalizeFinalDocumentStatus(value = '') {
  const normalized = normalizeString(value).toLowerCase()
  if (normalized === 'completed' || normalized === 'complete' || normalized === 'done' || normalized === 'success') {
    return 'completed'
  }
  if (normalized === 'error' || normalized === 'failed' || normalized === 'cancelled') {
    return normalized
  }
  return 'completed'
}

function normalizeExplicitCanonicalPart(rawPart = {}, fallbackAppendOrder = 0) {
  if (!rawPart || typeof rawPart !== 'object') return null
  const text = normalizeFinalText(rawPart.text ?? rawPart.content)
  if (!text) return null
  return {
    text,
    appendOrder: normalizePositiveInteger(rawPart.appendOrder, fallbackAppendOrder),
    partId: normalizeString(rawPart.partId),
    kind: normalizeString(rawPart.kind) || 'markdown',
    status: normalizeFinalDocumentStatus(rawPart.status),
  }
}

export function buildCanonicalFinalDocument({
  threadId = '',
  turnId = '',
  messageId = '',
  text = '',
  finalDocument = null,
  hasAuthoritativeMessageBinding = false,
  allowEmptyText = false,
} = {}) {
  const normalizedMessageId = normalizeString(messageId)
  if (!normalizedMessageId) return null

  const authoritativeParts = hasAuthoritativeMessageBinding && Array.isArray(finalDocument?.parts)
    ? finalDocument.parts
        .map((part, index) => normalizeExplicitCanonicalPart(part, index + 1))
        .filter(Boolean)
    : []
  const fallbackText = normalizeFinalText(text)
  const sourceParts = authoritativeParts.length > 0
    ? authoritativeParts
    : ((fallbackText || allowEmptyText)
        ? [{ text: fallbackText, appendOrder: 1, partId: '', kind: 'markdown', status: 'completed' }]
        : [])

  if (sourceParts.length === 0) return null

  const sorted = sourceParts
    .map((part, index) => ({
      ...part,
      appendOrder: normalizePositiveInteger(part.appendOrder, index + 1),
      sourceIndex: index,
    }))
    .sort((left, right) => {
      if (left.appendOrder !== right.appendOrder) return left.appendOrder - right.appendOrder
      return left.sourceIndex - right.sourceIndex
    })

  const seenAppendOrders = new Set()
  const seenPartIds = new Set()
  const canonicalParts = []

  for (const part of sorted) {
    const appendOrder = normalizePositiveInteger(part.appendOrder, canonicalParts.length + 1)
    const partId = part.partId || buildDeterministicPartId(normalizedMessageId, appendOrder)
    if (seenAppendOrders.has(appendOrder) || seenPartIds.has(partId)) continue
    seenAppendOrders.add(appendOrder)
    seenPartIds.add(partId)
    canonicalParts.push({
      threadId: normalizeString(threadId),
      turnId: normalizeString(turnId),
      messageId: normalizedMessageId,
      partId,
      appendOrder,
      sequence: canonicalParts.length + 1,
      status: normalizeFinalDocumentStatus(part.status),
      ownership: 'final-document',
      kind: normalizeString(part.kind) || 'markdown',
      text: normalizeFinalText(part.text),
    })
  }

  if (canonicalParts.length === 0) return null

  return {
    schemaVersion: 1,
    threadId: normalizeString(threadId),
    turnId: normalizeString(turnId),
    messageId: normalizedMessageId,
    ownership: 'final-document',
    text: canonicalParts.map((part) => part.text).join(''),
    parts: canonicalParts,
  }
}
