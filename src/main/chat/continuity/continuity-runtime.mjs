import crypto from 'node:crypto'
import { normalizeContinuityPolicy } from './continuity-policy.mjs'
import { planContinuityTokenBudget } from './token-budget-planner.mjs'
import { retrieveContinuityContext } from './retrieval-engine.mjs'
import { buildContinuityPacket } from './packet-builder.mjs'
import { applyContinuityCompaction } from './compaction-engine.mjs'
import { upsertContinuityPacketMessage } from './packet-injection.mjs'
import { evaluateContinuityDrift } from './drift-guard.mjs'
import { deriveOpenLoopFacts } from './open-loop-tracker.mjs'
import { persistThreadContinuityTurn } from './continuity-store.mjs'
import { shouldRefreshContinuityPacket } from './continuity-refresh-policy.mjs'
import {
  renderCompactionVicinityMarker,
  upsertCompactionVicinityMarkerMessage,
} from './compaction-handoff-prompt.mjs'
import { buildCompactionUsageRefreshPayload } from '../chat-compaction-usage-refresh.mjs'
import { commitProjectedTimelineEvent } from '../canonical-root-event-writer.mjs'

const COMPACTION_VICINITY_RATIO_THRESHOLD = 0.78
const COMPACTION_VICINITY_MARKER_TOKEN_BUDGET = 84
function now() {
  return Date.now()
}
function genId(prefix = 'continuity_packet') {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
}
function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
function asObject(value) {
  return value && typeof value === 'object' ? value : {}
}
function hasFiniteNumber(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value))
}

function emitCompactionUsageRefresh({
  send = () => {},
  persistTimelineEvent = () => {},
  threadId = '',
  turnId = '',
  modelLimit = 0,
  estimatedAfterTokens = 0,
  strategy = '',
} = {}) {
  const usagePayload = buildCompactionUsageRefreshPayload({
    threadId,
    turnId,
    usage: {},
    modelLimit: Number(modelLimit || 0) || 0,
    estimatedAfterTokens: Number(estimatedAfterTokens || 0) || 0,
    strategy,
    scope: 'partial_reduce',
    compactionSource: 'local',
    status: 'applied',
  })
  if (!usagePayload) return

  const contextRemainingTokens = Number(usagePayload.contextRemainingTokens || 0)
  commitProjectedTimelineEvent({
    persistTimelineEvent, send, kind: 'chat_usage',
    options: {
      role: 'system',
      content: `Usage: ${usagePayload.usage.totalTokens} tokens this step, ${contextRemainingTokens} context tokens remaining (estimated).`,
      meta: usagePayload,
    },
    channel: 'chat:usage', payload: usagePayload,
  })
}
function buildPacketPayloadFromState({
  packetState = null,
  profile = 'balanced',
  tokenBudget = 0,
  providerNativeMeta = {},
} = {}) {
  const packet = asObject(packetState?.packet)
  const qualityMeta = asObject(packetState?.qualityMeta)
  const sourceRefs = Array.isArray(packet.sourceRefs) ? packet.sourceRefs : []
  return {
    packetId: String(packet.packetId || ''),
    profile: String(profile || 'balanced'),
    tokenBudget: Number(tokenBudget || 0) || 0,
    packetTokens: Number(packetState?.packetTokens || 0) || 0,
    sourceRefCount: Number(sourceRefs.length || 0) || 0,
    driftRisk: String(qualityMeta.driftRisk || 'low'),
    violationCount: Number(qualityMeta.violationCount || 0) || 0,
    providerNativeMeta: asObject(providerNativeMeta),
  }
}
function buildContinuitySelectionSignature({ retrieval = {}, openLoops = [] } = {}) {
  const facts = Array.isArray(retrieval?.facts) ? retrieval.facts : []
  const invariants = Array.isArray(retrieval?.invariants) ? retrieval.invariants : []
  const snapshots = Array.isArray(retrieval?.snapshots) ? retrieval.snapshots : []
  const loops = Array.isArray(openLoops) ? openLoops : []
  const factIds = facts.map((row) => String(row?.id || '').trim()).filter(Boolean).sort()
  const invariantIds = invariants.map((row) => String(row?.id || '').trim()).filter(Boolean).sort()
  const snapshotIds = snapshots.map((row) => String(row?.id || '').trim()).filter(Boolean).sort()
  const openLoopIds = loops.map((row) => String(row?.id || '').trim()).filter(Boolean).sort()
  return JSON.stringify({
    facts: factIds,
    invariants: invariantIds,
    snapshots: snapshotIds,
    openLoops: openLoopIds,
    openLoopCount: openLoopIds.length,
  })
}

