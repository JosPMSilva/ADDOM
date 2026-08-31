import { normalizePermissionMode } from '../../../common/chat/permission-mode.mjs'

function normalizeChatMode(value = '') {
  const mode = String(value || '').trim().toLowerCase()
  return mode === 'plan' || mode === 'thinking' ? mode : 'execute'
}

export function cursorRequiresFullAccessCorrection(provider = null, permissionMode = '') {
  return provider?.capabilities?.requiresFullAccess === true
    && normalizePermissionMode(permissionMode) !== 'full_access'
}

export function resolveCursorExecutionCorrection(provider = null, {
  chatMode = 'execute',
  permissionMode = 'ask',
} = {}) {
  return {
    requiresExecuteMode: provider?.capabilities?.requiresExecuteMode === true
      && normalizeChatMode(chatMode) !== 'execute',
    requiresFullAccess: cursorRequiresFullAccessCorrection(provider, permissionMode),
  }
}

export function cursorExecutionIsBlocked(provider = null, state = {}) {
  const correction = resolveCursorExecutionCorrection(provider, state)
  return correction.requiresExecuteMode || correction.requiresFullAccess
}
