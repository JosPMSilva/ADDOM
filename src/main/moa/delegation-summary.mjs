import { DEFAULT_MOA_POLICY, normalizeMoaPolicy } from './moa-policy.mjs'
import { createUsage } from './usage-math.mjs'
import {
  DELEGATION_RETURN_BUDGETS,
  projectAgentReturnForOrchestrator,
} from './delegation-return-projection.mjs'

export function summarizeResults(results = []) {
  const summary = {
    total: results.length,
    completed: 0,
    failed: 0,
    rateLimited: 0,
    notFound: 0,
    missingApiKey: 0,
    timeout: 0,
    stale: 0,
    aborted: 0,
    budgetExceeded: 0,
    truncated: 0,
    stagedWrites: 0,
  }
  for (const row of results) {
    const status = String(row?.status || '').trim().toLowerCase()
    if (status === 'completed') summary.completed += 1
    else if (status === 'rate_limited') summary.rateLimited += 1
    else if (status === 'not_found') summary.notFound += 1
    else if (status === 'missing_api_key') summary.missingApiKey += 1
    else if (status === 'timeout') summary.timeout += 1
    else if (status === 'stale') summary.stale += 1
    else if (status === 'aborted') summary.aborted += 1
    else if (status === 'budget_exceeded') summary.budgetExceeded += 1
    else summary.failed += 1
    if (row?.truncated) summary.truncated += 1
    if (Array.isArray(row?.stagedChanges)) summary.stagedWrites += row.stagedChanges.length
  }
  return summary
}

const TOOL_OUTPUT_AGENT_CLIP = 400

