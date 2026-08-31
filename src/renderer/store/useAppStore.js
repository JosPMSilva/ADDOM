import { create } from 'zustand'
import { normalizePermissionMode } from '../../common/chat/permission-mode.mjs'
import {
  areModelCatalogVisibilityEqual,
  DEFAULT_MODEL_CATALOG_VISIBILITY,
  normalizeModelCatalogVisibility,
} from '../../common/api-clients/model-catalog-visibility-settings.mjs'
import {
  CHAT_COMPANION_AGENTS,
  CHAT_COMPANION_GIT,
  CHAT_COMPANION_MODE_FOCUSED,
  CHAT_COMPANION_MODE_SPLIT,
  DEFAULT_CHAT_COMPANION_WIDTH,
  activateChatCompanionView,
  clampChatCompanionWidth,
  closeChatCompanionView,
  createDocumentCompanionView,
  filterChatCompanionViewsForThread,
  moveChatCompanionView,
  normalizeChatCompanion,
  normalizeChatCompanionMode,
  openChatCompanionView,
  toggleChatCompanion as resolveChatCompanionToggle,
} from '../components/chat/chat-companion-state.mjs'
import {
  readAbsoluteEvidenceFile,
  resolveAbsoluteEvidenceFileReference,
} from '../components/chat/evidence-file-navigation.mjs'

const pendingConfirmResolvers = new Map()
const confirmQueue = []
let confirmSequence = 0
let chatDraftInjectionSequence = 0
let managedPlanTurnSequence = 0
let commandPaletteEventSequence = 0
const SUPPORTED_WORKSPACE_PANELS = new Set(['chat', 'editor', 'artifacts', 'memory', 'settings'])
const CHAT_COMPANION_WIDTH_STORAGE_KEY = 'addom.chatCompanion.splitWidth.v1'

function readStoredChatCompanionWidth() {
  if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_CHAT_COMPANION_WIDTH
  try {
    return clampChatCompanionWidth(window.localStorage.getItem(CHAT_COMPANION_WIDTH_STORAGE_KEY), window.innerWidth)
  } catch {
    return DEFAULT_CHAT_COMPANION_WIDTH
  }
}

function persistChatCompanionWidth(value) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(CHAT_COMPANION_WIDTH_STORAGE_KEY, String(value))
  } catch {
    // Local persistence is best-effort; the in-memory width remains authoritative for this session.
  }
}

function normalizeSettingsTargetPayload(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const categoryId = String(source.categoryId || '').trim()
  const sectionId = String(source.sectionId || '').trim()
  if (!categoryId || !sectionId) return null
  return {
    categoryId,
    sectionId,
    requestedAt: Date.now(),
  }
}

function normalizeConfirmRequest(request = {}) {
  const title = String(request.title || 'Confirm Action').trim() || 'Confirm Action'
  const message = String(request.message || request.body || '').trim()
  const confirmLabel = String(request.confirmLabel || 'Confirm').trim() || 'Confirm'
  const cancelLabel = String(request.cancelLabel || 'Cancel').trim() || 'Cancel'
  const toneValue = String(request.tone || '').trim().toLowerCase()
  const tone = ['danger', 'warning', 'neutral'].includes(toneValue) ? toneValue : 'warning'
  const showCancel = request.showCancel !== false
  return { title, message, confirmLabel, cancelLabel, tone, showCancel }
}

