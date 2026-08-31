import {
  createTextComposerBlock,
  createCodeComposerBlock,
  serializeComposerBlocksAndDraft,
} from './composer-segments.mjs'
import { normalizeAssistantPhase } from '../../../common/chat/assistant-phase.mjs'
import { normalizeProviderProcessingMode } from '../../../common/api-clients/provider-processing-mode.mjs'
import {
  buildAttachmentPart,
  sanitizeHistoryMessageForModel,
  summarizePendingAttachments,
} from './chat-panel-attachment-utils.mjs'
import { collectTurnFileChanges } from './turn-file-changes.mjs'
import { cursorExecutionIsBlocked } from './cursor-agent-renderer-capabilities.mjs'
export {
  isPdfAttachment,
  partitionAttachmentsByCapability,
  resolveAttachmentCapabilityGates,
  supportsPdfAttachmentsForSelection,
} from './chat-panel-attachment-utils.mjs'
export { buildContextMeterUsage } from './chat-context-meter-usage.mjs'

export function normalizeComposerAgentRoles(rawRoles = []) {
  if (!Array.isArray(rawRoles)) return []
  return rawRoles
    .filter((role) => role && typeof role === 'object')
    .map((role) => ({
      id: String(role.id || '').trim(),
      name: String(role.name || '').trim(),
      providerId: String(role.providerId || '').trim(),
      model: String(role.model || '').trim(),
      canWriteFiles: !!role.canWriteFiles,
    }))
    .filter((role) => role.id && role.name)
}

export function formatRoleMention(role) {
  const name = String(role?.name || '').replace(/\}/g, '').trim()
  const id = String(role?.id || '').trim()
  if (name) return `@{${name}}`
  if (id) return `@${id}`
  return ''
}

export function normalizeHiddenPreludePayload(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const text = String(value.text || '').trim()
    if (!text) return null
    const kindValue = String(value.kind || '').trim().toLowerCase()
    const kind = kindValue === 'editor_selection_prelude'
      ? 'editor_selection_prelude'
      : 'provider_switch_context'
    return { kind, text }
  }

  const text = String(value || '').trim()
  if (!text) return null
  return { kind: 'provider_switch_context', text }
}

export function resolveQuestionUserCardDisabled({
  request = null,
  disabled = false,
  isStreaming = false,
} = {}) {
  const source = String(request?.source || 'local_tool').trim().toLowerCase()
  if (source === 'openai_account_bridge') {
    return disabled === true && isStreaming !== true
  }
  return disabled === true || isStreaming === true
}

export function buildHiddenPreludeHistoryMessage(payload) {
  const normalized = normalizeHiddenPreludePayload(payload)
  if (!normalized) return null

  if (normalized.kind === 'editor_selection_prelude') {
    return {
      role: 'user',
      content: `[Editor Selection Task Context]
Use this hidden editor action context to answer the user's next visible message (which contains only the selected code snippet).
Treat the visible snippet as the primary code to operate on, and use the metadata/context/diagnostics below to guide the response.

${normalized.text}`,
    }
  }

  return {
    role: 'user',
    content: `[Context Bootstrap]
Use this retrieved workspace context to continue in the newly selected provider/model:

${normalized.text}`,
  }
}

export function buildToolFreeCommandTurnOptions(turnOptions = {}) {
  const source = turnOptions && typeof turnOptions === 'object' && !Array.isArray(turnOptions)
    ? turnOptions
    : {}
  const command = source.command && typeof source.command === 'object' && !Array.isArray(source.command)
    ? source.command
    : {}
  return {
    ...source,
    command: {
      ...command,
      disableTools: true,
    },
  }
}

