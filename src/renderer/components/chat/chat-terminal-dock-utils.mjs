export function asTrimmedString(value = '') {
  return String(value || '').trim()
}

export function dirnameFromPath(filePath = '') {
  const normalized = asTrimmedString(filePath).replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}

export function joinWorkspacePath(projectFolder = '', relativePath = '') {
  const normalizedProject = asTrimmedString(projectFolder).replace(/[\\/]+$/g, '')
  const normalizedRelative = asTrimmedString(relativePath).replace(/^[\\/]+/g, '')
  if (!normalizedProject) return ''
  if (!normalizedRelative) return normalizedProject
  const separator = normalizedProject.includes('\\') ? '\\' : '/'
  return `${normalizedProject}${separator}${normalizedRelative.replace(/[\\/]/g, separator)}`
}

function terminalActionState(enabled, reason = '') {
  return { enabled: !!enabled, reason: enabled ? '' : reason }
}

function getTerminalBaseDisabledReason({ workspaceActive = false, activeThreadId = '', projectFolder = '' } = {}) {
  if (!workspaceActive || !asTrimmedString(projectFolder)) return 'Open a project first'
  if (!asTrimmedString(activeThreadId)) return 'Open/select a thread first'
  return ''
}

function terminalSessionIsRunning(session = null) {
  if (!session) return false
  if (session?.approvalState === 'denied') return false
  if (asTrimmedString(session?.failureReason)) return false
  const lifecycleState = asTrimmedString(session?.lifecycleState || session?.status).toLowerCase()
  return !['closing', 'ended', 'exited', 'closed'].includes(lifecycleState)
}

function getMissingOrStoppedSessionReason(session = null) {
  if (!session?.id) return 'No terminal session selected'
  if (!terminalSessionIsRunning(session)) return 'Terminal session is not running'
  return ''
}

export function resolveTerminalActionStates({
  workspaceActive = false,
  activeThreadId = '',
  projectFolder = '',
  selectedSession = null,
  hasTerminalDockTarget = false,
  terminalDockCollapsed = false,
} = {}) {
  const baseDisabledReason = getTerminalBaseDisabledReason({ workspaceActive, activeThreadId, projectFolder })
  const sessionDisabledReason = baseDisabledReason || getMissingOrStoppedSessionReason(selectedSession)
  const selectedSessionId = asTrimmedString(selectedSession?.id)
  const controlOwner = asTrimmedString(selectedSession?.controlOwner).toLowerCase()
  const takeoverState = asTrimmedString(selectedSession?.takeoverState).toLowerCase()
  const controlledByUser = controlOwner === 'user' || takeoverState === 'user_takeover'
  const controlledByModel = controlOwner === 'model'
  const hasDockTarget = hasTerminalDockTarget || !!selectedSessionId

  return {
    focus: terminalActionState(
      !baseDisabledReason && !!selectedSessionId,
      baseDisabledReason || 'No terminal session selected',
    ),
    new: terminalActionState(!baseDisabledReason, baseDisabledReason),
    browse: terminalActionState(!baseDisabledReason, baseDisabledReason),
    takeover: terminalActionState(
      !sessionDisabledReason && controlledByModel,
      sessionDisabledReason || (controlledByUser ? 'Terminal is already controlled by you' : 'Terminal is not controlled by AI'),
    ),
    handback: terminalActionState(
      !sessionDisabledReason && controlledByUser,
      sessionDisabledReason || (controlledByModel ? 'Terminal is already controlled by AI' : 'Terminal is not controlled by you'),
    ),
    interrupt: terminalActionState(
      !sessionDisabledReason && selectedSession?.interruptCapability === true,
      sessionDisabledReason || 'Terminal cannot be interrupted',
    ),
    close: terminalActionState(
      !baseDisabledReason && !!selectedSessionId && selectedSession?.closeCapability === true,
      baseDisabledReason || (!selectedSessionId ? 'No terminal session selected' : 'Terminal cannot be closed'),
    ),
    hide: terminalActionState(
      !baseDisabledReason && hasDockTarget && terminalDockCollapsed !== true,
      baseDisabledReason || 'No terminal dock open',
    ),
    terminate: terminalActionState(
      !sessionDisabledReason && selectedSession?.terminateCapability === true,
      sessionDisabledReason || 'Terminal cannot be terminated',
    ),
  }
}