export async function runProviderNativeCompactionForPacket({
  providerNativeContext = null,
  providerId = '',
  policy = {},
  history = [],
  historyTokenEstimate = 0,
  packetTokens = 0,
} = {}) {
  const runProviderNativeCompaction = typeof providerNativeContext?.runProviderNativeCompaction === 'function'
    ? providerNativeContext.runProviderNativeCompaction
    : null
  if (!runProviderNativeCompaction) return {}
  return runProviderNativeCompaction({
    providerId: String(providerId || '').trim().toLowerCase(),
    policy,
    history: Array.isArray(history) ? history : [],
    historyTokenEstimate: Number(historyTokenEstimate || 0) || 0,
    packetTokens: Number(packetTokens || 0) || 0,
    promptCacheKey: providerNativeContext?.promptCacheKey,
  })
}

export function createContinuityRuntime({
  providerId = '',
  policy = {},
  threadId = '',
  turnId = '',
  project = '',
  modelLimit = 0,
  modelMaxOutputTokens = null,
  modelSource = 'estimated',
  promptBudgetProfile = null,
  send = () => { },
  persistTimelineEvent = () => { },
} = {}) {
  const normalizedPolicy = normalizeContinuityPolicy(policy)
  const activeThreadId = String(threadId || '').trim()
  const activeTurnId = String(turnId || '').trim()
  const activeProject = String(project || '').trim()
  const activeProviderId = String(providerId || '').trim().toLowerCase()
  let lastPacket = null
  let lastProviderNativeMeta = {}
  let compactionVicinityMarkerInjected = false
  const emitStatus = (payload = {}) => {
    const body = {
      threadId: activeThreadId,
      turnId: activeTurnId,
      providerId: activeProviderId,
      enabled: normalizedPolicy.enabled,
      architecture: normalizedPolicy.architecture,
      scope: normalizedPolicy.defaultScope,
      profile: normalizedPolicy.activeProfile,
      modelLimit: toNumber(modelLimit, 0),
      modelLimitSource: String(modelSource || 'estimated'),
      ...payload,
      at: now(),
    }
    send('chat:continuity-status', body)
  }
  const persistContinuityEvent = (kind, content, meta = {}) => {
    persistTimelineEvent(kind, {
      role: 'system',
      content,
      meta: {
        threadId: activeThreadId,
        turnId: activeTurnId,
        ...meta,
      },
    })
  }
  const maybeInjectCompactionVicinityMarker = ({
    historyRows = [],
    occupancyRatio = 0,
    round = 1,
    compacted = false,
  } = {}) => {
    const rows = Array.isArray(historyRows) ? [...historyRows] : []
    if (compacted) return rows
    if (compactionVicinityMarkerInjected) return rows
    const ratio = Number(occupancyRatio || 0) || 0
    if (ratio < COMPACTION_VICINITY_RATIO_THRESHOLD) return rows

    const markerText = renderCompactionVicinityMarker({
      providerId: activeProviderId,
      turnId: activeTurnId,
      occupancyRatio: ratio,
    }, {
      tokenBudget: COMPACTION_VICINITY_MARKER_TOKEN_BUDGET,
    })
    if (!markerText) return rows

    compactionVicinityMarkerInjected = true
    const withMarker = upsertCompactionVicinityMarkerMessage(rows, markerText)
    persistContinuityEvent(
      'continuity_compaction_vicinity',
      'Compaction vicinity marker injected before likely local compaction.',
      {
        round: Number(round || 1) || 1,
        occupancyRatio: Number(ratio.toFixed(3)),
      },
    )
    emitStatus({
      round: Number(round || 1) || 1,
      phase: 'compaction_vicinity',
      occupancyRatio: Number(ratio.toFixed(3)),
    })
    return withMarker
  }
  async function applyBeforeModelCall({
    history = [],
    round = 1,
    rollingTotalTokens = 0,
    contextOccupancyTokens = null,
    occupancySignal = null,
    userMessage = '',
    providerNativeContext = null,
  } = {}) {
    const inputHistory = Array.isArray(history) ? history : []
    const normalizedRound = Number(round || 1) || 1
    const budget = planContinuityTokenBudget({
      modelLimit: toNumber(modelLimit, 0),
      maxOutputTokens: hasFiniteNumber(modelMaxOutputTokens)
        ? toNumber(modelMaxOutputTokens, 0)
        : null,
      rollingTotalTokens: toNumber(rollingTotalTokens, 0),
      contextOccupancyTokens: hasFiniteNumber(contextOccupancyTokens)
        ? toNumber(contextOccupancyTokens, 0)
        : null,
      occupancySignal: occupancySignal && typeof occupancySignal === 'object'
        ? occupancySignal
        : null,
      policy: normalizedPolicy,
      promptBudgetProfile,
    })
    emitStatus({
      round: normalizedRound,
      phase: 'planned',
      tokenBudget: budget.packet?.budget || 0,
      maxInjectedFacts: budget.maxInjectedFacts,
    })
    const occupancyTokens = hasFiniteNumber(contextOccupancyTokens)
      ? toNumber(contextOccupancyTokens, 0)
      : toNumber(budget.used, 0)
    const occupancyRatio = toNumber(modelLimit, 0) > 0
      ? Math.max(0, Math.min(1.5, occupancyTokens / Math.max(1, toNumber(modelLimit, 0))))
      : 0

    if (!normalizedPolicy.enabled || !activeThreadId || Number(budget?.packet?.budget || 0) <= 0) {
      const compacted = await applyContinuityCompaction({
        history: inputHistory,
        modelLimit: toNumber(modelLimit, 0),
        packetText: '',
        providerId: activeProviderId,
        threadId: activeThreadId,
        model: String(providerNativeContext?.model || ''),
        apiKey: String(providerNativeContext?.apiKey || ''),
        turnId: activeTurnId,
      })
      return {
        history: maybeInjectCompactionVicinityMarker({
          historyRows: compacted.history,
          occupancyRatio,
          round: normalizedRound,
          compacted: !!compacted.compacted,
        }),
        compaction: compacted.compaction,
        compacted: !!compacted.compacted,
        continuityUsed: false,
        packetPayload: null,
        budget,
      }
    }
    const existingPacketText = String(lastPacket?.packetText || '').trim()
    const retrieval = retrieveContinuityContext({
      threadId: activeThreadId,
      project: activeProject,
      scope: normalizedPolicy.defaultScope,
      userMessage,
      factLimit: Math.max(4, Number(budget.maxInjectedFacts || 12)),
      invariantLimit: Math.max(3, Math.floor(Number(budget.maxInjectedFacts || 12) * 0.7)),
      snapshotLimit: 4,
    })
    persistContinuityEvent(
      'continuity_retrieval_used',
      `Continuity retrieval used (${Number(retrieval?.facts?.length || 0)} facts, ${Number(retrieval?.invariants?.length || 0)} invariants).`,
      {
        scope: normalizedPolicy.defaultScope,
        selectedFacts: Number(retrieval?.facts?.length || 0),
        selectedInvariants: Number(retrieval?.invariants?.length || 0),
        selectedSnapshots: Number(retrieval?.snapshots?.length || 0),
      },
    )

    const openLoops = deriveOpenLoopFacts(retrieval.facts)
    const selectionSignature = buildContinuitySelectionSignature({ retrieval, openLoops })
    const previousSelectionSignature = String(lastPacket?.retrievalMeta?.selectionSignature || '').trim()
    const hasSelectionChange = !!existingPacketText
      && !!previousSelectionSignature
      && previousSelectionSignature !== selectionSignature
    const drift = normalizedPolicy.driftGuardEnabled
      ? evaluateContinuityDrift({
        invariants: normalizedPolicy.invariantChecksEnabled ? retrieval.invariants : [],
        facts: retrieval.facts,
        contradictionChecksEnabled: normalizedPolicy.contradictionChecksEnabled,
      })
      : { driftRisk: 'low', violationCount: 0, violations: [] }
    const shouldRefreshPacket = shouldRefreshContinuityPacket({
      injectEveryRound: !!budget.injectEveryRound,
      round: normalizedRound,
      existingPacketText,
      occupancyRatio,
      driftViolationCount: Number(drift?.violationCount || 0),
      hasSelectionChange,
    })
    if (Number(drift?.violationCount || 0) > 0) {
      persistContinuityEvent(
        'continuity_drift_detected',
        `Continuity drift risk: ${String(drift.driftRisk || 'medium')} (${Number(drift.violationCount || 0)} contradiction${Number(drift.violationCount || 0) === 1 ? '' : 's'}).`,
        {
          driftRisk: String(drift.driftRisk || 'medium'),
          violationCount: Number(drift.violationCount || 0),
          violations: Array.isArray(drift.violations) ? drift.violations.slice(0, 8) : [],
        },
      )
      persistContinuityEvent(
        'continuity_invariant_violated',
        'Continuity invariant contradiction detected.',
        {
          violationCount: Number(drift.violationCount || 0),
        },
      )
    }
    if (!shouldRefreshPacket) {
      const reusePayload = buildPacketPayloadFromState({
        packetState: lastPacket,
        profile: budget.profileKey,
        tokenBudget: Number(budget.packet?.budget || 0),
        providerNativeMeta: lastProviderNativeMeta,
      })
      const compacted = await applyContinuityCompaction({
        history: inputHistory,
        modelLimit: toNumber(modelLimit, 0),
        packetText: existingPacketText,
        providerId: activeProviderId,
        threadId: activeThreadId,
        model: String(providerNativeContext?.model || ''),
        apiKey: String(providerNativeContext?.apiKey || ''),
        turnId: activeTurnId,
      })
      if (compacted.compacted) {
        const compactionStrategy = existingPacketText ? 'continuity_packet' : 'local_summary'
        persistContinuityEvent(
          'continuity_compaction_applied',
          `Continuity compaction applied (removed ${Number(compacted?.compaction?.removedCount || 0)} message${Number(compacted?.compaction?.removedCount || 0) === 1 ? '' : 's'}).`,
          {
            packetId: reusePayload.packetId,
            removedMessages: Number(compacted?.compaction?.removedCount || 0),
            replacedWithPacket: !!compacted.replacedWithPacket,
            estimatedBeforeTokens: Number(compacted?.compaction?.estimatedBeforeTokens || 0),
            estimatedAfterTokens: Number(compacted?.compaction?.estimatedAfterTokens || 0),
            packetReuse: true,
            compactionStrategy,
            compactionScope: 'partial_reduce',
            compactionSource: 'local',
            usageRefreshState: 'estimated',
          },
        )
        emitCompactionUsageRefresh({
          send,
          persistTimelineEvent,
          threadId: activeThreadId,
          turnId: activeTurnId,
          modelLimit: toNumber(modelLimit, 0),
          estimatedAfterTokens: Number(compacted?.compaction?.estimatedAfterTokens || 0),
          strategy: compactionStrategy,
        })
        emitStatus({
          round: normalizedRound,
          phase: 'compacted',
          packetId: reusePayload.packetId,
          removedMessages: Number(compacted?.compaction?.removedCount || 0),
          estimatedBeforeTokens: Number(compacted?.compaction?.estimatedBeforeTokens || 0),
          estimatedAfterTokens: Number(compacted?.compaction?.estimatedAfterTokens || 0),
          replacedWithPacket: !!compacted.replacedWithPacket,
          compactionStrategy,
          compactionScope: 'partial_reduce',
          compactionSource: 'local',
          usageRefreshState: 'estimated',
        })
      }
      emitStatus({
        round: normalizedRound,
        phase: 'packet_reused',
        packetId: reusePayload.packetId,
        tokenBudget: reusePayload.tokenBudget,
        packetTokens: reusePayload.packetTokens,
        occupancyRatio: Number(occupancyRatio.toFixed(3)),
        driftRisk: String(drift?.driftRisk || reusePayload.driftRisk || 'low'),
        sourceRefCount: Number(retrieval?.retrievalMeta?.selectedFacts || 0) > 0
          ? Number((retrieval?.facts || []).length || reusePayload.sourceRefCount)
          : reusePayload.sourceRefCount,
        selectionChanged: false,
      })
      const historyForReturn = maybeInjectCompactionVicinityMarker({
        historyRows: compacted.history,
        occupancyRatio,
        round: normalizedRound,
        compacted: !!compacted.compacted,
      })
      return {
        history: historyForReturn,
        compaction: compacted.compaction,
        compacted: !!compacted.compacted,
        continuityUsed: !!existingPacketText,
        packetPayload: existingPacketText ? reusePayload : null,
        budget,
      }
    }
    const packetBuilt = buildContinuityPacket({
      packetId: genId(),
      threadId: activeThreadId,
      turnId: activeTurnId,
      profile: budget.profileKey,
      tokenBudget: Number(budget.packet?.budget || 0),
      maxFacts: Number(budget.maxInjectedFacts || 10),
      maxSourceRefs: Number(budget.maxSourceRefs || 12),
      retrieval,
      openLoops,
      drift,
    })

    lastPacket = {
      packet: packetBuilt.packet,
      packetText: String(packetBuilt.packetText || ''),
      packetTokens: Number(packetBuilt.packetTokens || 0) || 0,
      qualityMeta: asObject(packetBuilt.qualityMeta),
      retrievalMeta: {
        ...asObject(retrieval.retrievalMeta),
        selectionSignature,
        openLoopCount: Array.isArray(openLoops) ? openLoops.length : 0,
      },
    }
    const providerNative = await runProviderNativeCompactionForPacket({
      providerNativeContext,
      providerId: activeProviderId,
      policy: normalizedPolicy,
      history: inputHistory,
      historyTokenEstimate: occupancyTokens,
      packetTokens: Number(packetBuilt.packetTokens || 0) || 0,
    })
    lastProviderNativeMeta = asObject(providerNative)

    const packetPayload = buildPacketPayloadFromState({
      packetState: lastPacket,
      profile: budget.profileKey,
      tokenBudget: Number(budget.packet?.budget || 0),
      providerNativeMeta: lastProviderNativeMeta,
    })
    const packetDeliveryPayload = {
      ...packetPayload,
      sections: packetBuilt.packet?.sections || {},
      qualityMeta: packetBuilt.qualityMeta || {},
      sourceRefs: packetBuilt.packet?.sourceRefs || [],
    }
    commitProjectedTimelineEvent({
      persistTimelineEvent, send, kind: 'continuity_packet_built',
      options: {
        role: 'system',
        content: `Continuity packet built (${packetPayload.packetTokens} token estimate, ${packetPayload.sourceRefCount} refs).`,
        meta: { threadId: activeThreadId, turnId: activeTurnId, ...packetPayload },
      },
      channel: 'chat:continuity-packet',
      payload: { threadId: activeThreadId, turnId: activeTurnId, providerId: activeProviderId, ...packetDeliveryPayload, at: now() },
    })
    emitStatus({
      round: normalizedRound,
      phase: 'packet_built',
      packetId: packetPayload.packetId,
      tokenBudget: packetPayload.tokenBudget,
      packetTokens: packetPayload.packetTokens,
      driftRisk: packetPayload.driftRisk,
      sourceRefCount: packetPayload.sourceRefCount,
    })
    const compacted = await applyContinuityCompaction({
      history: inputHistory,
      modelLimit: toNumber(modelLimit, 0),
      packetText: packetBuilt.packetText,
      providerId: activeProviderId,
      threadId: activeThreadId,
      model: String(providerNativeContext?.model || ''),
      apiKey: String(providerNativeContext?.apiKey || ''),
      turnId: activeTurnId,
    })
    const historyForReturn = (packetBuilt.packetText && (!compacted.compacted || !compacted.replacedWithPacket))
      ? upsertContinuityPacketMessage(compacted.history, packetBuilt.packetText)
      : compacted.history
    const historyWithVicinityMarker = maybeInjectCompactionVicinityMarker({
      historyRows: historyForReturn,
      occupancyRatio,
      round: normalizedRound,
      compacted: !!compacted.compacted,
    })
    if (compacted.compacted) {
      const compactionStrategy = packetBuilt.packetText ? 'continuity_packet' : 'local_summary'
      persistContinuityEvent(
        'continuity_compaction_applied',
        `Continuity compaction applied (removed ${Number(compacted?.compaction?.removedCount || 0)} message${Number(compacted?.compaction?.removedCount || 0) === 1 ? '' : 's'}).`,
        {
          packetId: packetPayload.packetId,
          removedMessages: Number(compacted?.compaction?.removedCount || 0),
          replacedWithPacket: !!compacted.replacedWithPacket,
          estimatedBeforeTokens: Number(compacted?.compaction?.estimatedBeforeTokens || 0),
          estimatedAfterTokens: Number(compacted?.compaction?.estimatedAfterTokens || 0),
          compactionStrategy,
          compactionScope: 'partial_reduce',
          compactionSource: 'local',
          usageRefreshState: 'estimated',
        },
      )
      emitCompactionUsageRefresh({
        send,
        persistTimelineEvent,
        threadId: activeThreadId,
        turnId: activeTurnId,
        modelLimit: toNumber(modelLimit, 0),
        estimatedAfterTokens: Number(compacted?.compaction?.estimatedAfterTokens || 0),
        strategy: compactionStrategy,
      })
      emitStatus({
        round: normalizedRound,
        phase: 'compacted',
        packetId: packetPayload.packetId,
        removedMessages: Number(compacted?.compaction?.removedCount || 0),
        estimatedBeforeTokens: Number(compacted?.compaction?.estimatedBeforeTokens || 0),
        estimatedAfterTokens: Number(compacted?.compaction?.estimatedAfterTokens || 0),
        replacedWithPacket: !!compacted.replacedWithPacket,
        compactionStrategy,
        compactionScope: 'partial_reduce',
        compactionSource: 'local',
        usageRefreshState: 'estimated',
      })
    }
    return {
      history: historyWithVicinityMarker,
      compaction: compacted.compaction,
      compacted: !!compacted.compacted,
      continuityUsed: true,
      packetPayload,
      budget,
    }
  }
  function persistTurnContinuity({
    assistantText = '',
    toolResults = [],
    userMessage = '',
  } = {}) {
    if (!normalizedPolicy.enabled || !activeThreadId) return
    persistThreadContinuityTurn({
      threadId: activeThreadId,
      turnId: activeTurnId,
      project: activeProject,
      userMessage,
      assistantText,
      toolResults,
    })
  }
  return {
    policy: normalizedPolicy,
    applyBeforeModelCall,
    persistTurnContinuity,
  }
}
