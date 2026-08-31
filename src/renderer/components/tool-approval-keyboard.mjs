export function isTextFieldTarget(target) {
  const tag = target?.tagName?.toLowerCase?.()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable
}

function isInteractiveTarget(target) {
  const tag = target?.tagName?.toLowerCase?.()
  if (['button', 'a', 'summary', 'input', 'textarea', 'select'].includes(tag)) return true
  if (target?.isContentEditable) return true
  if (typeof target?.closest !== 'function') return false
  return Boolean(target.closest('button, a[href], summary, input, textarea, select, [contenteditable="true"], [role="button"]'))
}

export function resolveApprovalKeyboardAction({
  event = null,
  expired = false,
  enterApprovalDisabled = false,
  keyboardLocked = false,
} = {}) {
  if (!event || keyboardLocked) return 'none'
  const key = String(event.key || '')
  if (key !== 'Enter' && key !== 'Escape') return 'none'
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return 'none'
  if (isTextFieldTarget(event.target)) return 'none'
  if (expired) return 'none'
  if (key === 'Escape') return 'deny'
  if (isInteractiveTarget(event.target)) return 'none'
  if (enterApprovalDisabled) return 'none'
  return 'approve'
}
