import {
  buildCancelledOpenAIAccountMcpElicitationResponse,
  normalizeOpenAIAccountMcpElicitationSubmission,
} from './ai-provider-openai-account-elicitation.mjs'
import {
  createOpenAIAccountRuntimeError,
  normalizeId,
} from './ai-provider-openai-account-shared.mjs'

const DEFAULT_ELICITATION_TIMEOUT_MS = 10 * 60 * 1_000
const pendingMcpElicitations = new Map()

function buildPendingKey(threadId = '') {
  return normalizeId(threadId)
}

function clearEntryResources(entry = null) {
  if (entry?.timeoutHandle) clearTimeout(entry.timeoutHandle)
  if (entry?.abortSignal && entry?.abortHandler) {
    entry.abortSignal.removeEventListener('abort', entry.abortHandler)
  }
  entry?.unsubscribeRendererDestroyed?.()
}

function notifyResolved(entry = null, {
  action = 'cancel',
  reason = 'resolved',
} = {}) {
  if (typeof entry?.onResolved !== 'function') return
  try {
    entry.onResolved({
      threadId: entry.appThreadId,
      providerThreadId: entry.providerThreadId,
      providerTurnId: entry.providerTurnId,
      action,
      reason,
    })
  } catch {
    // Resolution has already reached the provider; UI notification is best effort.
  }
}

function removePendingEntry(entry = null, resolution = {}) {
  if (!entry) return false
  const key = buildPendingKey(entry.appThreadId)
  if (pendingMcpElicitations.get(key) !== entry) return false
  pendingMcpElicitations.delete(key)
  clearEntryResources(entry)
  notifyResolved(entry, resolution)
  return true
}

function buildPublicElicitation(entry = null) {
  if (!entry?.elicitation) return null
  return {
    ...entry.elicitation,
    threadId: entry.appThreadId,
    responsePending: entry.status === 'responding',
  }
}

async function expirePendingEntry(entry = null, reason = 'timeout') {
  if (!entry || entry.status !== 'pending') return
  entry.status = 'responding'
  try {
    await entry.bridge.respond(
      entry.bridgeRequestId,
      buildCancelledOpenAIAccountMcpElicitationResponse('cancel'),
    )
  } catch {
    // The provider may already have cancelled or closed the request.
  } finally {
    removePendingEntry(entry, {
      action: 'cancel',
      reason,
    })
  }
}

export function registerOpenAIAccountPendingMcpElicitation(entry = null) {
  const source = entry && typeof entry === 'object' ? entry : {}
  const appThreadId = normalizeId(source.appThreadId)
  const providerThreadId = normalizeId(source.providerThreadId)
  const providerTurnId = normalizeId(source.providerTurnId)
  const bridgeRequestId = Number(source.bridgeRequestId)
  const rendererSenderId = Number(source.rendererSenderId || 0)
  if (
    !appThreadId
    || !providerThreadId
    || !Number.isFinite(bridgeRequestId)
    || typeof source.bridge?.respond !== 'function'
    || source.elicitation?.mode !== 'form'
  ) {
    throw createOpenAIAccountRuntimeError(
      'account_runtime_malformed_mcp_elicitation',
      'OpenAI account runtime received malformed MCP elicitation scope.',
    )
  }
  const key = buildPendingKey(appThreadId)
  if (pendingMcpElicitations.has(key)) {
    throw createOpenAIAccountRuntimeError(
      'account_runtime_concurrent_mcp_elicitation',
      `OpenAI account runtime already has a pending MCP elicitation for thread ${appThreadId}.`,
    )
  }

  const timeoutMs = Math.max(
    1_000,
    Number(source.timeoutMs || DEFAULT_ELICITATION_TIMEOUT_MS) || DEFAULT_ELICITATION_TIMEOUT_MS,
  )
  const registered = {
    bridge: source.bridge,
    bridgeRequestId,
    appThreadId,
    providerThreadId,
    providerTurnId,
    rendererSenderId: Number.isFinite(rendererSenderId) ? rendererSenderId : 0,
    elicitation: source.elicitation,
    onResolved: source.onResolved,
    status: 'pending',
    timeoutHandle: null,
    abortSignal: source.abortSignal || null,
    abortHandler: null,
    unsubscribeRendererDestroyed: null,
  }
  pendingMcpElicitations.set(key, registered)
  registered.timeoutHandle = setTimeout(() => {
    void expirePendingEntry(registered, 'timeout')
  }, timeoutMs)
  registered.timeoutHandle.unref?.()
  if (registered.abortSignal) {
    registered.abortHandler = () => {
      void expirePendingEntry(registered, 'turn_aborted')
    }
    registered.abortSignal.addEventListener('abort', registered.abortHandler, { once: true })
    if (registered.abortSignal.aborted) registered.abortHandler()
  }
  if (typeof source.subscribeRendererDestroyed === 'function') {
    const unsubscribe = source.subscribeRendererDestroyed(() => {
      void expirePendingEntry(registered, 'renderer_destroyed')
    })
    registered.unsubscribeRendererDestroyed = typeof unsubscribe === 'function' ? unsubscribe : null
  }
  return buildPublicElicitation(registered)
}

