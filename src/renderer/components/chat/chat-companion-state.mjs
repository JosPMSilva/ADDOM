export const CHAT_COMPANION_GIT = 'git'
export const CHAT_COMPANION_AGENTS = 'agents'
export const CHAT_COMPANION_DOCUMENT = 'document'
export const CHAT_COMPANION_MODE_SPLIT = 'split'
export const CHAT_COMPANION_MODE_FOCUSED = 'focused'
export const DEFAULT_CHAT_COMPANION_WIDTH = 360
export const MIN_CHAT_COMPANION_WIDTH = 280
export const MAX_CHAT_COMPANION_WIDTH = 760
export const MAX_OPEN_DOCUMENT_COMPANIONS = 6

const VIEW_TYPE_PATTERN = /^[a-z][a-z0-9_-]*$/
const DOCUMENT_KEY_PREFIX = `${CHAT_COMPANION_DOCUMENT}:`

function clean(value = '') {
  return String(value || '').trim().toLowerCase()
}

export function normalizeChatCompanion(value = '') {
  const raw = String(value || '').trim()
  const normalized = clean(raw)
  if (normalized === CHAT_COMPANION_GIT || normalized === CHAT_COMPANION_AGENTS) return normalized
  return normalized.startsWith(DOCUMENT_KEY_PREFIX) ? raw : ''
}

export function toggleChatCompanion(current = '', requested = '') {
  const target = clean(requested)
  if (target !== CHAT_COMPANION_GIT && target !== CHAT_COMPANION_AGENTS) return ''
  if (!target) return ''
  return normalizeChatCompanion(current) === target ? '' : target
}

export function normalizeChatCompanionMode(value = '') {
  return clean(value) === CHAT_COMPANION_MODE_FOCUSED
    ? CHAT_COMPANION_MODE_FOCUSED
    : CHAT_COMPANION_MODE_SPLIT
}

export function resolveChatCompanionMaximumWidth(viewportWidth = 0, layout = {}) {
  const viewport = Number(viewportWidth)
  if (!Number.isFinite(viewport) || viewport <= 0) return MAX_CHAT_COMPANION_WIDTH
  if (layout?.workspaceRailOpen === false) {
    return Math.max(MIN_CHAT_COMPANION_WIDTH, Math.floor(viewport * 0.5))
  }
  return Math.min(
    MAX_CHAT_COMPANION_WIDTH,
    Math.max(MIN_CHAT_COMPANION_WIDTH, viewport - 640),
  )
}

export function clampChatCompanionWidth(value, viewportWidth = 0, layout = {}) {
  const requested = Number(value)
  const maximum = resolveChatCompanionMaximumWidth(viewportWidth, layout)
  const next = Number.isFinite(requested) ? requested : DEFAULT_CHAT_COMPANION_WIDTH
  return Math.round(Math.min(maximum, Math.max(MIN_CHAT_COMPANION_WIDTH, next)))
}

export function createChatCompanionViewRegistry(descriptors = []) {
  const registry = new Map()
  for (const descriptor of Array.isArray(descriptors) ? descriptors : []) {
    const type = clean(descriptor?.type)
    if (!VIEW_TYPE_PATTERN.test(type)) {
      throw new TypeError(`Invalid companion view type: ${String(descriptor?.type || '')}`)
    }
    if (registry.has(type)) throw new TypeError(`Duplicate companion view type: ${type}`)
    registry.set(type, Object.freeze({
      type,
      singleton: descriptor?.singleton === true,
    }))
  }
  return registry
}

export const CHAT_COMPANION_VIEW_REGISTRY = createChatCompanionViewRegistry([
  { type: CHAT_COMPANION_GIT, singleton: true },
  { type: CHAT_COMPANION_AGENTS, singleton: true },
  { type: CHAT_COMPANION_DOCUMENT, singleton: false },
])

function normalizeDocumentPath(value = '') {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '')
}

