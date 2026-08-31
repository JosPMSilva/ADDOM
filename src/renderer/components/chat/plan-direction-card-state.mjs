function questionId(question = null) {
  return String(question?.id || '').trim()
}

function normalizedDraft(value = null) {
  if (typeof value === 'string') return { kind: 'custom', optionId: '', text: value }
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    kind: source.kind === 'option' ? 'option' : 'custom',
    optionId: String(source.optionId || '').trim(),
    text: String(source.text || ''),
  }
}

export function createPlanDirectionDrafts(questions = [], previousDrafts = {}) {
  const prior = previousDrafts && typeof previousDrafts === 'object' ? previousDrafts : {}
  return Object.fromEntries((Array.isArray(questions) ? questions : [])
    .map((question) => {
      const id = questionId(question)
      if (!id) return null
      return [id, normalizedDraft(Object.hasOwn(prior, id) ? prior[id] : question?.answer)]
    })
    .filter(Boolean))
}

export function createPlanDirectionAnswer(draft = null, question = null) {
  const normalized = normalizedDraft(draft)
  if (normalized.kind === 'option') {
    const option = (Array.isArray(question?.options) ? question.options : [])
      .find((entry) => String(entry?.id || '').trim() === normalized.optionId)
    return option
      ? { kind: 'option', optionId: normalized.optionId, text: String(option.label || '').trim() }
      : null
  }
  const answerText = normalized.text.trim()
  return answerText ? { kind: 'custom', optionId: '', text: answerText } : null
}

export function isPlanDirectionDraftComplete(draft = null, question = null) {
  return Boolean(createPlanDirectionAnswer(draft, question))
}

export function resolvePlanDirectionIndex(currentIndex = 0, nextIndex = 0, questionCount = 0) {
  const lastIndex = Math.max(0, Number(questionCount || 0) - 1)
  const fallback = Math.max(0, Math.min(lastIndex, Number(currentIndex || 0)))
  const requested = Number(nextIndex)
  return Number.isInteger(requested) ? Math.max(0, Math.min(lastIndex, requested)) : fallback
}
