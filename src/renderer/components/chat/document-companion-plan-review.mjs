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

export function canOpenManagedPlanInEditor(documentState = null) {
  return lifecycleOf(documentState) === 'approved'
}

export function buildManagedPlanEditorDocument({
  threadId = '',
  planId = '',
  label = 'Plan.md',
  content = '',
} = {}) {
  const fileName = String(label || '')
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .pop() || 'Plan.md'
  return {
    identity: `managed-plan:${String(threadId || '').trim()}:${String(planId || '').trim()}`,
    filePath: fileName,
    label: fileName,
    language: 'markdown',
    content: String(content ?? ''),
  }
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
