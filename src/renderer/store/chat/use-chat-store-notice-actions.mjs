function logComplianceNoticeEvent(noticeAction = '', notice = {}, source = 'chat_notice') {
  const meta = notice?.meta && typeof notice.meta === 'object' ? notice.meta : {}
  if (!meta.complianceNotice) return
  const action = String(noticeAction || '').trim().toLowerCase()
  if (!action) return
  const threadId = String(meta.threadId || '').trim()
  if (!threadId) return
  const chatApi = typeof window !== 'undefined' ? window?.addom?.chat : null
  if (!chatApi || typeof chatApi.logComplianceEvent !== 'function') return
  chatApi.logComplianceEvent({
    noticeAction: action,
    noticeType: String(meta.noticeType || '').trim().toLowerCase(),
    threadId,
    turnId: String(meta.turnId || '').trim(),
    providerId: String(meta.toProviderId || meta.providerId || '').trim().toLowerCase(),
    model: String(meta.toModelId || meta.model || '').trim(),
    termsVersion: String(meta.termsVersion || '').trim(),
    source: String(source || '').trim().toLowerCase(),
    sessionSuppressKey: String(meta.sessionSuppressKey || '').trim().toLowerCase(),
    repeatedCount: Number(meta.repeatedCount || 0) || 0,
    summary: String(notice?.text || '').trim(),
  })
}

