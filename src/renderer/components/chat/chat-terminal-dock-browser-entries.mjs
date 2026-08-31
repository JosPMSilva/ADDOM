import {
  getTerminalArchiveStatusLabel,
  getTerminalPrimaryIdentity,
  getTerminalRelativeTimestampLabel,
  getTerminalSecondaryIdentity,
} from '../terminal/terminal-session-display.mjs'
import {
  asTrimmedString,
  getArchivePriority,
  getBrowserSectionLabel,
  getTabPriority,
  getTabStateLabel,
  getThreadTitle,
} from './chat-terminal-dock-utils.mjs'

export function buildBrowserSessionEntries({
  tabs = [],
  sessions = [],
  archivedSessions = [],
  threads = [],
  activeThreadId = '',
  locale = '',
  labels = {},
}) {
  const terminalSessionLabels = labels?.terminalSessionLabels || {}
  const dockStateLabels = labels?.dockStateLabels || {}
  const workspaceRoot = asTrimmedString(labels?.workspaceRoot) || 'workspace root'
  const requestedInCurrentThread = asTrimmedString(labels?.requestedIn)
    || `Requested in ${getBrowserSectionLabel('current_thread', { labels: dockStateLabels })}`
  const currentThreadBrowserEntries = tabs.map((tab) => ({
    section: 'current_thread',
    selectionId: tab.id,
    kind: tab.kind,
    tab,
    session: tab.session || null,
    approval: tab.approval || null,
    label: tab.label,
    detail: tab.kind === 'pending'
      ? asTrimmedString(tab?.approval?.toolInput?.cwd || tab?.approval?.policy?.resolvedCwd || tab?.approval?.projectRoot || workspaceRoot)
      : (getTerminalSecondaryIdentity(tab.session, { labels: terminalSessionLabels }) || tab.session?.cwd || workspaceRoot),
    meta: tab.kind === 'pending'
      ? requestedInCurrentThread
      : getTerminalRelativeTimestampLabel(tab.session, { locale, labels: terminalSessionLabels }),
    stateLabel: getTabStateLabel(tab, { labels: dockStateLabels }),
    priority: getTabPriority(tab),
  }))

  const otherLiveBrowserEntries = (Array.isArray(sessions) ? sessions : [])
    .filter((session) => asTrimmedString(session?.threadId) && asTrimmedString(session?.threadId) !== asTrimmedString(activeThreadId))
    .map((session) => ({
      section: 'other_live',
      selectionId: session.id,
      kind: 'session',
      session,
      label: getTerminalPrimaryIdentity(session, { labels: terminalSessionLabels }),
      detail: getTerminalSecondaryIdentity(session, { labels: terminalSessionLabels }) || session?.cwd || workspaceRoot,
      meta: [getThreadTitle(threads, session?.threadId), getTerminalRelativeTimestampLabel(session, { locale, labels: terminalSessionLabels })].filter(Boolean).join(' / '),
      stateLabel: getTabStateLabel({ kind: 'session', session }, { labels: dockStateLabels }),
      priority: getTabPriority({ kind: 'session', session }),
    }))

  const historyBrowserEntries = (Array.isArray(archivedSessions) ? archivedSessions : [])
    .map((session) => ({
      section: 'history',
      selectionId: session.sessionId,
      kind: 'archived',
      archive: session,
      label: getTerminalPrimaryIdentity(session, { labels: terminalSessionLabels }),
      detail: getTerminalSecondaryIdentity(session, { labels: terminalSessionLabels }) || session?.cwd || workspaceRoot,
      meta: [getThreadTitle(threads, session?.threadId), getTerminalRelativeTimestampLabel(session, { locale, labels: terminalSessionLabels })].filter(Boolean).join(' / '),
      stateLabel: getTerminalArchiveStatusLabel(session, { labels: terminalSessionLabels }),
      priority: getArchivePriority(session),
    }))

  return {
    currentThreadBrowserEntries,
    otherLiveBrowserEntries,
    historyBrowserEntries,
  }
}
