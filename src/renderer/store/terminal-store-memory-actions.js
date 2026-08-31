import useMemoryStore from './useMemoryStore.js'
import {
  appendTelemetryEvent,
  asTrimmedString,
  removeBooleanMapEntry,
  upsertBooleanMapEntry,
} from './terminal-store-shared.js'
import {
  TERMINAL_MEMORY_OUTPUT_MAX_CHARS,
  buildTerminalMemorySnapshotPayload,
  extractTerminalOutputContext,
} from '../components/terminal/terminal-output-context.mjs'

export function createTerminalMemoryActions({ set, get }) {
  return {
    saveLiveSessionSnapshotToMemory: async (sessionId = '', options = {}) => {
      const normalizedSessionId = asTrimmedString(sessionId)
      const session = (Array.isArray(get().sessions) ? get().sessions : [])
        .find((entry) => asTrimmedString(entry?.id) === normalizedSessionId)
      const memoryApi = typeof window === 'undefined' ? null : window?.addom?.memory
      if (!normalizedSessionId || !session || typeof memoryApi?.add !== 'function') return null

      const output = options?.output && typeof options.output === 'object'
        ? options.output
        : extractTerminalOutputContext({
          mode: 'full_bounded',
          rawOutput: options?.rawOutput || get().rawOutputBySessionId?.[normalizedSessionId]?.rawOutput,
          maxChars: TERMINAL_MEMORY_OUTPUT_MAX_CHARS,
        })
      const payload = buildTerminalMemorySnapshotPayload({
        session,
        output,
        projectFolder: options?.projectFolder || get().hydratedProjectFolder,
        targetScope: options?.targetScope || 'thread',
      })
      if (!payload?.project || !payload?.content) {
        set({ actionError: 'Terminal output is required before saving a snapshot to Memory.' })
        return null
      }

      set((state) => ({
        liveMemoryActionPendingBySessionId: upsertBooleanMapEntry(
          state.liveMemoryActionPendingBySessionId,
          normalizedSessionId,
          true,
        ),
        actionError: '',
      }))
      try {
        const result = await memoryApi.add(payload)
        const nodeId = asTrimmedString(result?.id || result)
        await useMemoryStore.getState?.().refreshVisibleNodes?.(payload.project, {
          threadId: payload.threadId || session.threadId,
        })
        set((state) => ({
          liveMemoryActionPendingBySessionId: upsertBooleanMapEntry(
            state.liveMemoryActionPendingBySessionId,
            normalizedSessionId,
            false,
          ),
          telemetryEvents: appendTelemetryEvent(state.telemetryEvents, 'save_live_snapshot_to_memory', {
            sessionId: normalizedSessionId,
            memoryNodeId: nodeId,
            targetScope: payload.scope,
          }),
          actionError: '',
        }))
        return nodeId
      } catch (error) {
        set((state) => ({
          liveMemoryActionPendingBySessionId: removeBooleanMapEntry(
            state.liveMemoryActionPendingBySessionId,
            normalizedSessionId,
          ),
          actionError: asTrimmedString(error?.message || error || 'Failed to save terminal snapshot to Memory.'),
        }))
        return null
      }
    },
  }
}
