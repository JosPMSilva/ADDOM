function formatBadgeUsd(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

export function buildDelegationBadges(meta = {}) {
  if (!meta?.isDelegationTool) return []
  const type = String(meta.type || '')
  const taskCount = Math.max(0, Number(meta.taskCount || 0) || 0)
  const requestedTaskCount = Math.max(0, Number(meta.requestedTaskCount || 0) || 0)
  const plannedTaskCount = Math.max(0, Number(meta.plannedTaskCount || taskCount) || 0)
  const executedTaskCount = Math.max(0, Number(meta.executedTaskCount || 0) || 0)
  const skippedTaskCount = Math.max(0, Number(meta.skippedTaskCount || 0) || 0)
  const completed = Math.max(0, Number(meta.completed || 0) || 0)
  const failed = Math.max(0, Number(meta.failed || 0) || 0)
  const staged = Math.max(0, Number(meta.staged || 0) || 0)
  const estimatedTokens = Math.max(0, Number(meta.estimatedTokens || 0) || 0)
  const actualTokens = Math.max(0, Number(meta.actualTokens || 0) || 0)
  const totalTokens = Math.max(0, Number(meta.totalTokens || 0) || 0)
  const estimatedUsd = Number.isFinite(Number(meta.estimatedUsd)) ? Number(meta.estimatedUsd) : null
  const actualUsd = Number.isFinite(Number(meta.actualUsd)) ? Number(meta.actualUsd) : null
  const estimateConfidence = String(meta.estimateConfidence || '').trim()
  const riskTier = String(meta.riskTier || '').trim()
  const strategy = String(meta.strategy || '').trim()
  const pattern = String(meta.pattern || '').trim()
  const parsedOk = typeof meta.parsedOk === 'boolean' ? meta.parsedOk : null
  const synthesisPayload = meta.synthesisPayload && typeof meta.synthesisPayload === 'object'
    ? meta.synthesisPayload
    : null
  const synthesisMode = synthesisPayload?.agentOutputMode
    ? String(synthesisPayload.agentOutputMode).trim()
    : ''
  const durationMs = Math.max(0, Number(meta.durationMs || 0) || 0)
  const status = String(meta.status || '').trim()
  const route = String(meta.route || '').trim()
  const initiator = String(meta.initiator || '').trim()
  const formattedEstimatedUsd = formatBadgeUsd(estimatedUsd)
  const formattedActualUsd = formatBadgeUsd(actualUsd)

  const routeBadge = route === 'delegate_to_agents'
    ? 'route orch'
    : route === 'direct_single'
      ? 'route direct'
      : route === 'direct_fanout'
        ? 'route fanout'
        : (route ? `route ${route}` : '')
  const initiatorBadge = initiator === 'user_direct'
    ? 'by user'
    : initiator === 'orchestrator'
      ? 'by orch'
      : initiator === 'hybrid'
        ? 'by hybrid'
        : (initiator ? `by ${initiator}` : '')

  return [
    plannedTaskCount > 0 ? `tasks ${plannedTaskCount}` : taskCount > 0 ? `tasks ${taskCount}` : '',
    requestedTaskCount > 0 && requestedTaskCount !== plannedTaskCount ? `req ${requestedTaskCount}` : '',
    executedTaskCount > 0 ? `ran ${executedTaskCount}` : '',
    skippedTaskCount > 0 ? `skip ${skippedTaskCount}` : '',
    type === 'result' ? `ok ${completed}` : '',
    type === 'result' ? `fail ${failed}` : '',
    type === 'result' && staged > 0 ? `staged ${staged}` : '',
    estimatedTokens > 0 ? `est ${estimatedTokens}` : '',
    actualTokens > 0 ? `act ${actualTokens}` : totalTokens > 0 ? `${totalTokens} tok` : '',
    formattedEstimatedUsd ? `est ${formattedEstimatedUsd}` : '',
    formattedActualUsd ? `act ${formattedActualUsd}` : '',
    estimateConfidence && estimateConfidence !== 'token_plus_pricing'
      ? `cost ${estimateConfidence === 'partial_request_fee' ? 'partial' : estimateConfidence}`
      : '',
    riskTier,
    strategy,
    pattern,
    parsedOk != null ? `parsed ${parsedOk ? 'ok' : 'raw'}` : '',
    synthesisMode ? `synth ${synthesisMode}` : '',
    synthesisPayload?.agentOutputsTruncated ? 'synth trunc' : '',
    routeBadge,
    initiatorBadge,
    durationMs > 0 ? `${Math.round(durationMs / 1000)}s` : '',
    status,
  ].filter(Boolean)
}
