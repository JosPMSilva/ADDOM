import { create } from 'zustand'

const MAX_TOOL_HISTORY_ITEMS = 500

function normalizePendingThreadKey(threadId) {
  return String(threadId || '').trim()
}

function normalizePendingApproval(input) {
  if (!input || typeof input !== 'object') return null
  const approvalId = String(input.approvalId || '').trim()
  if (!approvalId) return null
  return { ...input }
}

export function resolvePendingApprovalForThread(pendingByThreadId = {}, threadId = '') {
  const source = pendingByThreadId && typeof pendingByThreadId === 'object'
    ? pendingByThreadId
    : {}
  const threadKey = normalizePendingThreadKey(threadId)
  if (!threadKey) return null
  const approvals = Array.isArray(source[threadKey]) ? source[threadKey] : []
  return approvals[0] || null
}

export function resolvePendingApprovalsForThread(pendingByThreadId = {}, threadId = '') {
  const source = pendingByThreadId && typeof pendingByThreadId === 'object'
    ? pendingByThreadId
    : {}
  const threadKey = normalizePendingThreadKey(threadId)
  if (!threadKey) return []
  return Array.isArray(source[threadKey]) ? source[threadKey] : []
}

function findPendingApprovalEntry(pendingByThreadId = {}, criteria = {}) {
  const source = pendingByThreadId && typeof pendingByThreadId === 'object'
    ? pendingByThreadId
    : {}
  const approvalId = String(criteria?.approvalId || '').trim()
  const hasThreadId = Object.prototype.hasOwnProperty.call(criteria || {}, 'threadId')
  const threadKey = hasThreadId ? normalizePendingThreadKey(criteria?.threadId) : ''

  if (approvalId && threadKey) {
    const direct = Array.isArray(source[threadKey]) ? source[threadKey] : []
    const directMatch = direct.find((approval) => String(approval?.approvalId || '').trim() === approvalId)
    if (directMatch) {
      return { key: threadKey, approval: directMatch }
    }
  }

  if (!approvalId && threadKey) {
    const direct = Array.isArray(source[threadKey]) ? source[threadKey] : []
    if (direct[0]) return { key: threadKey, approval: direct[0] }
  }

  if (!approvalId) return null

  for (const [key, approvals] of Object.entries(source)) {
    const rows = Array.isArray(approvals) ? approvals : []
    const approval = rows.find((entry) => String(entry?.approvalId || '').trim() === approvalId)
    if (approval) return { key, approval }
  }

  return null
}

function dropPendingApproval(pendingByThreadId = {}, criteria = {}) {
  const entry = findPendingApprovalEntry(pendingByThreadId, criteria)
  if (!entry?.key) return null
  const next = { ...pendingByThreadId }
  const remaining = (Array.isArray(next[entry.key]) ? next[entry.key] : []).filter((approval) => (
    String(approval?.approvalId || '').trim() !== String(entry.approval?.approvalId || '').trim()
  ))
  if (remaining.length > 0) next[entry.key] = remaining
  else delete next[entry.key]
  return next
}

function respondToPendingApproval(get, set, approvalId, decision, denyReason = '', approvalMeta = null) {
  const state = get()
  const entry = findPendingApprovalEntry(state.pendingByThreadId, { approvalId })
  if (!entry?.approval) return
  set((s) => ({
    approvalActionsById: {
      ...(s.approvalActionsById || {}),
      [approvalId]: { status: 'submitting', decision, message: '' },
    },
  }))
  try {
    const responded = window.addom.tool.respond(
      approvalId,
      decision,
      entry.approval.responseChannel || '',
      denyReason,
      approvalMeta,
    )
    if (responded === false) {
      throw new Error('Approval response was rejected before it reached the main process.')
    }
  } catch (error) {
    set((s) => ({
      approvalActionsById: {
        ...(s.approvalActionsById || {}),
        [approvalId]: {
          status: 'failed',
          decision,
          message: String(error?.message || 'Approval response failed. Try again.'),
        },
      },
    }))
    return
  }
  set((s) => {
    const nextPendingByThreadId = dropPendingApproval(s.pendingByThreadId, { approvalId })
    const nextApprovalActionsById = { ...(s.approvalActionsById || {}) }
    nextApprovalActionsById[approvalId] = { status: 'accepted', decision, message: '' }
    return {
      ...(nextPendingByThreadId ? { pendingByThreadId: nextPendingByThreadId } : {}),
      approvalActionsById: nextApprovalActionsById,
    }
  })
}

