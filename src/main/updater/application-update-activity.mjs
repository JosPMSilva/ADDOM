const TERMINAL_WORK_STATUSES = new Set([
  'cancelled',
  'closed',
  'completed',
  'exited',
  'failed',
  'orphaned',
  'resolved',
  'stopped',
])

function normalizeStatus(value = '') {
  return String(value || '').trim().toLowerCase()
}

function isActiveWork(row) {
  const status = normalizeStatus(row?.status)
  return !status || !TERMINAL_WORK_STATUSES.has(status)
}

function isPendingApproval(row) {
  return normalizeStatus(row?.status) === 'pending'
}

function isActiveTerminal(row) {
  const status = normalizeStatus(row?.status)
  return !status || !new Set(['closed', 'exited']).has(status)
}

function countLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`
}

function validRendererPreflight(value, now, maximumAgeMs) {
  const capturedAt = Number(value?.capturedAt)
  const ageMs = now - capturedAt
  return !!value
    && typeof value === 'object'
    && Number.isSafeInteger(value.dirtyTabCount)
    && value.dirtyTabCount >= 0
    && value.dirtyTabCount <= 10_000
    && Number.isFinite(capturedAt)
    && capturedAt >= 0
    && ageMs >= -1_000
    && ageMs <= maximumAgeMs
}

export function createApplicationUpdateActivityMonitor({
  listChatRuns = () => [],
  listManagedRuns = () => [],
  listManagedApprovals = () => [],
  listOpenAIBackgroundJobs = () => [],
  listBackgroundCommands = () => [],
  listTrackedCursorAgentPids = () => [],
  listTerminalSessions = () => [],
  now = Date.now,
  maxRendererPreflightAgeMs = 5_000,
} = {}) {
  async function collectBlockers({ rendererPreflight } = {}) {
    if (!validRendererPreflight(
      rendererPreflight,
      Number(now()),
      Math.max(0, Number(maxRendererPreflightAgeMs) || 0),
    )) {
      return [{
        kind: 'unsaved-work',
        label: 'ADDOM could not verify that editor work is saved',
      }]
    }

    let activity
    try {
      activity = await Promise.all([
        listChatRuns(),
        listManagedRuns(),
        listManagedApprovals(),
        listOpenAIBackgroundJobs(),
        listBackgroundCommands(),
        listTrackedCursorAgentPids(),
        listTerminalSessions(),
      ])
    } catch {
      return [{
        kind: 'running-task',
        label: 'ADDOM could not verify that all work is idle',
      }]
    }
    if (!activity.every(Array.isArray)) {
      return [{
        kind: 'running-task',
        label: 'ADDOM could not verify that all work is idle',
      }]
    }

    const [
      chatRuns,
      managedRuns,
      managedApprovals,
      openAIBackgroundJobs,
      backgroundCommands,
      trackedCursorAgentPids,
      terminalSessions,
    ] = activity

    const runningTaskCount = chatRuns.filter(isActiveWork).length
      + managedRuns.filter(isActiveWork).length
      + openAIBackgroundJobs.filter(isActiveWork).length
      + backgroundCommands.filter(isActiveWork).length
      + trackedCursorAgentPids.length
    const pendingApprovalCount = managedApprovals.filter(isPendingApproval).length
    const activeTerminalCount = terminalSessions.filter(isActiveTerminal).length
    const blockers = []

    if (runningTaskCount > 0) {
      blockers.push({
        kind: 'running-task',
        label: countLabel(runningTaskCount, 'task is still running', 'tasks are still running'),
      })
    }
    if (pendingApprovalCount > 0) {
      blockers.push({
        kind: 'pending-approval',
        label: countLabel(pendingApprovalCount, 'approval needs attention', 'approvals need attention'),
      })
    }
    if (activeTerminalCount > 0) {
      blockers.push({
        kind: 'active-terminal',
        label: countLabel(activeTerminalCount, 'terminal is still active', 'terminals are still active'),
      })
    }
    if (rendererPreflight.dirtyTabCount > 0) {
      blockers.push({
        kind: 'unsaved-work',
        label: countLabel(rendererPreflight.dirtyTabCount, 'unsaved editor tab', 'unsaved editor tabs'),
      })
    }

    return blockers
  }

  return { collectBlockers }
}