function normalizeChatDraftInjection(payload = {}) {
  const text = String(payload.text || '').trim()
  const guardVisibleText = String(payload.guardVisibleText || '').trim()
  const modeValue = String(payload.mode || '').trim().toLowerCase()
  const mode = modeValue === 'replace'
    ? 'replace'
    : (modeValue === 'snippet' ? 'snippet' : 'append')
  const source = String(payload.source || 'editor_selection').trim() || 'editor_selection'
  const composerBlocks = Array.isArray(payload.composerBlocks)
    ? payload.composerBlocks
      .filter((block) => block && typeof block === 'object')
      .map((block) => {
        const typeValue = String(block.type || 'text').trim().toLowerCase()
        if (typeValue === 'code') {
          return {
            type: 'code',
            language: String(block.language || 'plaintext').trim() || 'plaintext',
            code: String(block.code || ''),
          }
        }
        return {
          type: 'text',
          text: String(block.text || ''),
        }
      })
      .filter((block) => (
        block.type === 'code'
          ? block.code.length > 0 || block.language.length > 0
          : block.text.length > 0
      ))
    : null
  const composerSegments = Array.isArray(payload.composerSegments)
    ? payload.composerSegments
      .filter((segment) => segment && typeof segment === 'object')
      .map((segment) => {
        const typeValue = String(segment.type || 'text').trim().toLowerCase()
        if (typeValue === 'code') {
          return {
            type: 'code',
            language: String(segment.language || 'plaintext').trim() || 'plaintext',
            code: String(segment.code || ''),
          }
        }
        return {
          type: 'text',
          text: String(segment.text || ''),
        }
      })
      .filter((segment) => (
        segment.type === 'code'
          ? segment.code.length > 0 || segment.language.length > 0
          : segment.text.length > 0
      ))
    : null
  const hiddenPrefix = payload.hiddenPrefix
    && typeof payload.hiddenPrefix === 'object'
    ? {
        kind: String(payload.hiddenPrefix.kind || '').trim() || 'editor_selection_prelude',
        text: String(payload.hiddenPrefix.text || '').trim(),
      }
    : null
  return {
    id: `chat_draft_${Date.now()}_${(++chatDraftInjectionSequence).toString(36)}`,
    text,
    guardVisibleText,
    mode,
    source,
    composerBlocks: Array.isArray(composerBlocks) && composerBlocks.length > 0 ? composerBlocks : null,
    composerSegments: Array.isArray(composerSegments) && composerSegments.length > 0 ? composerSegments : null,
    hiddenPrefix: hiddenPrefix && hiddenPrefix.text ? hiddenPrefix : null,
    focusComposer: payload.focusComposer !== false,
    threadId: String(payload.threadId || '').trim(),
    requestedAt: Date.now(),
  }
}

function normalizeManagedPlanTurnRequest(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const kind = String(source.kind || '').trim().toLowerCase()
  const threadId = String(source.threadId || '').trim()
  if (!threadId || (kind !== 'revise_plan' && kind !== 'implement_plan')) return null
  return {
    id: `managed_plan_turn_${Date.now()}_${(++managedPlanTurnSequence).toString(36)}`,
    kind,
    threadId,
    planAction: source.planAction && typeof source.planAction === 'object'
      ? { ...source.planAction }
      : null,
    handoff: source.handoff && typeof source.handoff === 'object'
      ? { ...source.handoff }
      : null,
    content: String(source.content || ''),
  }
}

function normalizeActivePanel(panel = '') {
  const normalized = String(panel || '').trim().toLowerCase()
  return SUPPORTED_WORKSPACE_PANELS.has(normalized) ? normalized : 'chat'
}

function settleConfirmDialog(id, result) {
  const key = String(id || '').trim()
  if (!key) return
  const resolver = pendingConfirmResolvers.get(key)
  pendingConfirmResolvers.delete(key)
  try {
    resolver?.(!!result)
  } catch {
    // Non-fatal resolver error.
  }
}

function activateNextQueuedConfirm() {
  const state = useAppStore.getState?.()
  if (!state || typeof state._setActiveConfirmDialog !== 'function') return
  if (state.confirmDialog?.id) return
  const next = confirmQueue.shift() || null
  if (!next) return
  state._setActiveConfirmDialog(next)
}

