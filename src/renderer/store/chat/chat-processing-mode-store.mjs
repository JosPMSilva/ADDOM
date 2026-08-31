import {
  normalizeProviderProcessingMode,
  resolveProviderProcessingMode,
} from '../../../common/api-clients/provider-processing-mode.mjs'

export const INITIAL_CHAT_PROCESSING_MODE_STATE = Object.freeze({
  processingMode: 'standard',
  processingModeByThreadId: {},
  returnedProcessingMode: '',
  returnedProcessingModeByThreadId: {},
})

export function applyProcessingModeThreadSelection(state = {}, nextState = {}) {
  const threadId = String(nextState.activeThreadId || '').trim()
  return {
    ...nextState,
    processingMode: normalizeProviderProcessingMode(state.processingModeByThreadId?.[threadId]),
    returnedProcessingMode: String(
      state.returnedProcessingModeByThreadId?.[threadId] || '',
    ).trim(),
  }
}

export function applyProcessingModeThreadRemoval(state = {}, nextState = {}, threadId = '') {
  const removedThreadId = String(threadId || '').trim()
  const processingModeByThreadId = { ...(state.processingModeByThreadId || {}) }
  const returnedProcessingModeByThreadId = { ...(state.returnedProcessingModeByThreadId || {}) }
  delete processingModeByThreadId[removedThreadId]
  delete returnedProcessingModeByThreadId[removedThreadId]
  const activeThreadId = String(nextState.activeThreadId || '').trim()
  return {
    ...nextState,
    processingModeByThreadId,
    returnedProcessingModeByThreadId,
    processingMode: normalizeProviderProcessingMode(processingModeByThreadId[activeThreadId]),
    returnedProcessingMode: String(returnedProcessingModeByThreadId[activeThreadId] || '').trim(),
  }
}

export function createProcessingModeStoreActions({ get, set }) {
  return {
    setProcessingMode(mode, options = {}) {
      const threadId = String(options?.threadId || get().activeThreadId || '').trim()
      if (!threadId) return
      const processingMode = normalizeProviderProcessingMode(mode)
      set((state) => ({
        processingModeByThreadId: { ...(state.processingModeByThreadId || {}), [threadId]: processingMode },
        returnedProcessingModeByThreadId: {
          ...(state.returnedProcessingModeByThreadId || {}),
          [threadId]: '',
        },
        ...(threadId === state.activeThreadId ? { processingMode, returnedProcessingMode: '' } : {}),
      }))
    },
    recordReturnedProcessingMode(mode, options = {}) {
      const threadId = String(options?.threadId || get().activeThreadId || '').trim()
      const returnedProcessingMode = options?.providerId
        ? resolveProviderProcessingMode({
            providerId: options.providerId,
            returnedProviderMode: mode,
          }).returnedMode
        : String(mode || '').trim()
      if (!threadId || !returnedProcessingMode) return
      set((state) => ({
        returnedProcessingModeByThreadId: {
          ...(state.returnedProcessingModeByThreadId || {}),
          [threadId]: returnedProcessingMode,
        },
        ...(threadId === state.activeThreadId ? { returnedProcessingMode } : {}),
      }))
    },
  }
}
