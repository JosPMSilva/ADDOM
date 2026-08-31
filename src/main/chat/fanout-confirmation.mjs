import crypto from 'node:crypto'
import { toVersionedChannel } from '../ipc/ipc-versioning.mjs'

export const FANOUT_CONFIRMATION_DECISIONS = Object.freeze({
  launchAll: 'launch_all',
  limit: 'limit',
  stopTurn: 'stop_turn',
})

function positiveInteger(value, fallback = 1) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.round(parsed))
}

function normalizeDecision(value) {
  const decision = String(value || '').trim().toLowerCase()
  return Object.values(FANOUT_CONFIRMATION_DECISIONS).includes(decision)
    ? decision
    : FANOUT_CONFIRMATION_DECISIONS.stopTurn
}

export function evaluateFanoutConfirmation({
  requestedCount = 0,
  threshold = 5,
} = {}) {
  const normalizedRequestedCount = Math.max(0, Math.round(Number(requestedCount) || 0))
  const normalizedThreshold = positiveInteger(threshold, 5)
  return {
    requestedCount: normalizedRequestedCount,
    threshold: normalizedThreshold,
    shouldConfirm: normalizedRequestedCount > normalizedThreshold,
  }
}

export function applyFanoutDecision({
  decision = FANOUT_CONFIRMATION_DECISIONS.launchAll,
  tasks = [],
  threshold = 5,
} = {}) {
  const rows = Array.isArray(tasks) ? tasks : []
  const normalizedDecision = normalizeDecision(decision)
  const normalizedThreshold = positiveInteger(threshold, 5)
  if (normalizedDecision === FANOUT_CONFIRMATION_DECISIONS.stopTurn) {
    return {
      decision: normalizedDecision,
      tasks: [],
      limitedTaskCount: 0,
      stopTurn: true,
    }
  }
  const admittedTasks = normalizedDecision === FANOUT_CONFIRMATION_DECISIONS.limit
    ? rows.slice(0, normalizedThreshold)
    : rows
  return {
    decision: normalizedDecision,
    tasks: admittedTasks,
    limitedTaskCount: Math.max(0, rows.length - admittedTasks.length),
    stopTurn: false,
  }
}

export function requestAgentFanoutConfirmation({
  ipcMain,
  senderId,
  send,
  threadId = '',
  turnId = '',
  requestPayload = {},
  abortSignal = null,
}) {
  return new Promise((resolve) => {
    const requestId = `agent_fanout_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
    const timeoutMs = Math.max(
      5_000,
      Math.min(14_400_000, Number(requestPayload?.timeoutMs || 1_800_000)),
    )
    const channel = 'agents:fanout-confirm-response'
    const versionedChannel = toVersionedChannel(channel)
    let settled = false
    let timer = null

    const finalize = (decision = FANOUT_CONFIRMATION_DECISIONS.stopTurn) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      ipcMain.removeListener(channel, onResponse)
      if (versionedChannel && versionedChannel !== channel) {
        ipcMain.removeListener(versionedChannel, onResponse)
      }
      abortSignal?.removeEventListener?.('abort', onAbort)
      resolve({ decision: normalizeDecision(decision) })
    }

    const onAbort = () => finalize(FANOUT_CONFIRMATION_DECISIONS.stopTurn)
    const onResponse = (event, payload = {}) => {
      if (!event?.sender || event.sender.id !== senderId) return
      if (String(payload?.requestId || '') !== requestId) return
      finalize(payload?.decision)
    }

    ipcMain.on(channel, onResponse)
    if (versionedChannel && versionedChannel !== channel) {
      ipcMain.on(versionedChannel, onResponse)
    }
    abortSignal?.addEventListener?.('abort', onAbort, { once: true })
    send('agents:fanout-confirm-request', {
      ...requestPayload,
      requestId,
      timeoutMs,
      threadId,
      turnId,
      stepId: String(requestPayload?.stepId || ''),
    })
    timer = setTimeout(() => finalize(FANOUT_CONFIRMATION_DECISIONS.stopTurn), timeoutMs)
  })
}
