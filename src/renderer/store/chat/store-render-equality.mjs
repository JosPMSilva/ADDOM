import { providerHasCredential } from '../../../common/api-clients/provider-credential-state.mjs'

export function providersEqual(left = [], right = []) {
  if (left === right) return true
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
  return left.every((leftRow, index) => {
    const rightRow = right[index]
    return leftRow === rightRow || (
      String(leftRow?.id || '').trim() === String(rightRow?.id || '').trim()
      && String(leftRow?.label || '').trim() === String(rightRow?.label || '').trim()
      && String(leftRow?.defaultModel || '').trim() === String(rightRow?.defaultModel || '').trim()
      && providerHasCredential(leftRow) === providerHasCredential(rightRow)
    )
  })
}

export function toolActivityRenderFieldsEqual(left = {}, right = {}) {
  const text = (value) => String(value || '').trim()
  return text(left?.type) === text(right?.type)
    && text(left?.eventKind) === text(right?.eventKind)
    && text(left?.label) === text(right?.label)
    && text(left?.detail) === text(right?.detail)
    && text(left?.toolName) === text(right?.toolName)
    && text(left?.turnId) === text(right?.turnId)
    && text(left?.stepId) === text(right?.stepId)
    && text(left?.decision) === text(right?.decision)
    && !!left?.isError === !!right?.isError
    && Number(left?.finishedAt || 0) === Number(right?.finishedAt || 0)
    && Number(left?.updatedAt || 0) === Number(right?.updatedAt || 0)
}

function section(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === 'other_live' || normalized === 'history' ? normalized : 'current_thread'
}

export function terminalDockStatesEqual(left = {}, right = {}) {
  return (left?.collapsed === true) === (right?.collapsed === true)
    && String(left?.selectedTabId || '').trim() === String(right?.selectedTabId || '').trim()
    && (left?.browserOpen === true) === (right?.browserOpen === true)
    && section(left?.browserSection) === section(right?.browserSection)
    && String(left?.browserSelectionSessionId || '').trim() === String(right?.browserSelectionSessionId || '').trim()
    && Number(left?.height || 0) === Number(right?.height || 0)
}
