import { WebSocket } from 'undici'
import {
  buildTimeoutSignal,
  combineSignals,
  createProgressTimeoutMonitor,
  createProviderStreamStaleError,
} from '../../provider-policy.mjs'
import { resolveOpenAIBaseUrl } from '../../openai-runtime-types.mjs'
import {
  buildOpenAIBackgroundClientForResume,
  buildOpenAIBackgroundResponsePayload,
  pollOpenAIBackgroundResponseUntilTerminal,
} from '../../openai-background-runtime.mjs'
import { createOpenAIResponsesWebSocketResponseState } from './openai-websocket-response-state.mjs'
import { prepareOpenAIResponsesWebSocketRequest } from './openai-websocket-request-builder.mjs'
import {
  acquireOpenAIResponsesWebSocketConnection,
  __resetOpenAIResponsesWebSocketConnectionPoolForTests,
} from './openai-websocket-connection-manager.mjs'
import {
  classifyOpenAIWebSocketRecovery,
  inferOpenAIWebSocketReconnectReason,
  OPENAI_WEBSOCKET_RECONNECT_DELAY_MS,
  OPENAI_WEBSOCKET_RECONNECT_MAX_ATTEMPTS,
} from './openai-websocket-reconnect-policy.mjs'

let openAIResponsesWebSocketFactory = null
let openAIResponsesWebSocketStreamTimeoutMs = 0
let openAIResponsesWebSocketReconnectWait = async (delayMs, { signal } = {}) => new Promise((resolve, reject) => {
  const normalizedDelayMs = Math.max(0, Number(delayMs || 0) || 0)
  let settled = false
  let timer = null

  const cleanup = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    try {
      signal?.removeEventListener?.('abort', handleAbort)
    } catch {
      // Best-effort cleanup only.
    }
  }

  const handleAbort = () => {
    if (settled) return
    settled = true
    cleanup()
    reject(createAbortError('OpenAI Responses WebSocket reconnect aborted.'))
  }

  if (signal?.aborted) {
    handleAbort()
    return
  }

  try {
    signal?.addEventListener?.('abort', handleAbort, { once: true })
  } catch {
    // Best-effort only.
  }

  timer = setTimeout(() => {
    if (settled) return
    settled = true
    cleanup()
    resolve()
  }, normalizedDelayMs)
})

function createReconnectRecoveryError({
  message = 'OpenAI Responses WebSocket closed before a terminal response event was received.',
  responseState = null,
  code = 'websocket_connection_closed',
  reason = 'socket_closed_before_terminal',
} = {}) {
  const error = new Error(String(message || 'OpenAI Responses WebSocket transport failed.').trim() || 'OpenAI Responses WebSocket transport failed.')
  error.providerId = 'openai'
  error.code = String(code || '').trim().toLowerCase() || undefined
  error.openaiWebSocketReconnectRecommended = true
  error.openaiWebSocketReconnectReason = String(reason || 'socket_closed_before_terminal').trim().toLowerCase()
  error.openaiWebSocketEmittedAnyChunk = responseState?.emittedAnyChunk === true
  error.openaiWebSocketResponseId = String(responseState?.responseId || '').trim()
  error.openaiWebSocketConversationId = String(responseState?.conversationId || '').trim()
  return error
}

function createAbortError(message = 'The operation was aborted.') {
  try {
    return new DOMException(message, 'AbortError')
  } catch {
    const error = new Error(message)
    error.name = 'AbortError'
    return error
  }
}

function createTimeoutError(message = 'OpenAI Responses WebSocket request timed out before completion.') {
  const error = new Error(String(message || 'OpenAI Responses WebSocket request timed out before completion.').trim() || 'OpenAI Responses WebSocket request timed out before completion.')
  error.name = 'TimeoutError'
  error.providerId = 'openai'
  error.code = 'openai_websocket_turn_timeout'
  error.openaiWebSocketDeadlineExceeded = true
  return error
}