export function normalizePendingEditorDraftPrelude(payload = {}) {
  if (!payload || typeof payload !== 'object') return null
  const hiddenPrefix = normalizeHiddenPreludePayload(payload.hiddenPrefix)
  if (!hiddenPrefix || hiddenPrefix.kind !== 'editor_selection_prelude') return null
  const guardVisibleText = String(payload.guardVisibleText || '').trim()
  const blockIds = Array.isArray(payload.blockIds)
    ? payload.blockIds
      .map((value) => String(value || '').trim())
      .filter(Boolean)
    : (Array.isArray(payload.segmentIds)
      ? payload.segmentIds
        .map((value) => String(value || '').trim())
        .filter(Boolean)
      : [])
  return {
    id: String(payload.id || '').trim() || `editor_prelude_${Date.now()}`,
    hiddenPrefix,
    blockIds,
    guardVisibleText,
    createdAt: Number(payload.requestedAt || Date.now()) || Date.now(),
  }
}

export function normalizeInjectedComposerBlocksPayload(rawBlocks = []) {
  return (Array.isArray(rawBlocks) ? rawBlocks : [])
    .filter((block) => block && typeof block === 'object')
    .map((block) => {
      const typeValue = String(block.type || 'text').trim().toLowerCase()
      if (typeValue === 'code') {
        return createCodeComposerBlock({
          language: block.language,
          code: block.code,
        })
      }
      return createTextComposerBlock(block.text || '')
    })
}

export function composerHasMeaningfulContent(blocks = [], draftText = '') {
  const serialized = serializeComposerBlocksAndDraft({
    blocks,
    draftText,
    trimOuterWhitespace: true,
  })
  return serialized.trim().length > 0
}

export function buildTimelineTurnIndex(sourceTimeline = []) {
  const activitiesByTurn = new Map()
  const firstEventIdByTurn = new Map()
  const fileChangesByTurn = new Map()

  const rows = Array.isArray(sourceTimeline) ? sourceTimeline : []
  for (const entry of rows) {
    if (!(entry?.kind === 'tool' && entry?.activity)) continue
    const turnId = String(entry.activity.turnId || '').trim()
    if (!turnId) continue
    if (!activitiesByTurn.has(turnId)) activitiesByTurn.set(turnId, [])
    activitiesByTurn.get(turnId).push(entry.activity)
    if (!firstEventIdByTurn.has(turnId)) {
      firstEventIdByTurn.set(turnId, String(entry.id || ''))
    }
  }

  for (const [turnId, activities] of activitiesByTurn.entries()) {
    fileChangesByTurn.set(turnId, collectTurnFileChanges(activities))
  }

  return {
    activitiesByTurn,
    firstEventIdByTurn,
    fileChangesByTurn,
  }
}

