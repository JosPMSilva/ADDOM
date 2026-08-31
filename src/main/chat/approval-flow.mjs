import electron from 'electron'
import { getToolMeta } from '../tools/tool-definitions.mjs'
import { buildApprovalRequestPayload } from './approval-flow-payload.mjs'
import { sendVersioned, toVersionedChannel } from '../ipc/ipc-versioning.mjs'

const { ipcMain } = electron

const APPROVAL_WAIT_TIMEOUT_MS = 15 * 60 * 1000
const APPROVAL_WARNING_THRESHOLD_MS = 60 * 1000

/**
 * Send a tool approval request to the renderer and wait for the user's response.
 * For write_file, prevContent is the current disk content so the UI can show a diff.
 * Resolves with:
 *   { decision: 'approved' | 'denied', denyReason: '' | 'user_denied' | 'timeout' | 'cancelled' }
 */
export function createRequestApprovalHandler({
  ipcMainRef = ipcMain,
  getToolMetaFn = getToolMeta,
  sendVersionedFn = sendVersioned,
  toVersionedChannelFn = toVersionedChannel,
} = {}) {
  return function requestApproval(
    sender,
    approvalId,
    toolName,
    toolInput,
    projectRoot,
    prevContent = null,
    loop = null,
    onLifecycle = () => {},
    approvalContext = {},
  ) {
    return new Promise((resolve) => {
      const meta = getToolMetaFn(toolName)
      const responseChannel = `tool:approval-response:${approvalId}`
      const versionedResponseChannel = toVersionedChannelFn(responseChannel)
      const expiresAt = Date.now() + APPROVAL_WAIT_TIMEOUT_MS

      sendVersionedFn(sender, 'tool:approval-request', buildApprovalRequestPayload({
        approvalId,
        responseChannel,
        toolName,
        toolInput,
        meta,
        projectRoot,
        prevContent,
        expiresAt,
        timeoutMs: APPROVAL_WAIT_TIMEOUT_MS,
        policy: approvalContext?.policy,
        policyDecision: approvalContext?.policyDecision,
        executionTarget: approvalContext?.executionTarget,
        elevationRequired: approvalContext?.elevationRequired,
        threadId: approvalContext?.threadId,
        turnId: approvalContext?.turnId,
        availableDecisions: approvalContext?.availableDecisions,
        approvalKind: approvalContext?.approvalKind,
        grantRoot: approvalContext?.grantRoot,
        changes: approvalContext?.changes,
        originSurface: approvalContext?.originSurface,
        originLabel: approvalContext?.originLabel,
      }))
      onLifecycle('start', {
        approvalId,
        toolName,
        timeoutMs: APPROVAL_WAIT_TIMEOUT_MS,
        remainingMs: APPROVAL_WAIT_TIMEOUT_MS,
        expiresAt,
      })

      let settled = false
      let approvalTimeout = null
      let warningTimeout = null

      const onAbort = () => {
        if (loop) {
          loop.cancelled = true
          loop.cancelReason = loop.cancelReason || 'Cancelled by user.'
        }
        settle('denied', 'cancelled')
      }
      const onSenderDestroyed = () => {
        settle('denied', 'renderer_unavailable')
      }
      const onResponse = (event, data = {}) => {
        if (event?.sender !== sender) return
        const decisionRaw = String(data?.decision ?? '').trim().toLowerCase()
        const denyReasonRaw = String(data?.denyReason ?? '').trim().toLowerCase()
        if (decisionRaw === 'approved') {
          settle('approved', '', data?.approvalMeta && typeof data.approvalMeta === 'object' ? data.approvalMeta : null)
          return
        }
        const denyReason = denyReasonRaw || 'user_denied'
        settle('denied', denyReason, null)
      }
      const removeAbortListener = () => {
        const signal = loop?.abortController?.signal
        if (signal) signal.removeEventListener('abort', onAbort)
      }

      const settle = (decision = 'denied', denyReason = 'user_denied', approvalMeta = null) => {
        if (settled) return
        settled = true
        if (warningTimeout) clearTimeout(warningTimeout)
        if (approvalTimeout) clearTimeout(approvalTimeout)
        removeAbortListener()
        sender.removeListener('destroyed', onSenderDestroyed)
        ipcMainRef.removeListener(responseChannel, onResponse)
        if (versionedResponseChannel && versionedResponseChannel !== responseChannel) {
          ipcMainRef.removeListener(versionedResponseChannel, onResponse)
        }
        resolve({
          decision: decision === 'approved' ? 'approved' : 'denied',
          denyReason: decision === 'approved' ? '' : (denyReason || 'user_denied'),
          ...(approvalMeta && typeof approvalMeta === 'object' ? { approvalMeta } : {}),
        })
      }

      ipcMainRef.on(responseChannel, onResponse)
      if (versionedResponseChannel && versionedResponseChannel !== responseChannel) {
        ipcMainRef.on(versionedResponseChannel, onResponse)
      }
      sender.once('destroyed', onSenderDestroyed)
      if (loop?.abortController?.signal) {
        const signal = loop.abortController.signal
        if (signal.aborted) {
          onAbort()
          return
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }

      if (APPROVAL_WAIT_TIMEOUT_MS > APPROVAL_WARNING_THRESHOLD_MS) {
        warningTimeout = setTimeout(() => {
          if (settled) return
          onLifecycle('warning', {
            approvalId,
            toolName,
            timeoutMs: APPROVAL_WAIT_TIMEOUT_MS,
            remainingMs: APPROVAL_WARNING_THRESHOLD_MS,
            expiresAt,
          })
        }, APPROVAL_WAIT_TIMEOUT_MS - APPROVAL_WARNING_THRESHOLD_MS)
      }

      approvalTimeout = setTimeout(() => {
        if (settled) return
        onLifecycle('timeout', {
          approvalId,
          toolName,
          timeoutMs: APPROVAL_WAIT_TIMEOUT_MS,
          remainingMs: 0,
          expiresAt,
        })
        settle('denied', 'timeout')
      }, APPROVAL_WAIT_TIMEOUT_MS)
    })
  }
}

export const requestApproval = createRequestApprovalHandler()

export { buildApprovalRequestPayload } from './approval-flow-payload.mjs'

export function getApprovalTimeoutMs() {
  return APPROVAL_WAIT_TIMEOUT_MS
}