function documentKey(projectId = '', filePath = '') {
  const project = clean(projectId)
  const normalizedPath = normalizeDocumentPath(filePath).toLowerCase()
  return `${DOCUMENT_KEY_PREFIX}${encodeURIComponent(project)}:${encodeURIComponent(normalizedPath)}`
}

export function createDocumentCompanionView(payload = {}) {
  const requestedSourceKind = clean(payload?.sourceKind)
  const sourceKind = requestedSourceKind === 'evidence'
    ? 'evidence'
    : requestedSourceKind === 'managed_plan' ? 'managed_plan' : 'project'
  if (sourceKind === 'managed_plan') {
    const planId = String(payload?.planId || '').trim()
    const projectRoot = String(payload?.projectRoot || '').trim()
    const threadId = String(payload?.threadId || '').trim()
    if (!planId || !projectRoot || !threadId) throw new TypeError('Managed plan companion requires project, thread, and plan identity.')
    return {
      key: `${DOCUMENT_KEY_PREFIX}managed-plan:${encodeURIComponent(threadId)}:${encodeURIComponent(planId)}`,
      type: CHAT_COMPANION_DOCUMENT,
      projectId: 'managed-plan',
      filePath: `managed-plan/${planId}.md`,
      sourceKind,
      projectRoot,
      threadId,
      planId,
      label: 'Plan.md',
      originSelector: String(payload?.originSelector || '').trim(),
      originViewKey: String(payload?.originViewKey || '').trim(),
      initialDocument: payload?.initialDocument && typeof payload.initialDocument === 'object' ? { ...payload.initialDocument } : null,
    }
  }
  const projectId = String(payload?.projectId || (sourceKind === 'evidence' ? 'evidence' : '')).trim()
  const filePath = normalizeDocumentPath(payload?.filePath)
  if (!projectId || !filePath) throw new TypeError('Document companion requires projectId and filePath.')
  const sourceFilePath = sourceKind === 'evidence' ? normalizeDocumentPath(payload?.sourceFilePath) : ''
  const label = (sourceFilePath || filePath).split('/').filter(Boolean).pop() || 'Document'
  return {
    key: documentKey(projectId, filePath),
    type: CHAT_COMPANION_DOCUMENT,
    projectId,
    filePath,
    sourceKind,
    sourceRoot: sourceKind === 'evidence' ? normalizeDocumentPath(payload?.sourceRoot) : '',
    sourceFilePath,
    label,
    originSelector: String(payload?.originSelector || '').trim(),
    originViewKey: String(payload?.originViewKey || '').trim(),
    initialDocument: payload?.initialDocument && typeof payload.initialDocument === 'object'
      ? { ...payload.initialDocument }
      : null,
  }
}

function normalizeView(view = null) {
  if (!view || typeof view !== 'object') return null
  const type = clean(view.type)
  if (!CHAT_COMPANION_VIEW_REGISTRY.has(type)) return null
  if (type === CHAT_COMPANION_DOCUMENT) return createDocumentCompanionView(view)
  return {
    key: type,
    type,
    label: String(view.label || (type === CHAT_COMPANION_GIT ? 'Git' : 'Agents')).trim(),
  }
}

function normalizeDockState(state = {}) {
  const views = []
  const seen = new Set()
  for (const rawView of Array.isArray(state?.views) ? state.views : []) {
    const view = normalizeView(rawView)
    if (!view || seen.has(view.key)) continue
    seen.add(view.key)
    views.push(view)
  }
  const requestedActive = String(state?.activeKey || '').trim()
  return {
    views,
    activeKey: views.some((view) => view.key === requestedActive) ? requestedActive : '',
  }
}

export function filterChatCompanionViewsForThread(state = {}, activeThreadId = '') {
  const current = normalizeDockState(state)
  const threadId = String(activeThreadId || '').trim()
  const views = current.views.filter((view) => (
    view.sourceKind !== 'managed_plan' || view.threadId === threadId
  ))
  return {
    views,
    activeKey: views.some((view) => view.key === current.activeKey) ? current.activeKey : '',
  }
}