export function requestAppConfirm(request = {}) {
  const dialog = {
    id: `confirm_${Date.now()}_${(++confirmSequence).toString(36)}`,
    ...normalizeConfirmRequest(request),
  }
  return new Promise((resolve) => {
    pendingConfirmResolvers.set(dialog.id, resolve)
    confirmQueue.push(dialog)
    activateNextQueuedConfirm()
  })
}

export function requestAppAlert(request = {}) {
  return requestAppConfirm({
    tone: 'neutral',
    confirmLabel: 'OK',
    showCancel: false,
    ...request,
  })
}

/**
 * useAppStore - global renderer state.
 */
const useAppStore = create((set) => ({
  projectFolder: null,
  setProjectFolder: (folder) => set({ projectFolder: folder }),

  activeProjectId: null,
  setActiveProjectId: (id) => set((state) => {
    const activeProjectId = id || null
    if (state.activeProjectId === activeProjectId) return { activeProjectId }
    const views = state.chatCompanionViews.filter((view) => (
      view.type !== 'document' || view.projectId === activeProjectId
    ))
    return {
      activeProjectId,
      chatCompanionViews: views,
      activeChatCompanion: views.some((view) => view.key === state.activeChatCompanion)
        ? state.activeChatCompanion
        : '',
      chatCompanionMode: CHAT_COMPANION_MODE_SPLIT,
    }
  }),

  activeThreadId: null,
  setActiveThreadId: (id) => set((state) => {
    const activeThreadId = id || null
    if (state.activeThreadId === activeThreadId) return { activeThreadId }
    const scoped = filterChatCompanionViewsForThread({
      activeKey: state.activeChatCompanion,
      views: state.chatCompanionViews,
    }, activeThreadId)
    return {
      activeThreadId,
      chatCompanionViews: scoped.views,
      activeChatCompanion: scoped.activeKey,
      ...(scoped.activeKey ? {} : { chatCompanionMode: CHAT_COMPANION_MODE_SPLIT }),
    }
  }),

  // 'project-entry' | 'workspace'
  workspaceViewMode: 'project-entry',
  setWorkspaceViewMode: (mode) => {
    const next = mode === 'workspace' ? mode : 'project-entry'
    set({ workspaceViewMode: next })
  },

  // 'chat' | 'editor' | 'artifacts' | 'memory' | 'settings'
  activePanel: 'chat',
  setActivePanel: (panel) => set({ activePanel: normalizeActivePanel(panel) }),
  activeChatCompanion: '',
  chatCompanionViews: [],
  chatCompanionMode: CHAT_COMPANION_MODE_SPLIT,
  chatCompanionWidth: readStoredChatCompanionWidth(),
  setActiveChatCompanion: (value) => set((state) => {
    const requested = normalizeChatCompanion(value)
    if (!requested) return { activeChatCompanion: '', chatCompanionMode: CHAT_COMPANION_MODE_SPLIT }
    if (requested !== CHAT_COMPANION_GIT && requested !== CHAT_COMPANION_AGENTS) {
      const activated = activateChatCompanionView({
        activeKey: state.activeChatCompanion,
        views: state.chatCompanionViews,
      }, requested)
      return { activeChatCompanion: activated.activeKey }
    }
    const opened = openChatCompanionView({
      activeKey: state.activeChatCompanion,
      views: state.chatCompanionViews,
    }, {
      key: requested,
      type: requested,
      label: requested === CHAT_COMPANION_GIT ? 'Git' : 'Agents',
    })
    return {
      activeChatCompanion: opened.activeKey,
      chatCompanionViews: opened.views,
    }
  }),
  toggleChatCompanion: (value) => set((state) => {
    const toggled = resolveChatCompanionToggle(state.activeChatCompanion, value)
    if (!toggled) {
      return {
        activeChatCompanion: '',
        chatCompanionMode: CHAT_COMPANION_MODE_SPLIT,
      }
    }
    const opened = openChatCompanionView({
      activeKey: state.activeChatCompanion,
      views: state.chatCompanionViews,
    }, {
      key: toggled,
      type: toggled,
      label: toggled === CHAT_COMPANION_GIT ? 'Git' : 'Agents',
    })
    return {
      activeChatCompanion: opened.activeKey,
      chatCompanionViews: opened.views,
    }
  }),
  activateChatCompanionView: (viewKey) => set((state) => {
    const activated = activateChatCompanionView({
      activeKey: state.activeChatCompanion,
      views: state.chatCompanionViews,
    }, viewKey)
    return { activeChatCompanion: activated.activeKey }
  }),
  moveChatCompanionView: (viewKey, targetIndex) => set((state) => {
    const moved = moveChatCompanionView({
      activeKey: state.activeChatCompanion,
      views: state.chatCompanionViews,
    }, viewKey, targetIndex)
    return { chatCompanionViews: moved.views }
  }),
  closeChatCompanionView: (viewKey = '') => set((state) => {
    const closed = closeChatCompanionView({
      activeKey: state.activeChatCompanion,
      views: state.chatCompanionViews,
    }, viewKey)
    return {
      activeChatCompanion: closed.activeKey,
      chatCompanionViews: closed.views,
      ...(closed.activeKey ? {} : { chatCompanionMode: CHAT_COMPANION_MODE_SPLIT }),
    }
  }),
  openDocumentCompanion: async (payload = {}) => {
    if (String(payload?.sourceKind || '').trim().toLowerCase() === 'managed_plan') {
      const projectRoot = String(payload?.projectRoot || '').trim()
      const threadId = String(payload?.threadId || '').trim()
      const planId = String(payload?.planId || '').trim()
      if (!projectRoot || !threadId || !planId) return { ok: false, error: 'missing_plan_document_identity' }
      let result
      try {
        result = await window?.addom?.documents?.readManagedPlan?.({ projectRoot, threadId, planId })
      } catch {
        result = { ok: false, error: 'plan_document_unavailable' }
      }
      if (result?.ok !== true) return result || { ok: false, error: 'plan_document_unavailable' }
      const view = createDocumentCompanionView({
        sourceKind: 'managed_plan', projectRoot, threadId, planId, initialDocument: result,
      })
      set((state) => {
        const opened = openChatCompanionView({
          activeKey: state.activeChatCompanion,
          views: state.chatCompanionViews,
        }, view)
        return { activePanel: 'chat', activeChatCompanion: opened.activeKey, chatCompanionViews: opened.views }
      })
      return result
    }
    const evidenceTarget = resolveAbsoluteEvidenceFileReference(payload?.evidenceFilePath)
    const isEvidence = evidenceTarget.ok === true
    const projectId = String(payload?.projectId || (isEvidence ? 'evidence' : '')).trim()
    const filePath = String(isEvidence ? evidenceTarget.absolutePath : payload?.filePath || '').trim().replace(/\\/g, '/')
    if (!projectId || !filePath) return { ok: false, error: 'missing_document_identity' }
    let result
    if (isEvidence) {
      const readResult = await readAbsoluteEvidenceFile(window?.addom?.file, evidenceTarget.absolutePath)
      result = readResult.ok
        ? {
            ok: true,
            projectId,
            filePath: evidenceTarget.absolutePath,
            name: evidenceTarget.filePath,
            content: readResult.content,
          }
        : {
            ok: false,
            error: String(readResult.error || '').toLowerCase().includes('not found')
              ? 'document_not_found'
              : 'document_unavailable',
            projectId,
            filePath: evidenceTarget.absolutePath,
          }
    } else {
      const readDocument = window?.addom?.documents?.read
      if (typeof readDocument !== 'function') return { ok: false, error: 'document_bridge_unavailable' }
      try {
        result = await readDocument(projectId, filePath)
      } catch {
        result = { ok: false, error: 'document_unavailable', projectId, filePath }
      }
    }
    const safeErrors = new Set(['document_not_found', 'document_unavailable', 'document_too_large'])
    if (result?.ok !== true && !safeErrors.has(String(result?.error || ''))) return result
    const view = createDocumentCompanionView({
      projectId,
      filePath: String(result?.filePath || filePath),
      sourceKind: isEvidence ? 'evidence' : 'project',
      sourceRoot: isEvidence ? evidenceTarget.directoryPath : '',
      sourceFilePath: isEvidence ? evidenceTarget.filePath : '',
      originSelector: payload?.originSelector,
      originViewKey: payload?.originViewKey,
      initialDocument: result,
    })
    set((state) => {
      const opened = openChatCompanionView({
        activeKey: state.activeChatCompanion,
        views: state.chatCompanionViews,
      }, view)
      return {
        activePanel: 'chat',
        activeChatCompanion: opened.activeKey,
        chatCompanionViews: opened.views,
      }
    })
    return result
  },
  setChatCompanionMode: (mode) => set({ chatCompanionMode: normalizeChatCompanionMode(mode) }),
  toggleChatCompanionMode: () => set((state) => ({
    chatCompanionMode: state.chatCompanionMode === CHAT_COMPANION_MODE_FOCUSED
      ? CHAT_COMPANION_MODE_SPLIT
      : CHAT_COMPANION_MODE_FOCUSED,
  })),
  setChatCompanionWidth: (value, viewportWidth = 0, layout = {}) => {
    const width = clampChatCompanionWidth(value, viewportWidth, layout)
    persistChatCompanionWidth(width)
    set({ chatCompanionWidth: width })
  },
  settingsTarget: null,
  openSettingsTarget: (payload = {}) => {
    const target = normalizeSettingsTargetPayload(payload)
    set({
      activePanel: 'settings',
      ...(target ? { settingsTarget: target } : {}),
    })
  },
  clearSettingsTarget: () => set({ settingsTarget: null }),

  pendingChatDraftInjection: null,
  queueChatDraftInjection: (payload) => set({
    pendingChatDraftInjection: normalizeChatDraftInjection(payload),
  }),
  clearPendingChatDraftInjection: () => set({ pendingChatDraftInjection: null }),

  pendingManagedPlanTurnRequest: null,
  queueManagedPlanTurnRequest: (payload) => set({
    pendingManagedPlanTurnRequest: normalizeManagedPlanTurnRequest(payload),
  }),
  clearPendingManagedPlanTurnRequest: (requestId = '') => set((state) => (
    requestId && state.pendingManagedPlanTurnRequest?.id !== requestId
      ? state
      : { pendingManagedPlanTurnRequest: null }
  )),

  commandPaletteEvent: null,
  emitCommandPaletteEvent: (type, payload = {}) => set({
    commandPaletteEvent: {
      id: `cmd_palette_evt_${Date.now()}_${(++commandPaletteEventSequence).toString(36)}`,
      type: String(type || '').trim(),
      payload: payload && typeof payload === 'object' ? { ...payload } : {},
      emittedAt: Date.now(),
    },
  }),

  sidebarCollapsed: true,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  uiScale: 1,
  setUiScale: (value) => {
    const nextValue = Number(value)
    if (!Number.isFinite(nextValue) || nextValue <= 0) return
    set((state) => (
      state.uiScale === nextValue
        ? state
        : { uiScale: nextValue }
    ))
  },
  permissionMode: 'ask',
  setPermissionMode: (value) => {
    const nextPermissionMode = normalizePermissionMode(value)
    set((state) => (
      state.permissionMode === nextPermissionMode
        ? state
        : { permissionMode: nextPermissionMode }
    ))
  },

  inlineCompletionEnabled: true,
  setInlineCompletionEnabled: (v) => {
    const nextValue = !!v
    set((state) => (
      state.inlineCompletionEnabled === nextValue
        ? state
        : { inlineCompletionEnabled: nextValue }
    ))
  },

  attachmentTextExtractionEnabled: false,
  setAttachmentTextExtractionEnabled: (v) => {
    const nextValue = !!v
    set((state) => (
      state.attachmentTextExtractionEnabled === nextValue
        ? state
        : { attachmentTextExtractionEnabled: nextValue }
    ))
  },

  memoryCompressionEnabled: true,
  setMemoryCompressionEnabled: (v) => {
    const nextValue = !!v
    set((state) => (
      state.memoryCompressionEnabled === nextValue
        ? state
        : { memoryCompressionEnabled: nextValue }
    ))
  },

  memoryCompressionThreshold: 50,
  setMemoryCompressionThreshold: (value) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return
    const threshold = Math.max(5, Math.min(500, Math.round(n)))
    set((state) => (
      state.memoryCompressionThreshold === threshold
        ? state
        : { memoryCompressionThreshold: threshold }
    ))
  },

  includeGlobalMemoryInContext: false,
  setIncludeGlobalMemoryInContext: (v) => {
    const nextValue = !!v
    set((state) => (
      state.includeGlobalMemoryInContext === nextValue
        ? state
        : { includeGlobalMemoryInContext: nextValue }
    ))
  },

  liveExecutionStreamEnabled: true,
  setLiveExecutionStreamEnabled: (v) => {
    const nextValue = !!v
    set((state) => (
      state.liveExecutionStreamEnabled === nextValue
        ? state
        : { liveExecutionStreamEnabled: nextValue }
    ))
  },

  perThreadBackgroundSessions: true,
  setPerThreadBackgroundSessions: (v) => {
    const nextValue = !!v
    set((state) => (
      state.perThreadBackgroundSessions === nextValue
        ? state
        : { perThreadBackgroundSessions: nextValue }
    ))
  },

  modelCatalogVisibility: normalizeModelCatalogVisibility(DEFAULT_MODEL_CATALOG_VISIBILITY),
  setModelCatalogVisibility: (value) => {
    const nextValue = normalizeModelCatalogVisibility(value)
    set((state) => (
      areModelCatalogVisibilityEqual(state.modelCatalogVisibility, nextValue)
        ? state
        : { modelCatalogVisibility: nextValue }
    ))
  },

  commandSafetyStartupProbe: null,
  setCommandSafetyStartupProbe: (probe) => set({
    commandSafetyStartupProbe: probe && typeof probe === 'object'
      ? {
          checkedAt: Number(probe.checkedAt || Date.now()) || Date.now(),
          source: String(probe.source || 'renderer_startup'),
          backendStatus: probe.backendStatus && typeof probe.backendStatus === 'object'
            ? { ...probe.backendStatus }
            : null,
        }
      : null,
  }),

  commandSafetyStartupTelemetry: null,
  setCommandSafetyStartupTelemetry: (snapshot) => set({
    commandSafetyStartupTelemetry: snapshot && typeof snapshot === 'object'
      ? {
          checkedAt: Date.now(),
          source: 'renderer_startup',
          snapshot,
        }
      : null,
  }),

  confirmDialog: null,
  _setActiveConfirmDialog: (dialog) => set({
    confirmDialog: dialog && typeof dialog === 'object' ? { ...dialog } : null,
  }),
  resolveConfirmDialog: (result) => {
    const state = useAppStore.getState?.()
    const currentId = String(state?.confirmDialog?.id || '').trim()
    set({ confirmDialog: null })
    if (currentId) settleConfirmDialog(currentId, !!result)
    activateNextQueuedConfirm()
  },
  clearConfirmDialog: () => {
    const state = useAppStore.getState?.()
    const currentId = String(state?.confirmDialog?.id || '').trim()
    set({ confirmDialog: null })
    if (currentId) settleConfirmDialog(currentId, false)
    activateNextQueuedConfirm()
  },
}))

export default useAppStore
