const MAX_QUESTIONS = 5
const MAX_QUESTION_LENGTH = 1_200
const MAX_ANSWER_LENGTH = 1_200
const MAX_FEEDBACK_ITEMS = 10
const DIRECTION_STAGES = new Set(['collecting_answers', 'synthesizing', 'review'])
const SYNTHESIS_STATUSES = new Set(['pending', 'failed', 'completed'])

function text(value = '', maxLength = 0) {
  const normalized = String(value || '').trim()
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized
}

function positiveRevision(value = 0) {
  return Math.max(0, Number(value || 0) || 0)
}

function normalizeOption(raw = {}, index = 0, recommendedSeen = false) {
  const id = text(raw?.id || `option_${index + 1}`, 128).toLowerCase()
  const label = text(raw?.label, 160)
  if (!id || !label) return null
  const description = text(raw?.description, 320)
  const recommended = raw?.recommended === true && !recommendedSeen
  return { id, label, description, recommended }
}

export function normalizePlanDirectionOptions(raw = []) {
  const source = Array.isArray(raw) ? raw : []
  if (source.length < 2 || source.length > 3) return []
  const seen = new Set()
  let recommendedSeen = false
  const options = []
  for (const [index, entry] of source.entries()) {
    const option = normalizeOption(entry, index, recommendedSeen)
    if (!option || seen.has(option.id)) return []
    seen.add(option.id)
    recommendedSeen ||= option.recommended
    options.push(option)
  }
  return options
}

export function normalizePlanDirectionAnswer(raw = null, options = []) {
  if (typeof raw === 'string') {
    const answerText = text(raw, MAX_ANSWER_LENGTH)
    return answerText ? { kind: 'custom', optionId: '', text: answerText } : null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const kind = text(raw.kind, 24).toLowerCase()
  if (kind === 'option') {
    const optionId = text(raw.optionId || raw.option_id, 128).toLowerCase()
    const option = options.find((entry) => entry.id === optionId)
    return option ? { kind: 'option', optionId, text: option.label } : null
  }
  const answerText = text(raw.text || raw.answer, MAX_ANSWER_LENGTH)
  return answerText ? { kind: 'custom', optionId: '', text: answerText } : null
}

export function normalizePlanDirectionQuestions(raw = []) {
  const seen = new Set()
  const questions = []
  for (const [index, entry] of (Array.isArray(raw) ? raw : []).entries()) {
    if (questions.length >= MAX_QUESTIONS) break
    const id = text(entry?.id || `question_${index + 1}`, 128).toLowerCase()
    const question = text(entry?.question || entry?.text, MAX_QUESTION_LENGTH)
    if (!id || !question || seen.has(id)) continue
    seen.add(id)
    const options = normalizePlanDirectionOptions(entry?.options)
    questions.push({
      id,
      header: text(entry?.header, 120),
      question,
      options,
      answer: normalizePlanDirectionAnswer(entry?.answer, options),
    })
  }
  return questions
}

function normalizeFeedback(raw = []) {
  return (Array.isArray(raw) ? raw : []).slice(-MAX_FEEDBACK_ITEMS).map((entry, index) => {
    const value = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {}
    const feedbackText = text(value.text || entry, MAX_ANSWER_LENGTH)
    if (!feedbackText) return null
    return {
      id: text(value.id || `feedback_${index + 1}`, 128),
      text: feedbackText,
      createdAt: text(value.createdAt || value.created_at) || null,
      sourceDirectionRevision: positiveRevision(value.sourceDirectionRevision || value.source_direction_revision),
    }
  }).filter(Boolean)
}

function normalizeSynthesis(raw = null) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const requestId = text(raw.requestId || raw.request_id, 160)
  const status = text(raw.status, 32).toLowerCase()
  if (!requestId || !SYNTHESIS_STATUSES.has(status)) return null
  return {
    requestId,
    sourceDirectionRevision: positiveRevision(raw.sourceDirectionRevision || raw.source_direction_revision),
    sourceAnswerRevision: positiveRevision(raw.sourceAnswerRevision || raw.source_answer_revision),
    status,
    error: text(raw.error, 1_000),
  }
}

export function normalizePlanDirection(raw = null, { validateRecommendation = () => null } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const summary = text(raw.summary)
  const questions = normalizePlanDirectionQuestions(raw.questions)
  const answeredQuestionIds = questions.filter((question) => question.answer).map((question) => question.id)
  const legacyAnsweredQuestionIds = (Array.isArray(raw.answeredQuestionIds)
    ? raw.answeredQuestionIds
    : raw.answered_question_ids || []).map((value) => text(value, 128)).filter(Boolean)
  const revision = positiveRevision(raw.revision)
  const answerRevision = positiveRevision(raw.answerRevision || raw.answer_revision)
    || answeredQuestionIds.length
  const recommendation = validateRecommendation(raw.recommendation)
  const synthesis = normalizeSynthesis(raw.synthesis)
  const requestedStage = text(raw.stage, 40).toLowerCase()
  const allAnswered = questions.every((question) => question.answer)
  const stage = DIRECTION_STAGES.has(requestedStage)
    ? requestedStage
    : (questions.length === 0 || allAnswered ? 'review' : 'collecting_answers')
  const incorporatedAnswerIds = [...new Set((Array.isArray(raw.incorporatedAnswerIds)
    ? raw.incorporatedAnswerIds
    : raw.incorporated_answer_ids || legacyAnsweredQuestionIds)
    .map((value) => text(value, 128).toLowerCase()).filter((id) => answeredQuestionIds.includes(id)))]
  if (!summary && questions.length === 0 && revision === 0) return null
  return {
    schemaVersion: 2,
    revision,
    answerRevision,
    stage,
    summary,
    answeredQuestionIds,
    incorporatedAnswerIds,
    questions,
    feedback: normalizeFeedback(raw.feedback),
    synthesis,
    ...(recommendation ? { recommendation } : {}),
  }
}

export function formatPlanDirectionAnswer(answer = null) {
  return text(answer?.text, MAX_ANSWER_LENGTH)
}

export function createSynthesisRequest(direction = {}, requestId = '') {
  const id = text(requestId, 160)
  if (!id) throw new Error('A plan direction synthesis request ID is required.')
  return {
    requestId: id,
    sourceDirectionRevision: positiveRevision(direction.revision),
    sourceAnswerRevision: positiveRevision(direction.answerRevision),
    status: 'pending',
    error: '',
  }
}

export function buildPlanDirectionAction(direction = null) {
  if (direction?.stage !== 'synthesizing' || direction?.synthesis?.status !== 'pending') return null
  return {
    kind: 'plan_direction_synthesize',
    requestId: direction.synthesis.requestId,
    expectedDirectionRevision: direction.revision,
    expectedAnswerRevision: direction.answerRevision,
  }
}

export function directionAnswerIds(direction = null) {
  return (Array.isArray(direction?.questions) ? direction.questions : [])
    .filter((question) => question.answer)
    .map((question) => question.id)
}

export function sameAnswer(left = null, right = null) {
  return String(left?.kind || '') === String(right?.kind || '')
    && String(left?.optionId || '') === String(right?.optionId || '')
    && String(left?.text || '') === String(right?.text || '')
}