export function buildTimelineBlocksWithMeta(renderedTimeline = [], { fullTimeline = null, turnIndex = null } = {}) {
  const blocks = []
  const sourceTimeline = Array.isArray(fullTimeline) ? fullTimeline : renderedTimeline
  const resolvedTurnIndex = turnIndex && typeof turnIndex === 'object'
    ? turnIndex
    : buildTimelineTurnIndex(sourceTimeline)
  const activitiesByTurn = resolvedTurnIndex.activitiesByTurn instanceof Map
    ? resolvedTurnIndex.activitiesByTurn
    : new Map()
  const firstEventIdByTurn = resolvedTurnIndex.firstEventIdByTurn instanceof Map
    ? resolvedTurnIndex.firstEventIdByTurn
    : new Map()
  const fileChangesByTurn = resolvedTurnIndex.fileChangesByTurn instanceof Map
    ? resolvedTurnIndex.fileChangesByTurn
    : new Map()
  const assistantMessageTurnIds = new Set()
  for (const entry of renderedTimeline) {
    if (!(entry?.kind === 'message' && entry?.message?.role === 'assistant')) continue
    const turnId = String(entry?.message?.streamMeta?.turnId || '').trim()
    if (turnId) assistantMessageTurnIds.add(turnId)
  }

  const seenTurnIds = new Set()
  const pendingRunbooksByTurn = new Map()
  const runbookTurnIds = []
  let lastRunbookIndex = -1

  for (const entry of renderedTimeline) {
    if (entry?.kind === 'tool' && entry?.activity) {
      const turnId = String(entry.activity.turnId || '').trim()
      if (turnId && !seenTurnIds.has(turnId)) {
        seenTurnIds.add(turnId)
        const runbookBlock = {
          kind: 'runbook',
          id: `runbook:${turnId}:${firstEventIdByTurn.get(turnId) || String(entry.id || '') || blocks.length}`,
          turnId,
          activities: activitiesByTurn.get(turnId) || [],
          fileChanges: fileChangesByTurn.get(turnId) || [],
        }
        const existingAssistantBlockIndex = blocks.findIndex((block) => (
          block?.kind === 'entry'
          && block?.entry?.kind === 'message'
          && block?.entry?.message?.role === 'assistant'
          && String(block.entry.message?.streamMeta?.turnId || '').trim() === turnId
        ))
        if (existingAssistantBlockIndex >= 0) {
          blocks.splice(existingAssistantBlockIndex + 1, 0, runbookBlock)
          runbookTurnIds.push(turnId)
        } else if (assistantMessageTurnIds.has(turnId)) pendingRunbooksByTurn.set(turnId, runbookBlock)
        else {
          blocks.push(runbookBlock)
          runbookTurnIds.push(turnId)
        }
      }
      continue
    }

    blocks.push({
      kind: 'entry',
      id: String(entry?.id || `entry-${blocks.length}`),
      entry,
    })

    if (entry?.kind === 'message' && entry?.message?.role === 'assistant') {
      const turnId = String(entry?.message?.streamMeta?.turnId || '').trim()
      if (!turnId) continue
      const runbookBlock = pendingRunbooksByTurn.get(turnId)
      if (!runbookBlock) continue
      blocks.push(runbookBlock)
      runbookTurnIds.push(turnId)
      pendingRunbooksByTurn.delete(turnId)
    }
  }

  for (const [turnId, block] of pendingRunbooksByTurn.entries()) {
    blocks.push(block)
    runbookTurnIds.push(turnId)
  }

  lastRunbookIndex = blocks.reduce(
    (resolved, block, index) => (block?.kind === 'runbook' ? index : resolved),
    -1,
  )

  return {
    blocks,
    meta: {
      assistantMessageTurnIds: Array.from(assistantMessageTurnIds),
      runbookTurnIds,
      lastRunbookIndex,
    },
  }
}

export function buildTimelineBlocks(renderedTimeline = [], options = {}) {
  return buildTimelineBlocksWithMeta(renderedTimeline, options).blocks
}

export function buildChatTimelineViewModel(timeline = [], { visibleCount = 0 } = {}) {
  const visibleTimeline = Array.isArray(timeline) ? timeline : []

  const visibleTimelineLength = visibleTimeline.length
  const normalizedVisibleCount = Math.max(0, Number(visibleCount || 0) || 0)
  const hiddenTimelineCount = Math.max(0, visibleTimelineLength - normalizedVisibleCount)
  const renderedTimeline = hiddenTimelineCount > 0
    ? visibleTimeline.slice(hiddenTimelineCount)
    : visibleTimeline
  const turnIndex = buildTimelineTurnIndex(visibleTimeline)
  const { blocks, meta } = buildTimelineBlocksWithMeta(renderedTimeline, {
    fullTimeline: visibleTimeline,
    turnIndex,
  })

  return {
    visibleTimelineLength,
    hiddenTimelineCount,
    timelineBlocks: blocks,
    timelineBlockMeta: meta,
  }
}

function normalizeMode(mode, fallbackMode = 'execute') {
  if (mode === 'plan' || mode === 'thinking' || mode === 'execute') return mode
  return fallbackMode === 'plan' || fallbackMode === 'thinking' || fallbackMode === 'execute'
    ? fallbackMode
    : 'execute'
}

