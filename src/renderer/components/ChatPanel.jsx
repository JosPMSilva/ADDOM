import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import useChatStore from '../store/useChatStore.js'
import useVaultStore from '../store/useVaultStore.js'
import useAppStore from '../store/useAppStore.js'
import useWorkspaceStore from '../store/useWorkspaceStore.js'
import useTerminalStore from '../store/useTerminalStore.js'
import { normalizePermissionMode } from '../../common/chat/permission-mode.mjs'
import { providerIsSelectable } from './chat/provider-model-selector-view-model.mjs'
import { savePermissionModeSelection } from './permission-mode-persistence.mjs'
import WriteConflictCard from './chat/WriteConflictCard.jsx'
import { useProviderSwitchContextAction } from './chat/use-provider-switch-context-action.mjs'
import useBackgroundJobs from './chat/useBackgroundJobs.js'
import {
  CHAT_TIMELINE_WINDOW_SIZE,
} from './chat/chat-utils.js'
import { threadSessionHasLiveState } from '../store/chat/thread-session-store-utils.mjs'
import { useShallow } from 'zustand/react/shallow'
import {
  buildContextMeterUsage,
  buildTimelineBlocksWithMeta,
  buildTimelineTurnIndex,
  applyChatCommandPaletteEvent,
  resolveAttachmentCapabilityGates,
  submitQuestionUserAnswer,
} from './chat/chat-panel-helpers.mjs'
import { buildChatComposerPlaceholder } from './chat/chat-panel-composer-placeholder.mjs'
import { useChatPanelComposerActions } from './chat/use-chat-panel-composer-actions.mjs'
import { useChatPanelThreadActions } from './chat/use-chat-panel-thread-actions.mjs'
import { useChatPanelComposerDraftState } from './chat/use-chat-panel-composer-draft-state.mjs'
import { useChatPanelOpenAIKnowledgeBase } from './chat/use-chat-panel-openai-knowledge-base.mjs'
import { useChatPanelBottomAnchor } from './chat/use-chat-panel-bottom-anchor.mjs'
import { useChatPanelAgentRoles } from './chat/use-chat-panel-agent-roles.mjs'
import ChatPanelView from './chat/ChatPanelView.jsx'
import { useChatPanelTerminalMemorySuggestion } from './chat/use-chat-panel-terminal-memory-suggestion.mjs'
import { useChatPanelAttachmentTextRuntime } from './chat/use-chat-panel-attachment-runtime.mjs'
import { useChatPanelOpenAIRateLimits } from './chat/use-chat-panel-openai-rate-limits.mjs'
import { stopCurrentTurnOptimistically } from './chat/chat-panel-stop-turn.mjs'
import { useChatPanelPerfDebug } from './chat/use-chat-panel-perf-debug.mjs'
import { useInterruptedTurnContinuation } from './chat/use-interrupted-turn-continuation.js'
import { useWorkspaceRailActivitySummary } from './workspace/use-workspace-rail-activity-summary.js'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'
import { useThreadPromotionOrigin } from './chat/use-thread-promotion-origin.mjs'

