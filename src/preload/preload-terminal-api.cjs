function createTerminalApi(deps) {
  const {
    invokeVersioned,
    subVersioned,
    asTrimmedString,
    asPlainObject,
    asString,
    asBoolean,
    asOptionalRoundedNumber,
  } = deps

  const terminalSessionEventSubscribers = new Map()
  let terminalSessionEventBridgeCleanup = null

  function ensureTerminalSessionEventBridge() {
    if (typeof terminalSessionEventBridgeCleanup === 'function') return
    terminalSessionEventBridgeCleanup = subVersioned('terminal:session:event', (payload = {}) => {
      const subscriptionId = asTrimmedString(payload?.subscriptionId)
      if (!subscriptionId) return
      const subscriber = terminalSessionEventSubscribers.get(subscriptionId)
      if (typeof subscriber !== 'function') return
      subscriber(payload.event)
    })
  }

  function releaseTerminalSessionEventBridge() {
    if (terminalSessionEventSubscribers.size > 0) return
    if (typeof terminalSessionEventBridgeCleanup === 'function') {
      terminalSessionEventBridgeCleanup()
    }
    terminalSessionEventBridgeCleanup = null
  }

  async function subscribeTerminalSession(options = {}, cb) {
    if (typeof cb !== 'function') throw new TypeError('callback must be a function')
    const source = asPlainObject(options)
    const response = await invokeVersioned('terminal:session:subscribe', {
      sessionId: asTrimmedString(source.sessionId),
      projectFolder: asTrimmedString(source.projectFolder || source.projectRoot),
      permissionMode: asTrimmedString(source.permissionMode),
    })
    const subscriptionId = asTrimmedString(response?.subscriptionId)
    if (!subscriptionId) {
      throw new Error(asTrimmedString(response?.error) || 'terminal_session_subscribe_failed')
    }
    ensureTerminalSessionEventBridge()
    terminalSessionEventSubscribers.set(subscriptionId, cb)
    let unsubscribed = false
    return async () => {
      if (unsubscribed) return
      unsubscribed = true
      terminalSessionEventSubscribers.delete(subscriptionId)
      releaseTerminalSessionEventBridge()
      await invokeVersioned('terminal:session:unsubscribe', { subscriptionId })
    }
  }

  return {
    getRuntimeHealth: () => invokeVersioned('terminal:runtime-health'),
    createSession: (payload = {}) => invokeVersioned('terminal:session:create', {
      projectFolder: asTrimmedString(payload.projectFolder || payload.projectRoot),
      cwd: asTrimmedString(payload.cwd || payload.workdir || '.'),
      shell: asTrimmedString(payload.shell || 'default'),
      cols: asOptionalRoundedNumber(payload.cols),
      rows: asOptionalRoundedNumber(payload.rows),
      permissionMode: asTrimmedString(payload.permissionMode),
      threadId: asTrimmedString(payload.threadId),
      preferredSurface: asTrimmedString(payload.preferredSurface),
      sessionTitle: asTrimmedString(payload.sessionTitle || payload.title),
    }),
    listSessions: (options = {}) => invokeVersioned('terminal:session:list', {
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
      permissionMode: asTrimmedString(options?.permissionMode),
    }),
    attachSession: (sessionId, options = {}) => invokeVersioned('terminal:session:attach', {
      sessionId: asTrimmedString(sessionId),
      sinceSequence: asOptionalRoundedNumber(options?.sinceSequence),
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
      permissionMode: asTrimmedString(options?.permissionMode),
    }),
    readSessionSnapshot: (sessionId, options = {}) => invokeVersioned('terminal:session:read-snapshot', {
      sessionId: asTrimmedString(sessionId),
      sinceSequence: asOptionalRoundedNumber(options?.sinceSequence),
      maxChars: asOptionalRoundedNumber(options?.maxChars),
      mode: asTrimmedString(options?.mode),
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
      permissionMode: asTrimmedString(options?.permissionMode),
    }),
    publishVisibleSnapshot: (sessionId, payload = {}) => invokeVersioned('terminal:session:publish-visible-snapshot', {
      sessionId: asTrimmedString(sessionId),
      text: asString(payload?.text),
      capturedAt: asOptionalRoundedNumber(payload?.capturedAt),
      cols: asOptionalRoundedNumber(payload?.cols),
      rows: asOptionalRoundedNumber(payload?.rows),
      surface: asTrimmedString(payload?.surface),
      available: asBoolean(payload?.available),
      projectFolder: asTrimmedString(payload?.projectFolder || payload?.projectRoot),
      permissionMode: asTrimmedString(payload?.permissionMode),
    }),
    writeSession: (sessionId, data, options = {}) => invokeVersioned('terminal:session:write', {
      sessionId: asTrimmedString(sessionId),
      data: asString(data),
      ...(options?.submit === true ? { submit: true } : {}),
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
      permissionMode: asTrimmedString(options?.permissionMode),
    }),
    resizeSession: (sessionId, cols, rows, options = {}) => invokeVersioned('terminal:session:resize', {
      sessionId: asTrimmedString(sessionId),
      cols: asOptionalRoundedNumber(cols),
      rows: asOptionalRoundedNumber(rows),
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
      permissionMode: asTrimmedString(options?.permissionMode),
    }),
    signalSession: (sessionId, signal, options = {}) => invokeVersioned('terminal:session:signal', {
      sessionId: asTrimmedString(sessionId),
      signal: asTrimmedString(signal),
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
      permissionMode: asTrimmedString(options?.permissionMode),
    }),
    interruptSession: (sessionId, options = {}) => invokeVersioned('terminal:session:interrupt', {
      sessionId: asTrimmedString(sessionId),
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
      permissionMode: asTrimmedString(options?.permissionMode),
    }),
    closeSession: (sessionId, signal = '', options = {}) => invokeVersioned('terminal:session:close', {
      sessionId: asTrimmedString(sessionId),
      signal: asTrimmedString(signal),
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
      permissionMode: asTrimmedString(options?.permissionMode),
    }),
    terminateSession: (sessionId, options = {}) => invokeVersioned('terminal:session:terminate', {
      sessionId: asTrimmedString(sessionId),
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
      permissionMode: asTrimmedString(options?.permissionMode),
    }),
    renameSession: (sessionId, sessionTitle = '', options = {}) => invokeVersioned('terminal:session:rename', {
      sessionId: asTrimmedString(sessionId),
      sessionTitle: asTrimmedString(sessionTitle),
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
      permissionMode: asTrimmedString(options?.permissionMode),
    }),
    takeOverSession: (sessionId, options = {}) => invokeVersioned('terminal:session:takeover', {
      sessionId: asTrimmedString(sessionId),
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
      permissionMode: asTrimmedString(options?.permissionMode),
    }),
    handBackSession: (sessionId, options = {}) => invokeVersioned('terminal:session:handback', {
      sessionId: asTrimmedString(sessionId),
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
      permissionMode: asTrimmedString(options?.permissionMode),
    }),
    focusSessionSurface: (sessionId, surface, options = {}) => invokeVersioned('terminal:session:focus-surface', {
      sessionId: asTrimmedString(sessionId),
      surface: asTrimmedString(surface),
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
      permissionMode: asTrimmedString(options?.permissionMode),
    }),
    listArchivedSessions: (options = {}) => invokeVersioned('terminal:archive:list', {
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
      threadId: asTrimmedString(options?.threadId),
      limit: asOptionalRoundedNumber(options?.limit),
    }),
    getArchivedSession: (sessionId, options = {}) => invokeVersioned('terminal:archive:get', {
      sessionId: asTrimmedString(sessionId),
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
    }),
    deleteArchivedSession: (sessionId, options = {}) => invokeVersioned('terminal:archive:delete', {
      sessionId: asTrimmedString(sessionId),
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
    }),
    dismissArchivedSessionSuggestion: (sessionId, options = {}) => invokeVersioned('terminal:archive:dismiss-suggestion', {
      sessionId: asTrimmedString(sessionId),
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
    }),
    acceptArchivedSessionSuggestion: (sessionId, options = {}) => invokeVersioned('terminal:archive:accept-suggestion', {
      sessionId: asTrimmedString(sessionId),
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
      targetScope: asTrimmedString(options?.targetScope).toLowerCase(),
    }),
    saveArchivedSessionToMemory: (sessionId, options = {}) => invokeVersioned('terminal:archive:save-to-memory', {
      sessionId: asTrimmedString(sessionId),
      projectFolder: asTrimmedString(options?.projectFolder || options?.projectRoot),
      targetScope: asTrimmedString(options?.targetScope).toLowerCase(),
    }),
    subscribe: (options = {}, cb) => subscribeTerminalSession(options, cb),
  }
}

module.exports = {
  createTerminalApi,
}