export async function submitQuestionUserAnswer({
  request = null,
  answer = '',
  selectedOptionId = '',
  activeThreadId = '',
  sendMessage = () => false,
  respondQuestionUser = async () => ({}),
  clearPendingQuestionUser = () => {},
  setPendingQuestionUser = () => {},
  pushNotice = () => {},
} = {}) {
  const normalizedAnswer = String(answer || '').trim()
  if (!normalizedAnswer) return false

  const normalizedRequest = request && typeof request === 'object' ? request : null
  const source = String(normalizedRequest?.source || 'local_tool').trim().toLowerCase()
  const threadId = String(normalizedRequest?.threadId || activeThreadId || '').trim()
  const threadOptions = threadId ? { threadId } : undefined

  if (source === 'openai_account_bridge') {
    if (normalizedRequest?.responsePending === true) return false
    const requestId = String(normalizedRequest?.requestId || '').trim()
    if (!threadId || !requestId) {
      pushNotice({
        type: 'warning',
        text: 'This clarification request is no longer valid. Retry the turn if it still needs input.',
        ...(threadId ? { threadId } : {}),
      })
      clearPendingQuestionUser(threadOptions)
      return false
    }
    setPendingQuestionUser({
      ...(normalizedRequest || {}),
      responsePending: true,
    }, threadOptions)
    try {
      await respondQuestionUser({
        threadId,
        requestId,
        answer: normalizedAnswer,
        selectedOptionId: String(selectedOptionId || '').trim(),
      })
      return true
    } catch (error) {
      setPendingQuestionUser({
        ...(normalizedRequest || {}),
        responsePending: false,
      }, threadOptions)
      pushNotice({
        type: 'warning',
        text: String(error?.message || 'Could not send the clarification answer.'),
        ...(threadId ? { threadId } : {}),
      })
      return false
    }
  }

  const sent = sendMessage(normalizedAnswer, normalizeMode(normalizedRequest?.originMode, 'execute'))
  if (sent) clearPendingQuestionUser(threadOptions)
  return sent
}

