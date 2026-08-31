import { normalizeQuestionUserRequest } from '../../common/chat/question-user-request.mjs'
import {
  createOpenAIAccountRuntimeError,
  normalizeId,
} from './ai-provider-openai-account-shared.mjs'

const openAIAccountPendingQuestionUserRequests = new Map()

function extractThreadId(params = null) {
  return normalizeId(params?.threadId || params?.thread?.id)
}

function extractTurnId(params = null) {
  return normalizeId(params?.turnId || params?.turn?.id)
}

function normalizeQuestionUserOptionPayload(option, index = 0) {
  if (typeof option === 'string') {
    const label = normalizeId(option).slice(0, 240)
    if (!label) return null
    return {
      id: `option_${index + 1}`,
      label,
      description: '',
      recommended: false,
    }
  }
  if (!option || typeof option !== 'object' || Array.isArray(option)) return null
  const label = normalizeId(
    option.label
    || option.title
    || option.text
    || option.value,
  ).slice(0, 240)
  if (!label) return null
  return {
    id: normalizeId(option.id || option.value || `option_${index + 1}`).slice(0, 80) || `option_${index + 1}`,
    label,
    description: String(
      option.description
      || option.detail
      || option.hint
      || '',
    ).trim().slice(0, 500),
    recommended: option.recommended === true || option.default === true,
  }
}

function extractQuestionUserPromptText(payload = null) {
  if (!payload || typeof payload !== 'object') return ''
  if (typeof payload.question === 'string') return payload.question
  if (typeof payload.prompt === 'string') return payload.prompt
  if (typeof payload.message === 'string') return payload.message
  if (typeof payload.text === 'string') return payload.text
  if (payload.prompt && typeof payload.prompt === 'object') {
    return String(
      payload.prompt.question
      || payload.prompt.text
      || payload.prompt.message
      || '',
    )
  }
  return ''
}

function extractQuestionUserHeaderText(payload = null) {
  if (!payload || typeof payload !== 'object') return ''
  if (typeof payload.header === 'string') return payload.header
  if (typeof payload.title === 'string') return payload.title
  if (payload.prompt && typeof payload.prompt === 'object') {
    return String(payload.prompt.header || payload.prompt.title || '')
  }
  return ''
}

function extractQuestionUserOptions(payload = null) {
  if (!payload || typeof payload !== 'object') return []
  const rawOptions = Array.isArray(payload.options)
    ? payload.options
    : (Array.isArray(payload.choices)
      ? payload.choices
      : (Array.isArray(payload.decisionOptions) ? payload.decisionOptions : []))
  return rawOptions
    .map((option, index) => normalizeQuestionUserOptionPayload(option, index))
    .filter(Boolean)
    .slice(0, 12)
}

export function extractQuestionUserRequestId(payload = null) {
  return normalizeId(
    payload?.requestId
    || payload?.request?.id
    || payload?.id,
  )
}

function buildOpenAIAccountPendingQuestionUserKey({
  threadId = '',
  requestId = '',
} = {}) {
  const normalizedThreadId = normalizeId(threadId)
  const normalizedRequestId = normalizeId(requestId)
  if (!normalizedThreadId || !normalizedRequestId) return ''
  return `${normalizedThreadId}::${normalizedRequestId}`
}

function matchesOpenAIAccountPendingQuestionUserThreadAlias(entry = null, threadId = '') {
  const normalizedThreadId = normalizeId(threadId)
  if (!normalizedThreadId || !entry || typeof entry !== 'object') return false
  return (
    normalizeId(entry.threadId) === normalizedThreadId
    || normalizeId(entry.appThreadId) === normalizedThreadId
  )
}

function resolveOpenAIAccountPendingQuestionUserEntry({
  threadId = '',
  requestId = '',
} = {}) {
  const key = buildOpenAIAccountPendingQuestionUserKey({ threadId, requestId })
  if (key && openAIAccountPendingQuestionUserRequests.has(key)) {
    return openAIAccountPendingQuestionUserRequests.get(key) || null
  }
  const normalizedRequestId = normalizeId(requestId)
  const normalizedThreadId = normalizeId(threadId)
  if (!normalizedRequestId || !normalizedThreadId) return null
  return Array.from(openAIAccountPendingQuestionUserRequests.values())
    .find((entry) => (
      normalizeId(entry?.requestId) === normalizedRequestId
      && matchesOpenAIAccountPendingQuestionUserThreadAlias(entry, normalizedThreadId)
    ))
    || null
}