export function openChatCompanionView(state = {}, requestedView = null, options = {}) {
  const current = normalizeDockState(state)
  const view = normalizeView(requestedView)
  if (!view) return current
  const existingIndex = current.views.findIndex((entry) => entry.key === view.key)
  if (existingIndex >= 0) {
    const views = [...current.views]
    views[existingIndex] = { ...views[existingIndex], ...view }
    return { views, activeKey: view.key }
  }

  let views = [...current.views, view]
  if (view.type === CHAT_COMPANION_DOCUMENT) {
    const maxDocuments = Math.max(1, Number(options?.maxDocuments || MAX_OPEN_DOCUMENT_COMPANIONS) || MAX_OPEN_DOCUMENT_COMPANIONS)
    const documents = views.filter((entry) => entry.type === CHAT_COMPANION_DOCUMENT)
    if (documents.length > maxDocuments) {
      const evictedKey = documents[0].key
      views = views.filter((entry) => entry.key !== evictedKey)
    }
  }
  return { views, activeKey: view.key }
}

export function activateChatCompanionView(state = {}, viewKey = '') {
  const current = normalizeDockState(state)
  const requested = String(viewKey || '').trim()
  return current.views.some((view) => view.key === requested)
    ? { ...current, activeKey: requested }
    : current
}

export function moveChatCompanionView(state = {}, viewKey = '', targetIndex = 0) {
  const current = normalizeDockState(state)
  const requested = String(viewKey || '').trim()
  const currentIndex = current.views.findIndex((view) => view.key === requested)
  const requestedIndex = Number(targetIndex)
  if (currentIndex < 0 || !Number.isFinite(requestedIndex)) return current
  const nextIndex = Math.max(0, Math.min(current.views.length - 1, Math.round(requestedIndex)))
  if (nextIndex === currentIndex) return current
  const views = [...current.views]
  const [movedView] = views.splice(currentIndex, 1)
  views.splice(nextIndex, 0, movedView)
  return { views, activeKey: current.activeKey }
}

export function closeChatCompanionView(state = {}, viewKey = '') {
  const current = normalizeDockState(state)
  const requested = String(viewKey || current.activeKey || '').trim()
  const index = current.views.findIndex((view) => view.key === requested)
  if (index < 0) return current
  const closingView = current.views[index]
  const views = current.views.filter((view) => view.key !== requested)
  if (current.activeKey !== requested) return { views, activeKey: current.activeKey }
  const originViewKey = String(closingView?.originViewKey || '').trim()
  return {
    views,
    activeKey: views.some((view) => view.key === originViewKey)
      ? originViewKey
      : views[Math.min(index - 1, views.length - 1)]?.key || views[0]?.key || '',
  }
}

export function shouldShowAgentCompanionTrigger(status = null, activeCompanion = '') {
  return status?.visible === true || normalizeChatCompanion(activeCompanion) === CHAT_COMPANION_AGENTS
}

export function shouldCloseAgentCompanionOnThreadChange({
  ownerThreadId = '',
  activeThreadId = '',
  hasActiveAgents = false,
} = {}) {
  const owner = String(ownerThreadId || '').trim()
  const active = String(activeThreadId || '').trim()
  return Boolean(owner) && owner !== active && hasActiveAgents !== true
}

/** Trigger copy for a canonical companion status; attention outranks a plain completed count. */
export function formatAgentCompanionLabel(t, status = null) {
  const activeCount = Number(status?.activeCount || 0)
  if (activeCount > 0) {
    return t('core:agentTrigger.active', {
      count: activeCount,
      defaultValue: 'Agents · {{count}} active',
    })
  }
  if (status?.attentionStatus === 'approval_required') {
    return t('core:agentTrigger.approval', { defaultValue: 'Agents · needs approval' })
  }
  const failedCount = Number(status?.failedCount || 0)
  if (failedCount > 0) {
    return t('core:agentTrigger.failed', {
      count: failedCount,
      defaultValue: 'Agents · {{count}} failed',
    })
  }
  return t('core:agentTrigger.idle', { defaultValue: 'Agents' })
}
