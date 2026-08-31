function normalizeComparableExecutionText(value = '') {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function cutRawDetailToNormalizedPrefixLength(rawDetail = '', prefixNormLength = 0) {
  const raw = String(rawDetail || '')
  if (prefixNormLength <= 0) return ''
  let low = 0
  let high = raw.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const candidateNorm = normalizeComparableExecutionText(raw.slice(0, mid))
    if (candidateNorm.length < prefixNormLength) low = mid
    else high = mid - 1
  }
  let cut = low
  while (
    cut < raw.length
    && normalizeComparableExecutionText(raw.slice(0, cut + 1)).length <= prefixNormLength
  ) {
    cut += 1
  }
  return raw.slice(0, cut).trim()
}

/**
 * Remove final-answer prose that leaked into an execution reasoning/commentary detail.
 * Handles exact duplicates, answer-contained snippets, smashed title+answer suffixes,
 * and partial answer prefixes (while the answer is still streaming).
 */
export function stripLeakedAssistantAnswerFromExecutionDetail(detail = '', assistantText = '') {
  const rawDetail = String(detail || '')
  const rawAssistant = String(assistantText || '').trim()
  if (!rawDetail.trim() || !rawAssistant) return rawDetail

  const normalizedDetail = normalizeComparableExecutionText(rawDetail)
  const normalizedAssistant = normalizeComparableExecutionText(rawAssistant)
  if (!normalizedAssistant) return rawDetail
  if (normalizedDetail === normalizedAssistant) return ''
  if (
    normalizedAssistant.includes(normalizedDetail)
    && normalizedDetail.length >= Math.min(24, normalizedAssistant.length)
  ) {
    return ''
  }

  const minNeedle = Math.min(24, normalizedAssistant.length)
  if (minNeedle <= 0) return rawDetail

  // Prefer the earliest occurrence of the longest answer prefix inside the detail.
  let bestIndex = -1
  let bestLength = 0
  for (let length = normalizedAssistant.length; length >= minNeedle; length -= 1) {
    const needle = normalizedAssistant.slice(0, length)
    const index = normalizedDetail.indexOf(needle)
    if (index < 0) continue
    bestIndex = index
    bestLength = length
    break
  }

  // Also catch a trailing partial answer that has not finished streaming yet.
  if (bestIndex < 0) {
    const maxSuffix = Math.min(normalizedAssistant.length, normalizedDetail.length)
    for (let length = maxSuffix; length >= minNeedle; length -= 1) {
      const needle = normalizedAssistant.slice(0, length)
      if (!normalizedDetail.endsWith(needle)) continue
      bestIndex = normalizedDetail.length - length
      bestLength = length
      break
    }
  }

  if (bestIndex < 0 || bestLength < minNeedle) {
    if (!normalizedDetail.endsWith(normalizedAssistant)) return rawDetail
    return cutRawDetailToNormalizedPrefixLength(
      rawDetail,
      Math.max(0, normalizedDetail.length - normalizedAssistant.length),
    )
  }

  if (bestIndex === 0) return ''
  return cutRawDetailToNormalizedPrefixLength(rawDetail, bestIndex)
}
