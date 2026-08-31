function normalizeId(value) {
  return String(value || '').trim()
}

export function normalizeWorkspaceTargetIntent(target = {}) {
  const projectId = normalizeId(target.projectId)
  const projectPath = normalizeId(target.projectPath)
  if (!projectId && !projectPath) return null
  const createThread = target.createThread === true || target.kind === 'create-thread'
  return Object.freeze(projectId
    ? {
        projectId,
        threadId: createThread ? '' : normalizeId(target.threadId),
        createThread,
      }
    : {
        projectId: '',
        projectPath,
        threadId: createThread ? '' : normalizeId(target.threadId),
        createThread,
      })
}

export function createWorkspaceTargetTransitionController({
  getActiveProjectId = () => '',
  getDirtyTabs = () => [],
  activateWorkspaceTarget = async () => null,
  saveAllDirtyTabs = async () => [],
  discardAllDirtyTabs = () => {},
  clearProjectPresentation = () => {},
  onTargetActivated = () => {},
  reportSaveFailure = async () => {},
  reportActivationFailure = async () => {},
  onStateChange = () => {},
} = {}) {
  let state = {
    busy: false,
    dirtyTabs: [],
    error: '',
    pendingTarget: null,
  }
  let requestSequence = 0
  let pendingRequestSequence = 0

  const updateState = (patch) => {
    state = { ...state, ...patch }
    onStateChange({ ...state })
  }

  const continueToTarget = async (target, requestToken) => {
    const result = await activateWorkspaceTarget(target)
    if (requestToken !== requestSequence) return null
    if (!result) {
      updateState({ error: 'Failed to switch workspace.' })
      await reportActivationFailure()
      return null
    }
    clearProjectPresentation()
    updateState({ dirtyTabs: [], error: '', pendingTarget: null })
    onTargetActivated(result)
    return result
  }

  return {
    getState: () => ({ ...state }),

    requestTarget: async (target) => {
      const intent = normalizeWorkspaceTargetIntent(target)
      if (!intent) return null
      const requestToken = ++requestSequence
      if (intent.projectId && normalizeId(getActiveProjectId()) === intent.projectId) {
        const result = await activateWorkspaceTarget(intent)
        return requestToken === requestSequence ? result : null
      }
      const dirtyTabs = getDirtyTabs()
      if (!Array.isArray(dirtyTabs) || dirtyTabs.length === 0) {
        return await continueToTarget(intent, requestToken)
      }
      updateState({
        dirtyTabs: dirtyTabs.slice(),
        error: '',
        pendingTarget: intent,
      })
      pendingRequestSequence = requestToken
      return null
    },

    saveAndContinue: async () => {
      const target = state.pendingTarget
      if (!target || state.busy) return null
      updateState({ busy: true, error: '' })
      try {
        let results
        try {
          results = await saveAllDirtyTabs()
        } catch (error) {
          const failed = state.dirtyTabs.map((tab) => ({
            ok: false,
            filePath: tab?.filePath || '',
            error: String(error?.message || error || 'Save failed.'),
          }))
          updateState({ error: 'Failed to save one or more files.' })
          await reportSaveFailure(failed)
          return null
        }
        const failed = (Array.isArray(results) ? results : []).filter((row) => row?.ok !== true)
        if (failed.length > 0) {
          updateState({ error: 'Failed to save one or more files.' })
          await reportSaveFailure(failed)
          return null
        }
        return await continueToTarget(target, pendingRequestSequence)
      } finally {
        updateState({ busy: false })
      }
    },

    discardAndContinue: async () => {
      const target = state.pendingTarget
      if (!target || state.busy) return null
      updateState({ busy: true, error: '' })
      try {
        discardAllDirtyTabs()
        return await continueToTarget(target, pendingRequestSequence)
      } finally {
        updateState({ busy: false })
      }
    },

    cancel: () => {
      if (state.busy) return
      requestSequence += 1
      pendingRequestSequence = 0
      updateState({ dirtyTabs: [], error: '', pendingTarget: null })
    },
  }
}