function resolveDockLabels(labels = {}) {
  return {
    terminal: asTrimmedString(labels?.terminal) || 'Terminal',
    approval: asTrimmedString(labels?.approval) || 'Approval',
    approvalSuffix: asTrimmedString(labels?.approvalSuffix) || 'approval',
    denied: asTrimmedString(labels?.denied) || 'Denied',
    failed: asTrimmedString(labels?.failed) || 'Failed',
    closing: asTrimmedString(labels?.closing) || 'Closing',
    ended: asTrimmedString(labels?.ended) || 'Ended',
    userTakeover: asTrimmedString(labels?.userTakeover) || 'User takeover',
    aiWaiting: asTrimmedString(labels?.aiWaiting) || 'AI waiting',
    aiControlling: asTrimmedString(labels?.aiControlling) || 'AI controlling',
    running: asTrimmedString(labels?.running) || 'Running',
    currentThread: asTrimmedString(labels?.currentThread) || 'Current Thread',
    otherLive: asTrimmedString(labels?.otherLive) || 'Other Live',
    history: asTrimmedString(labels?.history) || 'History',
  }
}

export function getPathTail(value = '') {
  const normalized = asTrimmedString(value)
  if (!normalized) return ''
  const parts = normalized.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || normalized
}

export function getSessionTabLabel(session = null, { labels = {} } = {}) {
  const dockLabels = resolveDockLabels(labels)
  const explicitTitle = asTrimmedString(session?.sessionTitle)
  if (explicitTitle) return explicitTitle
  const tail = getPathTail(session?.cwd)
  const shell = asTrimmedString(session?.shellKind || session?.shell)
  if (tail && shell) return `${tail} (${shell})`
  return tail || shell || asTrimmedString(session?.id) || dockLabels.terminal
}

export function getPendingTabLabel(approval = null, { labels = {} } = {}) {
  const dockLabels = resolveDockLabels(labels)
  const tail = getPathTail(approval?.toolInput?.cwd || approval?.policy?.resolvedCwd)
  if (tail) return `${tail} (${dockLabels.approvalSuffix})`
  return dockLabels.approval
}

export function getShortApprovalLabel(approval = null) {
  const approvalId = asTrimmedString(approval?.approvalId)
  return approvalId ? approvalId.slice(-4) : ''
}

export function buildDisambiguatedTabLabel(baseLabel = '', item = null, duplicateIndex = 0, duplicateCount = 1, { labels = {} } = {}) {
  const dockLabels = resolveDockLabels(labels)
  const normalizedBaseLabel = asTrimmedString(baseLabel) || dockLabels.terminal
  if (duplicateCount <= 1) return normalizedBaseLabel

  const explicitDisambiguator = asTrimmedString(item?.session?.labelDisambiguator)
  if (explicitDisambiguator) return `${normalizedBaseLabel} - ${explicitDisambiguator}`

  if (item?.kind === 'pending') {
    const approvalSuffix = getShortApprovalLabel(item?.approval)
    if (approvalSuffix) return `${normalizedBaseLabel} - ${approvalSuffix}`
  }

  return `${normalizedBaseLabel} - ${duplicateIndex + 1}`
}

export function getTabPriority(item = null) {
  if (!item) return 'running'
  if (item.kind === 'pending') return 'approval'
  const session = item.session
  const failureReason = asTrimmedString(session?.failureReason)
  if (session?.approvalState === 'denied' || failureReason) return 'failed'
  const lifecycleState = asTrimmedString(session?.lifecycleState || session?.status).toLowerCase()
  if (lifecycleState === 'closing' || lifecycleState === 'ended' || lifecycleState === 'exited' || lifecycleState === 'closed') {
    return 'ended'
  }
  if (session?.pendingAiControlRequest === true) return 'waiting'
  if (session?.takeoverState === 'user_takeover' || session?.controlOwner === 'user') return 'controlled'
  return 'running'
}

