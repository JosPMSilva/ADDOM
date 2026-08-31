function lifecycleOf(documentState = null) {
  return String(documentState?.lifecycle || '').trim().toLowerCase()
}

function pendingChangesOf(documentState = null) {
  return Array.isArray(documentState?.review?.pendingChanges)
    ? documentState.review.pendingChanges
    : []
}

export function isManagedPlanReviewable(documentState = null) {
  const lifecycle = lifecycleOf(documentState)
  return lifecycle === 'ready_for_review'
    || (lifecycle === 'approved' && pendingChangesOf(documentState).length > 0)
}

export function documentReadingCursorClass(sourceKind = '') {
  return sourceKind === 'managed_plan' ? 'cursor-default active:cursor-text' : 'cursor-text'
}

export function resolveManagedPlanPrimaryAction(documentState = null) {
  const lifecycle = lifecycleOf(documentState)
  const pendingChanges = pendingChangesOf(documentState)
  if (pendingChanges.length > 0) {
    return { kind: 'submit_changes', disabled: !isManagedPlanReviewable(documentState) }
  }
  if (lifecycle === 'ready_for_review' || lifecycle === 'approved') {
    return { kind: 'implement', disabled: false }
  }
  return null
}