function clipToolOutputLine(value = '', maxChars = TOOL_OUTPUT_AGENT_CLIP) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`
}

/**
 * Compact tool return for the orchestrator.
 * Agents chrome owns substance; this string must not be a pasteable ledger dump.
 */
export function formatDelegationToolOutput(envelope = {}) {
  const status = String(envelope.status || 'unknown').trim() || 'unknown'
  const summary = envelope?.summary && typeof envelope.summary === 'object' ? envelope.summary : {}
  const agents = Array.isArray(envelope.agents) ? envelope.agents : []
  const completed = Number(summary.completed || 0)
  const failed = Number(summary.failed || 0)
    + Number(summary.timeout || 0)
    + Number(summary.stale || 0)
    + Number(summary.aborted || 0)
    + Number(summary.budgetExceeded || 0)
    + Number(summary.rateLimited || 0)
    + Number(summary.notFound || 0)
    + Number(summary.missingApiKey || 0)
  const lines = [
    `<delegation state="${status}">`,
    `<summary>${status}: ${completed} completed, ${failed} failed, ${agents.length} agent(s).</summary>`,
    '<results>',
  ]
  for (const agent of agents) {
    const role = String(
      agent?.role
      || agent?.requestedRole
      || agent?.requestedRoleKey
      || 'agent',
    ).trim() || 'agent'
    const agentStatus = String(agent?.status || 'unknown').trim() || 'unknown'
    const projected = projectAgentReturnForOrchestrator(agent)
    const body = clipToolOutputLine(
      agentStatus === 'completed'
        ? (projected.text || agent?.output || '')
        : (agent?.error || projected.text || 'failed'),
    )
    lines.push(`- ${role} (${agentStatus}): ${body || '(no output)'}`)
  }
  if (Array.isArray(envelope.errors) && envelope.errors.length > 0) {
    lines.push('<errors>')
    for (const err of envelope.errors.slice(0, 12)) {
      lines.push(`- ${clipToolOutputLine(err?.message || 'Unknown error', 240)}`)
    }
    lines.push('</errors>')
  }
  lines.push('</results>')
  lines.push(
    '<directive>Do not echo this block. Your next message must be short user-facing prose only. Per-agent detail is in Agents.</directive>',
  )
  lines.push('</delegation>')
  return lines.join('\n')
}

export function applyDelegationEnvelopeTexts(envelope = {}) {
  const target = envelope && typeof envelope === 'object' ? envelope : {}
  target.debugText = formatDelegationText(target)
  target.text = formatDelegationToolOutput(target)
  return target
}

export function formatDelegationText(envelope = {}) {
  const lines = ['=== AGENT DELEGATION RESULTS ===', '']
  const status = String(envelope.status || 'unknown')
  const pattern = String(envelope.pattern || '').trim()
  const usage = envelope?.usage && typeof envelope.usage === 'object' ? envelope.usage : {}
  const summary = envelope?.summary && typeof envelope.summary === 'object' ? envelope.summary : {}
  const agents = Array.isArray(envelope.agents) ? envelope.agents : []
  const requestedTaskCount = Number(envelope.requestedTaskCount || 0)
  const plannedTaskCount = Number(envelope.plannedTaskCount || envelope.taskCount || agents.length || 0)
  const executedTaskCount = Number(envelope.executedTaskCount || 0)
  const skippedTaskCount = Number(envelope.skippedTaskCount || 0)
  const admittedTaskCount = Number(envelope.admittedTaskCount || envelope.taskCount || agents.length || 0)
  const limitedTaskCount = Number(envelope.limitedTaskCount || 0)

  lines.push(`Delegation status: ${status}`)
  if (pattern) lines.push(`Pattern: ${pattern}`)
  lines.push(`Tasks: ${plannedTaskCount}`)
  if (requestedTaskCount > 0 && requestedTaskCount !== plannedTaskCount) {
    lines.push(`Requested tasks: ${requestedTaskCount}`)
  }
  lines.push(`Planned tasks: ${plannedTaskCount}`)
  lines.push(`Admitted tasks: ${admittedTaskCount}`)
  lines.push(`Executed tasks: ${executedTaskCount}`)
  if (limitedTaskCount > 0) {
    lines.push(`Limited by user: ${limitedTaskCount}`)
  }
  if (skippedTaskCount > 0) {
    lines.push(`Skipped tasks: ${skippedTaskCount}`)
  }
  lines.push(`Completed: ${Number(summary.completed || 0)} | Failed: ${Number(summary.failed || 0)} | Timeout: ${Number(summary.timeout || 0)} | Stale: ${Number(summary.stale || 0)} | Aborted: ${Number(summary.aborted || 0)} | Budget exceeded: ${Number(summary.budgetExceeded || 0)} | Rate limited: ${Number(summary.rateLimited || 0)} | Not found: ${Number(summary.notFound || 0)} | Missing key: ${Number(summary.missingApiKey || 0)} | Staged writes: ${Number(summary.stagedWrites || 0)}`)
  lines.push(`Duration: ${Number(envelope.durationMs || 0)}ms`)
  lines.push(`Token usage: total=${Number(usage.totalTokens || 0)} in=${Number(usage.inputTokens || 0)} out=${Number(usage.outputTokens || 0)} reasoning=${Number(usage.reasoningTokens || 0)}`)
  if (envelope.retryAttempted) {
    lines.push(`Retry attempts: ${Number(envelope.retryAttemptCount || 0)} | Retry exhausted: ${Array.isArray(envelope.retryExhaustedTasks) ? envelope.retryExhaustedTasks.length : 0} | Skipped exhausted (subset): ${Array.isArray(envelope.skippedRetryExhaustedTasks) ? envelope.skippedRetryExhaustedTasks.length : 0}`)
  }
  if (envelope.partialSuccess) lines.push('Continuation: partial agent success, continuing with local synthesis.')
  else if (envelope.allAgentsFailed) lines.push('Continuation: all delegated agents failed or were skipped; continue locally without more delegation this turn.')
  lines.push('')

  const softPerAgent = DELEGATION_RETURN_BUDGETS.envelopeSoftCharsPerAgent
  for (const agent of agents) {
    const taskId = String(agent.taskId || '')
    const role = String(agent.role || 'Requested role unavailable')
    const roleId = String(agent.roleId || '')
    const requestedRoleKey = String(agent.requestedRoleKey || '')
    const requestedRoleId = String(agent.requestedRoleId || '')
    const requestedRole = String(agent.requestedRole || '')
    const statusLabel = String(agent.status || 'unknown')
    lines.push(`[AGENT: ${role}] [TASK: ${taskId || 'n/a'}] Status: ${statusLabel}`)
    if (roleId) lines.push(`Role ID: ${roleId}`)
    if (requestedRoleKey) lines.push(`Requested role key: ${requestedRoleKey}`)
    if (requestedRoleId) lines.push(`Requested role id: ${requestedRoleId}`)
    if (requestedRole) lines.push(`Requested role name: ${requestedRole}`)
    if (agent.truncated) lines.push('Output: [truncated]')
    const projected = projectAgentReturnForOrchestrator(agent)
    // Soft per-agent budget; revision-backed inventory lives only in the projection.
    const body = projected.text.length > softPerAgent
      ? `${projected.text.slice(0, softPerAgent)}\n... [agent projection truncated for soft envelope budget]`
      : projected.text
    lines.push(body)
    lines.push('')
  }

  if (Array.isArray(envelope.errors) && envelope.errors.length > 0) {
    lines.push('Preflight / policy errors:')
    for (const err of envelope.errors.slice(0, 30)) {
      lines.push(`- ${String(err?.message || 'Unknown error')}`)
    }
    lines.push('')
  }

  lines.push('=== END AGENT RESULTS ===')
  let text = lines.join('\n')
  if (text.length > DELEGATION_RETURN_BUDGETS.envelopeHardChars) {
    text = `${text.slice(0, DELEGATION_RETURN_BUDGETS.envelopeHardChars)}\n... [delegation text truncated for orchestrator budget]\n=== END AGENT RESULTS ===`
  }
  return text
}

export function buildDelegationErrorEnvelope({
  delegationId = '',
  threadId = '',
  turnId = '',
  stepId = '',
  initiator = '',
  route = '',
  dispatchId = '',
  initiatorTurnId = '',
  initiatorMessageId = '',
  policy = DEFAULT_MOA_POLICY,
  tasks = [],
  pattern = '',
  requestedTaskCount = null,
  plannedTaskCount = null,
  admittedTaskCount = null,
  executedTaskCount = 0,
  skippedTaskCount = 0,
  limitedTaskCount = 0,
  fanoutDecision = '',
  errors = [],
  status = 'preflight_failed',
} = {}) {
  const normalizedErrors = Array.isArray(errors) ? errors : []
  const agents = (Array.isArray(tasks) ? tasks : []).map((task) => {
    const taskId = String(task?.task_id || '')
    const taskErrors = normalizedErrors
      .filter((error) => String(error?.taskId || '') === taskId)
      .map((error) => String(error?.message || '').trim())
      .filter(Boolean)
    return {
      taskId,
      roleKey: '',
      roleId: '',
      role: '',
      providerId: '',
      model: '',
      requestedRoleKey: String(task?.agent_role_key || ''),
      requestedRoleId: String(task?.agent_role_id || ''),
      requestedRole: String(task?.agent_role || ''),
      attempted: false,
      status: 'failed',
      output: null,
      error: taskErrors.join(' ') || 'Not executed due to delegation preflight failure.',
      usage: createUsage(),
      tokenUsage: createUsage(),
      rounds: 0,
      truncated: false,
      stagedChanges: [],
      startedAt: 0,
      finishedAt: 0,
      durationMs: 0,
    }
  })
  const envelope = {
    delegationId: String(delegationId || ''),
    threadId: String(threadId || ''),
    turnId: String(turnId || ''),
    stepId: String(stepId || ''),
    initiator: String(initiator || ''),
    route: String(route || ''),
    dispatchId: String(dispatchId || ''),
    initiatorTurnId: String(initiatorTurnId || ''),
    initiatorMessageId: String(initiatorMessageId || ''),
    status: String(status || 'preflight_failed'),
    pattern: String(pattern || ''),
    taskCount: agents.length,
    requestedTaskCount: Number(requestedTaskCount ?? agents.length),
    plannedTaskCount: Number(plannedTaskCount ?? agents.length),
    admittedTaskCount: Number(admittedTaskCount ?? agents.length),
    executedTaskCount: Number(executedTaskCount || 0),
    skippedTaskCount: Number(skippedTaskCount || 0),
    limitedTaskCount: Number(limitedTaskCount || 0),
    fanoutDecision: String(fanoutDecision || ''),
    startedAt: Date.now(),
    finishedAt: Date.now(),
    durationMs: 0,
    policy: normalizeMoaPolicy(policy),
    usage: createUsage(),
    summary: summarizeResults(agents),
    agents,
    stagedChanges: [],
    errors: normalizedErrors,
  }
  applyDelegationEnvelopeTexts(envelope)
  return envelope
}
