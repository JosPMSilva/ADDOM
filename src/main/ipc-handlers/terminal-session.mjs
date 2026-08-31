import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { handleVersioned, sendVersioned } from '../ipc/ipc-versioning.mjs'
import { buildTerminalSessionPolicy } from '../tools/terminal-session-policy.mjs'

const requireForRuntime = createRequire(import.meta.url)

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function createSubscriptionId() {
  return `term_sub_${crypto.randomUUID()}`
}

function createIpcErrorPayload(error, fallback = 'terminal_session_failed') {
  return {
    ok: false,
    error: asTrimmedString(error?.code) || fallback,
    message: asTrimmedString(error?.message || error || fallback),
  }
}

function getPathTail(value = '') {
  const normalized = asTrimmedString(value)
  if (!normalized) return ''
  const parts = normalized.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || normalized
}

function buildTerminalSessionDisplayName(session = {}) {
  const sessionTitle = asTrimmedString(session?.sessionTitle || session?.title)
  if (sessionTitle) return sessionTitle
  const sessionId = asTrimmedString(session?.id || session?.sessionId)
  const cwdTail = getPathTail(session?.cwd)
  if (sessionId && cwdTail) return `${sessionId} (${cwdTail})`
  if (sessionId) return sessionId
  if (cwdTail) return `terminal (${cwdTail})`
  return 'terminal session'
}

function buildReadSnapshotSummary(session = {}) {
  return `Read a terminal snapshot from ${buildTerminalSessionDisplayName(session)}.`
}

function buildReuseActionErrorPayload(action = '', approvalPolicy = null) {
  const normalizedAction = asTrimmedString(action).toLowerCase() || 'session'
  const policyDecision = asTrimmedString(approvalPolicy?.policyDecision).toLowerCase()
  const hint = Array.isArray(approvalPolicy?.hints) ? asTrimmedString(approvalPolicy.hints[0]) : ''
  return {
    ok: false,
    error: policyDecision === 'require_elevation'
      ? `terminal_session_${normalizedAction}_requires_approval`
      : `terminal_session_${normalizedAction}_denied`,
    message: hint || `Terminal session ${normalizedAction} is not allowed for this workspace context.`,
    approvalPolicy,
  }
}