export function getOpenAIAccountPendingMcpElicitation({
  threadId = '',
  senderId = 0,
} = {}) {
  const entry = pendingMcpElicitations.get(buildPendingKey(threadId)) || null
  const normalizedSenderId = Number(senderId || 0)
  if (entry?.rendererSenderId && entry.rendererSenderId !== normalizedSenderId) return null
  return buildPublicElicitation(entry)
}

export async function respondToOpenAIAccountPendingMcpElicitation({
  threadId = '',
  action = '',
  content = null,
  senderId = 0,
} = {}) {
  const key = buildPendingKey(threadId)
  const entry = pendingMcpElicitations.get(key) || null
  if (!entry) {
    throw createOpenAIAccountRuntimeError(
      'account_runtime_mcp_elicitation_stale',
      'This MCP elicitation is no longer pending.',
    )
  }
  const normalizedSenderId = Number(senderId || 0)
  if (entry.rendererSenderId && entry.rendererSenderId !== normalizedSenderId) {
    throw createOpenAIAccountRuntimeError(
      'account_runtime_mcp_elicitation_wrong_sender',
      'This MCP elicitation belongs to another renderer.',
    )
  }
  if (entry.status !== 'pending') {
    throw createOpenAIAccountRuntimeError(
      'account_runtime_mcp_elicitation_already_resolved',
      'This MCP elicitation is already being resolved.',
    )
  }

  const normalizedAction = normalizeId(action).toLowerCase()
  let response = null
  if (normalizedAction === 'accept') {
    const submission = normalizeOpenAIAccountMcpElicitationSubmission(
      entry.elicitation,
      content,
    )
    if (!submission.valid) {
      throw createOpenAIAccountRuntimeError(
        'account_runtime_mcp_elicitation_invalid_submission',
        `MCP elicitation response is invalid: ${submission.reason || 'invalid content'}.`,
      )
    }
    response = {
      action: 'accept',
      content: submission.content,
      _meta: null,
    }
  } else {
    response = buildCancelledOpenAIAccountMcpElicitationResponse(normalizedAction)
  }

  entry.status = 'responding'
  try {
    await entry.bridge.respond(entry.bridgeRequestId, response)
    removePendingEntry(entry, {
      action: response.action,
      reason: 'responded',
    })
    return {
      ok: true,
      threadId: entry.appThreadId,
      action: response.action,
    }
  } catch (error) {
    entry.status = 'pending'
    throw createOpenAIAccountRuntimeError(
      normalizeId(error?.reason || error?.code) || 'account_runtime_mcp_elicitation_response_failed',
      normalizeId(error?.message) || 'MCP elicitation response failed to reach the provider.',
    )
  }
}

export function __resetOpenAIAccountPendingMcpElicitationsForTests() {
  for (const entry of pendingMcpElicitations.values()) clearEntryResources(entry)
  pendingMcpElicitations.clear()
}