export function executeSendMessage({
  rawContent,
  modeOverride,
  options = {},
  isStreaming = false,
  selectedProvider = '',
  selectedModel = '',
  selectedProviderManifest = null,
  activeThreadId = '',
  projectFolder = '',
  permissionMode = 'ask',
  chatMode = 'execute',
  processingMode = 'standard',
  memoryCompressionEnabled = false,
  memoryCompressionThreshold = 0,
  activeProjectId = '',
  attachedImagesRef = { current: [] },
  consumePendingContextPrefix = () => null,
  addUserMessage = () => '',
  setAttachedImages = () => {},
  addAssistantPlaceholder = () => {},
  getChatState = () => ({ messages: [] }),
  chatStream = () => {},
  autoTitleThread = null,
} = {}) {
  void isStreaming
  if (!selectedProvider) return false
  if (!activeThreadId) return false
  if (cursorExecutionIsBlocked(selectedProviderManifest, { chatMode: modeOverride || chatMode, permissionMode })) {
    return false
  }

  const content = String(rawContent ?? '').trim()
  const pendingImagesSnapshot = Array.isArray(attachedImagesRef?.current)
    ? attachedImagesRef.current
    : []
  if (!content && pendingImagesSnapshot.length === 0) return false

  const historyRole = options?.historyRole === 'system' ? 'system' : 'user'
  const echoUser = options?.echoUser !== false
  const echoAssistant = options?.echoAssistant !== false
  const omitTurnHistoryMessage = options?.omitTurnHistoryMessage === true
  const currentUserMessage = Object.prototype.hasOwnProperty.call(options || {}, 'currentUserMessage')
    ? String(options.currentUserMessage ?? '')
    : historyRole === 'user'
      ? (content || summarizePendingAttachments(pendingImagesSnapshot))
      : ''

  const state = getChatState() || { messages: [] }
  const preserveHistory = options?.turnOptions?.command?.preserveHistory !== false
  const priorMessages = Array.isArray(state.messages)
    && preserveHistory
    ? state.messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.status !== 'background_pending')
      .map((m) => sanitizeHistoryMessageForModel(m))
      .filter(Boolean)
    : []
  const activeMode = normalizeMode(modeOverride, chatMode)
  const contextPrefix = consumePendingContextPrefix({ threadId: activeThreadId })
  const hiddenPreludeMessage = buildHiddenPreludeHistoryMessage(contextPrefix)
  const extraHiddenPreludeMessages = Array.isArray(options.hiddenPreludeMessages)
    ? options.hiddenPreludeMessages.filter((m) => m && typeof m === 'object' && m.role && m.content)
    : []

  const baseUserContent = (historyRole === 'user' && pendingImagesSnapshot.length > 0)
    ? [
      ...(content ? [{ type: 'text', text: content }] : []),
      ...pendingImagesSnapshot.map((attachment) => buildAttachmentPart(attachment)),
    ]
    : content

  let userContent = baseUserContent
  if (Object.prototype.hasOwnProperty.call(options || {}, 'historyContentOverride')) {
    const overrideContent = options.historyContentOverride
    if (historyRole === 'user' && pendingImagesSnapshot.length > 0 && typeof overrideContent === 'string') {
      userContent = [
        ...(overrideContent ? [{ type: 'text', text: overrideContent }] : []),
        ...pendingImagesSnapshot.map((attachment) => buildAttachmentPart(attachment)),
      ]
    } else {
      userContent = overrideContent
    }
  }
  const echoedUserContent = Object.prototype.hasOwnProperty.call(options || {}, 'displayContentOverride')
    ? options.displayContentOverride
    : userContent

  const threadOptions = activeThreadId ? { threadId: activeThreadId } : undefined
  const turnId = echoUser ? addUserMessage(echoedUserContent, threadOptions) : ''
  setAttachedImages([])
  const assistantId = echoAssistant ? addAssistantPlaceholder(threadOptions) : ''

  const history = [
    ...priorMessages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.role === 'assistant' && normalizeAssistantPhase(m.phase)
        ? { phase: normalizeAssistantPhase(m.phase) }
        : {}),
    })),
    ...(hiddenPreludeMessage ? [hiddenPreludeMessage] : []),
    ...extraHiddenPreludeMessages,
    ...(!omitTurnHistoryMessage ? [{ role: historyRole, content: userContent }] : []),
  ]

  const mergedTurnOptions = {
    ...(options?.turnOptions && typeof options.turnOptions === 'object' ? options.turnOptions : {}),
    processingMode: normalizeProviderProcessingMode(processingMode),
  }

  chatStream(
    selectedProvider,
    selectedModel,
    history,
    projectFolder,
    permissionMode,
    activeMode,
    memoryCompressionEnabled,
    memoryCompressionThreshold,
    activeProjectId || '',
    activeThreadId || '',
    turnId || '',
    currentUserMessage,
    assistantId,
    mergedTurnOptions,
  )
  if (historyRole === 'user' && echoUser && content && typeof autoTitleThread === 'function') {
    void Promise.resolve(autoTitleThread({
      projectId: activeProjectId,
      threadId: activeThreadId,
      prompt: currentUserMessage,
    })).catch(() => {})
  }
  return true
}