export function registerTerminalSessionHandlers({
  ipcMainImpl = requireForRuntime('electron').ipcMain,
  sessionManager,
  sendVersionedImpl = sendVersioned,
} = {}) {
  if (!sessionManager || typeof sessionManager.createSession !== 'function') {
    throw new TypeError('sessionManager is required')
  }

  const subscriptions = new Map()
  const senderSubscriptions = new Map()

  function cleanupSubscription(subscriptionId) {
    const normalizedId = asTrimmedString(subscriptionId)
    const subscription = subscriptions.get(normalizedId)
    if (!subscription) return false
    subscriptions.delete(normalizedId)
    const senderEntry = senderSubscriptions.get(subscription.senderId)
    if (senderEntry) {
      senderEntry.subscriptionIds.delete(normalizedId)
      if (senderEntry.subscriptionIds.size === 0) {
        try {
          senderEntry.sender.removeListener?.('destroyed', senderEntry.destroyedHandler)
        } catch {
          // Best-effort webContents cleanup only.
        }
        senderSubscriptions.delete(subscription.senderId)
      }
    }
    return true
  }

  function ensureSenderEntry(sender) {
    const senderId = Number(sender?.id || 0) || Date.now()
    let entry = senderSubscriptions.get(senderId)
    if (entry) return entry
    const destroyedHandler = () => {
      const current = senderSubscriptions.get(senderId)
      if (!current) return
      for (const subscriptionId of Array.from(current.subscriptionIds)) {
        cleanupSubscription(subscriptionId)
      }
    }
    entry = {
      sender,
      senderId,
      destroyedHandler,
      subscriptionIds: new Set(),
    }
    senderSubscriptions.set(senderId, entry)
    sender.on?.('destroyed', destroyedHandler)
    return entry
  }

  const unsubscribeManager = sessionManager.subscribe((eventPayload = {}) => {
    const sessionId = asTrimmedString(eventPayload?.sessionId)
    for (const subscription of subscriptions.values()) {
      if (subscription.sender?.isDestroyed?.()) {
        cleanupSubscription(subscription.id)
        continue
      }
      if (subscription.sessionId && subscription.sessionId !== sessionId) continue
      sendVersionedImpl(subscription.sender, 'terminal:session:event', {
        subscriptionId: subscription.id,
        event: eventPayload,
      })
    }
  })

  function resolveTerminalSessionPolicy(toolName, payload = {}) {
    return buildTerminalSessionPolicy({
      toolName,
      toolInput: payload,
      projectFolder: asTrimmedString(payload.projectFolder || payload.projectRoot || ''),
      permissionMode: asTrimmedString(payload.permissionMode || ''),
      resolveSession: (sessionId) => sessionManager.getSession(sessionId),
      actor: 'user',
    })
  }

  handleVersioned(ipcMainImpl, 'terminal:session:create', async (_event, payload = {}) => {
    try {
      const projectFolder = asTrimmedString(payload.projectFolder || payload.projectRoot || '')
      const permissionMode = asTrimmedString(payload.permissionMode || '')
      const approvalPolicy = buildTerminalSessionPolicy({
        toolName: 'terminal_session_open',
        toolInput: payload,
        projectFolder,
        permissionMode,
      })
      if (!approvalPolicy || approvalPolicy.policyDecision === 'deny') {
        return {
          ok: false,
          error: 'terminal_session_create_denied',
          approvalPolicy,
        }
      }
      if (approvalPolicy.policyDecision === 'require_elevation') {
        return {
          ok: false,
          error: 'terminal_session_create_requires_approval',
          approvalPolicy,
        }
      }
      const result = sessionManager.createSession({
        cwd: approvalPolicy.resolvedCwd,
        shell: approvalPolicy.resolvedShell || payload.shell || 'default',
        cols: approvalPolicy.cols,
        rows: approvalPolicy.rows,
        envOverrides: payload.env,
        policy: approvalPolicy,
        project: projectFolder,
        threadId: asTrimmedString(payload.threadId),
        turnId: asTrimmedString(payload.turnId),
        openedBy: 'user',
        preferredSurface: asTrimmedString(payload.preferredSurface),
        sessionTitle: asTrimmedString(payload.sessionTitle || payload.title),
      })
      return {
        ok: true,
        approvalPolicy,
        ...result,
      }
    } catch (error) {
      return createIpcErrorPayload(error, 'terminal_session_create_failed')
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:session:list', async (_event, payload = {}) => {
    try {
      const projectFolder = asTrimmedString(payload?.projectFolder || payload?.projectRoot || '')
      const permissionMode = asTrimmedString(payload?.permissionMode || '')
      const sessions = sessionManager.listSessions().filter((session) => {
      const approvalPolicy = buildTerminalSessionPolicy({
        toolName: 'terminal_session_attach',
        toolInput: { sessionId: session.id },
        projectFolder,
        permissionMode,
        resolveSession: (sessionId) => sessionManager.getSession(sessionId),
        actor: 'user',
      })
        return String(approvalPolicy?.policyDecision || '').trim().toLowerCase() === 'allow'
      })
      return {
        ok: true,
        sessions,
        serverTime: Date.now(),
      }
    } catch (error) {
      return createIpcErrorPayload(error, 'terminal_session_list_failed')
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:session:attach', async (_event, payload = {}) => {
    try {
      const approvalPolicy = resolveTerminalSessionPolicy('terminal_session_attach', payload)
      const policyDecision = asTrimmedString(approvalPolicy?.policyDecision).toLowerCase()
      if (policyDecision !== 'allow') return buildReuseActionErrorPayload('attach', approvalPolicy)
      return {
        ok: true,
        ...sessionManager.attachSession(payload.sessionId, {
          sinceSequence: payload.sinceSequence,
        }),
      }
    } catch (error) {
      return createIpcErrorPayload(error, 'terminal_session_attach_failed')
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:session:read-snapshot', async (_event, payload = {}) => {
    try {
      const approvalPolicy = resolveTerminalSessionPolicy('terminal_session_read_snapshot', payload)
      const policyDecision = asTrimmedString(approvalPolicy?.policyDecision).toLowerCase()
      if (policyDecision !== 'allow') return buildReuseActionErrorPayload('read_snapshot', approvalPolicy)
      const snapshot = sessionManager.readSessionSnapshot(payload.sessionId, {
        sinceSequence: payload.sinceSequence,
        maxChars: payload.maxChars,
        mode: payload.mode,
      })
      return {
        ok: true,
        summary: buildReadSnapshotSummary(snapshot.session),
        ...snapshot,
      }
    } catch (error) {
      return createIpcErrorPayload(error, 'terminal_session_read_snapshot_failed')
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:session:publish-visible-snapshot', async (_event, payload = {}) => {
    try {
      const approvalPolicy = resolveTerminalSessionPolicy('terminal_session_attach', payload)
      const policyDecision = asTrimmedString(approvalPolicy?.policyDecision).toLowerCase()
      if (policyDecision !== 'allow') return buildReuseActionErrorPayload('attach', approvalPolicy)
      return {
        ok: true,
        ...sessionManager.updateVisibleSnapshot(payload.sessionId, {
          text: payload.text,
          capturedAt: payload.capturedAt,
          cols: payload.cols,
          rows: payload.rows,
          surface: payload.surface,
          available: payload.available,
        }),
      }
    } catch (error) {
      return createIpcErrorPayload(error, 'terminal_session_publish_visible_snapshot_failed')
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:session:rename', async (_event, payload = {}) => {
    try {
      const approvalPolicy = resolveTerminalSessionPolicy('terminal_session_attach', payload)
      const policyDecision = asTrimmedString(approvalPolicy?.policyDecision).toLowerCase()
      if (policyDecision !== 'allow') return buildReuseActionErrorPayload('rename', approvalPolicy)
      return {
        ok: true,
        session: sessionManager.renameSession(payload.sessionId, {
          sessionTitle: payload.sessionTitle,
          title: payload.title,
        }),
      }
    } catch (error) {
      return createIpcErrorPayload(error, 'terminal_session_rename_failed')
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:session:write', async (_event, payload = {}) => {
    try {
      const approvalPolicy = resolveTerminalSessionPolicy('terminal_session_write', payload)
      const policyDecision = asTrimmedString(approvalPolicy?.policyDecision).toLowerCase()
      if (policyDecision !== 'allow') return buildReuseActionErrorPayload('write', approvalPolicy)
      return {
        ok: true,
        session: sessionManager.writeSession(payload.sessionId, payload.data, {
          actor: 'user',
          submit: payload.submit === true,
        }),
      }
    } catch (error) {
      return createIpcErrorPayload(error, 'terminal_session_write_failed')
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:session:resize', async (_event, payload = {}) => {
    try {
      const approvalPolicy = resolveTerminalSessionPolicy('terminal_session_resize', payload)
      const policyDecision = asTrimmedString(approvalPolicy?.policyDecision).toLowerCase()
      if (policyDecision !== 'allow') return buildReuseActionErrorPayload('resize', approvalPolicy)
      return {
        ok: true,
        session: sessionManager.resizeSession(payload.sessionId, {
          cols: payload.cols,
          rows: payload.rows,
        }),
      }
    } catch (error) {
      return createIpcErrorPayload(error, 'terminal_session_resize_failed')
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:session:signal', async (_event, payload = {}) => {
    try {
      const approvalPolicy = resolveTerminalSessionPolicy('terminal_session_signal', payload)
      const policyDecision = asTrimmedString(approvalPolicy?.policyDecision).toLowerCase()
      if (policyDecision !== 'allow') return buildReuseActionErrorPayload('signal', approvalPolicy)
      return {
        ok: true,
        ...sessionManager.signalSession(payload.sessionId, {
          signal: payload.signal,
        }),
      }
    } catch (error) {
      return createIpcErrorPayload(error, 'terminal_session_signal_failed')
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:session:interrupt', async (_event, payload = {}) => {
    try {
      const approvalPolicy = resolveTerminalSessionPolicy('terminal_session_signal', payload)
      const policyDecision = asTrimmedString(approvalPolicy?.policyDecision).toLowerCase()
      if (policyDecision !== 'allow') return buildReuseActionErrorPayload('signal', approvalPolicy)
      return {
        ok: true,
        ...sessionManager.interruptSession(payload.sessionId),
      }
    } catch (error) {
      return createIpcErrorPayload(error, 'terminal_session_interrupt_failed')
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:session:close', async (_event, payload = {}) => {
    try {
      const approvalPolicy = resolveTerminalSessionPolicy('terminal_session_close', payload)
      const policyDecision = asTrimmedString(approvalPolicy?.policyDecision).toLowerCase()
      if (policyDecision !== 'allow') return buildReuseActionErrorPayload('close', approvalPolicy)
      return {
        ok: true,
        ...sessionManager.closeSession(payload.sessionId, {
          signal: payload.signal,
          closedBy: 'user',
        }),
      }
    } catch (error) {
      return createIpcErrorPayload(error, 'terminal_session_close_failed')
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:session:terminate', async (_event, payload = {}) => {
    try {
      const approvalPolicy = resolveTerminalSessionPolicy('terminal_session_close', payload)
      const policyDecision = asTrimmedString(approvalPolicy?.policyDecision).toLowerCase()
      if (policyDecision !== 'allow') return buildReuseActionErrorPayload('close', approvalPolicy)
      return {
        ok: true,
        ...sessionManager.terminateSession(payload.sessionId, {
          closedBy: 'user',
        }),
      }
    } catch (error) {
      return createIpcErrorPayload(error, 'terminal_session_terminate_failed')
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:session:takeover', async (_event, payload = {}) => {
    try {
      const approvalPolicy = resolveTerminalSessionPolicy('terminal_session_attach', payload)
      const policyDecision = asTrimmedString(approvalPolicy?.policyDecision).toLowerCase()
      if (policyDecision !== 'allow') return buildReuseActionErrorPayload('attach', approvalPolicy)
      return {
        ok: true,
        session: sessionManager.setSessionTakeover(payload.sessionId, {
          controlOwner: 'user',
        }),
      }
    } catch (error) {
      return createIpcErrorPayload(error, 'terminal_session_takeover_failed')
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:session:handback', async (_event, payload = {}) => {
    try {
      const approvalPolicy = resolveTerminalSessionPolicy('terminal_session_attach', payload)
      const policyDecision = asTrimmedString(approvalPolicy?.policyDecision).toLowerCase()
      if (policyDecision !== 'allow') return buildReuseActionErrorPayload('attach', approvalPolicy)
      return {
        ok: true,
        session: sessionManager.handBackSession(payload.sessionId),
      }
    } catch (error) {
      return createIpcErrorPayload(error, 'terminal_session_handback_failed')
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:session:focus-surface', async (_event, payload = {}) => {
    try {
      const approvalPolicy = resolveTerminalSessionPolicy('terminal_session_attach', payload)
      const policyDecision = asTrimmedString(approvalPolicy?.policyDecision).toLowerCase()
      if (policyDecision !== 'allow') return buildReuseActionErrorPayload('attach', approvalPolicy)
      return {
        ok: true,
        session: sessionManager.focusSessionSurface(payload.sessionId, {
          surface: payload.surface,
        }),
      }
    } catch (error) {
      return createIpcErrorPayload(error, 'terminal_session_focus_surface_failed')
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:session:subscribe', async (event, payload = {}) => {
    const sender = event?.sender
    if (!sender) {
      return {
        ok: false,
        error: 'terminal_session_sender_missing',
      }
    }
    const approvalPolicy = resolveTerminalSessionPolicy('terminal_session_attach', payload)
    const policyDecision = asTrimmedString(approvalPolicy?.policyDecision).toLowerCase()
    if (policyDecision !== 'allow') {
      return buildReuseActionErrorPayload('attach', approvalPolicy)
    }
    const subscription = {
      id: createSubscriptionId(),
      sessionId: asTrimmedString(payload.sessionId || ''),
      sender,
      senderId: Number(sender.id || 0) || Date.now(),
    }
    const senderEntry = ensureSenderEntry(sender)
    senderEntry.subscriptionIds.add(subscription.id)
    subscriptions.set(subscription.id, subscription)
    return {
      ok: true,
      subscriptionId: subscription.id,
      sessionId: subscription.sessionId,
    }
  })

  handleVersioned(ipcMainImpl, 'terminal:session:unsubscribe', async (_event, payload = {}) => {
    return {
      ok: cleanupSubscription(payload.subscriptionId),
      subscriptionId: asTrimmedString(payload.subscriptionId),
    }
  })

  return {
    dispose() {
      unsubscribeManager()
      for (const subscriptionId of Array.from(subscriptions.keys())) {
        cleanupSubscription(subscriptionId)
      }
    },
  }
}
