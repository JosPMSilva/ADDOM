import { applyCompactionLifecycle } from '../../../common/chat/compaction-lifecycle.mjs'

function normalizeId(value = '') {
  return String(value || '').trim()
}

function resolveLocalCompactionEventKind(payload = {}) {
  const strategy = normalizeId(payload?.strategy || payload?.compactionStrategy).toLowerCase()
  return strategy === 'continuity_packet'
    ? 'continuity_compaction_applied'
    : 'context_compacted'
}

function resolveLocalCompactionActivityId(payload = {}) {
  const threadId = normalizeId(payload?.threadId)
  const turnId = normalizeId(payload?.turnId)
  const strategy = normalizeId(payload?.strategy || payload?.compactionStrategy || 'local_summary').toLowerCase()
  if (!threadId || !turnId || !strategy) return ''
  return `local_compaction:${threadId}:${turnId}:${strategy}`
}

function buildLocalCompactionActivity(payload = {}) {
  const removedMessages = Number(payload?.removedMessages || 0)
  const eventKind = resolveLocalCompactionEventKind(payload)
  const strategy = normalizeId(payload?.strategy || payload?.compactionStrategy).toLowerCase()
  const isContinuityPacket = strategy === 'continuity_packet'
  const status = normalizeId(payload?.status || (normalizeId(payload?.phase).toLowerCase() === 'compacted' ? 'applied' : '')).toLowerCase()

  return applyCompactionLifecycle({
    id: resolveLocalCompactionActivityId(payload),
    coalesce: true,
    type: 'info',
    threadId: normalizeId(payload?.threadId),
    turnId: normalizeId(payload?.turnId),
    status,
    eventKind,
    label: isContinuityPacket
      ? `Continuity compaction applied (${removedMessages} removed)`
      : `Context compacted (${removedMessages} older message${removedMessages === 1 ? '' : 's'} summarized)`,
    detail: [
      Number(payload?.estimatedBeforeTokens || 0) > 0 ? `before_tokens: ${Number(payload.estimatedBeforeTokens)}` : '',
      Number(payload?.estimatedAfterTokens || 0) > 0 ? `after_tokens: ${Number(payload.estimatedAfterTokens)}` : '',
      Number(payload?.modelLimit || 0) > 0 ? `model_limit: ${Number(payload.modelLimit)}` : '',
      payload?.packetId ? `packet_id: ${String(payload.packetId)}` : '',
    ].filter(Boolean).join('\n'),
    compactionMilestone: status === 'applied',
    compactionMilestoneTitle: status === 'applied' ? 'Context automatically compacted' : '',
    compactionMilestoneDetail: status === 'applied'
      ? [
          isContinuityPacket ? 'Continuity packet compaction' : 'Local continuity summary',
          removedMessages > 0 ? `${removedMessages} message${removedMessages === 1 ? '' : 's'} summarized` : '',
        ].filter(Boolean).join(' | ')
      : '',
    compactionMilestoneTone: status === 'applied' ? 'local' : '',
  }, payload)
}

