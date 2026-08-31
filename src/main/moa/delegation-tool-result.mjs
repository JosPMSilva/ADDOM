import { buildToolResultMessage } from '../api-clients/ai-provider.mjs'

function asObject(value) {
  return value && typeof value === 'object' ? value : {}
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

export function buildDelegationMeta(delegationEnvelope, { trimText }) {
  const envelope = asObject(delegationEnvelope)
  const usage = asObject(envelope.usage)
  const reducer = asObject(envelope.reducer)
  const stagedChanges = asArray(envelope.stagedChanges)
  const agents = asArray(envelope.agents)

  return {
    delegationId: String(envelope.delegationId || ''),
    dispatchId: String(envelope.dispatchId || envelope.delegationId || ''),
    route: String(envelope.route || ''),
    initiator: String(envelope.initiator || ''),
    initiatorTurnId: String(envelope.initiatorTurnId || ''),
    initiatorMessageId: String(envelope.initiatorMessageId || ''),
    status: String(envelope.status || ''),
    selectionContractStatus: String(envelope.selectionContractStatus || ''),
    riskTier: String(envelope.riskTier || ''),
    strategy: String(envelope.strategy || ''),
    pattern: String(envelope.pattern || ''),
    estimatedTokens: Number(envelope.estimatedTokens || 0),
    actualTokens: Number(envelope.actualTokens || usage.totalTokens || 0),
    estimatedUsd: Number.isFinite(Number(envelope.estimatedUsd))
      ? Number(envelope.estimatedUsd)
      : null,
    actualUsd: Number.isFinite(Number(envelope.actualUsd))
      ? Number(envelope.actualUsd)
      : null,
    costDecision: String(envelope.costDecision || ''),
    parsedOk: !!envelope.parsedOk,
    dedupeCount: Number(envelope.dedupeCount || 0),
    recommendationDedupeCount: Number(envelope.recommendationDedupeCount || 0),
    stagedChangeDedupeCount: Number(envelope.stagedChangeDedupeCount || 0),
    scorecardDedupeCount: Number(envelope.scorecardDedupeCount || 0),
    mergedSeverityConflicts: Number(envelope.mergedSeverityConflicts || 0),
    droppedFindings: Number(envelope.droppedFindings || 0),
    taskCount: Number(envelope.taskCount || 0),
    requestedTaskCount: Number(envelope.requestedTaskCount || 0),
    plannedTaskCount: Number(envelope.plannedTaskCount || envelope.taskCount || 0),
    admittedTaskCount: Number(envelope.admittedTaskCount || 0),
    executedTaskCount: Number(envelope.executedTaskCount || 0),
    skippedTaskCount: Number(envelope.skippedTaskCount || 0),
    limitedTaskCount: Number(envelope.limitedTaskCount || 0),
    fanoutDecision: String(envelope.fanoutDecision || ''),
    durationMs: Number(envelope.durationMs || 0),
    summary: asObject(envelope.summary),
    usage,
    policy: asObject(envelope.policy),
    retryAttempted: envelope.retryAttempted === true,
    retryAttemptCount: Number(envelope.retryAttemptCount || 0),
    allAgentsFailed: envelope.allAgentsFailed === true,
    partialSuccess: envelope.partialSuccess === true,
    retryExhaustedTasks: asArray(envelope.retryExhaustedTasks).slice(0, 30).map((row) => ({
      taskId: String(row?.taskId || ''),
      roleId: String(row?.roleId || ''),
      role: String(row?.role || ''),
      providerId: String(row?.providerId || ''),
      model: String(row?.model || ''),
      status: String(row?.status || ''),
      error: String(row?.error || ''),
      attempts: Number(row?.attempts || 0),
      terminalForTurn: row?.terminalForTurn === true,
    })),
    skippedRetryExhaustedTasks: asArray(envelope.skippedRetryExhaustedTasks).slice(0, 30).map((row) => ({
      taskId: String(row?.taskId || ''),
      roleId: String(row?.roleId || ''),
      role: String(row?.role || ''),
      providerId: String(row?.providerId || ''),
      model: String(row?.model || ''),
      status: String(row?.status || ''),
      error: String(row?.error || ''),
      attempts: Number(row?.attempts || 0),
      terminalForTurn: row?.terminalForTurn === true,
    })),
    agents: agents.slice(0, 30).map((agent) => {
      const row = asObject(agent)
      const stagedRows = asArray(row.stagedChanges)
      return {
        taskId: String(row.taskId || ''),
        roleKey: String(row.roleKey || ''),
        roleId: String(row.roleId || ''),
        role: String(row.role || ''),
        requestedRoleKey: String(row.requestedRoleKey || ''),
        requestedRoleId: String(row.requestedRoleId || ''),
        requestedRole: String(row.requestedRole || ''),
        status: String(row.status || ''),
        attempted: row.attempted === true,
        rounds: Number(row.rounds || 0),
        durationMs: Number(row.durationMs || 0),
        truncated: !!row.truncated,
        error: String(row.error || ''),
        outputPreview: trimText ? trimText(row.output || '', 1200) : String(row.output || '').slice(0, 1200),
        usage: asObject(row.usage),
        stagedCount: stagedRows.length,
        stagedChanges: stagedRows.slice(0, 20).map((change) => ({
          filePath: String(change?.filePath || ''),
          revisionId: String(change?.revisionId || ''),
          bytes: Number(change?.bytes || 0) || 0,
          addedLines: Number(change?.addedLines || 0) || 0,
          removedLines: Number(change?.removedLines || 0) || 0,
        })),
      }
    }),
    stagedSummary: envelope.stagedSummary && typeof envelope.stagedSummary === 'object'
      ? {
          count: Number(envelope.stagedSummary.count || 0) || 0,
          totalBytes: Number(envelope.stagedSummary.totalBytes || 0) || 0,
        }
      : {
          count: stagedChanges.length,
          totalBytes: stagedChanges.reduce((sum, row) => sum + (Number(row?.bytes || 0) || 0), 0),
        },
    stagedChanges: stagedChanges.slice(0, 120).map((row) => ({
      filePath: String(row?.filePath || ''),
      revisionId: String(row?.revisionId || ''),
      taskId: String(row?.taskId || ''),
      roleId: String(row?.roleId || ''),
      role: String(row?.role || ''),
      bytes: Number(row?.bytes || 0) || 0,
      addedLines: Number(row?.addedLines || 0) || 0,
      removedLines: Number(row?.removedLines || 0) || 0,
      createdAt: Number(row?.createdAt || 0) || 0,
    })),
    errors: asArray(envelope.errors).slice(0, 30).map((err) => ({
      code: String(err?.code || ''),
      message: String(err?.message || ''),
      taskId: String(err?.taskId || ''),
    })),
    reducer: reducer && Object.keys(reducer).length > 0
      ? {
          parsedOk: !!reducer.parsedOk,
          dedupeCount: Number(reducer.dedupeCount || 0),
          recommendationDedupeCount: Number(reducer.recommendationDedupeCount || 0),
          stagedChangeDedupeCount: Number(reducer.stagedChangeDedupeCount || 0),
          scorecardDedupeCount: Number(reducer.scorecardDedupeCount || 0),
          mergedSeverityConflicts: Number(reducer.mergedSeverityConflicts || 0),
          droppedFindings: Number(reducer.droppedFindings || 0),
          findingsCount: asArray(reducer.findings).length,
          recommendationsCount: asArray(reducer.recommendations).length,
          stagedChangesCount: asArray(reducer.stagedChanges).length,
          scorecardCount: asArray(reducer.scorecard).length,
          topFindings: asArray(reducer.findings).slice(0, 20).map((finding) => ({
            severity: String(finding?.severity || ''),
            file: String(finding?.file || ''),
            issue: String(finding?.issue || ''),
            taskId: String(finding?.taskId || ''),
            role: String(finding?.role || ''),
          })),
          topRecommendations: asArray(reducer.recommendations).slice(0, 20).map((row) => ({
            title: String(row?.title || ''),
            priority: String(row?.priority || ''),
            file: String(row?.file || ''),
            taskId: String(row?.taskId || ''),
            role: String(row?.role || ''),
          })),
          topStagedChanges: asArray(reducer.stagedChanges).slice(0, 20).map((row) => ({
            filePath: String(row?.filePath || ''),
            changeType: String(row?.changeType || ''),
            taskId: String(row?.taskId || ''),
            role: String(row?.role || ''),
          })),
          topScorecard: asArray(reducer.scorecard).slice(0, 20).map((row) => ({
            label: String(row?.label || ''),
            score: Number(row?.score || 0),
            taskId: String(row?.taskId || ''),
            role: String(row?.role || ''),
          })),
        }
      : null,
  }
}

export function emitDelegationToolResult({
  tc,
  toolInput,
  delegationInput,
  delegationEnvelope,
  delegationIsError,
  activeThreadId,
  activeTurnId,
  stepId,
  stepSequence,
  stepStartedAt,
  history,
  turnToolResults,
  send,
  persistTimelineEvent,
  trimText,
}) {
  const delegationResult = String(delegationEnvelope?.text || 'Delegation failed with no output.')
  const delegationMeta = buildDelegationMeta(delegationEnvelope, { trimText })
  const delegationFinishedAt = Date.now()
  const delegationDurationMs = Math.max(0, delegationFinishedAt - stepStartedAt)

  send('chat:tool-result', {
    threadId: activeThreadId,
    turnId: activeTurnId,
    stepId,
    sequence: stepSequence,
    startedAt: stepStartedAt,
    finishedAt: delegationFinishedAt,
    durationMs: delegationDurationMs,
    approvalId: '',
    toolName: tc.name,
    toolInput: delegationInput,
    result: delegationResult,
    isError: delegationIsError,
    decision: 'approved',
    denyReason: '',
    moa: delegationMeta,
  })

  persistTimelineEvent('tool_result', {
    role: 'assistant',
    content: delegationResult,
    meta: {
      threadId: activeThreadId,
      turnId: activeTurnId,
      stepId,
      sequence: stepSequence,
      startedAt: stepStartedAt,
      finishedAt: delegationFinishedAt,
      durationMs: delegationDurationMs,
      toolName: tc.name,
      decision: 'approved',
      denyReason: '',
      isError: delegationIsError,
      toolInput: delegationInput,
      resultPreview: trimText ? trimText(delegationResult, 5000) : delegationResult.slice(0, 5000),
      moa: delegationMeta,
    },
  })

  turnToolResults.push({
    approvalId: '',
    toolName: tc.name,
    input: toolInput,
    result: delegationResult,
    isError: delegationIsError,
    decision: 'approved',
    denyReason: '',
    missingDependencySuspected: false,
    stepId,
    sequence: stepSequence,
    startedAt: stepStartedAt,
    finishedAt: delegationFinishedAt,
    durationMs: delegationDurationMs,
    fileChange: null,
  })

  history.push(buildToolResultMessage(tc.id, tc.name, delegationResult, delegationIsError))
}
