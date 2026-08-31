/** True when text ends on a sentence/clause terminal suitable for a segment bump. */
export function endsWithSentenceBoundary(detail = '') {
  const text = String(detail || '').replace(/\s+$/u, '')
  if (!text) return false
  return /[.!?]["')\]]*$/u.test(text)
}
