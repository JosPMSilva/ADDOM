import { emitUsageEvent } from './chat-turn-events.mjs'
import { applyCompactionDiagnostics } from '../../common/chat/compaction-diagnostics.mjs'
import { getOpenAIAccountAuthService } from '../openai-account/openai-account-auth-service.mjs'
import { extractOpenAIAccountThreadTokenUsageTelemetry } from '../api-clients/ai-provider-openai-account-telemetry.mjs'
import { COMPACTION_MODES } from './continuity/compaction-mode-contract.mjs'
import {
  emitOpenAICompactionEvent,
} from './chat-stream-precall-compaction-helpers.mjs'
import { buildOpenAIAccountCompactionUsageRefreshPayload } from './chat-compaction-usage-refresh.mjs'

const ACCOUNT_THREAD_COMPACTION_TIMEOUT_MS = 30_000

let openAIAccountAuthServiceGetterForTests = null

export function normalizeId(value = '') {
  return String(value || '').trim()
}

export function normalizeAuthMethod(value = '') {
  const normalized = normalizeId(value).toLowerCase()
  return normalized || 'api_key'
}

export function buildOpenAICompactionActivityId({
  threadId = '',
  turnId = '',
  mode = '',
  compactionEventType = '',
} = {}) {
  const normalizedThreadId = normalizeId(threadId)
  const normalizedTurnId = normalizeId(turnId)
  const normalizedMode = normalizeId(mode).toLowerCase() || 'automatic'
  const normalizedType = normalizeId(compactionEventType).toLowerCase() || 'provider_compaction'
  if (normalizedThreadId && normalizedTurnId) {
    return `openai_compaction:${normalizedThreadId}:${normalizedTurnId}:${normalizedMode}:${normalizedType}`
  }
  if (normalizedTurnId) return `openai_compaction:${normalizedTurnId}:${normalizedMode}:${normalizedType}`
  if (normalizedThreadId) return `openai_compaction:${normalizedThreadId}:${normalizedMode}:${normalizedType}`
  return `openai_compaction:${normalizedMode}:${normalizedType}`
}

function getOpenAIAccountAuthServiceForCompaction() {
  return typeof openAIAccountAuthServiceGetterForTests === 'function'
    ? openAIAccountAuthServiceGetterForTests()
    : getOpenAIAccountAuthService()
}

export function buildManualCompactionMeta({
  compactionMeta = {},
  requestedCompactionMode = COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
  manualCandidateCompactionModes = [],
  extra = {},
} = {}) {
  return applyCompactionDiagnostics({
    ...compactionMeta,
    ...extra,
  }, {
    selectedCompactionMode: requestedCompactionMode,
    candidateCompactionModes: manualCandidateCompactionModes,
    ...extra,
  })
}