export function createNoticeActions({
  set,
  get,
  now,
  appendCappedItem,
  maxNotices,
  maxSuppressedNoticeKeys,
  resolveThreadSessionId,
  updateThreadSessionState,
}) {
  const hasThreadRouting = (
    typeof resolveThreadSessionId === 'function'
    && typeof updateThreadSessionState === 'function'
  )
  const normalizeThreadId = (value) => String(value || '').trim()
  const resolveTargetThreadId = (state, threadId = '', meta = null) => {
    if (!hasThreadRouting) return ''
    const explicit = normalizeThreadId(threadId)
    if (explicit) return resolveThreadSessionId(state, explicit)
    const metaThreadId = normalizeThreadId(meta?.threadId)
    if (metaThreadId) return resolveThreadSessionId(state, metaThreadId)
    return resolveThreadSessionId(state, state?.activeThreadId)
  }
  const readThreadField = (state, threadId, field) => {
    if (!hasThreadRouting) return state?.[field]
    const activeThreadId = resolveThreadSessionId(state, state?.activeThreadId)
    if (threadId === activeThreadId) return state?.[field]
    const map = state?.threadStateById && typeof state.threadStateById === 'object'
      ? state.threadStateById
      : {}
    return map?.[threadId]?.[field]
  }
  const findThreadIdByNoticeId = (state, noticeId) => {
    const targetId = String(noticeId || '').trim()
    if (!targetId || !hasThreadRouting) return resolveThreadSessionId(state, state?.activeThreadId)
    const activeThreadId = resolveThreadSessionId(state, state?.activeThreadId)
    const activeNotices = Array.isArray(state?.notices) ? state.notices : []
    if (activeNotices.some((entry) => String(entry?.id || '').trim() === targetId)) {
      return activeThreadId
    }
    const map = state?.threadStateById && typeof state.threadStateById === 'object'
      ? state.threadStateById
      : {}
    for (const [threadId, threadState] of Object.entries(map)) {
      const notices = Array.isArray(threadState?.notices) ? threadState.notices : []
      if (notices.some((entry) => String(entry?.id || '').trim() === targetId)) {
        return resolveThreadSessionId(state, threadId)
      }
    }
    return activeThreadId
  }

  return {
    pushNotice: ({ type = 'info', text = '', meta = null, threadId = '' } = {}) => {
      const message = String(text ?? '').trim()
      if (!message) return
      const state = get()
      const targetThreadId = resolveTargetThreadId(state, threadId, meta)
      const suppressedSource = readThreadField(state, targetThreadId, 'suppressedNoticeKeys')
      const suppressedKeys = Array.isArray(suppressedSource) ? suppressedSource : []
      const sessionSuppressKey = String(meta?.sessionSuppressKey || '').trim().toLowerCase()
      if (sessionSuppressKey && suppressedKeys.includes(sessionSuppressKey)) return
      const normalizedMeta = {
        ...(meta && typeof meta === 'object' ? meta : null),
        ...(targetThreadId && !(meta && typeof meta === 'object' && String(meta.threadId || '').trim())
          ? { threadId: targetThreadId }
          : {}),
      }
      const notice = {
        id: crypto.randomUUID(),
        type: String(type || 'info'),
        text: message,
        meta: normalizedMeta,
        createdAt: now(),
      }
      if (hasThreadRouting) {
        set((s) => updateThreadSessionState(s, targetThreadId, (thread) => ({
          notices: appendCappedItem(thread.notices, notice, maxNotices),
        })))
      } else {
        set((s) => ({
          notices: appendCappedItem(s.notices, notice, maxNotices),
        }))
      }
      logComplianceNoticeEvent('shown', notice, 'chat_notice')
    },

    dismissNotice: (noticeId, options = {}) => {
      const id = String(noticeId ?? '').trim()
      if (!id) return
      const state = get()
      const explicitThreadId = normalizeThreadId(options?.threadId)
      const targetThreadId = hasThreadRouting
        ? (explicitThreadId
          ? resolveThreadSessionId(state, explicitThreadId)
          : findThreadIdByNoticeId(state, id))
        : ''
      const notices = Array.isArray(readThreadField(state, targetThreadId, 'notices'))
        ? readThreadField(state, targetThreadId, 'notices')
        : (Array.isArray(state?.notices) ? state.notices : [])
      const target = notices.find((notice) => notice?.id === id) || null
      if (target) {
        logComplianceNoticeEvent('skipped', target, 'chat_notice_dismiss')
      }
      if (hasThreadRouting) {
        set((s) => updateThreadSessionState(s, targetThreadId, (thread) => ({
          notices: Array.isArray(thread.notices)
            ? thread.notices.filter((n) => n.id !== id)
            : [],
        })))
      } else {
        set((s) => ({
          notices: s.notices.filter((n) => n.id !== id),
        }))
      }
    },

    suppressNoticeForSession: (rawKey, options = {}) => {
      const key = String(rawKey ?? '').trim().toLowerCase()
      if (!key) return
      const state = get()
      const targetThreadId = resolveTargetThreadId(state, options?.threadId, null)
      const notices = Array.isArray(readThreadField(state, targetThreadId, 'notices'))
        ? readThreadField(state, targetThreadId, 'notices')
        : (Array.isArray(state?.notices) ? state.notices : [])
      const matching = notices.filter((notice) => String(notice?.meta?.sessionSuppressKey || '').trim().toLowerCase() === key)
      if (matching.length > 0) {
        for (const notice of matching) {
          logComplianceNoticeEvent('skipped', notice, 'chat_notice_session_mute')
        }
      }
      if (hasThreadRouting) {
        set((s) => updateThreadSessionState(s, targetThreadId, (thread) => {
          const current = Array.isArray(thread.suppressedNoticeKeys) ? thread.suppressedNoticeKeys : []
          if (current.includes(key)) {
            return {
              notices: Array.isArray(thread.notices)
                ? thread.notices.filter((notice) => String(notice?.meta?.sessionSuppressKey || '').trim().toLowerCase() !== key)
                : [],
            }
          }
          const nextKeys = [...current, key]
          return {
            suppressedNoticeKeys: nextKeys.length > maxSuppressedNoticeKeys
              ? nextKeys.slice(nextKeys.length - maxSuppressedNoticeKeys)
              : nextKeys,
            notices: Array.isArray(thread.notices)
              ? thread.notices.filter((notice) => String(notice?.meta?.sessionSuppressKey || '').trim().toLowerCase() !== key)
              : [],
          }
        }))
      } else {
        set((s) => {
          const current = Array.isArray(s.suppressedNoticeKeys) ? s.suppressedNoticeKeys : []
          if (current.includes(key)) {
            return {
              notices: Array.isArray(s.notices)
                ? s.notices.filter((notice) => String(notice?.meta?.sessionSuppressKey || '').trim().toLowerCase() !== key)
                : [],
            }
          }
          const nextKeys = [...current, key]
          return {
            suppressedNoticeKeys: nextKeys.length > maxSuppressedNoticeKeys
              ? nextKeys.slice(nextKeys.length - maxSuppressedNoticeKeys)
              : nextKeys,
            notices: Array.isArray(s.notices)
              ? s.notices.filter((notice) => String(notice?.meta?.sessionSuppressKey || '').trim().toLowerCase() !== key)
              : [],
          }
        })
      }
    },
  }
}
