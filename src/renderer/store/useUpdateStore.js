import { create } from 'zustand'
import useEditorStore from './useEditorStore.js'

const PHASES = new Set(['hidden', 'unavailable', 'managed', 'checking', 'available', 'downloading', 'ready', 'installing', 'error'])
const ERROR_CODES = new Set(['generic', 'network', 'operation_in_progress', 'unavailable'])
const BLOCKER_KINDS = new Set(['running-task', 'pending-approval', 'active-terminal', 'unsaved-work'])

function cleanText(value, maxLength = 120) {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, maxLength) : null
}

function cleanTimestamp(value) {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : null
}

function initialSnapshot() {
  return {
    phase: 'hidden',
    version: null,
    progressPercent: 0,
    errorCode: null,
    checkedAt: null,
    downloadedAt: null,
    installBlockers: [],
    simulation: null,
    revision: 0,
  }
}

export function normalizeRendererUpdateSnapshot(value) {
  const source = value && typeof value === 'object' ? value : {}
  const progress = Number(source.progressPercent)
  const revision = Number(source.revision)
  const errorCode = cleanText(source.errorCode, 40)
  const simulation = source.simulation?.enabled === true
    ? {
        enabled: true,
        candidateVersion: cleanText(source.simulation.candidateVersion, 80) || '99.0.0-dev',
      }
    : null
  const installBlockers = Array.isArray(source.installBlockers)
    ? source.installBlockers.flatMap((candidate) => {
        const kind = cleanText(candidate?.kind, 40)
        const label = cleanText(candidate?.label)
        if (!kind || !label || !BLOCKER_KINDS.has(kind)) return []
        return [{ kind, label, simulated: candidate?.simulated === true }]
      }).slice(0, 20)
    : []

  return {
    phase: PHASES.has(source.phase) ? source.phase : 'hidden',
    version: cleanText(source.version, 80),
    progressPercent: Number.isFinite(progress)
      ? Math.round(Math.max(0, Math.min(100, progress)))
      : 0,
    errorCode: errorCode && ERROR_CODES.has(errorCode) ? errorCode : (errorCode ? 'generic' : null),
    checkedAt: cleanTimestamp(source.checkedAt),
    downloadedAt: cleanTimestamp(source.downloadedAt),
    installBlockers,
    simulation,
    revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
  }
}

export function toLegacyUpdatePresentation(value) {
  const snapshot = normalizeRendererUpdateSnapshot(value)
  const statusByPhase = {
    hidden: snapshot.errorCode ? 'error' : null,
    unavailable: 'unavailable',
    managed: 'managed',
    checking: 'checking',
    available: 'available',
    downloading: 'downloading',
    ready: snapshot.installBlockers.length > 0 ? 'blocked' : 'downloaded',
    installing: 'installing',
    error: 'error',
  }
  return {
    status: statusByPhase[snapshot.phase],
    info: {
      version: snapshot.version,
      code: snapshot.errorCode,
      installBlockers: snapshot.installBlockers,
      simulation: snapshot.simulation,
    },
    percent: snapshot.progressPercent,
  }
}

function unavailableResult() {
  return Promise.resolve({ ok: false, code: 'unavailable' })
}

function createRendererPreflight(getDirtyTabCount, now) {
  const dirtyTabCount = Number(getDirtyTabCount())
  return {
    dirtyTabCount: Number.isSafeInteger(dirtyTabCount) && dirtyTabCount >= 0
      ? dirtyTabCount
      : -1,
    capturedAt: Number(now()),
  }
}

export function createUpdateStore({
  getDirtyTabCount = () => useEditorStore.getState().getDirtyTabs().length,
  now = Date.now,
} = {}) {
  return create((set, get) => ({
    snapshot: initialSnapshot(),
    hydrated: false,
    api: null,
    unsubscribe: null,
    initializePromise: null,
    initialize(api = globalThis.window?.addom?.updater) {
      if (get().unsubscribe) return Promise.resolve(get().snapshot)
      if (get().initializePromise) return get().initializePromise
      if (!api || typeof api.getState !== 'function' || typeof api.onStateChanged !== 'function') {
        set({ hydrated: true })
        return Promise.resolve(get().snapshot)
      }

      const applySnapshot = (candidate) => {
        const normalized = normalizeRendererUpdateSnapshot(candidate)
        if (normalized.revision < get().snapshot.revision) return get().snapshot
        set({ snapshot: normalized, hydrated: true })
        return normalized
      }
      const unsubscribe = api.onStateChanged(applySnapshot)
      set({ api, unsubscribe: typeof unsubscribe === 'function' ? unsubscribe : () => {} })
      const initializePromise = Promise.resolve(api.getState())
        .then(applySnapshot)
        .catch(() => {
          set({ hydrated: true })
          return get().snapshot
        })
        .finally(() => set({ initializePromise: null }))
      set({ initializePromise })
      return initializePromise
    },
    dispose() {
      get().unsubscribe?.()
      set({ api: null, unsubscribe: null, initializePromise: null })
    },
    checkForUpdates() {
      return get().api?.checkForUpdates?.() ?? unavailableResult()
    },
    downloadUpdate() {
      return get().api?.downloadUpdate?.() ?? unavailableResult()
    },
    refreshInstallReadiness() {
      return get().api?.refreshInstallReadiness?.(
        createRendererPreflight(getDirtyTabCount, now),
      ) ?? unavailableResult()
    },
    installUpdate() {
      return get().api?.installUpdate?.(
        createRendererPreflight(getDirtyTabCount, now),
      ) ?? unavailableResult()
    },
  }))
}

const useUpdateStore = createUpdateStore()

export default useUpdateStore
