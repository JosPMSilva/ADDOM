import path from 'node:path'
import crypto from 'node:crypto'
import {
  DEFAULT_TERMINAL_SESSION_MAX_BUFFER_CHARS,
  DEFAULT_TERMINAL_EXITED_SESSION_REAP_MS,
  DEFAULT_TERMINAL_CLOSE_FALLBACK_MS,
  DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_MODE,
  DEFAULT_TERMINAL_SESSION_WAIT_FOR_OUTPUT_TIMEOUT_MS,
} from './terminal-session-manager-constants.mjs'
export {
  MIN_TERMINAL_COLS,
  MIN_TERMINAL_ROWS,
  MAX_TERMINAL_COLS,
  MAX_TERMINAL_ROWS,
  DEFAULT_TERMINAL_SESSION_MAX_BUFFER_CHARS,
  DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_MAX_CHARS,
  MAX_TERMINAL_SESSION_READ_SNAPSHOT_MAX_CHARS,
  DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_PREVIEW_MAX_CHARS,
  DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_MODE,
  DEFAULT_TERMINAL_SESSION_WAIT_FOR_OUTPUT_TIMEOUT_MS,
  MAX_TERMINAL_SESSION_WAIT_FOR_OUTPUT_TIMEOUT_MS,
  DEFAULT_TERMINAL_EXITED_SESSION_REAP_MS,
  DEFAULT_TERMINAL_CLOSE_FALLBACK_MS,
} from './terminal-session-manager-constants.mjs'
import {
  asTrimmedString,
  createTerminalSessionError,
  normalizeProjectPathKey,
  normalizeReadSnapshotMode,
  normalizeTerminalSize,
  normalizeWaitForOutputTimeoutMs,
} from './terminal-session-manager-normalizers.mjs'
export { normalizeTerminalSize } from './terminal-session-manager-normalizers.mjs'
import { defaultSpawnTerminal, resolveTerminalShellLaunch } from './terminal-session-shell.mjs'
export { resolveAvailableTerminalShells, resolveTerminalShellLaunch } from './terminal-session-shell.mjs'
import { createTerminalOutputMatcher } from './terminal-session-output-text.mjs'
import { buildTerminalWritePayload, markSessionIdleFromOutputBuffer, markSessionIdleFromVisibleSnapshot } from './terminal-session-command-state.mjs'
import {
  attachTerminalDataListener,
  attachTerminalErrorListener,
  attachTerminalExitListener,
} from './terminal-session-listeners.mjs'
import {
  buildClosedSessionArchiveSnapshot,
  createOutputSnapshot,
  createReadSnapshot,
  normalizeSurface,
  toPublicSession,
} from './terminal-session-snapshots.mjs'

