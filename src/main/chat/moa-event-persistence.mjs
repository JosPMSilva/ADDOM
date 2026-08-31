import { commitProjectedTimelineEvent } from './canonical-root-event-writer.mjs'

function resolveMoaEventSpec(channel, data) {
  const agent = String(data.agentRole || data.agentRoleId || 'agent')
  const task = String(data.taskId || 'n/a')
  switch (channel) {
    case 'moa:delegation-start': return ['moa_delegation_start', `MoA delegation started (${Number(data.taskCount || 0)} task(s)).`]
    case 'moa:agent-start': return ['moa_agent_start', `MoA agent started: ${agent} (${task}).`]
    case 'moa:agent-done': return ['moa_agent_done', `MoA agent done: ${agent} (${task}).`]
    case 'moa:agent-error': return ['moa_agent_error', `MoA agent error: ${agent} - ${String(data.error || 'unknown error')}`]
    case 'moa:agent-recovery': return ['moa_agent_recovery', `MoA agent recovery: ${agent} - ${String(data.message || 'loop guard recovery')}`]
    case 'moa:agent-file-staged': return ['moa_agent_file_staged', `MoA staged file: ${String(data.filePath || 'unknown file')} (${String(data.revisionId || 'n/a')})`]
    case 'moa:delegation-retry': return ['moa_delegation_retry', `MoA retrying agent: ${agent} (${task}).`]
    case 'moa:delegation-skip': return ['moa_delegation_skip', `MoA skipped agent: ${agent} (${task}).`]
    case 'moa:delegation-planned': return ['moa_delegation_planned', `MoA delegation planned (${String(data.riskTier || 'n/a')} / ${String(data.strategy || 'n/a')}${data.pattern ? ` / ${String(data.pattern)}` : ''}).`]
    case 'moa:delegation-fanout-confirmed': return ['moa_delegation_fanout_confirmed', `MoA fanout decision: ${String(data.decision || 'launch_all')} (${Number(data.admittedTaskCount || 0)} admitted).`]
    case 'moa:delegation-preflight-telemetry': return ['moa_delegation_preflight_telemetry', `MoA preflight ${String(data.preflightStatus || 'unknown')}${data.isRepairRetryAttempt ? ' (repair retry)' : ''}.`]
    case 'moa:delegation-done': return ['moa_delegation_done', `MoA delegation finished (${String(data.status || 'completed')}).`]
    default: return null
  }
}

export function createMoaEventEmitter({
  send,
  persistTimelineEvent,
  activeThreadId,
  activeTurnId,
  stepId,
  stepSequence,
}) {
  return (channel, payload = {}) => {
    const data = {
      threadId: activeThreadId,
      turnId: activeTurnId,
      stepId,
      sequence: stepSequence,
      ...payload,
    }
    const spec = resolveMoaEventSpec(channel, data)
    if (!spec) return send(channel, data)
    commitProjectedTimelineEvent({
      persistTimelineEvent, send, kind: spec[0],
      options: { role: 'system', content: spec[1], meta: data },
      channel, payload: data,
    })
    if (channel === 'moa:agent-file-staged' && data.filePath) {
      send('artifacts:updated', { filePath: String(data.filePath) })
    }
  }
}