async function waitForAccountThreadCompaction({
  bridge = null,
  bridgeThreadId = '',
  timeoutMs = ACCOUNT_THREAD_COMPACTION_TIMEOUT_MS,
} = {}) {
  const normalizedBridgeThreadId = normalizeId(bridgeThreadId)
  if (!bridge || typeof bridge.on !== 'function' || typeof bridge.startThreadCompaction !== 'function') {
    throw new Error('Codex account bridge is unavailable for manual compaction.')
  }
  if (!normalizedBridgeThreadId) {
    throw new Error('Codex account thread id is required for manual compaction.')
  }

  return await new Promise((resolve, reject) => {
    let settled = false
    let compactionId = ''
    let compactionSeen = false
    let latestThreadTokenUsageTelemetry = null

    const finish = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      bridge.off('notification', onNotification)
      fn(value)
    }

    const onNotification = ({ method = '', params = null } = {}) => {
      const notificationThreadId = normalizeId(params?.threadId || params?.thread?.id)
      if (notificationThreadId && notificationThreadId !== normalizedBridgeThreadId) return
      const safeMethod = normalizeId(method)

      if (safeMethod === 'thread/tokenUsage/updated') {
        latestThreadTokenUsageTelemetry = extractOpenAIAccountThreadTokenUsageTelemetry(params)
        return
      }

      if (safeMethod === 'item/started' || safeMethod === 'item/completed') {
        const item = params?.item && typeof params.item === 'object' ? params.item : null
        if (normalizeId(item?.type) !== 'contextCompaction') return
        compactionSeen = true
        compactionId = normalizeId(item?.id) || compactionId
        return
      }

      if (safeMethod === 'turn/completed') {
        const turn = params?.turn && typeof params.turn === 'object' ? params.turn : {}
        const status = normalizeId(turn?.status).toLowerCase()
        if (status === 'failed' || turn?.error) {
          finish(reject, new Error(normalizeId(turn?.error?.message) || 'Codex account thread compaction failed.'))
          return
        }
        if (status === 'completed') {
          finish(resolve, {
            compactionId,
            turnId: normalizeId(turn?.id),
            compactionSeen,
            latestThreadTokenUsageTelemetry,
            turn,
          })
        }
      }
    }

    const timer = setTimeout(() => {
      finish(reject, new Error('Codex account thread compaction timed out.'))
    }, Math.max(5_000, Number(timeoutMs || ACCOUNT_THREAD_COMPACTION_TIMEOUT_MS) || ACCOUNT_THREAD_COMPACTION_TIMEOUT_MS))

    bridge.on('notification', onNotification)
    Promise.resolve(bridge.startThreadCompaction(normalizedBridgeThreadId))
      .catch((error) => {
        finish(reject, error)
      })
  })
}

export function persistCommandOnlyWebSocketCompaction({
  upsertOpenAIThreadState = () => {},
  activeThreadId = '',
  activeProjectId = '',
  model = '',
  shouldStoreOpenAIState = false,
  toolsetHash = '',
  systemPromptHash = '',
  continuitySignature = '',
  updatedLatestOpenAICompactionId = '',
  manualCompaction = null,
} = {}) {
  if (!manualCompaction) return
  try {
    upsertOpenAIThreadState({
      threadId: activeThreadId,
      projectId: activeProjectId,
      providerId: 'openai',
      model: String(model ?? ''),
      lastResponseId: '',
      conversationId: '',
      storeEnabled: shouldStoreOpenAIState,
      toolsetHash,
      systemPromptHash,
      continuitySignature,
      continuityEpoch: Math.max(1, Number(manualCompaction?.continuityEpoch || 1) || 1),
      continuityReducerVersion: String(manualCompaction?.continuityReducerVersion || '').trim(),
      modeSignature: String(manualCompaction?.modeSignature || '').trim(),
      modelSignature: String(manualCompaction?.modelSignature || '').trim(),
      lastCompactionId: updatedLatestOpenAICompactionId,
      chainValid: true,
      chainInvalidReason: '',
      metadata: {
        pendingManualCompactedWindow: Array.isArray(manualCompaction.compactedWindow)
          ? manualCompaction.compactedWindow
          : [],
        resetChainFromCompaction: true,
      },
    })
  } catch {
    // Best-effort persistence only.
  }
}