function defaultGenerateSessionId() { return `term_${crypto.randomUUID()}` }
export function createTerminalSessionManager({
  platform = process.platform,
  env = process.env,
  now = () => Date.now(),
  spawnTerminal = defaultSpawnTerminal,
  generateSessionId = defaultGenerateSessionId,
  maxBufferChars = DEFAULT_TERMINAL_SESSION_MAX_BUFFER_CHARS,
  exitedSessionReapMs = DEFAULT_TERMINAL_EXITED_SESSION_REAP_MS,
  closeFallbackMs = DEFAULT_TERMINAL_CLOSE_FALLBACK_MS,
  archiveClosedSession = null,
  setTimer = (fn, delay) => setTimeout(fn, delay),
  clearTimer = (timerId) => clearTimeout(timerId),
} = {}) {
  const sessions = new Map()
  const listeners = new Set()
  const effectiveMaxBufferChars = Math.max(1, Math.round(Number(maxBufferChars) || DEFAULT_TERMINAL_SESSION_MAX_BUFFER_CHARS))
  const effectiveExitedSessionReapMs = Math.max(0, Math.round(Number(exitedSessionReapMs) || 0))
  const effectiveCloseFallbackMs = Math.max(1, Math.round(Number(closeFallbackMs) || DEFAULT_TERMINAL_CLOSE_FALLBACK_MS))

  function emit(event) {
    for (const listener of listeners) {
      try {
        listener(event)
      } catch {
        // Listener failures are isolated from terminal lifecycle management.
      }
    }
  }

  function ensureSession(sessionId, { allowExited = true } = {}) {
    const normalizedId = asTrimmedString(sessionId)
    const session = sessions.get(normalizedId)
    if (!session) {
      throw createTerminalSessionError(
        'terminal_session_not_found',
        `Terminal session "${normalizedId}" was not found.`,
        { sessionId: normalizedId },
      )
    }
    if (!allowExited && session.status !== 'running') {
      throw createTerminalSessionError(
        'terminal_session_not_running',
        `Terminal session "${normalizedId}" is not running.`,
        { sessionId: normalizedId, status: session.status },
      )
    }
    return session
  }

  function clearSessionTimer(session, timerKey) {
    const timerId = session?.[timerKey]
    if (!timerId) return
    try {
      clearTimer(timerId)
    } catch {
      // Best-effort timer cleanup only.
    }
    session[timerKey] = null
  }

  function disposeSession(session) {
    clearSessionTimer(session, 'reapTimer')
    clearSessionTimer(session, 'closeFallbackTimer')
    for (const cleanup of session.cleanupFns.splice(0)) {
      try { cleanup() } catch { /* best-effort listener cleanup */ }
    }
    for (const socket of [
      session.terminal?._socket,
      session.terminal?._agent?._inSocket,
      session.terminal?._agent?._outSocket,
    ]) {
      try { socket?.destroy?.() } catch { /* best-effort socket cleanup */ }
      try { socket?.unref?.() } catch { /* best-effort socket cleanup */ }
    }
    try { session.terminal?._agent?._conoutSocketWorker?.dispose?.() } catch { /* best-effort ConPTY cleanup */ }
    try { session.terminal?._agent?._conoutSocketWorker?._worker?.terminate?.() } catch { /* best-effort ConPTY cleanup */ }
  }

  function appendOutput(session, data) {
    const chunk = String(data ?? '')
    if (!chunk) return null
    session.outputSequence += 1
    const entry = {
      sequence: session.outputSequence,
      data: chunk,
      at: now(),
    }
    session.outputBuffer.push(entry)
    session.outputChars += chunk.length
    session.updatedAt = entry.at

    while (session.outputChars > effectiveMaxBufferChars && session.outputBuffer.length > 1) {
      const removed = session.outputBuffer.shift()
      session.outputChars -= String(removed?.data || '').length
      session.outputTruncated = true
    }

    if (session.outputChars > effectiveMaxBufferChars && session.outputBuffer.length === 1) {
      const onlyEntry = session.outputBuffer[0]
      const trimmedChunk = String(onlyEntry?.data || '').slice(-effectiveMaxBufferChars)
      onlyEntry.data = trimmedChunk
      session.outputChars = trimmedChunk.length
      session.outputTruncated = true
    }

    markSessionIdleFromOutputBuffer(session)

    return entry
  }

  function finalizeClosedSession(session, reason = 'closed') {
    const closedAt = now()
    const archiveSnapshot = buildClosedSessionArchiveSnapshot(session, {
      closedAt,
      closeReason: reason,
    })
    disposeSession(session)
    sessions.delete(session.id)
    emit({
      type: 'closed',
      reason,
      sessionId: session.id,
      session: toPublicSession(session),
      at: closedAt,
    })
    if (session.archiveOnClose !== false && typeof archiveClosedSession === 'function') {
      try {
        archiveClosedSession(archiveSnapshot)
      } catch {
        // Archive persistence is best-effort and must not break terminal lifecycle cleanup.
      }
    }
  }

  function scheduleExitedSessionReap(session) {
    if (effectiveExitedSessionReapMs <= 0) {
      session.status = 'closed'
      session.closeRequested = true
      session.closeReason = 'reaped_after_exit'
      session.updatedAt = now()
      finalizeClosedSession(session, session.closeReason)
      return
    }
    if (session.reapTimer) {
      try { clearTimer(session.reapTimer) } catch { /* best-effort timer cleanup */ }
    }
    session.reapTimer = setTimer(() => {
      const current = sessions.get(session.id)
      if (!current || current.status !== 'exited') return
      current.status = 'closed'
      current.closeRequested = true
      current.closeReason = 'reaped_after_exit'
      current.updatedAt = now()
      finalizeClosedSession(current, current.closeReason)
    }, effectiveExitedSessionReapMs)
  }

  function scheduleCloseFallback(session) {
    clearSessionTimer(session, 'closeFallbackTimer')
    session.closeFallbackTimer = setTimer(() => {
      const current = sessions.get(session.id)
      if (!current || (current.status !== 'running' && current.status !== 'closing') || current.closeRequested !== true) return
      current.lastError = 'Terminal session did not emit an exit event before the close fallback timeout.'
      current.status = 'closed'
      current.commandState = 'idle'
      current.closeReason = 'close_timeout_fallback'
      current.updatedAt = now()
      emit({
        type: 'error',
        sessionId: current.id,
        session: toPublicSession(current),
        error: current.lastError,
      })
      finalizeClosedSession(current, current.closeReason)
    }, effectiveCloseFallbackMs)
  }

  function attachSessionLifecycle(session) {
    session.cleanupFns.push(attachTerminalDataListener(session.terminal, (data) => {
      const entry = appendOutput(session, data)
      if (!entry) return
      emit({
        type: 'data',
        sessionId: session.id,
        session: toPublicSession(session),
        chunk: entry,
      })
    }))
    session.cleanupFns.push(attachTerminalExitListener(session.terminal, ({ exitCode, signal } = {}) => {
      if (session.status === 'closed') return
      session.status = 'exited'
      session.commandState = 'idle'
      session.exitCode = Number.isFinite(Number(exitCode)) ? Number(exitCode) : exitCode ?? null
      session.exitSignal = signal ?? null
      session.exitedAt = now()
      session.updatedAt = session.exitedAt
      disposeSession(session)
      emit({
        type: 'exit',
        sessionId: session.id,
        session: toPublicSession(session),
      })
      if (session.closeRequested === true) {
        session.status = 'closed'
        finalizeClosedSession(session, session.closeReason || 'close_requested')
        return
      }
      scheduleExitedSessionReap(session)
    }))
    session.cleanupFns.push(attachTerminalErrorListener(session.terminal, (error) => {
      session.lastError = asTrimmedString(error?.message || error || 'terminal_session_error')
      session.updatedAt = now()
      emit({
        type: 'error',
        sessionId: session.id,
        session: toPublicSession(session),
        error: session.lastError,
      })
    }))
  }

  function listSessions() {
    return Array.from(sessions.values())
      .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))
      .map((session) => toPublicSession(session))
  }

  function collectMatchingSessionIds({
    threadId = '',
    project = '',
  } = {}) {
    const normalizedThreadId = asTrimmedString(threadId)
    const normalizedProject = normalizeProjectPathKey(project, platform)
    if (!normalizedThreadId && !normalizedProject) return []
    return Array.from(sessions.values())
      .filter((session) => {
        if (normalizedThreadId && asTrimmedString(session.threadId) === normalizedThreadId) return true
        if (normalizedProject && normalizeProjectPathKey(session.project, platform) === normalizedProject) return true
        return false
      })
      .map((session) => session.id)
  }

  function createSession({
    cwd = process.cwd(),
    shell = 'default',
    cols,
    rows,
    envOverrides = null,
    policy = null,
    project = '',
    threadId = '',
    turnId = '',
    openedBy = '',
    preferredSurface = '',
    sessionTitle = '',
  } = {}) {
    if (envOverrides && Object.keys(envOverrides).length > 0) {
      throw createTerminalSessionError(
        'terminal_session_env_override_not_allowed',
        'Terminal session env overrides are not allowed.',
      )
    }

    const size = normalizeTerminalSize({ cols, rows })
    const shellLaunch = resolveTerminalShellLaunch({ platform, env, shell })
    const sessionId = asTrimmedString(generateSessionId())
    if (!sessionId) {
      throw createTerminalSessionError('terminal_session_id_invalid', 'Failed to allocate a terminal session id.')
    }
    if (sessions.has(sessionId)) {
      throw createTerminalSessionError('terminal_session_id_conflict', `Terminal session "${sessionId}" already exists.`)
    }

    const createdAt = now()
    const terminal = spawnTerminal({
      file: shellLaunch.file,
      args: shellLaunch.args,
      options: {
        name: 'xterm-256color',
        cols: size.cols,
        rows: size.rows,
        cwd: path.resolve(String(cwd || process.cwd())),
        env: { ...env },
        ...(platform === 'win32' ? { useConpty: true, useConptyDll: true } : {}),
      },
    })

    const session = {
      id: sessionId,
      pid: Number(terminal?.pid || 0) || null,
      terminal,
      cleanupFns: [],
      project: asTrimmedString(project),
      threadId: asTrimmedString(threadId),
      turnId: asTrimmedString(turnId),
      shell: shellLaunch.shellId,
      shellKind: shellLaunch.shellKind,
      cwd: path.resolve(String(cwd || process.cwd())),
      cols: size.cols,
      rows: size.rows,
      status: 'running',
      approvalState: 'approved',
      createdAt,
      updatedAt: createdAt,
      exitedAt: null,
      exitCode: null,
      exitSignal: null,
      closeRequested: false,
      closeReason: '',
      outputSequence: 0,
      outputBuffer: [],
      outputChars: 0,
      outputTruncated: false,
      lastError: '',
      failureReason: '',
      policy: policy && typeof policy === 'object' ? { ...policy } : null,
      openedBy: asTrimmedString(openedBy).toLowerCase(),
      closedBy: '',
      sessionTitle: asTrimmedString(sessionTitle),
      controlOwner: asTrimmedString(openedBy).toLowerCase() === 'user' ? 'user' : 'model',
      aiWriteBlocked: false,
      pendingAiControlRequest: false,
      focusedSurface: normalizeSurface(preferredSurface) || 'chat_dock',
      labelDisambiguator: '',
      commandState: 'idle',
      reapTimer: null,
      closeFallbackTimer: null,
      visibleSnapshot: null,
    }

    sessions.set(session.id, session)
    attachSessionLifecycle(session)
    emit({
      type: 'created',
      sessionId: session.id,
      session: toPublicSession(session),
    })
    return createOutputSnapshot(session)
  }

  function attachSession(sessionId, { sinceSequence = 0 } = {}) {
    const session = ensureSession(sessionId)
    return createOutputSnapshot(session, sinceSequence)
  }

  function readSessionSnapshot(sessionId, {
    sinceSequence = 0,
    maxChars,
    mode = DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_MODE,
  } = {}) {
    const session = ensureSession(sessionId)
    return createReadSnapshot(session, {
      sinceSequence,
      maxChars,
      mode,
      capturedAt: now(),
    })
  }

  function updateVisibleSnapshot(sessionId, {
    text = '',
    capturedAt = now(),
    cols = 0,
    rows = 0,
    surface = '',
    available = true,
  } = {}) {
    const session = ensureSession(sessionId)
    session.visibleSnapshot = { text: String(text || ''), capturedAt: Number(capturedAt || 0) || now(), cols: Number(cols || 0) || 0, rows: Number(rows || 0) || 0, surface: normalizeSurface(surface), available: available === true }
    markSessionIdleFromVisibleSnapshot(session)
    return { sessionId: session.id, session: toPublicSession(session), visibleSnapshot: { ...session.visibleSnapshot } }
  }

  function waitForOutput(sessionId, {
    pattern = '',
    text = '',
    sinceSequence = 0,
    timeoutMs = DEFAULT_TERMINAL_SESSION_WAIT_FOR_OUTPUT_TIMEOUT_MS,
    maxChars,
    mode = 'plain_text_tail',
  } = {}) {
    const session = ensureSession(sessionId, { allowExited: false })
    const matcher = createTerminalOutputMatcher({ pattern, text })
    const normalizedMode = normalizeReadSnapshotMode(mode || 'plain_text_tail')
    const effectiveTimeoutMs = normalizeWaitForOutputTimeoutMs(timeoutMs)
    const captureSnapshot = () => createReadSnapshot(session, {
      sinceSequence,
      maxChars,
      mode: normalizedMode,
      capturedAt: now(),
    })
    const buildResult = ({
      matched = false,
      timedOut = false,
      reason = '',
      snapshot = captureSnapshot(),
    } = {}) => ({
      sessionId: session.id,
      session: toPublicSession(session),
      wait: {
        matched,
        timedOut,
        reason: asTrimmedString(reason) || (matched ? 'matched' : (timedOut ? 'timeout' : 'completed')),
        matchType: matcher.matchType,
        pattern: matcher.pattern,
        text: matcher.text,
        timeoutMs: effectiveTimeoutMs,
        sinceSequence: Number(sinceSequence || 0) || 0,
      },
      output: snapshot.output,
    })

    const initialSnapshot = captureSnapshot()
    if (matcher.matches(initialSnapshot.output.text)) {
      return Promise.resolve(buildResult({
        matched: true,
        reason: 'matched',
        snapshot: initialSnapshot,
      }))
    }

    return new Promise((resolve) => {
      let settled = false
      let waitTimerId = null
      let unsubscribe = null

      const finish = (payload = {}) => {
        if (settled) return
        settled = true
        if (unsubscribe) unsubscribe()
        if (waitTimerId) clearTimer(waitTimerId)
        resolve(buildResult(payload))
      }

      const listener = (event = {}) => {
        if (asTrimmedString(event?.sessionId) !== session.id) return
        const eventType = asTrimmedString(event?.type).toLowerCase()
        if (eventType !== 'data' && eventType !== 'exit' && eventType !== 'closed') return
        const snapshot = captureSnapshot()
        if (matcher.matches(snapshot.output.text)) {
          finish({
            matched: true,
            reason: eventType === 'data' ? 'matched' : 'matched_before_session_end',
            snapshot,
          })
          return
        }
        if (eventType === 'exit' || eventType === 'closed') {
          finish({
            matched: false,
            timedOut: false,
            reason: 'session_ended',
            snapshot,
          })
        }
      }
      listeners.add(listener)
      unsubscribe = () => {
        listeners.delete(listener)
      }

      waitTimerId = setTimer(() => {
        const snapshot = captureSnapshot()
        finish({
          matched: false,
          timedOut: true,
          reason: 'timeout',
          snapshot,
        })
      }, effectiveTimeoutMs)
    })
  }

  function renameSession(sessionId, { sessionTitle = '', title = '' } = {}) {
    const session = ensureSession(sessionId)
    session.sessionTitle = asTrimmedString(sessionTitle || title)
    session.updatedAt = now()
    emit({
      type: 'renamed',
      sessionId: session.id,
      session: toPublicSession(session),
    })
    return toPublicSession(session)
  }

  function writeSession(sessionId, data, { actor = '', submit = false } = {}) {
    const session = ensureSession(sessionId, { allowExited: false })
    const text = String(data ?? '')
    if (!text) {
      throw createTerminalSessionError('terminal_session_write_empty', 'Terminal session write data is required.', {
        sessionId: session.id,
      })
    }
    const normalizedActor = asTrimmedString(actor).toLowerCase() || 'user'
    if (session.controlOwner === 'user' && normalizedActor === 'model') {
      session.pendingAiControlRequest = true
      session.aiWriteBlocked = true
      session.updatedAt = now()
      emit({
        type: 'control',
        sessionId: session.id,
        session: toPublicSession(session),
      })
      throw createTerminalSessionError(
        'terminal_session_ai_write_blocked_by_takeover',
        `Terminal session "${session.id}" is under user takeover.`,
        { sessionId: session.id },
      )
    }
    const { payload, submitted } = buildTerminalWritePayload(session, text, { submit, platform })
    session.terminal.write(payload)
    if (submitted) session.commandState = 'running'
    session.pendingAiControlRequest = false
    session.updatedAt = now()
    emit({
      type: 'input',
      sessionId: session.id,
      session: toPublicSession(session),
      inputLength: payload.length,
    })
    return toPublicSession(session)
  }

  function resizeSession(sessionId, { cols, rows } = {}) {
    const session = ensureSession(sessionId, { allowExited: false })
    const size = normalizeTerminalSize({ cols, rows }, { cols: session.cols, rows: session.rows })
    if (session.cols === size.cols && session.rows === size.rows) {
      return toPublicSession(session)
    }
    session.terminal.resize(size.cols, size.rows)
    session.cols = size.cols
    session.rows = size.rows
    session.updatedAt = now()
    emit({
      type: 'resized',
      sessionId: session.id,
      session: toPublicSession(session),
    })
    return toPublicSession(session)
  }

  function signalSession(sessionId, { signal = '' } = {}) {
    const session = ensureSession(sessionId, { allowExited: false })
    const normalizedSignal = asTrimmedString(signal).toUpperCase() || 'SIGTERM'
    if (platform === 'win32' && normalizedSignal === 'SIGINT') {
      session.terminal.write('\u0003')
    } else if (platform === 'win32') {
      session.terminal.kill()
    } else {
      session.terminal.kill(normalizedSignal)
    }
    session.updatedAt = now()
    emit({
      type: 'signaled',
      sessionId: session.id,
      signal: normalizedSignal,
      session: toPublicSession(session),
    })
    return {
      session: toPublicSession(session),
      signal: normalizedSignal,
    }
  }

  function interruptSession(sessionId) {
    return signalSession(sessionId, { signal: 'SIGINT' })
  }

  function closeSession(sessionId, { signal = '', closedBy = '', archive = true } = {}) {
    const session = ensureSession(sessionId)
    if (archive === false) session.archiveOnClose = false
    if (closedBy !== undefined) {
      session.closedBy = asTrimmedString(closedBy).toLowerCase()
    }
    if (session.status === 'exited') {
      session.status = 'closed'
      session.closeRequested = true
      session.closeReason = 'close_after_exit'
      session.updatedAt = now()
      finalizeClosedSession(session, session.closeReason)
      return { closed: true, sessionId: session.id }
    }
    if (session.closeRequested === true) {
      return { closing: true, sessionId: session.id }
    }
    session.closeRequested = true
    session.status = 'closing'
    session.closeReason = 'close_requested'
    session.updatedAt = now()
    scheduleCloseFallback(session)
    if (platform === 'win32') {
      session.terminal.kill()
    } else {
      session.terminal.kill(asTrimmedString(signal).toUpperCase() || 'SIGHUP')
    }
    return { closing: true, sessionId: session.id }
  }

  function terminateSession(sessionId, { closedBy = '' } = {}) {
    const session = ensureSession(sessionId)
    if (closedBy !== undefined) {
      session.closedBy = asTrimmedString(closedBy).toLowerCase()
    }
    session.closeRequested = true
    session.status = 'closing'
    session.closeReason = 'force_terminated'
    session.failureReason = 'terminated'
    session.updatedAt = now()
    if (platform === 'win32') {
      session.terminal.kill()
    } else {
      session.terminal.kill('SIGKILL')
    }
    emit({
      type: 'signaled',
      sessionId: session.id,
      signal: 'SIGKILL',
      session: toPublicSession(session),
    })
    return { closing: true, sessionId: session.id, terminated: true }
  }

  function setSessionTakeover(sessionId, { controlOwner = 'user' } = {}) {
    const session = ensureSession(sessionId)
    const nextOwner = asTrimmedString(controlOwner).toLowerCase() === 'user' ? 'user' : 'model'
    session.controlOwner = nextOwner
    session.aiWriteBlocked = nextOwner === 'user'
    session.pendingAiControlRequest = false
    session.updatedAt = now()
    emit({
      type: 'control',
      sessionId: session.id,
      session: toPublicSession(session),
    })
    return toPublicSession(session)
  }

  function handBackSession(sessionId) {
    return setSessionTakeover(sessionId, { controlOwner: 'model' })
  }

  function closeSessionsForThread(threadId, { signal = '', closedBy = '', archive = true } = {}) {
    const sessionIds = collectMatchingSessionIds({ threadId })
    for (const sessionId of sessionIds) {
      try {
        closeSession(sessionId, { signal, closedBy, archive })
      } catch {
        // Best-effort bulk cleanup should continue across sessions.
      }
    }
    return sessionIds
  }
  function closeSessionsForProject(project, { signal = '', closedBy = '' } = {}) {
    const sessionIds = collectMatchingSessionIds({ project })
    for (const sessionId of sessionIds) {
      try {
        closeSession(sessionId, { signal, closedBy })
      } catch {
        // Best-effort bulk cleanup should continue across sessions.
      }
    }
    return sessionIds
  }

  function closeAllSessions({ signal = '', closedBy = '' } = {}) {
    const sessionIds = Array.from(sessions.keys())
    for (const sessionId of sessionIds) {
      try {
        closeSession(sessionId, { signal, closedBy })
      } catch {
        // Best-effort bulk cleanup should continue across sessions.
      }
    }
    return sessionIds
  }

  function focusSessionSurface(sessionId, { surface = '' } = {}) {
    const session = ensureSession(sessionId)
    session.focusedSurface = normalizeSurface(surface)
    session.updatedAt = now()
    emit({
      type: 'surface_focus',
      sessionId: session.id,
      session: toPublicSession(session),
    })
    return toPublicSession(session)
  }

  function dispose() {
    for (const session of Array.from(sessions.values())) {
      try {
        session.closeRequested = true
        session.closeReason = 'manager_dispose'
        if (session.status === 'running') {
          if (platform === 'win32') session.terminal.kill()
          else session.terminal.kill('SIGHUP')
        }
      } catch {
        // Best-effort terminal shutdown during app disposal.
      }
      if (!sessions.has(session.id)) continue
      session.status = 'closed'
      finalizeClosedSession(session, session.closeReason || 'manager_dispose')
    }
  }

  return {
    createSession,
    listSessions,
    getSession(sessionId, options = {}) {
      return toPublicSession(ensureSession(sessionId, options))
    },
    attachSession,
    readSessionSnapshot,
    updateVisibleSnapshot,
    waitForOutput,
    renameSession,
    writeSession,
    resizeSession,
    signalSession,
    interruptSession,
    closeSession,
    terminateSession,
    setSessionTakeover,
    handBackSession,
    closeSessionsForThread,
    closeSessionsForProject,
    closeAllSessions,
    focusSessionSurface,
    hasSession(sessionId) {
      return sessions.has(asTrimmedString(sessionId))
    },
    subscribe(listener) {
      if (typeof listener !== 'function') {
        throw new TypeError('listener must be a function')
      }
      listeners.add(listener)
      let unsubscribed = false
      return () => {
        if (unsubscribed) return
        unsubscribed = true
        listeners.delete(listener)
      }
    },
    dispose,
  }
}