export function registerChatEventBridgeAuxSubscriptions({
  safeSub,
  chatApi,
  useChatStore,
  useMemoryStore,
} = {}) {
  const unMemoryInjected = safeSub(chatApi.onMemoryInjected, (payload = {}) => {
    const count = Number(payload.nodeCount || 0)
    useChatStore.getState().pushToolActivity({
      type: 'info',
      threadId: String(payload.threadId || ''),
      turnId: String(payload.turnId || ''),
      label: `Memory context injected (${count} node${count === 1 ? '' : 's'})`,
    })
  }, 'onMemoryInjected')

  const unCostEstimate = safeSub(chatApi.onCostEstimate, (payload = {}) => {
    useChatStore.getState().recordCostEstimate(payload)
    const estTokens = Number(payload.estimatedTotalTokens || 0) || 0
    const estUsd = Number.isFinite(Number(payload.estimatedUsd))
      ? Number(payload.estimatedUsd)
      : null
    useChatStore.getState().pushToolActivity({
      type: 'info',
      threadId: String(payload.threadId || ''),
      turnId: String(payload.turnId || ''),
      authMethod: String(payload.authMethod || '').trim().toLowerCase(),
      eventKind: 'chat_cost_estimate',
      label: estUsd != null
        ? `Turn cost estimate: $${estUsd.toFixed(estUsd >= 1 ? 2 : 4)} (${estTokens} tokens)`
        : `Turn token estimate: ${estTokens} tokens`,
      detail: [
        Number(payload.estimatedInputTokens || 0) > 0 ? `input_estimate: ${Number(payload.estimatedInputTokens)}` : '',
        Number(payload.estimatedOutputTokens || 0) > 0 ? `output_estimate: ${Number(payload.estimatedOutputTokens)}` : '',
        estUsd != null ? `usd_estimate: ${estUsd.toFixed(4)}` : '',
        payload.estimateConfidence ? `confidence: ${String(payload.estimateConfidence)}` : '',
        payload.pricingWarning ? `pricing_warning: ${String(payload.pricingWarning)}` : '',
      ].filter(Boolean).join('\n'),
    })
  }, 'onCostEstimate')

  const unPromptComposition = safeSub(chatApi.onPromptComposition, (payload = {}) => {
    useChatStore.getState().pushToolActivity({
      type: 'info',
      threadId: String(payload.threadId || ''),
      turnId: String(payload.turnId || ''),
      eventKind: 'prompt_composition',
      label: `Prompt composition: ${Number(payload.systemPromptTokens || 0)} system tokens`,
      detail: [
        `execution_brief: ${Number(payload.executionBriefTokens || 0) || 0}`,
        `runtime_context: ${Number(payload.runtimeContextTokens || 0) || 0}`,
        `memory_context: ${Number(payload.memoryContextTokens || 0) || 0}`,
        `moa_control_prompt: ${Number(payload.moaControlPromptTokens || 0) || 0}`,
        `role_catalog: ${Number(payload.roleCatalogTokens || 0) || 0}`,
        `delegation_available: ${payload.delegationAvailable ? 'true' : 'false'}`,
      ].join('\n'),
    })
  }, 'onPromptComposition')

  const unUsage = safeSub(chatApi.onUsage, (payload = {}) => {
    useChatStore.getState().recordUsage(payload)
    const usage = payload?.usage && typeof payload.usage === 'object' ? payload.usage : {}
    const total = Number(usage.totalTokens || 0)
    useChatStore.getState().pushToolActivity({
      type: 'usage',
      threadId: String(payload.threadId || ''),
      turnId: String(payload.turnId || ''),
      authMethod: String(payload.authMethod || '').trim().toLowerCase(),
      providerUsageAvailable: typeof payload.providerUsageAvailable === 'boolean'
        ? payload.providerUsageAvailable
        : undefined,
      totalTokens: Number.isFinite(total) ? total : 0,
      eventKind: 'chat_usage',
      label: `Context usage: ${Number.isFinite(total) ? total : 0} tokens this step`,
      detail: [
        `input: ${Number(usage.inputTokens || 0) || 0}`,
        `output: ${Number(usage.outputTokens || 0) || 0}`,
        Number(usage.reasoningTokens || 0) > 0 ? `reasoning: ${Number(usage.reasoningTokens || 0)}` : '',
        `rolling: ${Number(payload.rollingTotalTokens || 0) || 0}`,
        Number(payload.modelLimit || 0) > 0 ? `limit: ${Number(payload.modelLimit || 0)}` : '',
        Number(payload.modelLimit || 0) > 0 ? `remaining: ${Number(payload.remainingTokens || 0) || 0}` : '',
      ].filter(Boolean).join('\n'),
    })
  }, 'onUsage')

  const unRuntimeDiagnostics = safeSub(chatApi.onRuntimeDiagnostics, (payload = {}) => {
    const detail = String(payload.detail || '').trim()
    if (!detail) return
    useChatStore.getState().pushToolActivity({
      type: String(payload.type || '').trim().toLowerCase() === 'warning' ? 'warning' : 'info',
      threadId: String(payload.threadId || ''),
      turnId: String(payload.turnId || ''),
      eventKind: 'runtime_diagnostics',
      label: String(payload.label || 'Runtime diagnostics captured').trim(),
      detail,
    })
  }, 'onRuntimeDiagnostics')

  const unFileChange = safeSub(chatApi.onFileChange, (payload = {}) => {
    const filePath = String(payload.filePath || '').trim()
    const added = Number(payload.addedLines || 0) || 0
    const removed = Number(payload.removedLines || 0) || 0
    useChatStore.getState().pushToolActivity({
      type: 'file_change',
      threadId: String(payload.threadId || ''),
      turnId: String(payload.turnId || ''),
      stepId: String(payload.stepId || ''),
      sequence: Number(payload.sequence || 0) || 0,
      eventKind: 'file_change',
      fileChange: {
        filePath,
        renamedFrom: String(payload.renamedFrom || ''),
        newRevId: String(payload.newRevId || ''),
        prevRevId: String(payload.prevRevId || ''),
        rev: Number(payload.rev || 0) || 0,
        contentBytes: Number(payload.contentBytes || 0) || 0,
        addedLines: added,
        removedLines: removed,
        changeType: String(payload.changeType || '').trim().toLowerCase(),
        source: String(payload.source || '').trim().toLowerCase(),
      },
      label: `File changed: ${filePath} (+${added} / -${removed})`,
    })
  }, 'onFileChange')

  const unArtifactTracking = safeSub(chatApi.onArtifactTracking, (payload = {}) => {
    const status = String(payload.status || '').trim().toLowerCase()
    const reason = String(payload.reason || payload.reasonCode || 'No tracking reason was provided.').trim()
    const toolName = String(payload.toolName || 'write tool').trim()
    useChatStore.getState().pushToolActivity({
      type: status === 'tracked' ? 'info' : 'warning',
      threadId: String(payload.threadId || ''),
      turnId: String(payload.turnId || ''),
      stepId: String(payload.stepId || ''),
      sequence: Number(payload.sequence || 0) || 0,
      eventKind: 'artifact_tracking',
      toolName,
      artifactTracking: payload,
      label: status === 'tracked'
        ? `Artifact tracking complete for ${toolName}.`
        : `Artifact tracking ${status || 'untracked'} for ${toolName}.`,
      detail: [
        reason ? `reason: ${reason}` : '',
        payload.reasonCode ? `reason_code: ${String(payload.reasonCode)}` : '',
        Number(payload.trackedCount || 0) > 0 ? `tracked: ${Number(payload.trackedCount)}` : '',
        Number(payload.untrackedCount || 0) > 0 ? `untracked: ${Number(payload.untrackedCount)}` : '',
      ].filter(Boolean).join('\n'),
    })
  }, 'onArtifactTracking')

  const unWriteConflict = typeof chatApi.onWriteConflict === 'function'
    ? safeSub(chatApi.onWriteConflict, (payload = {}) => {
        useChatStore.getState().pushWriteConflict(payload, {
          threadId: String(payload.threadId || ''),
        })
      }, 'onWriteConflict')
    : null

  const unMemoryCompressed = safeSub(chatApi.onMemoryCompressed, (payload = {}) => {
    const rangeStart = Number(payload.rangeStart || 0)
    const rangeEnd = Number(payload.rangeEnd || 0)
    const archivedCount = Number(payload.archivedCount || 0)
    const summaryNodeId = String(payload.summaryNodeId || '').trim()
    const label = rangeStart > 0 && rangeEnd > 0
      ? `Compressed logs #${rangeStart}-#${rangeEnd} into summary node (${archivedCount} archived)`
      : `Compressed memory logs into summary node (${archivedCount} archived)`

    useChatStore.getState().pushToolActivity({
      type: 'info',
      label,
      detail: summaryNodeId ? `summaryNodeId: ${summaryNodeId}` : '',
      threadId: String(payload.threadId || ''),
      turnId: String(payload.turnId || ''),
      eventKind: 'memory_compressed',
    })
    useChatStore.getState().pushNotice({
      type: 'memory-compressed',
      text: label,
      meta: payload,
    })
    useMemoryStore.getState().setCompressionEvent(payload)
  }, 'onMemoryCompressed')

  const unContextCompacted = safeSub(chatApi.onContextCompacted, (payload = {}) => {
    const removed = Number(payload.removedMessages || 0)
    const label = `Context compacted (${removed} older message${removed === 1 ? '' : 's'} summarized)`
    useChatStore.getState().pushToolActivity(buildLocalCompactionActivity(payload))
    useChatStore.getState().pushNotice({
      type: 'context-compacted',
      text: label,
      meta: payload,
    })
  }, 'onContextCompacted')

  const unContinuityStatus = safeSub(chatApi.onContinuityStatus, (payload = {}) => {
    const state = useChatStore.getState()
    state.recordContinuityStatus(payload)
    if (String(payload.phase || '').trim().toLowerCase() !== 'compacted') return
    if (!normalizeId(payload?.compactionStrategy || payload?.strategy)) return
    state.pushToolActivity(buildLocalCompactionActivity(payload))
  }, 'onContinuityStatus')

  const unContinuityPacket = safeSub(chatApi.onContinuityPacket, (payload = {}) => {
    useChatStore.getState().recordContinuityPacket(payload)
    useChatStore.getState().pushToolActivity({
      type: 'info',
      threadId: String(payload.threadId || ''),
      turnId: String(payload.turnId || ''),
      authMethod: String(payload.authMethod || payload?.providerNativeMeta?.authMethod || '').trim().toLowerCase(),
      eventKind: 'continuity_packet_built',
      label: `Continuity packet built (${String(payload.profile || 'balanced')})`,
      detail: [
        Number(payload.tokenBudget || 0) > 0 ? `budget: ${Number(payload.tokenBudget)}` : '',
        Number(payload.packetTokens || 0) > 0 ? `packet_tokens: ${Number(payload.packetTokens)}` : '',
        Number(payload.sourceRefCount || 0) > 0 ? `source_refs: ${Number(payload.sourceRefCount)}` : '',
        payload.driftRisk ? `drift_risk: ${String(payload.driftRisk)}` : '',
      ].filter(Boolean).join('\n'),
    })
  }, 'onContinuityPacket')

  const unApprovalCountdown = safeSub(chatApi.onApprovalCountdown, (payload = {}) => {
    const phase = String(payload.phase || '').trim().toLowerCase()
    const toolName = String(payload.toolName || 'tool')
    const remainingMs = Number(payload.remainingMs || 0)
    const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000))
    if (phase === 'start') {
      const timeoutSec = Math.max(0, Math.ceil(Number(payload.timeoutMs || 0) / 1000))
      useChatStore.getState().pushToolActivity({
        type: 'pending',
        threadId: String(payload.threadId || ''),
        turnId: String(payload.turnId || ''),
        stepId: String(payload.stepId || ''),
        sequence: Number(payload.sequence || 0) || 0,
        eventKind: 'approval_countdown',
        toolName,
        label: `Approval requested for ${toolName} (${timeoutSec}s timeout).`,
        detail: `approvalId: ${String(payload.approvalId || '').trim()}`,
      })
    } else if (phase === 'warning') {
      useChatStore.getState().pushToolActivity({
        type: 'info',
        threadId: String(payload.threadId || ''),
        turnId: String(payload.turnId || ''),
        stepId: String(payload.stepId || ''),
        sequence: Number(payload.sequence || 0) || 0,
        eventKind: 'approval_countdown',
        toolName,
        label: `Approval for ${toolName} is about to expire (${remainingSec}s left).`,
      })
    }
  }, 'onApprovalCountdown')

  const unApprovalTimeout = safeSub(chatApi.onApprovalTimeout, (payload = {}) => {
    const toolName = String(payload.toolName || 'tool')
    useChatStore.getState().pushToolActivity({
      type: 'result',
      isError: true,
      decision: 'denied',
      denyReason: 'timeout',
      threadId: String(payload.threadId || ''),
      turnId: String(payload.turnId || ''),
      stepId: String(payload.stepId || ''),
      sequence: Number(payload.sequence || 0) || 0,
      eventKind: 'approval_timeout',
      toolName,
      label: `Approval expired for ${toolName}.`,
    })
    useChatStore.getState().pushNotice({
      type: 'approval-timeout',
      text: `Approval expired for ${toolName}.`,
      meta: payload,
    })
  }, 'onApprovalTimeout')

  const unCompressionState = safeSub(chatApi.onCompressionState, (payload = {}) => {
    const state = String(payload.state || '').trim().toLowerCase()
    if (!state || state === 'completed') return

    if (state === 'started') {
      useChatStore.getState().pushToolActivity({
        type: 'info',
        label: `Memory compression started (threshold ${Number(payload.threshold || 0)}).`,
        threadId: String(payload.threadId || ''),
        turnId: String(payload.turnId || ''),
        eventKind: 'compression_state',
      })
      return
    }

    if (state === 'skipped') {
      const reason = String(payload.reason || 'not eligible')
      useChatStore.getState().pushToolActivity({
        type: 'info',
        label: `Memory compression skipped: ${reason}.`,
        threadId: String(payload.threadId || ''),
        turnId: String(payload.turnId || ''),
        eventKind: 'compression_state',
      })
      return
    }

    if (state === 'failed') {
      const error = String(payload.error || 'unknown error')
      useChatStore.getState().pushToolActivity({
        type: 'result',
        isError: true,
        decision: 'approved',
        label: `Memory compression failed: ${error}`,
        threadId: String(payload.threadId || ''),
        turnId: String(payload.turnId || ''),
        eventKind: 'compression_state',
      })
      useChatStore.getState().pushNotice({
        type: 'compression-failed',
        text: `Memory compression failed: ${error}`,
        meta: payload,
      })
    }
  }, 'onCompressionState')

  const unComplianceEvent = safeSub(chatApi.onComplianceEvent, (payload = {}) => {
    const kind = String(payload.kind || '').trim().toLowerCase()
    const noticeAction = String(payload.noticeAction || '').trim().toLowerCase()
    const meta = payload?.meta && typeof payload.meta === 'object' ? payload.meta : {}
    const noticeType = String(meta.noticeType || '').trim()
    const actionLabel = noticeAction === 'acknowledged'
      ? 'acknowledged'
      : noticeAction === 'skipped'
        ? 'skipped'
        : 'shown'
    const label = noticeType
      ? `Compliance notice ${actionLabel}: ${noticeType}`
      : `Compliance notice ${actionLabel}`
    useChatStore.getState().pushToolActivity({
      type: 'info',
      threadId: String(payload.threadId || ''),
      turnId: String(payload.turnId || ''),
      eventKind: kind || `compliance_notice_${actionLabel}`,
      label,
      detail: [
        meta.providerId ? `provider: ${String(meta.providerId)}` : '',
        meta.model ? `model: ${String(meta.model)}` : '',
        meta.termsVersion ? `terms_version: ${String(meta.termsVersion)}` : '',
        meta.source ? `source: ${String(meta.source)}` : '',
        Number(meta.repeatedCount || 0) > 0 ? `repeated_count: ${Number(meta.repeatedCount)}` : '',
        typeof meta.preserveCitations === 'boolean'
          ? `preserve_citations: ${meta.preserveCitations ? 'true' : 'false'}`
          : '',
      ].filter(Boolean).join('\n'),
    })
  }, 'onComplianceEvent')

  const unNotice = safeSub(chatApi.onNotice, (payload = {}) => {
    const text = String(payload?.text || payload?.message || '').trim()
    if (!text) return
    const type = String(payload?.type || '').trim().toLowerCase() === 'warning' ? 'warning' : 'info'
    const meta = payload?.meta && typeof payload.meta === 'object' ? payload.meta : null
    useChatStore.getState().pushNotice({
      type,
      text,
      meta,
      threadId: String(payload?.threadId || ''),
    })
  }, 'onNotice')

  return () => {
    unMemoryInjected()
    unCostEstimate()
    unPromptComposition()
    unUsage()
    unRuntimeDiagnostics()
    unFileChange()
    unArtifactTracking()
    if (unWriteConflict) unWriteConflict()
    unMemoryCompressed()
    unContextCompacted()
    unContinuityStatus()
    unContinuityPacket()
    unApprovalCountdown()
    unApprovalTimeout()
    unCompressionState()
    unComplianceEvent()
    unNotice()
  }
}