/**
 * useToolStore manages pending tool approvals.
 *
 * When main process sends 'tool:approval-request', the approval is stored
 * per thread. The ToolApprovalOverlay renders the active thread's approval
 * and the user clicks Allow or Deny, which sends the response back to main.
 */
const useToolStore = create((set, get) => ({
  pendingByThreadId: {},
  approvalActionsById: {},

  // Log of completed tool calls in this session
  history: [],

  getPendingForThread: (threadId = '') => resolvePendingApprovalForThread(get().pendingByThreadId, threadId),
  getPendingListForThread: (threadId = '') => resolvePendingApprovalsForThread(get().pendingByThreadId, threadId),
  getApprovalAction: (approvalId = '') => {
    const id = String(approvalId || '').trim()
    return id ? (get().approvalActionsById?.[id] || null) : null
  },

  setPending: (approval) => {
    const nextApproval = normalizePendingApproval(approval)
    if (!nextApproval) return
    const threadKey = normalizePendingThreadKey(nextApproval.threadId)
    if (!threadKey) return
    set((s) => ({
      approvalActionsById: {
        ...(s.approvalActionsById || {}),
        [nextApproval.approvalId]: { status: 'pending', decision: '', message: '' },
      },
      pendingByThreadId: {
        ...s.pendingByThreadId,
        [threadKey]: [
          nextApproval,
          ...resolvePendingApprovalsForThread(s.pendingByThreadId, threadKey).filter((entry) => (
            String(entry?.approvalId || '').trim() !== nextApproval.approvalId
          )),
        ],
      },
    }))
  },

  clearPending: (criteria = null) => {
    if (!criteria || typeof criteria !== 'object') {
      set((s) => (
        Object.keys(s.pendingByThreadId || {}).length > 0
          ? { pendingByThreadId: {} }
          : {}
      ))
      return
    }
    set((s) => {
      const nextPendingByThreadId = dropPendingApproval(s.pendingByThreadId, criteria)
      return nextPendingByThreadId ? { pendingByThreadId: nextPendingByThreadId } : {}
    })
  },

  clearThread: (threadId = '') => {
    const threadKey = normalizePendingThreadKey(threadId)
    if (!threadKey) return
    set((state) => {
      const approvals = resolvePendingApprovalsForThread(state.pendingByThreadId, threadKey)
      const pendingByThreadId = { ...state.pendingByThreadId }
      const approvalActionsById = { ...state.approvalActionsById }
      delete pendingByThreadId[threadKey]
      for (const approval of approvals) delete approvalActionsById[approval.approvalId]
      return {
        approvalActionsById,
        history: state.history.filter((entry) => normalizePendingThreadKey(entry?.threadId) !== threadKey),
        pendingByThreadId,
      }
    })
  },

  approve: (approvalId, approvalMeta = null) => {
    respondToPendingApproval(get, set, approvalId, 'approved', '', approvalMeta)
  },

  approveForSession: (approvalId) => {
    respondToPendingApproval(get, set, approvalId, 'approved', '', {
      remoteApproval: {
        decision: 'acceptForSession',
      },
    })
  },

  approveHostInstallFallback: (approvalId) => {
    respondToPendingApproval(get, set, approvalId, 'approved', '', {
      runCommand: {
        hostInstallFallback: true,
      },
    })
  },

  approveHostFullAccess: (approvalId) => {
    respondToPendingApproval(get, set, approvalId, 'approved', '', {
      runCommand: {
        hostFullAccess: true,
      },
    })
  },

  approveHostFullAccessThisTurn: (approvalId) => {
    respondToPendingApproval(get, set, approvalId, 'approved', '', {
      runCommand: {
        hostFullAccess: true,
        hostFullAccessThisTurn: true,
      },
    })
  },

  approveWslCompatibility: (approvalId) => {
    respondToPendingApproval(get, set, approvalId, 'approved', '', {
      runCommand: {
        wslCompatibility: true,
      },
    })
  },

  deny: (approvalId) => {
    respondToPendingApproval(get, set, approvalId, 'denied', 'user_denied')
  },

  addHistory: (entry) => set((s) => {
    const next = [...s.history, { ...entry, timestamp: Date.now() }]
    return {
      history: next.length > MAX_TOOL_HISTORY_ITEMS
        ? next.slice(next.length - MAX_TOOL_HISTORY_ITEMS)
        : next,
    }
  }),

  clearHistory: () => set({ history: [] }),
}))

export default useToolStore
