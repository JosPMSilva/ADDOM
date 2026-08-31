export function reduceHydratedPlanProjection(current = {}, kind = '', meta = {}) {
  if (kind === 'plan_document_ready') {
    const planId = String(meta.planId || '').trim()
    const threadId = String(meta.threadId || '').trim()
    const projectRoot = String(meta.projectRoot || '').trim()
    return {
      handled: true,
      state: {
        ...current,
        pendingPlanDirection: null,
        planDocumentReady: planId && threadId && projectRoot
          ? {
              threadId,
              projectRoot,
              planId,
              revision: Number(meta.revision || 0) || 0,
              lifecycle: String(meta.lifecycle || 'ready_for_review').trim(),
              ...(meta.document && typeof meta.document === 'object'
                ? { document: { ...meta.document } }
                : {}),
            }
          : current.planDocumentReady,
      },
    }
  }
  if (!String(kind).startsWith('plan_') || !meta.plan || typeof meta.plan !== 'object') {
    return { handled: false, state: current }
  }
  const lifecycle = String(meta.plan.lifecycle || '').trim()
  return {
    handled: true,
    state: {
      ...current,
      pendingPlanDirection: lifecycle === 'awaiting_decision' || lifecycle === 'drafting'
        ? { ...meta.plan }
        : current.pendingPlanDirection,
    },
  }
}