function listOpenAIAccountPendingQuestionUserEntriesForThread(threadId = '') {
  const normalizedThreadId = normalizeId(threadId)
  if (!normalizedThreadId) return []
  return Array.from(openAIAccountPendingQuestionUserRequests.values())
    .filter((entry) => matchesOpenAIAccountPendingQuestionUserThreadAlias(entry, normalizedThreadId))
}

export function normalizeOpenAIAccountQuestionUserRequest(params = null, {
  threadId = '',
  turnId = '',
  itemId = '',
  originMode = '',
} = {}) {
  const normalized = normalizeQuestionUserRequest({
    source: 'openai_account_bridge',
    answerMode: 'bridge_response',
    requestId: extractQuestionUserRequestId(params),
    threadId: extractThreadId(params) || threadId,
    turnId: extractTurnId(params) || turnId,
    itemId: normalizeId(params?.itemId || params?.item?.id || itemId),
    originMode,
    header: extractQuestionUserHeaderText(params),
    question: extractQuestionUserPromptText(params),
    options: extractQuestionUserOptions(params),
  })
  return normalized && normalized.source === 'openai_account_bridge'
    ? normalized
    : null
}

export function buildOpenAIAccountQuestionUserResponsePayload({
  answer = '',
  selectedOptionId = '',
} = {}) {
  const normalizedAnswer = String(answer || '').trim()
  if (!normalizedAnswer) {
    throw createOpenAIAccountRuntimeError(
      'account_runtime_question_user_empty_answer',
      'OpenAI account clarification answers must not be empty.',
    )
  }
  const normalizedSelectedOptionId = normalizeId(selectedOptionId)
  return normalizedSelectedOptionId
    ? { text: normalizedAnswer, selectedOptionId: normalizedSelectedOptionId }
    : { text: normalizedAnswer }
}

export function registerOpenAIAccountPendingQuestionUserRequest(entry = null) {
  const source = entry && typeof entry === 'object' ? entry : null
  const threadId = normalizeId(source?.threadId)
  const appThreadId = normalizeId(source?.appThreadId)
  const requestId = normalizeId(source?.requestId)
  const bridgeRequestId = Number(source?.bridgeRequestId)
  if (!threadId || !requestId || !Number.isFinite(bridgeRequestId)) {
    throw createOpenAIAccountRuntimeError(
      'account_runtime_malformed_request_user_input',
      'OpenAI account runtime received malformed tool/requestUserInput scope.',
    )
  }
  const key = buildOpenAIAccountPendingQuestionUserKey({ threadId, requestId })
  if (!key) {
    throw createOpenAIAccountRuntimeError(
      'account_runtime_malformed_request_user_input',
      'OpenAI account runtime could not register a clarification request without thread and request ids.',
    )
  }
  if (openAIAccountPendingQuestionUserRequests.has(key)) {
    throw createOpenAIAccountRuntimeError(
      'account_runtime_duplicate_request_user_input',
      `OpenAI account runtime received a duplicate clarification request for ${requestId}.`,
    )
  }
  if (listOpenAIAccountPendingQuestionUserEntriesForThread(threadId).length > 0) {
    throw createOpenAIAccountRuntimeError(
      'account_runtime_concurrent_request_user_input',
      `OpenAI account runtime received a second clarification request for thread ${threadId} before the first was resolved.`,
    )
  }
  openAIAccountPendingQuestionUserRequests.set(key, {
    ...source,
    threadId,
    appThreadId,
    requestId,
    bridgeRequestId,
    turnId: normalizeId(source?.turnId),
    itemId: normalizeId(source?.itemId),
    status: 'pending',
    questionUser: normalizeQuestionUserRequest(source?.questionUser),
    createdAt: Number(source?.createdAt || Date.now()) || Date.now(),
  })
  return openAIAccountPendingQuestionUserRequests.get(key) || null
}

export function clearOpenAIAccountPendingQuestionUserRequest({
  threadId = '',
  requestId = '',
  reason = '',
} = {}) {
  const entry = resolveOpenAIAccountPendingQuestionUserEntry({ threadId, requestId })
  if (!entry) return false
  openAIAccountPendingQuestionUserRequests.delete(buildOpenAIAccountPendingQuestionUserKey({
    threadId: normalizeId(entry.threadId),
    requestId: normalizeId(entry.requestId),
  }))
  if (typeof entry.onResolved === 'function') {
    try {
      entry.onResolved({
        threadId: normalizeId(entry.threadId),
        turnId: normalizeId(entry.turnId),
        requestId: normalizeId(entry.requestId),
        itemId: normalizeId(entry.itemId),
        reason: normalizeId(reason) || 'resolved',
      })
    } catch {
      // Best-effort UI notification only.
    }
  }
  return true
}

