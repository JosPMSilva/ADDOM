import { now } from './activity-builders.mjs'

const MAX_MAP_ENTRIES = 300
const MAX_ARRAY_ENTRIES = 400
const MAX_SPEC_ITEMS = 16

function emptyLegacyPlanState() {
  return {
    canonicalPlan: null,
    selectedOptionByMessage: {},
    customDirectionByMessage: {},
    answeredQuestions: {},
    dismissedPlanMessageIds: [],
    hiddenRoleCardIds: [],
    pendingRequestIds: [],
    completedRequestIds: [],
    requestTraceById: {},
    linkedMessageIds: [],
    updatedAt: now(),
  }
}

function sanitizeStringMap(raw, maxEntries = MAX_MAP_ENTRIES) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [keyValue, rawValue] of Object.entries(raw)) {
    if (Object.keys(out).length >= maxEntries) break
    const key = String(keyValue ?? '').trim()
    const value = String(rawValue ?? '').trim()
    if (key && value) out[key] = value
  }
  return out
}

function sanitizeStringArray(raw, maxEntries = MAX_ARRAY_ENTRIES) {
  if (!Array.isArray(raw)) return []
  const out = []
  const seen = new Set()
  for (const item of raw) {
    if (out.length >= maxEntries) break
    const value = String(item ?? '').trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function sanitizeRequestTrace(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [keyValue, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= MAX_MAP_ENTRIES) break
    const key = String(keyValue ?? '').trim()
    if (!key || !value || typeof value !== 'object') continue
    out[key] = {
      messageId: String(value.messageId ?? '').trim(),
      requestId: String(value.requestId ?? '').trim(),
      type: String(value.type ?? '').trim(),
      status: String(value.status ?? '').trim() || 'completed',
      traceSummary: String(value.traceSummary ?? '').trim(),
      completedAt: Number(value.completedAt) || now(),
    }
  }
  return out
}

function sanitizeQuestion(raw = {}, index = 0) {
  const id = String(raw?.id ?? '').trim() || `q${index + 1}`
  const text = String(raw?.text ?? '').trim().slice(0, 500)
  if (!text) return null
  const answer = String(raw?.answer ?? '').trim().slice(0, 500)
  return {
    id,
    text,
    choices: Array.isArray(raw?.choices)
      ? raw.choices.map((value) => String(value ?? '').trim().slice(0, 160)).filter(Boolean).slice(0, 6)
      : [],
    ...(answer ? { answer } : {}),
  }
}

function sanitizeOption(raw = {}, index = 0) {
  const id = String(raw?.id ?? '').trim() || `opt_${index + 1}`
  const title = String(raw?.title ?? '').trim().slice(0, 240)
  const description = String(raw?.description ?? '').trim().slice(0, 500)
  const tradeoff = String(raw?.tradeoff ?? '').trim().slice(0, 500)
  if (!title && !description) return null
  return {
    id, title, description, tradeoff,
    recommended: raw?.recommended === true,
    selected: raw?.selected === true,
  }
}

function sanitizeRequest(raw = {}, index = 0) {
  const id = String(raw?.id ?? '').trim() || `req_${index + 1}`
  const type = String(raw?.type ?? '').trim().slice(0, 80)
  if (!type) return null
  return {
    id,
    type,
    reason: String(raw?.reason ?? '').trim().slice(0, 500),
    url: String(raw?.url ?? '').trim().slice(0, 500),
    topic: String(raw?.topic ?? '').trim().slice(0, 240),
    trackedRequestId: String(raw?.trackedRequestId ?? '').trim().slice(0, 160),
    status: String(raw?.status ?? '').trim().toLowerCase().slice(0, 40) || 'pending',
    traceSummary: String(raw?.traceSummary ?? '').trim().slice(0, 500),
    filePaths: Array.isArray(raw?.filePaths)
      ? raw.filePaths.map((value) => String(value ?? '').trim().replace(/\\/g, '/').slice(0, 260)).filter(Boolean).slice(0, 20)
      : [],
  }
}

function sanitizeCanonicalPlan(raw) {
  if (!raw || typeof raw !== 'object') return null
  const canonicalPlan = {
    messageId: String(raw.messageId ?? '').trim().slice(0, 160),
    summary: String(raw.summary ?? '').trim().slice(0, 500),
    selectedOptionId: String(raw.selectedOptionId ?? '').trim().slice(0, 120),
    customDirection: String(raw.customDirection ?? '').trim().slice(0, 500),
    questions: Array.isArray(raw.questions)
      ? raw.questions.map(sanitizeQuestion).filter(Boolean).slice(0, MAX_SPEC_ITEMS)
      : [],
    options: Array.isArray(raw.options)
      ? raw.options.map(sanitizeOption).filter(Boolean).slice(0, MAX_SPEC_ITEMS)
      : [],
    requests: Array.isArray(raw.requests)
      ? raw.requests.map(sanitizeRequest).filter(Boolean).slice(0, MAX_SPEC_ITEMS)
      : [],
    generatedAt: Number(raw.generatedAt) || now(),
  }
  return Object.entries(canonicalPlan).some(([key, value]) => (
    key !== 'generatedAt' && (Array.isArray(value) ? value.length > 0 : Boolean(value))
  )) ? canonicalPlan : null
}

export function sanitizeLegacyPlanState(raw) {
  const fallback = emptyLegacyPlanState()
  if (!raw || typeof raw !== 'object') return fallback
  return {
    canonicalPlan: sanitizeCanonicalPlan(raw.canonicalPlan),
    selectedOptionByMessage: sanitizeStringMap(raw.selectedOptionByMessage),
    customDirectionByMessage: sanitizeStringMap(raw.customDirectionByMessage),
    answeredQuestions: sanitizeStringMap(raw.answeredQuestions, MAX_ARRAY_ENTRIES),
    dismissedPlanMessageIds: sanitizeStringArray(raw.dismissedPlanMessageIds, MAX_MAP_ENTRIES),
    hiddenRoleCardIds: sanitizeStringArray(raw.hiddenRoleCardIds, MAX_MAP_ENTRIES),
    pendingRequestIds: sanitizeStringArray(raw.pendingRequestIds),
    completedRequestIds: sanitizeStringArray(raw.completedRequestIds),
    requestTraceById: sanitizeRequestTrace(raw.requestTraceById),
    linkedMessageIds: sanitizeStringArray(raw.linkedMessageIds, MAX_MAP_ENTRIES),
    updatedAt: Number(raw.updatedAt) || fallback.updatedAt,
  }
}