function createStaleError(timeoutMs = 0, message = 'OpenAI Responses WebSocket stream went stale before completion.') {
  const error = createProviderStreamStaleError({
    providerId: 'openai',
    timeoutMs,
    message,
    code: 'openai_websocket_stream_stale',
  })
  error.openaiWebSocketStreamStale = true
  return error
}

function isLoopbackHost(hostname = '') {
  const normalized = String(hostname || '').trim().toLowerCase().replace(/^\[(.*)\]$/, '$1')
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
}

function isProductionLikeRuntime() {
  const explicitDev = String(process.env.ADDOM_DEV || '').trim()
  if (explicitDev === '1') return false
  if (explicitDev === '0') return true
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production'
}

function assertSecureWebSocketBaseUrl(url) {
  const protocol = String(url?.protocol || '').trim().toLowerCase()
  if (protocol !== 'http:' && protocol !== 'ws:') return
  if (!isLoopbackHost(url?.hostname)) {
    throw new Error('OpenAI Responses WebSocket requires a secure https/wss base URL outside local loopback development.')
  }
  if (isProductionLikeRuntime()) {
    throw new Error('OpenAI Responses WebSocket requires a secure https/wss base URL in production.')
  }
}

function toWebSocketUrl(baseUrl = '') {
  const url = new URL(String(baseUrl || '').trim())
  assertSecureWebSocketBaseUrl(url)
  if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  } else if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  }
  if (!url.pathname.endsWith('/responses')) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/responses`
  }
  return url.toString()
}

export function __toWebSocketUrlForTests(baseUrl = '') {
  return toWebSocketUrl(baseUrl)
}

function createDefaultOpenAIResponsesWebSocket({ apiKey = '', baseUrl = '' } = {}) {
  return new WebSocket(toWebSocketUrl(baseUrl), {
    headers: {
      Authorization: `Bearer ${String(apiKey || '').trim()}`,
    },
  })
}

function resolveWebSocketFactory() {
  return typeof openAIResponsesWebSocketFactory === 'function'
    ? openAIResponsesWebSocketFactory
    : createDefaultOpenAIResponsesWebSocket
}

function extractMessageData(data) {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString('utf8')
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8')
  }
  return String(data ?? '')
}

export function __setOpenAIResponsesWebSocketFactoryForTests(factory) {
  openAIResponsesWebSocketFactory = typeof factory === 'function' ? factory : null
}

export function __resetOpenAIResponsesWebSocketFactoryForTests() {
  openAIResponsesWebSocketFactory = null
  openAIResponsesWebSocketStreamTimeoutMs = 0
  openAIResponsesWebSocketReconnectWait = async (delayMs, { signal } = {}) => new Promise((resolve, reject) => {
    const normalizedDelayMs = Math.max(0, Number(delayMs || 0) || 0)
    let settled = false
    let timer = null

    const cleanup = () => {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      try {
        signal?.removeEventListener?.('abort', handleAbort)
      } catch {
        // Best-effort cleanup only.
      }
    }

    const handleAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(createAbortError('OpenAI Responses WebSocket reconnect aborted.'))
    }

    if (signal?.aborted) {
      handleAbort()
      return
    }

    try {
      signal?.addEventListener?.('abort', handleAbort, { once: true })
    } catch {
      // Best-effort only.
    }

    timer = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }, normalizedDelayMs)
  })
  __resetOpenAIResponsesWebSocketConnectionPoolForTests()
}

export function __setOpenAIResponsesWebSocketReconnectWaitForTests(fn) {
  openAIResponsesWebSocketReconnectWait = typeof fn === 'function' ? fn : openAIResponsesWebSocketReconnectWait
}

export function __setOpenAIResponsesWebSocketStreamTimeoutMsForTests(timeoutMs) {
  const numeric = Number(timeoutMs)
  openAIResponsesWebSocketStreamTimeoutMs = Number.isFinite(numeric) && numeric > 0
    ? Math.round(numeric)
    : 0
}

export async function createExperimentalOpenAIResponsesWebSocketStream({
  apiKey = '',
  messages = [],
  options = {},
  onChunk = () => {},
  onReasoning = () => {},
  requestPreparation = null,
} = {}) {
  const resolvedRequestPreparation = requestPreparation && typeof requestPreparation === 'object'
    ? requestPreparation
    : prepareOpenAIResponsesWebSocketRequest({
      messages,
      options,
    })
  if (!resolvedRequestPreparation.eligible) {
    const error = new Error(`OpenAI Responses WebSocket transport is not eligible for this turn (${resolvedRequestPreparation.reason || 'unknown_reason'}).`)
    error.providerId = 'openai'
    error.code = 'openai_websocket_ineligible'
    error.openaiWebSocketFallbackRecommended = true
    error.openaiWebSocketFallbackReason = String(resolvedRequestPreparation.reason || 'unknown_reason')
    error.openaiWebSocketEmittedAnyChunk = false
    throw error
  }

  const emitTransportStatus = (payload = {}) => {
    if (typeof options?.onTransportStatus !== 'function') return
    options.onTransportStatus({
      transportMode: 'responses_websocket_experimental',
      ...payload,
    })
  }
  const fallbackEnabled = options?.providerRuntimeSettings?.websocketFallbackToStream !== false
  let reconnectAttempt = 0
  let reconnectReason = ''
  const turnStartedAt = Date.now()
  const requestedStreamTimeoutMs = Number(options?.streamTimeoutMs || 0)
  const effectiveStreamTimeoutMs = Number.isFinite(requestedStreamTimeoutMs) && requestedStreamTimeoutMs > 0
    ? Math.round(requestedStreamTimeoutMs)
    : (Number.isFinite(Number(openAIResponsesWebSocketStreamTimeoutMs))
        && Number(openAIResponsesWebSocketStreamTimeoutMs) > 0
        ? Math.round(Number(openAIResponsesWebSocketStreamTimeoutMs))
        : 0)
  const turnDeadlineAt = effectiveStreamTimeoutMs > 0
    ? turnStartedAt + effectiveStreamTimeoutMs
    : 0

  const resolveRemainingTurnBudgetMs = () => {
    if (!(turnDeadlineAt > 0)) return 0
    return Math.max(0, turnDeadlineAt - Date.now())
  }

  const runAttempt = async () => {
    const remainingTurnBudgetMs = resolveRemainingTurnBudgetMs()
    if (turnDeadlineAt > 0 && remainingTurnBudgetMs <= 0) {
      throw createTimeoutError()
    }
    const baseUrl = resolveOpenAIBaseUrl()
    const releaseThreadSocketId = String(options?.requestContext?.threadId || '').trim()
    const connection = acquireOpenAIResponsesWebSocketConnection({
      apiKey,
      baseUrl,
      threadId: releaseThreadSocketId,
      createSocket: () => resolveWebSocketFactory()({
        apiKey,
        baseUrl,
      }),
    })
    const socket = connection.socket
    const attemptTimeoutSignal = buildTimeoutSignal(remainingTurnBudgetMs)
    const requestedIdleTimeoutMs = Number(options?.streamIdleTimeoutMs || 0)
    const resolvedIdleTimeoutMs = requestedIdleTimeoutMs > 0
      ? Math.min(requestedIdleTimeoutMs, Math.max(5_000, remainingTurnBudgetMs || requestedIdleTimeoutMs))
      : 0
    const staleMonitor = createProgressTimeoutMonitor({
      timeoutMs: resolvedIdleTimeoutMs,
      buildError: () => createStaleError(resolvedIdleTimeoutMs),
    })
    const timeoutSignal = combineSignals(options?.abortSignal, attemptTimeoutSignal, staleMonitor.signal)

    return new Promise((resolve, reject) => {
      const responseState = createOpenAIResponsesWebSocketResponseState({
        modelId: resolvedRequestPreparation.modelId,
        onChunk,
        onReasoning,
        onProviderToolStatus: typeof options?.onProviderToolStatus === 'function'
          ? options.onProviderToolStatus
          : () => {},
        onProviderToolOutput: typeof options?.onProviderToolOutput === 'function'
          ? options.onProviderToolOutput
          : () => {},
        onProgress: () => staleMonitor.markProgress(),
      })
      const warmupBody = (
        resolvedRequestPreparation?.warmupBody
        && typeof resolvedRequestPreparation.warmupBody === 'object'
      )
        ? resolvedRequestPreparation.warmupBody
        : null
      let warmupPending = warmupBody !== null
      let warmupResponseId = ''
      let settled = false
      let storedResponseRecoveryInFlight = false
      let readyHandlerArmed = false
      const transportMeta = {
        transportMode: 'responses_websocket_experimental',
        websocketPooledConnection: connection.pooled === true,
        websocketReusedConnection: connection.reused === true,
        websocketReuseMode: String(connection.reuseMode || '').trim().toLowerCase() || (
          connection.pooled === true ? 'thread_socket_fresh' : 'unpooled_socket'
        ),
        websocketConnectionAgeMsAtAcquire: Math.max(0, Date.now() - (Number(connection.connectionCreatedAt || 0) || Date.now())),
        websocketReconnectAttempt: reconnectAttempt,
        websocketReconnectMaxAttempts: OPENAI_WEBSOCKET_RECONNECT_MAX_ATTEMPTS,
        websocketReconnectReason: reconnectReason,
        websocketRecovered: reconnectAttempt > 0,
        websocketFallbackAfterReconnectExhausted: false,
      }
      const storedResponseRecoveryEligible = resolvedRequestPreparation?.createBody?.store !== false

      const buildTransportMeta = (patch = {}) => ({
        ...transportMeta,
        ...(patch && typeof patch === 'object' ? patch : {}),
      })

      const finalizeWithError = (error) => {
        if (settled) return
        settled = true
        cleanup()
        connection.release({ keepAlive: false })
        reject(error)
      }

      const finalizeWithPayload = (payload = null, { keepAlive = true, transportMetaPatch = null } = {}) => {
        if (settled) return
        const basePayload = payload && typeof payload === 'object' ? payload : {}
        basePayload.providerResponseMeta = {
          ...(basePayload.providerResponseMeta && typeof basePayload.providerResponseMeta === 'object'
            ? basePayload.providerResponseMeta
            : {}),
          ...buildTransportMeta(transportMetaPatch),
        }
        settled = true
        cleanup()
        connection.release({ keepAlive })
        resolve(basePayload)
      }

      const finalizeWithResult = () => {
        if (settled) return
        try {
          const payload = responseState.buildResult()
          finalizeWithPayload(payload, { keepAlive: true })
        } catch (error) {
          finalizeWithError(error)
        }
      }

      const maybeRecoverStoredResponse = async (reason = 'partial_output_disconnect') => {
        if (settled || storedResponseRecoveryInFlight) return false
        if (responseState.emittedAnyChunk !== true) return false
        if (storedResponseRecoveryEligible !== true) return false
        staleMonitor.clear()
        const responseId = String(responseState.responseId || '').trim()
        if (!responseId) return false
        const remainingTurnBudgetMs = resolveRemainingTurnBudgetMs()
        if (turnDeadlineAt > 0 && remainingTurnBudgetMs <= 0) {
          return {
            recovered: false,
            error: createTimeoutError(
              'OpenAI Responses WebSocket request timed out before stored-response recovery could start.',
            ),
          }
        }

        storedResponseRecoveryInFlight = true
        const recoveryTimeoutSignal = buildTimeoutSignal(remainingTurnBudgetMs)
        emitTransportStatus({
          status: 'recovering_stored_response',
          reason,
          responseId,
        })
        try {
          const recoveryAbortSignal = combineSignals(options?.abortSignal, recoveryTimeoutSignal)
          const client = buildOpenAIBackgroundClientForResume(apiKey)
          const recoveredResponse = await pollOpenAIBackgroundResponseUntilTerminal(
            client,
            responseId,
            recoveryAbortSignal,
          )
          const recoveredPayload = buildOpenAIBackgroundResponsePayload(recoveredResponse)
          emitTransportStatus({
            status: 'recovered_stored_response',
            reason,
            responseId,
          })
          finalizeWithPayload(recoveredPayload, {
            keepAlive: false,
            transportMetaPatch: {
              websocketStoredResponseRecoveryAttempted: true,
              websocketRecoveredFromStoredResponse: true,
            },
          })
          return {
            recovered: true,
            error: null,
          }
        } catch (error) {
          const recoveryError = (
            recoveryTimeoutSignal?.aborted
            && options?.abortSignal?.aborted !== true
          )
            ? createTimeoutError(
              'OpenAI Responses WebSocket request timed out while recovering the stored response.',
            )
            : (error && typeof error === 'object'
                ? error
                : new Error(String(error || 'Stored-response recovery failed.')))
          recoveryError.providerId = 'openai'
          recoveryError.openaiWebSocketStoredResponseRecoveryAttempted = true
          recoveryError.openaiWebSocketRecoveredFromStoredResponse = false
          recoveryError.openaiWebSocketResponseId = responseId
          emitTransportStatus({
            status: 'stored_response_recovery_failed',
            reason,
            responseId,
          })
          return {
            recovered: false,
            error: recoveryError,
          }
        } finally {
          storedResponseRecoveryInFlight = false
        }
      }

      const handleAbort = () => {
        const error = options?.abortSignal?.aborted
          ? createAbortError('OpenAI Responses WebSocket request aborted.')
          : staleMonitor.timedOut()
            ? (staleMonitor.error() || createStaleError(resolvedIdleTimeoutMs))
          : createTimeoutError('OpenAI Responses WebSocket request timed out before completion.')
        error.providerId = 'openai'
        error.openaiWebSocketEmittedAnyChunk = responseState.emittedAnyChunk === true
        finalizeWithError(error)
      }

      const handleOpen = () => {
        if (readyHandlerArmed) return
        readyHandlerArmed = true
        try {
          const firstBody = warmupPending ? warmupBody : resolvedRequestPreparation.createBody
          socket.send(JSON.stringify({
            type: 'response.create',
            ...firstBody,
          }))
        } catch (error) {
          finalizeWithError(error)
        }
      }

      const handleMessage = (event) => {
        try {
          const parsed = JSON.parse(extractMessageData(event?.data))
          if (warmupPending) {
            const eventType = String(parsed?.type || '').trim()
            if (eventType === 'error') {
              const message = String(
                parsed?.error?.message
                || parsed?.message
                || 'OpenAI Responses WebSocket warmup failed.',
              ).trim() || 'OpenAI Responses WebSocket warmup failed.'
              const error = new Error(message)
              error.providerId = 'openai'
              error.code = String(parsed?.error?.code || '').trim().toLowerCase() || undefined
              finalizeWithError(error)
              return
            }
            if (eventType === 'response.failed') {
              const message = String(
                parsed?.response?.error?.message
                || parsed?.response?.status_details?.error?.message
                || 'OpenAI Responses WebSocket warmup failed.',
              ).trim() || 'OpenAI Responses WebSocket warmup failed.'
              const error = new Error(message)
              error.providerId = 'openai'
              error.code = String(parsed?.response?.error?.code || '').trim().toLowerCase() || undefined
              finalizeWithError(error)
              return
            }
            if (eventType === 'response.completed' || eventType === 'response.incomplete') {
              warmupResponseId = String(parsed?.response?.id || '').trim()
              if (!warmupResponseId) {
                finalizeWithError(new Error('OpenAI Responses WebSocket warmup did not return a response ID.'))
                return
              }
              warmupPending = false
              socket.send(JSON.stringify({
                type: 'response.create',
                ...resolvedRequestPreparation.createBody,
                previous_response_id: warmupResponseId,
              }))
              return
            }
            return
          }
          const terminal = responseState.handleEvent(parsed)
          if (terminal) {
            finalizeWithResult()
          }
        } catch (error) {
          finalizeWithError(error)
        }
      }

      const handleError = (event) => {
        if (storedResponseRecoveryInFlight) return
        const message = String(event?.error?.message || event?.message || 'OpenAI Responses WebSocket transport failed.').trim()
          || 'OpenAI Responses WebSocket transport failed.'
        const error = new Error(message)
        error.providerId = 'openai'
        error.code = String(event?.error?.code || '').trim().toLowerCase() || undefined
        error.openaiWebSocketEmittedAnyChunk = responseState.emittedAnyChunk === true
        error.openaiWebSocketResponseId = String(responseState.responseId || '').trim()
        error.openaiWebSocketConversationId = String(responseState.conversationId || '').trim()
        if (responseState.emittedAnyChunk === true) {
          void (async () => {
            const recoveryOutcome = await maybeRecoverStoredResponse('transport_error_after_partial_output')
            if (recoveryOutcome?.recovered === true) return
            if (recoveryOutcome?.error) {
              recoveryOutcome.error.cause = recoveryOutcome.error.cause || error
              finalizeWithError(recoveryOutcome.error)
              return
            }
            finalizeWithError(error)
          })()
          return
        }
        finalizeWithError(error)
      }

      const handleClose = (event) => {
        if (settled) return
        if (storedResponseRecoveryInFlight) return
        if (responseState.hasTerminalEvent === true) {
          finalizeWithResult()
          return
        }
        if (responseState.emittedAnyChunk !== true) {
          const closeMessage = String(event?.reason || '').trim()
          finalizeWithError(createReconnectRecoveryError({
            message: closeMessage
              ? `OpenAI Responses WebSocket closed before a terminal response event was received (${closeMessage}).`
              : 'OpenAI Responses WebSocket closed before a terminal response event was received.',
            responseState,
            reason: 'socket_closed_before_terminal',
          }))
          return
        }
        void (async () => {
          const recoveryOutcome = await maybeRecoverStoredResponse('socket_closed_after_partial_output')
          if (recoveryOutcome?.recovered === true) return
          const error = new Error('OpenAI Responses WebSocket closed after partial output and before a terminal response event was received.')
          error.providerId = 'openai'
          error.code = 'websocket_connection_closed'
          error.openaiWebSocketEmittedAnyChunk = true
          error.openaiWebSocketResponseId = String(responseState.responseId || '').trim()
          error.openaiWebSocketConversationId = String(responseState.conversationId || '').trim()
          if (recoveryOutcome?.error) {
            recoveryOutcome.error.cause = recoveryOutcome.error.cause || error
            finalizeWithError(recoveryOutcome.error)
            return
          }
          finalizeWithError(error)
        })()
      }

      const cleanup = () => {
        staleMonitor.dispose()
        timeoutSignal?.removeEventListener?.('abort', handleAbort)
        socket?.removeEventListener?.('open', handleOpen)
        socket?.removeEventListener?.('message', handleMessage)
        socket?.removeEventListener?.('error', handleError)
        socket?.removeEventListener?.('close', handleClose)
      }

      if (timeoutSignal?.aborted) {
        handleAbort()
        return
      }

      staleMonitor.markProgress()
      timeoutSignal?.addEventListener?.('abort', handleAbort, { once: true })
      socket.addEventListener('open', handleOpen)
      socket.addEventListener('message', handleMessage)
      socket.addEventListener('error', handleError)
      socket.addEventListener('close', handleClose)
      if (connection.ready === true) {
        handleOpen()
      } else {
        connection.readyPromise.catch((error) => {
          if (!settled) finalizeWithError(error)
        })
      }
    })
  }

  for (;;) {
    try {
      const payload = await runAttempt()
      if (reconnectAttempt > 0) {
        emitTransportStatus({
          status: 'recovered',
          attempt: reconnectAttempt,
          maxAttempts: OPENAI_WEBSOCKET_RECONNECT_MAX_ATTEMPTS,
          reason: reconnectReason || 'transient_transport_failure',
        })
      }
      return payload
    } catch (error) {
      const recovery = classifyOpenAIWebSocketRecovery({
        error,
        reconnectAttempt,
        fallbackEnabled,
        abortSignal: options?.abortSignal,
      })

      if (recovery.action === 'retryable_pre_output') {
        reconnectAttempt += 1
        reconnectReason = recovery.reason || inferOpenAIWebSocketReconnectReason(error)
        if (turnDeadlineAt > 0 && resolveRemainingTurnBudgetMs() <= OPENAI_WEBSOCKET_RECONNECT_DELAY_MS) {
          const timeoutError = createTimeoutError(
            'OpenAI Responses WebSocket reconnect budget was exhausted before the next retry could start.',
          )
          timeoutError.openaiWebSocketReconnectAttempt = reconnectAttempt
          timeoutError.openaiWebSocketReconnectMaxAttempts = OPENAI_WEBSOCKET_RECONNECT_MAX_ATTEMPTS
          timeoutError.openaiWebSocketReconnectReason = reconnectReason
          timeoutError.openaiWebSocketEmittedAnyChunk = error?.openaiWebSocketEmittedAnyChunk === true
          throw timeoutError
        }
        emitTransportStatus({
          status: 'reconnecting',
          attempt: reconnectAttempt,
          maxAttempts: OPENAI_WEBSOCKET_RECONNECT_MAX_ATTEMPTS,
          reason: reconnectReason,
          waitMs: OPENAI_WEBSOCKET_RECONNECT_DELAY_MS,
        })
        try {
          await openAIResponsesWebSocketReconnectWait(OPENAI_WEBSOCKET_RECONNECT_DELAY_MS, {
            signal: options?.abortSignal,
          })
        } catch (waitError) {
          emitTransportStatus({
            status: 'cancelled',
            attempt: reconnectAttempt,
            maxAttempts: OPENAI_WEBSOCKET_RECONNECT_MAX_ATTEMPTS,
            reason: reconnectReason,
            waitMs: OPENAI_WEBSOCKET_RECONNECT_DELAY_MS,
          })
          throw waitError
        }
        continue
      }

      error.openaiWebSocketReconnectAttempt = reconnectAttempt
      error.openaiWebSocketReconnectMaxAttempts = OPENAI_WEBSOCKET_RECONNECT_MAX_ATTEMPTS
      error.openaiWebSocketReconnectReason = recovery.reason || inferOpenAIWebSocketReconnectReason(error)
      error.openaiWebSocketRecovered = false
      error.openaiWebSocketFallbackAfterReconnectExhausted = recovery.action === 'fallback_to_legacy' && recovery.exhausted === true
      if (recovery.exhausted === true) {
        error.openaiWebSocketReconnectExhausted = true
        emitTransportStatus({
          status: 'exhausted',
          attempt: reconnectAttempt,
          maxAttempts: OPENAI_WEBSOCKET_RECONNECT_MAX_ATTEMPTS,
          reason: error.openaiWebSocketReconnectReason,
          waitMs: OPENAI_WEBSOCKET_RECONNECT_DELAY_MS,
        })
      }
      if (recovery.action === 'fallback_to_legacy' && recovery.exhausted === true) {
        error.openaiWebSocketFallbackRecommended = true
      }
      throw error
    }
  }
}