export async function runOpenAIAccountThreadCompaction({
  mode = 'manual',
  send = () => {},
  persistTimelineEvent = () => {},
  threadId = '',
  turnId = '',
  providerId = 'openai',
  model = '',
  reason = '',
  selectedCompactionMode = COMPACTION_MODES.CODEX_THREAD_COMPACTION,
  candidateCompactionModes = [],
  bridgeThreadId = '',
  compactionEventPhase = 'running',
  contextCompactionGeneration = 0,
} = {}) {
  const currentCompactionGeneration = Math.max(0, Number(contextCompactionGeneration || 0) || 0)
  const activityId = buildOpenAICompactionActivityId({
    threadId,
    turnId,
    mode,
    compactionEventType: 'codex_thread_compaction',
  })
  emitOpenAICompactionEvent({
    send,
    persistTimelineEvent,
    activityId,
    threadId,
    turnId,
    providerId,
    model,
    status: 'requested',
    mode,
    reason,
    selectedCompactionMode,
    candidateCompactionModes,
    compactionEventType: 'codex_thread_compaction',
    compactionEventPhase,
    compactionEventOccurred: false,
    accountBridgeThreadId: bridgeThreadId,
    contextCompactionGeneration: currentCompactionGeneration,
  })

  const service = getOpenAIAccountAuthServiceForCompaction()
  const bridge = service?.getBridge?.()
  const compactionResult = await waitForAccountThreadCompaction({
    bridge,
    bridgeThreadId,
  })
  const updatedCompactionId = normalizeId(compactionResult?.compactionId || compactionResult?.turnId)
  const nextCompactionGeneration = currentCompactionGeneration + 1
  const usageRefreshPayload = buildOpenAIAccountCompactionUsageRefreshPayload({
    threadId,
    turnId,
    completedTurn: compactionResult?.turn,
    latestThreadTokenUsageTelemetry: compactionResult?.latestThreadTokenUsageTelemetry,
    strategy: selectedCompactionMode || COMPACTION_MODES.CODEX_THREAD_COMPACTION,
    scope: 'thread_reset',
    compactionSource: 'provider',
    status: 'applied',
    authMethod: 'account',
    transportMode: 'codex_app_server_chatgpt',
    accountBridgeThreadId: bridgeThreadId,
    accountBridgeTurnId: compactionResult?.turnId || '',
    contextCompactionGeneration: nextCompactionGeneration,
  })
  emitOpenAICompactionEvent({
    send,
    persistTimelineEvent,
    activityId,
    threadId,
    turnId,
    providerId,
    model,
    status: 'applied',
    mode,
    reason: 'compacted',
    compactionId: updatedCompactionId,
    selectedCompactionMode,
    candidateCompactionModes,
    compactionEventType: 'codex_thread_compaction',
    compactionEventPhase: 'resumed_after',
    compactionEventOccurred: true,
    strategy: usageRefreshPayload?.compactionStrategy,
    scope: usageRefreshPayload?.compactionScope,
    compactionSource: usageRefreshPayload?.compactionSource,
    usageRefreshState: usageRefreshPayload?.usageRefreshState,
    remainingContextTokens: usageRefreshPayload?.contextRemainingTokens,
    threadOccupancyTokens: usageRefreshPayload?.threadOccupancyTokens,
    estimatedAfterTokens: usageRefreshPayload?.estimatedOccupancyTokens,
    modelLimit: usageRefreshPayload?.modelLimit,
    accountBridgeThreadId: bridgeThreadId,
    accountBridgeTurnId: compactionResult?.turnId || '',
    contextCompactionGeneration: nextCompactionGeneration,
  })
  emitUsageEvent({
    usagePayload: usageRefreshPayload,
    send,
    persistTimelineEvent,
  })

  return {
    activityId,
    compactionId: updatedCompactionId,
    turnId: normalizeId(compactionResult?.turnId),
    contextCompactionGeneration: nextCompactionGeneration,
  }
}