export function clearOpenAIAccountPendingQuestionUserRequestsForTurn({
  threadId = '',
  turnId = '',
  reason = '',
} = {}) {
  const normalizedThreadId = normalizeId(threadId)
  const normalizedTurnId = normalizeId(turnId)
  if (!normalizedThreadId) return 0
  const entries = Array.from(openAIAccountPendingQuestionUserRequests.values())
    .filter((entry) => (
      normalizeId(entry?.threadId) === normalizedThreadId
      && (!normalizedTurnId || normalizeId(entry?.turnId) === normalizedTurnId)
    ))
  for (const entry of entries) {
    clearOpenAIAccountPendingQuestionUserRequest({
      threadId: normalizedThreadId,
      requestId: normalizeId(entry?.requestId),
      reason,
    })
  }
  return entries.length
}

export function getOpenAIAccountPendingQuestionUserRequest({
  threadId = '',
  requestId = '',
} = {}) {
  const normalizedThreadId = normalizeId(threadId)
  const normalizedRequestId = normalizeId(requestId)
  if (normalizedRequestId) {
    const entry = resolveOpenAIAccountPendingQuestionUserEntry({
      threadId: normalizedThreadId,
      requestId: normalizedRequestId,
    })
    return entry?.questionUser ? { ...entry.questionUser } : null
  }
  const entries = listOpenAIAccountPendingQuestionUserEntriesForThread(normalizedThreadId)
  if (entries.length !== 1) return null
  return entries[0]?.questionUser ? { ...entries[0].questionUser } : null
}

export async function respondToOpenAIAccountPendingQuestionUserRequest({
  threadId = '',
  requestId = '',
  answer = '',
  selectedOptionId = '',
  cancel = false,
} = {}) {
  const normalizedThreadId = normalizeId(threadId)
  const normalizedRequestId = normalizeId(requestId)
  const entry = resolveOpenAIAccountPendingQuestionUserEntry({
    threadId: normalizedThreadId,
    requestId: normalizedRequestId,
  })
  if (!entry) {
    throw createOpenAIAccountRuntimeError(
      'account_runtime_request_user_input_stale',
      `OpenAI account clarification request ${normalizedRequestId || 'unknown'} is no longer pending.`,
    )
  }
  if (String(entry.status || '').trim().toLowerCase() !== 'pending') {
    throw createOpenAIAccountRuntimeError(
      'account_runtime_request_user_input_already_resolved',
      `OpenAI account clarification request ${normalizedRequestId || 'unknown'} was already answered.`,
    )
  }

  entry.status = 'responding'
  entry.questionUser = normalizeQuestionUserRequest({
    ...(entry.questionUser && typeof entry.questionUser === 'object' ? entry.questionUser : {}),
    responsePending: true,
  })
  openAIAccountPendingQuestionUserRequests.set(
    buildOpenAIAccountPendingQuestionUserKey({
      threadId: entry.threadId,
      requestId: entry.requestId,
    }),
    entry,
  )

  try {
    const responsePayload = cancel === true
      ? { cancelled: true }
      : buildOpenAIAccountQuestionUserResponsePayload({ answer, selectedOptionId })
    await entry.bridge.respond(entry.bridgeRequestId, responsePayload)
    return {
      ok: true,
      threadId: entry.threadId,
      turnId: entry.turnId,
      requestId: entry.requestId,
      itemId: entry.itemId,
    }
  } catch (error) {
    entry.status = 'pending'
    entry.questionUser = normalizeQuestionUserRequest({
      ...(entry.questionUser && typeof entry.questionUser === 'object' ? entry.questionUser : {}),
      responsePending: false,
    })
    openAIAccountPendingQuestionUserRequests.set(
      buildOpenAIAccountPendingQuestionUserKey({
        threadId: entry.threadId,
        requestId: entry.requestId,
      }),
      entry,
    )
    throw createOpenAIAccountRuntimeError(
      normalizeId(error?.reason || error?.code) || 'account_runtime_request_user_input_response_failed',
      normalizeId(error?.message) || 'OpenAI account clarification response failed to reach the bridge.',
    )
  }
}

export function __resetOpenAIAccountPendingQuestionUserRequestsForTests() {
  openAIAccountPendingQuestionUserRequests.clear()
}