export async function executeCompactionCommand({
  rawContent,
  modeOverride,
  options = {},
  providerId = '',
  isStreaming = false,
  activeThreadId = '',
  addUserMessage = () => '',
  addAssistantPlaceholder = () => '',
  markError = () => {},
  parseCompactionCommandFn = () => null,
  sendMessage = () => false,
} = {}) {
  if (isStreaming) return false
  if (!activeThreadId) return false

  const content = String(rawContent ?? '').trim()
  if (!content) return false

  const parsed = parseCompactionCommandFn(content, { providerId })
  if (!parsed) return false

  if (!parsed.ok) {
    const threadOptions = activeThreadId ? { threadId: activeThreadId } : undefined
    addUserMessage(content, threadOptions)
    const assistantId = addAssistantPlaceholder(threadOptions)
    markError(assistantId, parsed.message || 'Invalid compaction command.', threadOptions)
    return true
  }

  return sendMessage(content, modeOverride, {
    ...options,
    displayContentOverride: content,
    historyContentOverride: String(parsed.prompt || ''),
    currentUserMessage: String(parsed.prompt || ''),
    omitTurnHistoryMessage: !String(parsed.prompt || '').trim(),
    turnOptions: buildToolFreeCommandTurnOptions(parsed.turnOptions || {}),
  })
}

export async function executeOrchestratedAgentCommand({
  rawContent,
  isStreaming = false,
  activeThreadId = '',
  projectFolder = '',
  addUserMessage = () => '',
  addAssistantPlaceholder = () => '',
  markError = () => {},
  isDirectAgentCommandTextFn = () => false,
  parseDirectAgentCommandFn = () => null,
  moaRoles = [],
  sendMessage = async () => false,
} = {}) {
  if (isStreaming) return false
  if (!activeThreadId) return false
  if (!projectFolder) return false

  const content = String(rawContent ?? '').trim()
  if (!content || !isDirectAgentCommandTextFn(content)) return false

  const parsed = parseDirectAgentCommandFn(content, moaRoles)
  if (!parsed) return false

  if (!parsed.ok) {
    const threadOptions = activeThreadId ? { threadId: activeThreadId } : undefined
    addUserMessage(content, threadOptions)
    const assistantId = addAssistantPlaceholder(threadOptions)
    markError(assistantId, parsed.message || 'Invalid agent command.', threadOptions)
    return true
  }

  await sendMessage(content, 'execute', {
    turnOptions: {
      requiredAgentDelegation: {
        route: parsed.route,
        tasks: parsed.tasks,
      },
    },
  })
  return true
}

export function buildRequiredAgentDelegationTurnOptions(parsed = {}) {
  if (!parsed?.ok || !Array.isArray(parsed?.tasks) || parsed.tasks.length === 0) return null
  return {
    requiredAgentDelegation: {
      route: parsed.route,
      tasks: parsed.tasks,
    },
  }
}

export function applyChatCommandPaletteEvent({
  event = null,
  handledEventIdRef,
  focusComposerDraftInput = () => {},
  handleJumpToLatest = () => {},
  handleCreateThread = async () => {},
  handleRenameThread = async () => {},
  openDeleteThreadModal = () => {},
  handleInjectSwitchContext = async () => {},
} = {}) {
  const eventId = String(event?.id || '').trim()
  if (!eventId) return false
  if (handledEventIdRef?.current === eventId) return false
  if (handledEventIdRef) handledEventIdRef.current = eventId

  const type = String(event?.type || '').trim()
  if (!type) return false

  if (type === 'chat.focusComposer') {
    focusComposerDraftInput()
    return true
  }
  if (type === 'chat.jumpToLatest') {
    handleJumpToLatest()
    return true
  }
  if (type === 'chat.thread.new') {
    void handleCreateThread()
    return true
  }
  if (type === 'chat.thread.rename') {
    void handleRenameThread()
    return true
  }
  if (type === 'chat.thread.delete') {
    openDeleteThreadModal()
    return true
  }
  if (type === 'chat.inject.memory') {
    void handleInjectSwitchContext('memory')
    return true
  }
  if (type === 'chat.inject.artifacts') {
    void handleInjectSwitchContext('artifacts')
    return true
  }
  if (type === 'chat.inject.both') {
    void handleInjectSwitchContext('both')
    return true
  }
  return false
}