export function getTabStateLabel(item = null, { labels = {} } = {}) {
  const dockLabels = resolveDockLabels(labels)
  if (!item) return ''
  if (item.kind === 'pending') return dockLabels.approval
  const session = item.session
  if (session?.approvalState === 'denied') return dockLabels.denied
  if (asTrimmedString(session?.failureReason)) return dockLabels.failed
  const lifecycleState = asTrimmedString(session?.lifecycleState || session?.status).toLowerCase()
  if (lifecycleState === 'closing') return dockLabels.closing
  if (lifecycleState === 'ended' || lifecycleState === 'exited' || lifecycleState === 'closed') return dockLabels.ended
  if (session?.takeoverState === 'user_takeover') return dockLabels.userTakeover
  if (session?.pendingAiControlRequest === true) return dockLabels.aiWaiting
  if (session?.controlOwner === 'model') return dockLabels.aiControlling
  return dockLabels.running
}

export function getPriorityClasses(priority = 'running') {
  if (priority === 'approval') return 'border-warning-border/60 bg-warning-bg/12 text-warning-soft'
  if (priority === 'failed') return 'border-danger/50 bg-danger/12 text-danger-soft'
  if (priority === 'waiting') return 'border-accent/45 bg-accent/12 text-accent-soft'
  if (priority === 'controlled') return 'border-accent/45 bg-accent/12 text-accent-soft'
  if (priority === 'ended') return 'border-surface-border/70 bg-surface-panel/60 text-text-secondary'
  if (priority === 'unread') return 'border-surface-border/80 bg-surface-panel/70 text-text-primary'
  return 'border-success-border/40 bg-success-bg/10 text-success-soft'
}

export function getPriorityIcon(priority = 'running') {
  if (priority === 'approval') return 'warning-circle'
  if (priority === 'failed') return 'warning'
  if (priority === 'waiting') return 'clock'
  if (priority === 'controlled') return 'robot'
  if (priority === 'ended') return 'check-circle'
  return 'play'
}

export function getSelectedTabDetail(tab = null) {
  if (!tab) return ''
  if (tab.kind === 'pending') {
    return asTrimmedString(tab?.approval?.toolInput?.cwd || tab?.approval?.policy?.resolvedCwd || tab?.approval?.projectRoot)
  }
  return asTrimmedString(tab?.session?.cwd)
}

export function getThreadTitle(threads = [], threadId = '') {
  const normalizedThreadId = asTrimmedString(threadId)
  if (!normalizedThreadId) return ''
  return (Array.isArray(threads) ? threads : [])
    .find((thread) => asTrimmedString(thread?.id) === normalizedThreadId)?.title || normalizedThreadId
}

export function getBrowserSectionLabel(section = '', { labels = {} } = {}) {
  const dockLabels = resolveDockLabels(labels)
  if (section === 'other_live') return dockLabels.otherLive
  if (section === 'history') return dockLabels.history
  return dockLabels.currentThread
}

export function getArchivePriority(session = null) {
  return asTrimmedString(session?.failureReason) ? 'failed' : 'ended'
}

export function hasArchivedMemorySummary(session = null) {
  return asTrimmedString(session?.memoryCandidateSummary).length > 0
}

export function hasSavedArchivedMemory(session = null) {
  return (
    asTrimmedString(session?.memoryCandidateStatus).toLowerCase() === 'accepted'
    && asTrimmedString(session?.memoryNodeId).length > 0
  )
}

export function getArchiveSaveActionState(session = null, pending = false) {
  if (pending) return { disabled: true, saved: false, missing: false }
  if (hasSavedArchivedMemory(session)) return { disabled: true, saved: true, missing: false }
  if (!hasArchivedMemorySummary(session)) return { disabled: true, saved: false, missing: true }
  return { disabled: false, saved: false, missing: false }
}

export function getDockTabDomId(tabId = '') {
  return `chat-terminal-dock-tab-${asTrimmedString(tabId).replace(/[^a-z0-9_-]+/gi, '-') || 'unknown'}`
}

export function getDockPanelDomId(tabId = '') {
  return `chat-terminal-dock-panel-${asTrimmedString(tabId).replace(/[^a-z0-9_-]+/gi, '-') || 'unknown'}`
}
