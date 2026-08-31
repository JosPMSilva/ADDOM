import {
  formatDateTime,
  formatRelativeTime,
} from '../../i18n/formatters.mjs'

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function resolveTerminalSessionLabels(labels = {}) {
  return {
    user: asTrimmedString(labels?.user) || 'User',
    ai: asTrimmedString(labels?.ai) || 'AI',
    session: asTrimmedString(labels?.session) || 'Session',
    host: asTrimmedString(labels?.host) || 'Host',
    workspace: asTrimmedString(labels?.workspace) || 'Workspace',
    shell: asTrimmedString(labels?.shell) || 'shell',
    terminal: asTrimmedString(labels?.terminal) || 'terminal',
    threadPrefix: asTrimmedString(labels?.threadPrefix) || 'Thread',
    closing: asTrimmedString(labels?.closing) || 'Closing',
    ended: asTrimmedString(labels?.ended) || 'Ended',
    closed: asTrimmedString(labels?.closed) || 'Closed',
    live: asTrimmedString(labels?.live) || 'Live',
    failed: asTrimmedString(labels?.failed) || 'Failed',
    terminated: asTrimmedString(labels?.terminated) || 'Terminated',
    closedPrefix: asTrimmedString(labels?.closedPrefix) || 'Closed',
    startedPrefix: asTrimmedString(labels?.startedPrefix) || 'Started',
    savedToMemory: asTrimmedString(labels?.savedToMemory) || 'Saved to Memory',
    dismissed: asTrimmedString(labels?.dismissed) || 'Dismissed',
    suggested: asTrimmedString(labels?.suggested) || 'Suggested',
    noSuggestion: asTrimmedString(labels?.noSuggestion) || 'No suggestion',
  }
}

export function getPathTail(value = '') {
  const normalized = asTrimmedString(value)
  if (!normalized) return ''
  const parts = normalized.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || normalized
}

export function getTerminalInitiatorLabel(session = null, { modelSessionId = '', labels = {} } = {}) {
  const resolvedLabels = resolveTerminalSessionLabels(labels)
  const openedBy = asTrimmedString(session?.openedBy).toLowerCase()
  if (openedBy === 'user') return resolvedLabels.user
  if (openedBy === 'model') return resolvedLabels.ai
  if (asTrimmedString(modelSessionId) === asTrimmedString(session?.id || session?.sessionId)) return resolvedLabels.ai
  return resolvedLabels.session
}

export function getTerminalActorLabel(value = '', { labels = {} } = {}) {
  const resolvedLabels = resolveTerminalSessionLabels(labels)
  const actor = asTrimmedString(value).toLowerCase()
  if (actor === 'user') return resolvedLabels.user
  if (actor === 'model') return resolvedLabels.ai
  return asTrimmedString(value) || '-'
}

export function getTerminalScopeLabel(session = null, { labels = {} } = {}) {
  const resolvedLabels = resolveTerminalSessionLabels(labels)
  const scope = asTrimmedString(session?.scope).toLowerCase()
  return scope === 'host' || session?.hostAccessRequired === true ? resolvedLabels.host : resolvedLabels.workspace
}

export function getTerminalShellLabel(session = null, { labels = {} } = {}) {
  const resolvedLabels = resolveTerminalSessionLabels(labels)
  return asTrimmedString(session?.shellKind || session?.shell) || resolvedLabels.shell
}

export function getTerminalPrimaryIdentity(session = null, options = {}) {
  const resolvedLabels = resolveTerminalSessionLabels(options?.labels)
  const displayLabelPrimary = asTrimmedString(session?.displayLabelPrimary)
  if (displayLabelPrimary) return displayLabelPrimary
  const sessionTitle = asTrimmedString(session?.sessionTitle)
  if (sessionTitle) return sessionTitle
  const tail = getPathTail(session?.cwd) || asTrimmedString(session?.displayName) || resolvedLabels.terminal
  return [tail, getTerminalShellLabel(session, options), getTerminalInitiatorLabel(session, options)].filter(Boolean).join(' / ')
}

export function getTerminalThreadHint(session = null, { labels = {} } = {}) {
  const resolvedLabels = resolveTerminalSessionLabels(labels)
  const threadTitleHint = asTrimmedString(session?.metadata?.threadTitleHint)
  if (threadTitleHint) return threadTitleHint
  const threadId = asTrimmedString(session?.threadId)
  if (!threadId) return ''
  return `${resolvedLabels.threadPrefix} ${threadId.slice(0, 8)}`
}

export function getTerminalSecondaryIdentity(session = null, options = {}) {
  const displayLabelSecondary = asTrimmedString(session?.displayLabelSecondary)
  if (displayLabelSecondary) return displayLabelSecondary
  return [
    asTrimmedString(session?.cwd),
    getTerminalScopeLabel(session, options),
    getTerminalThreadHint(session, options),
  ].filter(Boolean).join(' / ')
}

export function getTerminalLiveStatusLabel(session = null, { labels = {} } = {}) {
  const resolvedLabels = resolveTerminalSessionLabels(labels)
  const status = asTrimmedString(session?.status || 'running').toLowerCase()
  if (status === 'closing') return resolvedLabels.closing
  if (status === 'exited') return resolvedLabels.ended
  if (status === 'closed') return resolvedLabels.closed
  return resolvedLabels.live
}

export function getTerminalArchiveStatusLabel(session = null, { labels = {} } = {}) {
  const resolvedLabels = resolveTerminalSessionLabels(labels)
  const status = asTrimmedString(session?.status || 'ended').toLowerCase()
  if (status === 'failed') return resolvedLabels.failed
  if (status === 'terminated') return resolvedLabels.terminated
  return resolvedLabels.ended
}

export function getTerminalRelativeTimestampLabel(session = null, { locale = '', now = Date.now(), labels = {} } = {}) {
  const resolvedLabels = resolveTerminalSessionLabels(labels)
  const closedAt = Number(session?.closedAt || 0) || 0
  if (closedAt > 0) {
    const relative = formatRelativeTime(closedAt, { locale, now, style: 'short', fallback: '' })
    return relative ? `${resolvedLabels.closedPrefix} ${relative}` : resolvedLabels.closedPrefix
  }
  const startedAt = Number(session?.createdAt || session?.openedAt || 0) || 0
  if (startedAt > 0) {
    const relative = formatRelativeTime(startedAt, { locale, now, style: 'short', fallback: '' })
    return relative ? `${resolvedLabels.startedPrefix} ${relative}` : resolvedLabels.startedPrefix
  }
  return ''
}

export function getTerminalExactTimestampLabel(value, { locale = '' } = {}) {
  return formatDateTime(value, {
    locale,
    fallback: '-',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function getTerminalArchiveSuggestionLabel(status = '', { labels = {} } = {}) {
  const resolvedLabels = resolveTerminalSessionLabels(labels)
  const normalized = asTrimmedString(status).toLowerCase()
  if (normalized === 'accepted') return resolvedLabels.savedToMemory
  if (normalized === 'dismissed') return resolvedLabels.dismissed
  if (normalized === 'pending') return resolvedLabels.suggested
  return resolvedLabels.noSuggestion
}

export function getTerminalArchiveOutputText(session = null) {
  return Array.isArray(session?.outputTail)
    ? session.outputTail.map((entry) => String(entry?.data || '')).join('')
    : ''
}
