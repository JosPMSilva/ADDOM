export async function runOwningThreadMutation({
  projectId,
  mutate,
  refresh,
  onError,
}) {
  try {
    const changed = await mutate()
    if (!changed) return false
    await refresh(projectId)
    return true
  } catch (error) {
    onError?.(error)
    return false
  }
}

export function canDismissWorkspaceThreadMenu(pending) {
  return pending !== true
}

export async function runWorkspaceThreadMenuAction(action, {
  onPendingChange,
  onSuccess,
  onCancelled,
} = {}) {
  let result
  onPendingChange?.(true)
  try {
    result = await action()
  } finally {
    onPendingChange?.(false)
  }
  if (result) onSuccess?.()
  else if (result === null) onCancelled?.()
  return result
}
