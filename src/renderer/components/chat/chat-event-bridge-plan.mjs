function openManagedPlanForActiveThread({ useAppStore, projectRoot, threadId, planId } = {}) {
  const appState = useAppStore?.getState?.()
  if (String(appState?.activeThreadId || '').trim() !== String(threadId || '').trim()) return
  void appState?.openDocumentCompanion?.({
    sourceKind: 'managed_plan', projectRoot, threadId, planId,
  })
}

export function handlePlanDocumentReady(payload = {}, { useChatStore, useAppStore } = {}) {
  const planId = String(payload.planId || '').trim()
  const projectRoot = String(payload.projectRoot || '').trim()
  const threadId = String(payload.threadId || '').trim()
  if (!planId || !projectRoot || !threadId) return
  useChatStore.getState().setPendingPlanDirection?.(null, { threadId })
  useChatStore.getState().setPlanDocumentReady?.(payload, { threadId })
  openManagedPlanForActiveThread({ useAppStore, projectRoot, threadId, planId })
}

export function handlePlanLifecycleEvent(payload = {}, { useChatStore, useAppStore } = {}) {
  const plan = payload.plan && typeof payload.plan === 'object' ? payload.plan : null
  const threadId = String(payload.threadId || plan?.threadId || '').trim()
  if (!plan || !threadId) return
  if (plan.lifecycle === 'awaiting_decision' || plan.lifecycle === 'drafting') {
    useChatStore.getState().setPendingPlanDirection?.(plan, { threadId })
  }
  if (plan.document && (plan.lifecycle === 'ready_for_review' || plan.lifecycle === 'revising')) {
    const projectRoot = String(payload.projectRoot || plan.project || '').trim()
    if (projectRoot) {
      openManagedPlanForActiveThread({ useAppStore, projectRoot, threadId, planId: plan.planId })
    }
  }
}