const EMPTY_LIVE_EXECUTION_TURNS = Object.freeze({})
export default function ChatPanel({
  workspaceRailEnabled = false,
  workspaceRailOpen = true,
  onOpenWorkspaceRail,
}) {
  const { t } = useRendererTranslation(['core'])
  const {
    messages,
    timeline,
    liveExecutionTurns,
    streamingId,
    selectedProvider,
    selectedModel,
    providerSwitchHint,
    contextUsage,
    notices,
    addUserMessage,
    addAssistantPlaceholder,
    finalizeMessage,
    markError,
    clearToolActivity,
    pushToolActivity,
    dismissProviderSwitchHint,
    setPendingContextPrefix,
    consumePendingContextPrefix,
    setPendingQuestionUser,
    clearPendingQuestionUser,
    resolveWriteConflict,
    dismissWriteConflict,
    setConflictMergeProposal,
    dismissNotice,
    suppressNoticeForSession,
    setSelectedProvider,
    setSelectedModel,
  } = useChatStore(useShallow((s) => ({
    messages: s.messages,
    timeline: s.timeline,
    liveExecutionTurns: s.liveExecution?.turnsById || EMPTY_LIVE_EXECUTION_TURNS,
    streamingId: s.streamingId,
    selectedProvider: s.selectedProvider,
    selectedModel: s.selectedModel,
    providerSwitchHint: s.providerSwitchHint,
    contextUsage: s.contextUsage,
    notices: s.notices,
    setChatMode: s.setChatMode,
    addUserMessage: s.addUserMessage,
    addAssistantPlaceholder: s.addAssistantPlaceholder,
    finalizeMessage: s.finalizeMessage,
    markError: s.markError,
    clearToolActivity: s.clearToolActivity,
    pushToolActivity: s.pushToolActivity,
    dismissProviderSwitchHint: s.dismissProviderSwitchHint,
    setPendingContextPrefix: s.setPendingContextPrefix,
    consumePendingContextPrefix: s.consumePendingContextPrefix,
    setPendingQuestionUser: s.setPendingQuestionUser,
    clearPendingQuestionUser: s.clearPendingQuestionUser,
    resolveWriteConflict: s.resolveWriteConflict,
    dismissWriteConflict: s.dismissWriteConflict,
    setConflictMergeProposal: s.setConflictMergeProposal,
    dismissNotice: s.dismissNotice,
    suppressNoticeForSession: s.suppressNoticeForSession,
    setSelectedProvider: s.setSelectedProvider,
    setSelectedModel: s.setSelectedModel,
  })))
  const pushNotice = useChatStore((s) => s.pushNotice)
  const pendingQuestionUser = useChatStore((s) => s.pendingQuestionUser)
  const writeConflicts = useChatStore((s) => s.writeConflicts)
  const {
    threadSuggestionArchivesByThreadId,
    threadSuggestionArchivesPendingByThreadId,
    refreshThreadSuggestionArchives,
    dismissArchivedSessionSuggestion,
    acceptArchivedSessionSuggestion,
  } = useTerminalStore(useShallow((s) => ({
    threadSuggestionArchivesByThreadId: s.threadSuggestionArchivesByThreadId || {},
    threadSuggestionArchivesPendingByThreadId: s.threadSuggestionArchivesPendingByThreadId || {},
    refreshThreadSuggestionArchives: s.refreshThreadSuggestionArchives,
    dismissArchivedSessionSuggestion: s.dismissArchivedSessionSuggestion,
    acceptArchivedSessionSuggestion: s.acceptArchivedSessionSuggestion,
  })))

  const { providers, loaded, refreshing, loadProviders, openAIAccountHasSession, refreshOpenAIAccountState } = useVaultStore(useShallow((s) => ({
    providers: s.providers,
    loaded: s.loaded,
    refreshing: s.refreshing,
    loadProviders: s.loadProviders,
    openAIAccountHasSession: s.openAIAccountSession?.hasSession === true,
    refreshOpenAIAccountState: s.refreshOpenAIAccountState,
  })))
  const {
    projectFolder,
    activeProjectId,
    activeThreadId,
    pendingChatDraftInjection,
    pendingManagedPlanTurnRequest,
    queueChatDraftInjection,
    commandPaletteEvent,
    clearPendingChatDraftInjection,
    clearPendingManagedPlanTurnRequest,
    permissionMode,
    setPermissionMode,
    inlineCompletionEnabled,
    memoryCompressionEnabled,
    memoryCompressionThreshold,
    includeGlobalMemoryInContext,
    liveExecutionStreamEnabled,
    modelCatalogVisibility,
    attachmentTextExtractionEnabled,
  } = useAppStore(useShallow((s) => ({
    projectFolder: s.projectFolder,
    activeProjectId: s.activeProjectId,
    activeThreadId: s.activeThreadId,
    pendingChatDraftInjection: s.pendingChatDraftInjection,
    pendingManagedPlanTurnRequest: s.pendingManagedPlanTurnRequest,
    queueChatDraftInjection: s.queueChatDraftInjection,
    commandPaletteEvent: s.commandPaletteEvent,
    clearPendingChatDraftInjection: s.clearPendingChatDraftInjection,
    clearPendingManagedPlanTurnRequest: s.clearPendingManagedPlanTurnRequest,
    permissionMode: s.permissionMode,
    setPermissionMode: s.setPermissionMode,
    inlineCompletionEnabled: s.inlineCompletionEnabled,
    memoryCompressionEnabled: s.memoryCompressionEnabled,
    memoryCompressionThreshold: s.memoryCompressionThreshold,
    includeGlobalMemoryInContext: s.includeGlobalMemoryInContext,
    liveExecutionStreamEnabled: s.liveExecutionStreamEnabled,
    modelCatalogVisibility: s.modelCatalogVisibility,
    attachmentTextExtractionEnabled: s.attachmentTextExtractionEnabled,
  })))
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const workspaceRailActivitySummary = useWorkspaceRailActivitySummary(workspaceRailEnabled)

  const {
    threads,
    setActiveThread,
    createThread,
    autoTitleThread,
    renameCurrentThread,
    deleteCurrentThread,
  } = useWorkspaceStore(useShallow((s) => ({
    threads: s.threads,
    setActiveThread: s.setActiveThread,
    createThread: s.createThread,
    autoTitleThread: s.autoTitleThread,
    renameCurrentThread: s.renameCurrentThread,
    deleteCurrentThread: s.deleteCurrentThread,
  })))

  const [jobsModalOpen, setJobsModalOpen] = useState(false)
  const [attachedImages, setAttachedImages] = useState([])
  const [attachmentTextExtractionRuntimeReady, setAttachmentTextExtractionRuntimeReady] = useState(false)
  const [permissionModeChangePending, setPermissionModeChangePending] = useState(false)
  const [timelineVisibleCount, setTimelineVisibleCount] = useState(CHAT_TIMELINE_WINDOW_SIZE)
  const [createThreadModalOpen, setCreateThreadModalOpen] = useState(false)
  const [newThreadTitle, setNewThreadTitle] = useState('New Thread')
  const [renameThreadModalOpen, setRenameThreadModalOpen] = useState(false)
  const [renameThreadTitle, setRenameThreadTitle] = useState('')

  const bottomRef = useRef(null)
  const composerInputRef = useRef(null)
  const timelineScrollRef = useRef(null)
  const attachedImagesRef = useRef([])
  const handledCommandPaletteEventIdRef = useRef('')

  const {
    composerDraftText,
    composerDraftSyncVersion,
    composerBlocksSyncVersion,
    setComposerDraftText,
    composerBlocks,
    setComposerBlocks,
    pendingEditorDraftPreludes,
    setPendingEditorDraftPreludes,
    composerDraftTextRef,
    composerBlocksRef,
    focusComposerDraftInput,
    syncComposerBlocks,
    setComposerFromMarkdownText,
    handleComposerDraftTextChange,
    hasComposerContent,
    isDirectAgentDraft,
  } = useChatPanelComposerDraftState({
    activeThreadId,
    pendingChatDraftInjection,
    clearPendingChatDraftInjection,
    setPendingContextPrefix,
    composerInputRef,
  })

  const {
    openAIProviderConfigured,
    openAIKnowledgeBaseBusyAttachmentIds,
    openAIKnowledgeBaseStateByAttachmentId,
    handleAddAttachmentToOpenAIKnowledgeBase,
  } = useChatPanelOpenAIKnowledgeBase({
    providers,
    activeProjectId,
    activeThreadId,
    pushNotice,
  })

  useEffect(() => {
    attachedImagesRef.current = attachedImages
  }, [attachedImages])

  const streamingMessage = useMemo(
    () => messages.find((m) => m.id === streamingId && m.role === 'assistant') || null,
    [messages, streamingId],
  )
  const {
    activeThread,
    activeThreadOrigin,
    originInspectionBusy,
    originInspectionError,
    handleInspectThreadOrigin,
  } = useThreadPromotionOrigin({ threads, activeThreadId, setActiveThread, t })
  const activeThreadIsEmpty = !!activeThreadId && timeline.length === 0
  const activeThreadHasConversationMessages = useMemo(
    () => messages.some((message) => {
      const role = String(message?.role || '').trim()
      return role === 'user' || role === 'assistant'
    }),
    [messages],
  )
  const activeThreadHasCompletedAssistantTurn = useMemo(
    () => messages.some((message) => {
      const role = String(message?.role || '').trim()
      if (role !== 'assistant') return false
      return String(message?.status || '').trim() !== 'streaming'
    }),
    [messages],
  )
  const activeThreadContextFallbackMode = useMemo(() => {
    if (!activeThreadId) return 'none'
    if (activeThreadIsEmpty) return 'empty_thread'
    if (!activeThreadHasCompletedAssistantTurn) return 'initial_turn'
    return 'none'
  }, [activeThreadHasCompletedAssistantTurn, activeThreadId, activeThreadIsEmpty])
  const activeThreadIsContextEmpty = !!activeThreadId && !activeThreadHasConversationMessages
  const unresolvedConflicts = useMemo(
    () => (Array.isArray(writeConflicts) ? writeConflicts : []).filter((c) => !c.resolved),
    [writeConflicts],
  )
  const visibleTimeline = useMemo(() => timeline, [timeline])
  const visibleTimelineLength = visibleTimeline.length
  const hiddenTimelineCount = Math.max(0, visibleTimelineLength - timelineVisibleCount)
  const renderedTimeline = useMemo(
    () => (hiddenTimelineCount > 0
      ? visibleTimeline.slice(hiddenTimelineCount)
      : visibleTimeline),
    [hiddenTimelineCount, visibleTimeline],
  )
  const timelineTurnIndex = useMemo(() => buildTimelineTurnIndex(visibleTimeline), [visibleTimeline])
  const { timelineBlocks, timelineBlockMeta } = useMemo(() => {
    const { blocks, meta } = buildTimelineBlocksWithMeta(renderedTimeline, { turnIndex: timelineTurnIndex })
    return {
      timelineBlocks: blocks,
      timelineBlockMeta: meta,
    }
  }, [renderedTimeline, timelineTurnIndex])

  const { showJumpToLatest, handleJumpToLatest } = useChatPanelBottomAnchor({
    activeThreadId,
    timeline,
    messages,
    streamingId,
    timelineScrollRef,
  })

  useEffect(() => {
    if (!Array.isArray(notices) || notices.length === 0) return undefined
    const first = notices[0]
    if (!first?.id) return undefined
    if (first?.meta?.action && typeof first.meta.action === 'object') return undefined
    const timer = setTimeout(() => {
      dismissNotice(first.id)
    }, 5000)
    return () => clearTimeout(timer)
  }, [notices, dismissNotice])

  useEffect(() => {
    setTimelineVisibleCount(CHAT_TIMELINE_WINDOW_SIZE)
  }, [activeThreadId])

  useEffect(() => {
    const threadId = String(activeThreadId || '').trim()
    const normalizedProjectFolder = String(projectFolder || '').trim()
    if (!threadId || !normalizedProjectFolder) return
    void refreshThreadSuggestionArchives({
      projectFolder: normalizedProjectFolder,
      threadId,
    })
  }, [activeThreadId, projectFolder, refreshThreadSuggestionArchives])

  const {
    composerAgentRoles,
    composerAgentRolesLoading,
    loadComposerAgentRoles,
  } = useChatPanelAgentRoles()

  const { devPerfEnabled, keydownStartRef } = useChatPanelPerfDebug({ composerDraftText })

  const {
    backgroundJobs,
    jobsLoading,
    jobsError,
    jobsLastUpdated,
    jobsStoppingId,
    refreshBackgroundJobs,
    handleStopBackgroundJob,
    handleStopAllBackgroundJobs,
  } = useBackgroundJobs({
    jobsModalOpen,
    pushToolActivity,
  })

  const {
    handleThreadSelect,
    handleCreateThread,
    handleCreateThreadSubmit,
    handleRenameThread,
    handleRenameThreadSubmit,
    openDeleteThreadModal,
  } = useChatPanelThreadActions({
    activeThreadId,
    activeThread,
    setActiveThread,
    createThread,
    renameCurrentThread,
    deleteCurrentThread,
    clearToolActivity,
    setCreateThreadModalOpen,
    setNewThreadTitle,
    newThreadTitle,
    setRenameThreadModalOpen,
    setRenameThreadTitle,
    renameThreadTitle,
  })

  const handleContinueInterruptedTurn = useInterruptedTurnContinuation({
    activeThreadId,
    clearPendingChatDraftInjection,
    continuationText: t('core:executionStream.actions.continueDraft', {
      defaultValue: 'Continue from the saved context.',
    }),
    queueChatDraftInjection,
    setActiveThread,
  })

  const configuredProvidersCount = useMemo(
    () => providers.filter((provider) => providerIsSelectable(provider)).length,
    [providers],
  )
  const isStreaming = useMemo(() => threadSessionHasLiveState({
    streamingId,
    messages,
    liveExecution: {
      turnsById: liveExecutionTurns,
    },
  }), [liveExecutionTurns, messages, streamingId])
  const canSend = !!activeThreadId
    && (hasComposerContent || attachedImages.length > 0)
    && (
      !!selectedProvider
      || isDirectAgentDraft
    )
  const activeProviderManifest = useMemo(
    () => providers.find((p) => p.id === selectedProvider) || null,
    [providers, selectedProvider],
  )
  const activeModelManifest = useMemo(
    () => activeProviderManifest?.models?.find((m) => m.id === selectedModel) || null,
    [activeProviderManifest, selectedModel],
  )
  const selectedModelMissing = !!selectedProvider && !!selectedModel && !!activeProviderManifest && !activeModelManifest
  const selectedProviderAuthMethod = String(activeProviderManifest?.authMethod || '').trim().toLowerCase()
  const { refreshOpenAIAccountRateLimits, shouldTrackOpenAIAccountRateLimits } = useChatPanelOpenAIRateLimits({
    activeProjectId,
    activeThreadId,
    isStreaming,
    openAIAccountHasSession,
    projectFolder,
    refreshOpenAIAccountState,
    selectedProvider,
    selectedProviderAuthMethod,
  })
  const contextMeterUsage = useMemo(
    () => buildContextMeterUsage(contextUsage, activeModelManifest, {
      accountThreadEstimate: (
        String(selectedProvider || '').trim().toLowerCase() === 'openai'
        && selectedProviderAuthMethod === 'account'
        && openAIAccountHasSession === true
      ),
      threadIsEmpty: activeThreadIsContextEmpty,
    }),
    [
      activeThreadIsContextEmpty,
      activeModelManifest,
      contextUsage,
      openAIAccountHasSession,
      selectedProvider,
      selectedProviderAuthMethod,
    ],
  )
  const writeConflictCards = useMemo(() => (
    unresolvedConflicts.length > 0 ? (
      <div className="space-y-3">
        {unresolvedConflicts.map((conflict) => (
          <WriteConflictCard
            key={conflict.id}
            conflict={conflict}
            projectFolder={projectFolder}
            providerId={selectedProvider}
            model={selectedModel}
            onResolve={resolveWriteConflict}
            onDismiss={dismissWriteConflict}
            onSetMergeProposal={setConflictMergeProposal}
          />
        ))}
      </div>
    ) : null
  ), [
    dismissWriteConflict,
    projectFolder,
    resolveWriteConflict,
    selectedModel,
    selectedProvider,
    setConflictMergeProposal,
    unresolvedConflicts,
  ])
  const { terminalMemorySuggestionCard } = useChatPanelTerminalMemorySuggestion({
    activeThreadId, isStreaming, threadSuggestionArchivesByThreadId,
    threadSuggestionArchivesPendingByThreadId, acceptArchivedSessionSuggestion,
    dismissArchivedSessionSuggestion, pushNotice,
  })

  const attachmentCapability = useMemo(() => resolveAttachmentCapabilityGates({
    providerId: selectedProvider,
    modelManifest: activeModelManifest,
    attachmentTextExtractionEnabled,
    attachmentTextExtractionRuntimeReady,
  }), [
    selectedProvider,
    activeModelManifest,
    attachmentTextExtractionEnabled,
    attachmentTextExtractionRuntimeReady,
  ])
  const {
    nativeFileAttachmentsEnabled,
    fileAttachmentsEnabled,
    imageAttachmentsEnabled,
    attachmentsEnabled,
  } = attachmentCapability

  useChatPanelAttachmentTextRuntime({
    attachmentTextExtractionEnabled, selectedProvider, selectedModel,
    nativeFileAttachmentsEnabled, setAttachmentTextExtractionRuntimeReady,
  })

  const {
    handleComposerPaste,
    handleComposerDrop,
    handleComposerFilesSelected,
    sendMessage,
    send,
    handleInsertDirectAgentTarget,
    handleKeyDown,
    focusComposerInput,
  } = useChatPanelComposerActions({
    fileAttachmentsEnabled,
    imageAttachmentsEnabled,
    isStreaming,
    canSend,
    selectedProvider,
    selectedModel,
    selectedProviderManifest: activeProviderManifest,
    projectFolder,
    activeProjectId,
    activeThreadId,
    permissionMode,
    memoryCompressionEnabled,
    memoryCompressionThreshold,
    attachedImagesRef,
    setAttachedImages,
    consumePendingContextPrefix,
    addUserMessage,
    addAssistantPlaceholder,
    finalizeMessage,
    markError,
    getChatState: () => useChatStore.getState().getThreadState(activeThreadId),
    autoTitleThread,
    pendingEditorDraftPreludes,
    setPendingEditorDraftPreludes,
    pushNotice,
    composerBlocksRef,
    composerDraftTextRef,
    setComposerDraftText,
    setComposerBlocks,
    setComposerFromMarkdownText,
    composerInputRef,
    devPerfEnabled,
    keydownStartRef,
  })

  const handleNoticeAction = useCallback((notice) => {
    const action = notice?.meta?.action && typeof notice.meta.action === 'object'
      ? notice.meta.action
      : null
    const actionType = String(action?.type || '').trim().toLowerCase()
    if (actionType === 'open_settings_target') {
      const payload = action?.payload && typeof action.payload === 'object' ? action.payload : {}
      openSettingsTarget(payload)
      if (notice?.id) dismissNotice(notice.id)
    }
  }, [dismissNotice, openSettingsTarget])

  const handlePermissionModeChange = useCallback(async (nextMode) => {
    if (permissionModeChangePending) return
    const normalizedMode = normalizePermissionMode(nextMode)
    if (normalizedMode === permissionMode) return

    setPermissionModeChangePending(true)
    try {
      const result = await savePermissionModeSelection({
        nextMode: normalizedMode,
        currentPermissionMode: permissionMode,
        settingsApi: window?.addom?.settings ?? null,
      })
      setPermissionMode(result.permissionMode)
      if (result.status === 'failed') {
        pushNotice({
          type: 'warning',
          text: 'Could not save permission mode. Restored the last saved value.',
          threadId: activeThreadId,
        })
      }
    } finally {
      setPermissionModeChangePending(false)
    }
  }, [activeThreadId, permissionMode, permissionModeChangePending, pushNotice, setPermissionMode])

  const handleRefreshProviders = useCallback(() => {
    if (shouldTrackOpenAIAccountRateLimits) {
      void refreshOpenAIAccountRateLimits({ refreshProviders: true, background: false })
      return
    }
    loadProviders(true)
  }, [loadProviders, refreshOpenAIAccountRateLimits, shouldTrackOpenAIAccountRateLimits])

  const handleOpenJobsModal = useCallback(() => {
    setJobsModalOpen(true)
  }, [])

  const handleSubmitQuestionUserAnswer = useCallback(async (answer, meta = {}) => {
    await submitQuestionUserAnswer({
      request: pendingQuestionUser,
      answer,
      selectedOptionId: meta?.selectedOptionId,
      activeThreadId,
      sendMessage,
      respondQuestionUser: (payload = {}) => window.addom.chat.respondQuestionUser(payload),
      clearPendingQuestionUser,
      setPendingQuestionUser,
      pushNotice,
    })
  }, [
    activeThreadId,
    clearPendingQuestionUser,
    pendingQuestionUser,
    pushNotice,
    sendMessage,
    setPendingQuestionUser,
  ])

  useEffect(() => {
    const threadId = String(activeThreadId || '').trim()
    if (!threadId || typeof window?.addom?.chat?.getPendingQuestionUser !== 'function') return undefined
    let cancelled = false
    window.addom.chat.getPendingQuestionUser(threadId)
      .then((request) => {
        if (cancelled) return
        if (request) {
          setPendingQuestionUser(request, { threadId })
          return
        }
        const currentPending = useChatStore.getState().getThreadState(threadId)?.pendingQuestionUser || null
        if (String(currentPending?.source || '').trim().toLowerCase() === 'openai_account_bridge') {
          clearPendingQuestionUser({ threadId })
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeThreadId, clearPendingQuestionUser, setPendingQuestionUser])

  const handleCloseJobsModal = useCallback(() => {
    setJobsModalOpen(false)
  }, [])

  const handleCloseCreateThreadModal = useCallback(() => {
    setCreateThreadModalOpen(false)
  }, [])

  const handleCloseRenameThreadModal = useCallback(() => {
    setRenameThreadModalOpen(false)
  }, [])

  const handleStopCurrentTurn = useCallback(() => {
    stopCurrentTurnOptimistically({
      activeThreadId,
      streamingMessage,
      liveExecutionTurns,
      finalizeMessage,
      pushToolActivity,
      cancel: (...args) => window.addom.chat.cancel(...args),
    })
  }, [activeThreadId, finalizeMessage, liveExecutionTurns, pushToolActivity, streamingMessage])

  const handleSend = useCallback(() => {
    if (shouldTrackOpenAIAccountRateLimits) {
      void refreshOpenAIAccountRateLimits({ refreshProviders: false, background: true })
    }
    void send()
  }, [refreshOpenAIAccountRateLimits, send, shouldTrackOpenAIAccountRateLimits])

  const handlePlanLifecycleAction = useCallback((planAction) => sendMessage(
    'Internal Plan lifecycle action',
    'plan',
    {
      echoUser: false,
      echoAssistant: false,
      omitTurnHistoryMessage: true,
      currentUserMessage: '',
      turnOptions: { planAction },
    },
  ), [sendMessage])

  useEffect(() => {
    const request = pendingManagedPlanTurnRequest
    if (!request || request.threadId !== activeThreadId || isStreaming) return
    let started = false
    if (request.kind === 'revise_plan' && request.planAction) {
      useChatStore.getState().setChatMode('plan')
      started = handlePlanLifecycleAction(request.planAction)
    } else if (request.kind === 'implement_plan' && request.handoff && request.content) {
      useChatStore.getState().setChatMode('execute')
      const handoff = JSON.stringify(request.handoff)
      started = sendMessage([
        '[ADDOM Accepted Managed Plan]',
        handoff,
        'Implement this exact accepted managed plan revision now.',
        'Managed Plan.md:',
        request.content,
      ].join('\n'), 'execute', {
        echoUser: false,
        currentUserMessage: '',
      })
    }
    if (started) clearPendingManagedPlanTurnRequest(request.id)
  }, [
    activeThreadId,
    clearPendingManagedPlanTurnRequest,
    handlePlanLifecycleAction,
    isStreaming,
    pendingManagedPlanTurnRequest,
    sendMessage,
  ])

  const { contextActionBusy, handleInjectSwitchContext } = useProviderSwitchContextAction({
    projectFolder,
    activeThreadId,
    includeGlobalMemoryInContext,
    setPendingContextPrefix,
    dismissProviderSwitchHint,
    pushToolActivity,
  })

  useEffect(() => {
    applyChatCommandPaletteEvent({
      event: commandPaletteEvent,
      handledEventIdRef: handledCommandPaletteEventIdRef,
      focusComposerDraftInput,
      handleJumpToLatest,
      handleCreateThread,
      handleRenameThread,
      openDeleteThreadModal,
      handleInjectSwitchContext,
    })
  }, [
    commandPaletteEvent,
    focusComposerDraftInput,
    handleJumpToLatest,
    handleCreateThread,
    handleRenameThread,
    openDeleteThreadModal,
    handleInjectSwitchContext,
  ])

  const actionsDisabled = isStreaming || contextActionBusy
  const composerPlaceholder = buildChatComposerPlaceholder({
    selectedProvider,
    activeThreadId,
    isStreaming,
  })

  const viewProps = {
    workspaceRailEnabled, workspaceRailOpen, onOpenWorkspaceRail, workspaceRailActivitySummary,
    activeThreadTitle: String(activeThread?.title || '').trim(), timelineLength: timeline.length,
    activeThreadOrigin, originInspectionBusy, originInspectionError, handleInspectThreadOrigin,
    activeThreadId, permissionMode, permissionModeChangePending, handlePermissionModeChange, activeThreadIsEmpty, activeThreadContextFallbackMode, providerSwitchHint, actionsDisabled, handleInjectSwitchContext,
    dismissProviderSwitchHint, handleCreateThread, timelineScrollRef, notices, dismissNotice, suppressNoticeForSession, handleNoticeAction, hiddenTimelineCount, setTimelineVisibleCount,
    visibleTimelineLength, streamingMessage, configuredProvidersCount, timelineBlocks, timelineBlockMeta, liveExecutionTurns, liveExecutionStreamEnabled, handleContinueInterruptedTurn, projectFolder,
    isStreaming, jobsModalOpen, backgroundJobs,
    jobsLoading, jobsError, jobsLastUpdated, jobsStoppingId, refreshBackgroundJobs, handleStopBackgroundJob, handleStopAllBackgroundJobs, handleCloseJobsModal, createThreadModalOpen, newThreadTitle,
    setNewThreadTitle, handleCreateThreadSubmit, handleCloseCreateThreadModal, renameThreadModalOpen, renameThreadTitle, setRenameThreadTitle, handleRenameThreadSubmit, handleCloseRenameThreadModal,
    bottomRef, terminalMemorySuggestionCard, writeConflictCards, showJumpToLatest, handleJumpToLatest, handleComposerPaste, handleComposerDrop,
    attachmentsEnabled, fileAttachmentsEnabled, imageAttachmentsEnabled, selectedProvider, selectedModel, modelCatalogVisibility, inlineCompletionEnabled, selectedModelMissing, loaded, refreshing,
    setSelectedProvider, setSelectedModel, handleRefreshProviders, pushNotice, contextMeterUsage, threads, handleThreadSelect, handleRenameThread, providers,
    handleOpenJobsModal, commandPaletteEvent, composerInputRef, composerBlocks, composerBlocksSyncVersion, composerDraftText, composerDraftSyncVersion, handleComposerDraftTextChange,
    syncComposerBlocks, handleKeyDown, composerPlaceholder, canSend, composerAgentRoles, composerAgentRolesLoading, loadComposerAgentRoles, handleInsertDirectAgentTarget, focusComposerInput, pendingQuestionUser,
    handleSubmitQuestionUserAnswer, handleSend, handleStopCurrentTurn, attachedImages, handleComposerFilesSelected, setAttachedImages, openAIProviderConfigured, activeProjectId, openAIKnowledgeBaseStateByAttachmentId, openAIKnowledgeBaseBusyAttachmentIds,
    handleAddAttachmentToOpenAIKnowledgeBase, handlePlanLifecycleAction,
  }

  return <ChatPanelView {...viewProps} />
}
