import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import { nodeKey, scopeKey } from './agents/agent-run-normalizers.mjs'
import {
  applyAgentEventBatch,
  createAgentRunState,
  hydrateAgentRunSnapshot,
  selectAgentNavigatorNode,
  updateAgentRunPresentation,
} from './agents/agent-run-reducer.mjs'

const STORAGE_KEY = 'addom-agent-run-presentation-v1'
const MAX_TRANSCRIPT_ITEMS_PER_NODE = 500
const fallbackStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}

const storage = createJSONStorage(() => (
  typeof window !== 'undefined' && window.localStorage
    ? window.localStorage
    : fallbackStorage
))

const useAgentRunStore = create(persist((set, get) => ({
  ...createAgentRunState(),

  hydrateRun: (snapshot) => set((state) => hydrateAgentRunSnapshot(state, snapshot)),

  applyEvents: (events = []) => set((state) => applyAgentEventBatch(state, events)),

  applyTranscriptPage: ({ runId, nodeId, items = [], hasMore = false, nextCursor = null }) => {
    const key = nodeKey(runId, nodeId)
    set((state) => {
      const current = state.transcriptByNode[key] || {
        summaryHydrated: true,
        itemIds: [],
        itemsById: {},
      }
      const itemsById = { ...current.itemsById }
      for (const item of items) {
        if (item?.id) itemsById[item.id] = { ...item }
      }
      const itemIds = [...new Set([
        ...current.itemIds,
        ...items.map((item) => item?.id).filter(Boolean),
      ])].slice(-MAX_TRANSCRIPT_ITEMS_PER_NODE)
      const retainedIds = new Set(itemIds)
      const retainedItems = Object.fromEntries(
        Object.entries(itemsById).filter(([itemId]) => retainedIds.has(itemId)),
      )
      return {
        transcriptByNode: {
          ...state.transcriptByNode,
          [key]: {
            ...current,
            summaryHydrated: true,
            itemIds,
            itemsById: retainedItems,
            hasMore: hasMore === true,
            nextCursor,
          },
        },
      }
    })
  },

  setPresentation: (input = {}) => set((state) => updateAgentRunPresentation(state, input)),

  selectNavigatorNode: (input = {}) => set((state) => selectAgentNavigatorNode(state, input)),

  clearScope: ({ projectId, threadId } = {}) => set((state) => {
    const key = scopeKey(projectId, threadId)
    const runIds = new Set(state.runIdsByScope[key] || [])
    if (runIds.size === 0) return state
    const cleanRows = (index) => Object.fromEntries(
      Object.entries(index).filter(([, row]) => !runIds.has(row?.runId)),
    )
    const cleanRunKeys = (index) => Object.fromEntries(
      Object.entries(index).filter(([candidate]) => !runIds.has(candidate)),
    )
    return {
      ...state,
      runsById: Object.fromEntries(
        Object.entries(state.runsById).filter(([runId]) => !runIds.has(runId)),
      ),
      nodesById: cleanRows(state.nodesById),
      attemptsById: cleanRows(state.attemptsById),
      approvalsById: cleanRows(state.approvalsById),
      artifactsById: cleanRows(state.artifactsById),
      lastSequenceByRun: cleanRunKeys(state.lastSequenceByRun),
      nodeSequencesByRun: cleanRunKeys(state.nodeSequencesByRun),
      gapByRun: cleanRunKeys(state.gapByRun),
      pendingEventsByRun: cleanRunKeys(state.pendingEventsByRun),
      runIdsByScope: Object.fromEntries(
        Object.entries(state.runIdsByScope).filter(([candidate]) => candidate !== key),
      ),
      activeRunIdsByScope: Object.fromEntries(
        Object.entries(state.activeRunIdsByScope).filter(([candidate]) => candidate !== key),
      ),
    }
  }),

  reset: () => set({ ...createAgentRunState() }),

  getGap: (runId) => get().gapByRun[String(runId || '')] || null,
}), {
  name: STORAGE_KEY,
  storage,
  partialize: (state) => ({
    presentationByScope: state.presentationByScope,
  }),
  merge: (persisted, current) => ({
    ...current,
    presentationByScope: persisted?.presentationByScope || {},
  }),
}))

export default useAgentRunStore
