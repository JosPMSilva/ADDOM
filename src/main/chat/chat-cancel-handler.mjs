import { onVersioned, sendVersioned } from '../ipc/ipc-versioning.mjs'
import { getSettings } from '../settings.mjs'
import { buildWriteIntentWithoutMutationReason, hasWriteIntentWithoutMutation } from './chat-runtime-diagnostics.mjs'
import { safeDebug } from '../utils/safe-console.mjs'

const SOFT_STOP_REASON = 'Stop requested. Stopping after current action.'
const staleCancellationKeys = new Set()

function normalizeId(value) {
  const id = String(value || '').trim()
  return id || ''
}

function buildCancellationPayload(loop = null) {
  const diagnostics = loop?.errorDiagnostics && typeof loop.errorDiagnostics === 'object'
    ? loop.errorDiagnostics
    : {}
  const writeIntentWithoutMutation = hasWriteIntentWithoutMutation(diagnostics)
  const recoveryNote = writeIntentWithoutMutation
    ? buildWriteIntentWithoutMutationReason({
      ...diagnostics,
      toolWorkflowTerminalState: 'cancelled',
    })
    : ''
  const reason = recoveryNote
    ? `${SOFT_STOP_REASON} ${recoveryNote}`
    : SOFT_STOP_REASON
  return {
    reason,
    writeIntentWithoutMutation,
    recoveryNote,
  }
}

function emitCancellation({ sender, threadId = '', turnId = '', cancellationPayload = buildCancellationPayload() } = {}) {
  if (!sender?.isDestroyed?.()) {
    sendVersioned(sender, 'chat:cancelled', {
      reason: cancellationPayload.reason,
      threadId,
      turnId,
      ...(cancellationPayload.writeIntentWithoutMutation
        ? {
          writeIntentWithoutMutation: true,
          recoveryNote: cancellationPayload.recoveryNote,
        }
        : {}),
    })
    sendVersioned(sender, 'chat:turn-state', {
      threadId,
      turnId,
      state: 'cancelled',
      status: 'cancelled',
      reason: cancellationPayload.reason,
      ...(cancellationPayload.writeIntentWithoutMutation
        ? {
          writeIntentWithoutMutation: true,
          recoveryNote: cancellationPayload.recoveryNote,
        }
        : {}),
    })
  }
}

function appendCancellationEvents({ appendEvent, threadId = '', turnId = '', cancellationPayload = buildCancellationPayload() } = {}) {
  if (!threadId) return
  appendEvent(threadId, {
    turnId,
    kind: 'turn_cancelled',
    role: 'system',
    content: `Stop requested: ${cancellationPayload.reason}`,
    meta: {
      threadId,
      turnId,
      state: 'cancelled',
      status: 'cancelled',
      reason: cancellationPayload.reason,
      ...(cancellationPayload.writeIntentWithoutMutation
        ? {
          writeIntentWithoutMutation: true,
          recoveryNote: cancellationPayload.recoveryNote,
        }
        : {}),
    },
  })
  appendEvent(threadId, {
    turnId,
    kind: 'chat_cancelled',
    role: 'system',
    content: cancellationPayload.reason,
    meta: { reason: cancellationPayload.reason },
  })
}

export function registerChatCancelHandler({ ipcMain, runRegistry, appendEvent }) {
  onVersioned(ipcMain, 'chat:cancel', (event, payload = {}) => {
    const senderId = String(event.sender.id || '')
    const targetThreadId = normalizeId(payload?.threadId)
    const targetTurnId = normalizeId(payload?.turnId)
    const _debugThread = getSettings()?.commandSafety?.showDeveloperOptions === true
    const runFilter = {
      windowId: senderId,
      ...(targetThreadId ? { threadId: targetThreadId } : {}),
      ...(targetTurnId ? { turnId: targetTurnId } : {}),
    }
    const loops = runRegistry.select(runFilter).filter((loop) => loop.cancelled !== true)
    if (_debugThread) {
      safeDebug('[thread-session] cancel:request', { threadId: targetThreadId, turnId: targetTurnId, matchedLoops: loops.length })
    }

    if (loops.length === 0 && targetThreadId && targetTurnId) {
      const staleKey = `${targetThreadId}:${targetTurnId}`
      const cancellationPayload = buildCancellationPayload()
      emitCancellation({
        sender: event.sender,
        threadId: targetThreadId,
        turnId: targetTurnId,
        cancellationPayload,
      })
      if (!staleCancellationKeys.has(staleKey)) {
        try {
          appendCancellationEvents({
            appendEvent,
            threadId: targetThreadId,
            turnId: targetTurnId,
            cancellationPayload,
          })
          staleCancellationKeys.add(staleKey)
        } catch {
          // Non-fatal.
        }
      }
      return
    }

    void runRegistry.cancelAndWait(runFilter, {
      reason: (loop) => buildCancellationPayload(loop).reason,
      onCancel: (loop) => {
        const cancellationPayload = buildCancellationPayload(loop)
        if (!loop.cancellationSent && !event.sender.isDestroyed()) {
          loop.cancellationSent = true
          emitCancellation({
            sender: event.sender,
            threadId: loop.threadId || '',
            turnId: loop.turnId || '',
            cancellationPayload,
          })
        }

        if (!loop.threadId || loop.cancellationLogged) return
        try {
          appendCancellationEvents({
            appendEvent,
            threadId: loop.threadId || '',
            turnId: loop.turnId || '',
            cancellationPayload,
          })
          loop.cancellationLogged = true
        } catch {
          // Non-fatal.
        }
      },
    })
  })
}