export function persistCommandOnlyAccountCompaction({
  upsertOpenAIThreadState = () => {},
  activeThreadId = '',
  activeProjectId = '',
  model = '',
  shouldStoreOpenAIState = false,
  toolsetHash = '',
  systemPromptHash = '',
  continuitySignature = '',
  updatedLatestOpenAICompactionId = '',
  effectiveOpenAIContinuation = null,
  manualDecision = null,
} = {}) {
  try {
    upsertOpenAIThreadState({
      threadId: activeThreadId,
      projectId: activeProjectId,
      providerId: 'openai',
      model: String(model ?? ''),
      lastResponseId: normalizeId(effectiveOpenAIContinuation?.state?.lastResponseId),
      conversationId: normalizeId(effectiveOpenAIContinuation?.state?.conversationId),
      storeEnabled: shouldStoreOpenAIState,
      toolsetHash,
      systemPromptHash,
      continuitySignature,
      continuityEpoch: Math.max(1, Number(effectiveOpenAIContinuation?.state?.continuityEpoch || 1) || 1),
      continuityReducerVersion: String(effectiveOpenAIContinuation?.state?.continuityReducerVersion || '').trim(),
      modeSignature: String(effectiveOpenAIContinuation?.state?.modeSignature || '').trim(),
      modelSignature: String(effectiveOpenAIContinuation?.state?.modelSignature || '').trim(),
      lastCompactionId: updatedLatestOpenAICompactionId,
      chainValid: true,
      chainInvalidReason: '',
      metadata: {
        ...(normalizeId(manualDecision?.accountBridgeThreadId)
          ? { accountBridgeThreadId: normalizeId(manualDecision.accountBridgeThreadId) }
          : {}),
        ...(normalizeId(effectiveOpenAIContinuation?.state?.metadata?.accountBridgeProjectFolder)
          ? { accountBridgeProjectFolder: normalizeId(effectiveOpenAIContinuation.state.metadata.accountBridgeProjectFolder) }
          : {}),
        accountContextCompactionGeneration: Math.max(0, Number(
          effectiveOpenAIContinuation?.accountContextCompactionGeneration
          ?? effectiveOpenAIContinuation?.state?.metadata?.accountContextCompactionGeneration
          ?? 0,
        ) || 0),
      },
    })
  } catch {
    // Best-effort persistence only.
  }
}

export function persistAutomaticAccountCompaction({
  upsertOpenAIThreadState = () => {},
  activeThreadId = '',
  activeProjectId = '',
  model = '',
  shouldStoreOpenAIState = false,
  toolsetHash = '',
  systemPromptHash = '',
  continuitySignature = '',
  updatedLatestOpenAICompactionId = '',
  effectiveOpenAIContinuation = null,
  automaticDecision = null,
  activeTurnId = '',
} = {}) {
  try {
    upsertOpenAIThreadState({
      threadId: activeThreadId,
      projectId: activeProjectId,
      providerId: 'openai',
      model: String(model ?? ''),
      lastResponseId: normalizeId(effectiveOpenAIContinuation?.state?.lastResponseId),
      conversationId: normalizeId(effectiveOpenAIContinuation?.state?.conversationId),
      storeEnabled: shouldStoreOpenAIState,
      toolsetHash,
      systemPromptHash,
      continuitySignature,
      continuityEpoch: Math.max(1, Number(effectiveOpenAIContinuation?.state?.continuityEpoch || 1) || 1),
      continuityReducerVersion: String(effectiveOpenAIContinuation?.state?.continuityReducerVersion || '').trim(),
      modeSignature: String(effectiveOpenAIContinuation?.state?.modeSignature || '').trim(),
      modelSignature: String(effectiveOpenAIContinuation?.state?.modelSignature || '').trim(),
      lastCompactionId: updatedLatestOpenAICompactionId,
      chainValid: true,
      chainInvalidReason: '',
      metadata: {
        ...(normalizeId(automaticDecision?.accountBridgeThreadId)
          ? { accountBridgeThreadId: normalizeId(automaticDecision.accountBridgeThreadId) }
          : {}),
        ...(normalizeId(effectiveOpenAIContinuation?.state?.metadata?.accountBridgeProjectFolder)
          ? { accountBridgeProjectFolder: normalizeId(effectiveOpenAIContinuation.state.metadata.accountBridgeProjectFolder) }
          : {}),
        latestCodexThreadCompaction: {
          eventType: 'codex_thread_compaction',
          eventPhase: 'applied',
          source: 'provider',
          confidence: 'explicit',
          providerId: 'openai',
          turnId: String(activeTurnId || ''),
          responseId: '',
          compactionIds: updatedLatestOpenAICompactionId ? [updatedLatestOpenAICompactionId] : [],
          detectedAt: Date.now(),
        },
      },
    })
  } catch {
    // Best-effort persistence only.
  }
}

export function __setOpenAIAccountAuthServiceGetterForTests(fn = null) {
  openAIAccountAuthServiceGetterForTests = typeof fn === 'function' ? fn : null
}

export function __resetOpenAIAccountAuthServiceGetterForTests() {
  openAIAccountAuthServiceGetterForTests = null
}
