import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import ChatComposer from './ChatComposer.jsx'
import { MemoChatComposerControlRail as ChatComposerControlRail } from './ChatComposerControlRail.jsx'
import ConversationComposerFoundation, {
  ConversationComposerInputSurface,
} from './ConversationComposerFoundation.jsx'
import { ChatModeFooterTip } from './ChatModeControls.jsx'
import QuestionUserCard from './QuestionUserCard.jsx'
import PlanDirectionCard from './PlanDirectionCard.jsx'
import McpElicitationCardHost from './McpElicitationCardHost.jsx'
import useMoaPipelineProgress from '../../hooks/use-moa-pipeline-progress.mjs'
import useMoaCouncilProgress from '../../hooks/use-moa-council-progress.mjs'
import { resolveQuestionUserCardDisabled } from './chat-panel-helpers.mjs'
import ChatTerminalDock from './ChatTerminalDock.jsx'
import useChatStore from '../../store/useChatStore.js'
import useAppStore from '../../store/useAppStore.js'
import { resolveCursorExecutionCorrection } from './cursor-agent-renderer-capabilities.mjs'

export default function ChatPanelComposerArea({
  onComposerPaste,
  onComposerDrop,
  attachmentsEnabled,
  fileAttachmentsEnabled,
  imageAttachmentsEnabled,
  selectedProvider,
  selectedModel,
  modelCatalogVisibility = null,
  projectFolder,
  inlineCompletionEnabled,
  configuredProvidersCount,
  activeThreadId,
  activeThreadIsEmpty = false,
  activeThreadContextFallbackMode = 'none',
  selectedModelMissing,
  providers,
  loaded,
  refreshing,
  onProviderChange,
  onModelChange,
  onRefreshProviders,
  onComplianceNotice,
  contextUsage,
  threads,
  onThreadSelect,
  onCreateThread,
  onRenameThread,
  onOpenJobsModal,
  commandPaletteEvent = null,
  timelineLength,
  composerInputRef,
  composerBlocks,
  composerBlocksSyncVersion,
  composerDraftText,
  composerDraftSyncVersion,
  onComposerDraftTextChange,
  onComposerBlocksChange,
  onComposerKeyDown,
  composerPlaceholder,
  disabled,
  isStreaming,
  canSend,
  agentQuickActionsEnabled,
  directAgentRoles,
  directAgentRolesLoading,
  onRefreshDirectAgentRoles,
  onInsertDirectAgentTarget,
  onFocusComposer,
  pendingQuestionUser = null,
  onSubmitQuestionUserAnswer = () => {},
  onSend,
  onStop,
  attachedImages,
  onImagesAttached,
  onImageRemove,
  openAIKnowledgeBaseEnabled = false,
  openAIKnowledgeBaseStateByAttachmentId = {},
  openAIKnowledgeBaseBusyAttachmentIds = [],
  onAddToOpenAIKnowledgeBase = () => { },
  permissionMode = '',
  permissionModeChangePending = false,
  onPermissionModeChange = () => {},
  onPlanLifecycleAction = () => {},
}) {
  const { t } = useRendererTranslation(['core'])
  const [agentMenuOpen, setAgentMenuOpen] = React.useState(false)
  const [planDirectionError, setPlanDirectionError] = React.useState('')
  const {
    terminalDockBrowserOpen,
    terminalDockBrowserSelectionSessionId,
    terminalDockCollapsed,
    terminalDockSelectedTabId,
  } = useChatStore(useShallow((state) => {
    const terminalDock = state.getThreadState(activeThreadId)?.terminalDock || {}
    return {
      terminalDockBrowserOpen: terminalDock?.browserOpen === true,
      terminalDockBrowserSelectionSessionId: String(terminalDock?.browserSelectionSessionId || '').trim(),
      terminalDockCollapsed: terminalDock?.collapsed === true,
      terminalDockSelectedTabId: String(terminalDock?.selectedTabId || '').trim(),
    }
  }))
  const setTerminalDockState = useChatStore((state) => state.setTerminalDockState)
  const pendingPlanDirection = useChatStore((state) => state.pendingPlanDirection)
  const planDocumentReady = useChatStore((state) => state.planDocumentReady)
  const setPendingPlanDirection = useChatStore((state) => state.setPendingPlanDirection)
  const legacyPlanStateMigrationCandidate = useChatStore((state) => state.legacyPlanStateMigrationCandidate)
  const clearLegacyPlanStateMigrationCandidate = useChatStore((state) => state.clearLegacyPlanStateMigrationCandidate)
  const chatMode = useChatStore((state) => state.chatMode)
  const setChatMode = useChatStore((state) => state.setChatMode)
  const pipelineProgress = useMoaPipelineProgress()
  const councilProgress = useMoaCouncilProgress()
  const answerPlanDirection = React.useCallback(async (questionId, answer) => {
    const plan = pendingPlanDirection
    if (!plan?.planId || !plan?.project || !activeThreadId) return
    setPlanDirectionError('')
    try {
      const result = await window?.addom?.documents?.answerPlanDirection?.({
        projectRoot: plan.project, threadId: activeThreadId, planId: plan.planId, questionId, answer,
        expectedRevision: plan.revision, expectedDirectionRevision: plan.direction?.revision,
      })
      if (!result?.plan) throw new Error(t('core:chat.planDirection.errors.answerSave'))
      setPendingPlanDirection(result.plan, { threadId: activeThreadId })
      if (result.action) {
        const started = onPlanLifecycleAction({
          ...result.action,
          kind: 'synthesize_direction',
          planId: result.plan.planId,
          expectedRevision: result.plan.revision,
        })
        if (!started) throw new Error(t('core:chat.planDirection.errors.answerSave'))
      }
    } catch (error) {
      setPlanDirectionError(String(error?.message || t('core:chat.planDirection.errors.answerSave')))
    }
  }, [activeThreadId, onPlanLifecycleAction, pendingPlanDirection, setPendingPlanDirection, t])
  const changePlanDirection = React.useCallback(async (feedback) => {
    const plan = pendingPlanDirection
    if (!plan?.planId || !plan?.project || !activeThreadId) return false
    setPlanDirectionError('')
    try {
      const result = await window?.addom?.documents?.changePlanDirection?.({
        projectRoot: plan.project, threadId: activeThreadId, planId: plan.planId, feedback,
        expectedRevision: plan.revision, expectedDirectionRevision: plan.direction?.revision,
      })
      if (!result?.plan || !result?.action) throw new Error(t('core:chat.planDirection.errors.changeFailed'))
      setPendingPlanDirection(result.plan, { threadId: activeThreadId })
      const started = onPlanLifecycleAction({
        ...result.action,
        kind: 'synthesize_direction',
        planId: result.plan.planId,
        expectedRevision: result.plan.revision,
      })
      if (!started) throw new Error(t('core:chat.planDirection.errors.changeFailed'))
      return true
    } catch (error) {
      setPlanDirectionError(String(error?.message || t('core:chat.planDirection.errors.changeFailed')))
      return false
    }
  }, [activeThreadId, onPlanLifecycleAction, pendingPlanDirection, setPendingPlanDirection, t])
  const retryPlanDirection = React.useCallback(async () => {
    const plan = pendingPlanDirection
    if (!plan?.planId || !plan?.project || !activeThreadId) return
    setPlanDirectionError('')
    try {
      const result = await window?.addom?.documents?.retryPlanDirection?.({
        projectRoot: plan.project, threadId: activeThreadId, planId: plan.planId,
        expectedRevision: plan.revision, expectedDirectionRevision: plan.direction?.revision,
      })
      if (!result?.plan || !result?.action) throw new Error(t('core:chat.planDirection.errors.retryFailed'))
      setPendingPlanDirection(result.plan, { threadId: activeThreadId })
      const started = onPlanLifecycleAction({
        ...result.action,
        kind: 'synthesize_direction',
        planId: result.plan.planId,
        expectedRevision: result.plan.revision,
      })
      if (!started) throw new Error(t('core:chat.planDirection.errors.retryFailed'))
    } catch (error) {
      setPlanDirectionError(String(error?.message || t('core:chat.planDirection.errors.retryFailed')))
    }
  }, [activeThreadId, onPlanLifecycleAction, pendingPlanDirection, setPendingPlanDirection, t])
  const retryPlanDraft = React.useCallback(() => {
    const plan = pendingPlanDirection
    if (!plan?.planId || !plan?.direction?.revision) return
    setPlanDirectionError('')
    const started = onPlanLifecycleAction({
      kind: 'draft_plan',
      planId: plan.planId,
      expectedRevision: plan.revision,
      expectedDirectionRevision: plan.direction.revision,
    })
    if (!started) setPlanDirectionError(t('core:chat.planDirection.errors.profileUnavailable'))
  }, [onPlanLifecycleAction, pendingPlanDirection, t])
  const selectPlanProfile = React.useCallback(async (selectedProfile) => {
    const plan = pendingPlanDirection
    if (!plan?.planId || !plan?.project || !activeThreadId) return
    setPlanDirectionError('')
    try {
      const result = await window?.addom?.documents?.selectPlanAuthoringProfile?.({
        projectRoot: plan.project, threadId: activeThreadId, planId: plan.planId, selectedProfile,
        expectedRevision: plan.revision, expectedDirectionRevision: plan.direction?.revision,
      })
      if (!result?.plan) throw new Error(t('core:chat.planDirection.errors.profileUnavailable'))
      setPendingPlanDirection(result.plan, { threadId: activeThreadId })
      const started = onPlanLifecycleAction({
        kind: 'draft_plan',
        planId: result.plan.planId,
        expectedRevision: result.plan.revision,
        expectedDirectionRevision: result.plan.direction?.revision,
      })
      if (!started) throw new Error(t('core:chat.planDirection.errors.profileUnavailable'))
    } catch (error) {
      setPlanDirectionError(String(error?.message || t('core:chat.planDirection.errors.profileUnavailable')))
    }
  }, [activeThreadId, onPlanLifecycleAction, pendingPlanDirection, setPendingPlanDirection, t])
  React.useEffect(() => {
    if (!activeThreadId || !projectFolder) return undefined
    let active = true
    void (async () => {
      try {
        if (legacyPlanStateMigrationCandidate) {
          await window?.addom?.documents?.migrateLegacyPlanState?.({
            projectRoot: projectFolder,
            threadId: activeThreadId,
            legacyState: legacyPlanStateMigrationCandidate,
          })
          if (active) clearLegacyPlanStateMigrationCandidate()
        }
        const result = await window?.addom?.documents?.readPlanState?.({
          projectRoot: projectFolder,
          threadId: activeThreadId,
        })
        const plan = result?.plan
        if (!active || !plan?.planId) return
        if (plan.direction && (plan.lifecycle === 'awaiting_decision' || plan.lifecycle === 'drafting')) {
          setPendingPlanDirection(plan, { threadId: activeThreadId })
        } else {
          setPendingPlanDirection(null, { threadId: activeThreadId })
        }
        if (plan.document && (plan.lifecycle === 'ready_for_review' || plan.lifecycle === 'revising' || plan.lifecycle === 'approved')) {
          void useAppStore.getState().openDocumentCompanion?.({
            sourceKind: 'managed_plan', projectRoot: plan.project, threadId: plan.threadId, planId: plan.planId,
          })
        }
      } catch {
        // A missing bridge or inactive stored plan must not interrupt the composer.
      }
    })()
    return () => { active = false }
  }, [
    activeThreadId, clearLegacyPlanStateMigrationCandidate, legacyPlanStateMigrationCandidate,
    projectFolder, setPendingPlanDirection,
  ])
  React.useEffect(() => {
    if (
      !planDocumentReady?.planId
      || !planDocumentReady?.projectRoot
      || String(planDocumentReady.threadId || '').trim() !== String(activeThreadId || '').trim()
    ) return
    void useAppStore.getState().openDocumentCompanion?.({
      sourceKind: 'managed_plan',
      projectRoot: planDocumentReady.projectRoot,
      threadId: planDocumentReady.threadId,
      planId: planDocumentReady.planId,
    })
  }, [activeThreadId, planDocumentReady])
  const handleToggleTerminalDock = React.useCallback(() => {
    if (!activeThreadId) return
    if (terminalDockCollapsed === true) {
      const hasDockTarget = Boolean(
        terminalDockSelectedTabId
        || terminalDockBrowserOpen
        || terminalDockBrowserSelectionSessionId,
      )
      setTerminalDockState(
        hasDockTarget
          ? { collapsed: false }
          : {
              collapsed: false,
              browserOpen: true,
              browserSection: 'current_thread',
            },
        { threadId: activeThreadId },
      )
      return
    }
    setTerminalDockState({
      collapsed: true,
    }, { threadId: activeThreadId })
  }, [
    activeThreadId,
    setTerminalDockState,
    terminalDockBrowserOpen,
    terminalDockBrowserSelectionSessionId,
    terminalDockCollapsed,
    terminalDockSelectedTabId,
  ])
  const attachButtonTitle = (
    fileAttachmentsEnabled && !imageAttachmentsEnabled
      ? t('core:chat.controlRail.attach.filesImagesDisabled', {
        defaultValue: 'Attach files (images disabled for this model)',
      })
      : (!fileAttachmentsEnabled && imageAttachmentsEnabled
        ? t('core:chat.controlRail.attach.images', { defaultValue: 'Attach images' })
        : t('core:chat.controlRail.attach.files', { defaultValue: 'Attach files' }))
  )
  const attachDisabled = !attachmentsEnabled || disabled || isStreaming
  const selectedProviderRow = providers.find((provider) => provider?.id === selectedProvider) || null
  const cursorCorrection = resolveCursorExecutionCorrection(selectedProviderRow, {
    chatMode,
    permissionMode,
  })
  const cursorExecutionBlocked = cursorCorrection.requiresExecuteMode
    || cursorCorrection.requiresFullAccess
  const handleUseExecuteMode = React.useCallback(() => {
    setChatMode('execute')
    window.addom?.settings?.set?.({ chatMode: 'execute' }).catch(() => {})
  }, [setChatMode])
  return (
    <ConversationComposerFoundation variant="root">
      <div
        className="shrink-0 px-4 pb-4 bg-transparent pointer-events-none"
        onPaste={onComposerPaste}
        onDrop={onComposerDrop}
        onDragOver={(e) => { if (attachmentsEnabled) e.preventDefault() }}
      >
        <div className="mx-auto w-full" style={{ maxWidth: 'var(--app-chat-composer-max-width)' }}>
      {!selectedProvider && configuredProvidersCount > 0 && (
        <p className="text-warning text-xs mb-2 text-center">{t('core:chat.composerArea.selectProvider', { defaultValue: 'Select a provider below to start chatting.' })}</p>
      )}

      {selectedProvider && !activeThreadId && (
        <p className="text-warning text-xs mb-2 text-center">{t('core:chat.composerArea.selectThread', { defaultValue: 'Select or create a thread before sending messages.' })}</p>
      )}

      {selectedModelMissing && (
        <p className="text-warning text-xs mb-2 text-center">
          {t('core:chat.composerArea.selectedModelMissing', { defaultValue: 'Selected model may be unavailable. Refresh curated models from the actions menu.' })}
        </p>
      )}

      {configuredProvidersCount === 0 && (
        <p className="text-text-muted text-xs mb-2 text-center">{t('core:chat.composerArea.addApiKey', { defaultValue: 'Add an API key in Settings to start.' })}</p>
      )}

      {cursorExecutionBlocked ? (
        <div className="pointer-events-auto mb-2 flex items-center justify-center gap-2 text-[11px] text-text-secondary" data-ui="cursor-execution-correction">
          <span>Cursor runs only in Execute mode with Full Access.</span>
          {cursorCorrection.requiresExecuteMode ? (
            <button
              type="button"
              onClick={handleUseExecuteMode}
              className="rounded-md bg-surface-panel px-2 py-1 font-medium text-text-primary transition-colors hover:bg-surface-panel-alt"
            >
              Use Execute
            </button>
          ) : null}
          {cursorCorrection.requiresFullAccess ? (
            <button
              type="button"
              disabled={permissionModeChangePending}
              onClick={() => onPermissionModeChange('full_access')}
              className="rounded-md bg-surface-panel px-2 py-1 font-medium text-text-primary transition-colors hover:bg-surface-panel-alt disabled:opacity-45"
            >
              {t('core:chat.cursor.useFullAccess', { defaultValue: 'Use Full Access' })}
            </button>
          ) : null}
        </div>
      ) : null}

      {fileAttachmentsEnabled && !imageAttachmentsEnabled && (
        <p className="text-text-secondary text-xs mb-2 text-center">
          {t('core:chat.composerArea.imagesDisabled', { defaultValue: 'Images are disabled for this model. File attachments remain enabled.' })}
        </p>
      )}

      {/* Pipeline progress indicator */}
      {pipelineProgress.active && (
        <div className="mx-auto mb-2 w-full pointer-events-auto" style={{ maxWidth: 'var(--app-chat-composer-max-width)' }}>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-accent/30 bg-surface-panel/60 backdrop-blur-sm">
            <span
              aria-hidden="true"
              className="inline-flex h-2 w-2 shrink-0 rounded-full bg-accent"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary truncate">
                  {pipelineProgress.status === 'step_running'
                    ? t('core:chat.composerArea.pipeline.stepRunning', {
                      defaultValue: 'Step {{currentStep}}/{{totalSteps}}: {{stepName}}',
                      currentStep: pipelineProgress.currentStep,
                      totalSteps: pipelineProgress.totalSteps,
                      stepName: pipelineProgress.stepName,
                    })
                    : pipelineProgress.status === 'completed'
                      ? t('core:chat.composerArea.pipeline.completed', { defaultValue: 'Pipeline complete' })
                      : pipelineProgress.status === 'failed'
                        ? t('core:chat.composerArea.pipeline.failedAt', {
                          defaultValue: 'Pipeline failed at {{stepName}}',
                          stepName: pipelineProgress.stepName,
                        })
                        : pipelineProgress.status === 'aborted'
                          ? t('core:chat.composerArea.pipeline.cancelled', { defaultValue: 'Pipeline cancelled' })
                          : t('core:chat.composerArea.pipeline.starting', {
                            defaultValue: 'Starting pipeline ({{totalSteps}} steps)...',
                            totalSteps: pipelineProgress.totalSteps,
                          })
                  }
                </span>
                {pipelineProgress.pipelineName && (
                  <span className="text-[10px] text-text-tertiary ml-2 shrink-0">{pipelineProgress.pipelineName}</span>
                )}
                {pipelineProgress.executionId && pipelineProgress.status !== 'completed' && pipelineProgress.status !== 'failed' && pipelineProgress.status !== 'aborted' && (
                  <button
                    type="button"
                    onClick={() => { window.addom?.pipeline?.abort?.(pipelineProgress.executionId).catch?.(() => {}) }}
                    className="ml-2 shrink-0 rounded-md border border-surface-border px-2 py-0.5 text-[10px] text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
                  >
                    {t('core:common.cancel', { defaultValue: 'Cancel' })}
                  </button>
                )}
              </div>
              {pipelineProgress.totalSteps > 0 && (
                <div className="mt-1 h-1 rounded-full bg-surface-border/50 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
                    style={{ width: `${Math.round((pipelineProgress.currentStep / pipelineProgress.totalSteps) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {councilProgress.active && (
        <div className="mx-auto mb-2 w-full pointer-events-auto" style={{ maxWidth: 'var(--app-chat-composer-max-width)' }}>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-warning/30 bg-surface-panel/60 backdrop-blur-sm">
            <span
              aria-hidden="true"
              className="inline-flex h-2 w-2 shrink-0 rounded-full bg-warning"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-text-secondary truncate">
                  {councilProgress.status === 'completed'
                    ? t('core:chat.composerArea.council.completed', {
                      defaultValue: 'Council complete ({{successCount}}/{{memberCount}} successful)',
                      successCount: councilProgress.successCount,
                      memberCount: councilProgress.memberCount,
                    })
                    : councilProgress.status === 'failed'
                      ? t('core:chat.composerArea.council.failed', { defaultValue: 'Council failed' })
                      : councilProgress.status === 'aborted'
                        ? t('core:chat.composerArea.council.cancelled', { defaultValue: 'Council cancelled' })
                        : t('core:chat.composerArea.council.running', {
                          defaultValue: 'Council running ({{memberCount}} member{{suffix}})...',
                          memberCount: councilProgress.memberCount || '?',
                          suffix: (councilProgress.memberCount || 0) === 1 ? '' : 's',
                        })}
                </span>
                {councilProgress.executionId && councilProgress.status !== 'completed' && councilProgress.status !== 'failed' && councilProgress.status !== 'aborted' && (
                  <button
                    type="button"
                    onClick={() => { window.addom?.council?.abort?.(councilProgress.executionId).catch?.(() => {}) }}
                    className="ml-2 shrink-0 rounded-md border border-surface-border px-2 py-0.5 text-[10px] text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
                  >
                    {t('core:common.cancel', { defaultValue: 'Cancel' })}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="w-full pointer-events-auto">
        <McpElicitationCardHost activeThreadId={activeThreadId} />
        {pendingQuestionUser && (
          <QuestionUserCard
            request={pendingQuestionUser}
            disabled={resolveQuestionUserCardDisabled({
              request: pendingQuestionUser,
              disabled,
              isStreaming,
            })}
            onSubmitAnswer={onSubmitQuestionUserAnswer}
          />
        )}
        {pendingPlanDirection ? <PlanDirectionCard
          key={`${activeThreadId}:${pendingPlanDirection.planId}`}
          plan={pendingPlanDirection}
          disabled={disabled || isStreaming}
          error={planDirectionError}
          onAnswer={answerPlanDirection}
          onCreatePlan={selectPlanProfile}
          onChangeDirection={changePlanDirection}
          onRetry={retryPlanDirection}
          onRetryDraft={retryPlanDraft}
        /> : null}
        {/* Composer card — fully rounded, glassmorphic background */}
        <ConversationComposerInputSurface data-ui="chat-composer-stack-shell">
          <ChatComposer
            composerInputRef={composerInputRef}
            composerBlocks={composerBlocks}
            composerBlocksSyncVersion={composerBlocksSyncVersion}
            composerDraftText={composerDraftText}
            composerDraftSyncVersion={composerDraftSyncVersion}
            onDraftTextChange={onComposerDraftTextChange}
            onBlocksChange={onComposerBlocksChange}
            onKeyDown={onComposerKeyDown}
            placeholder={composerPlaceholder}
            disabled={disabled}
            isStreaming={isStreaming}
            agentQuickActionsEnabled={agentQuickActionsEnabled}
            agentMenuOpen={agentMenuOpen}
            onAgentMenuOpenChange={setAgentMenuOpen}
            directAgentRoles={directAgentRoles}
            directAgentRolesLoading={directAgentRolesLoading}
            onRefreshDirectAgentRoles={onRefreshDirectAgentRoles}
            onInsertDirectAgentTarget={onInsertDirectAgentTarget}
            onFocusComposer={onFocusComposer}
            attachedImages={attachedImages}
            onImageRemove={onImageRemove}
            openAIKnowledgeBaseEnabled={openAIKnowledgeBaseEnabled}
            openAIKnowledgeBaseStateByAttachmentId={openAIKnowledgeBaseStateByAttachmentId}
            openAIKnowledgeBaseBusyAttachmentIds={openAIKnowledgeBaseBusyAttachmentIds}
            onAddToOpenAIKnowledgeBase={onAddToOpenAIKnowledgeBase}
            attachButtonTitle={attachButtonTitle}
            attachDisabled={attachDisabled}
            onAttachFiles={onImagesAttached}
            selectedProvider={selectedProvider}
            selectedModel={selectedModel}
            projectFolder={projectFolder}
            inlineCompletionEnabled={inlineCompletionEnabled}
          />
        </ConversationComposerInputSurface>

        {/* Rail — sits outside the opaque card so backdrop-blur blurs the timeline behind it */}
        <ChatComposerControlRail
          providers={providers}
          loaded={loaded}
          refreshing={refreshing}
          selectedProvider={selectedProvider}
          selectedModel={selectedModel}
          modelCatalogVisibility={modelCatalogVisibility}
          activeThreadId={activeThreadId}
          activeThreadIsEmpty={activeThreadIsEmpty}
          activeThreadContextFallbackMode={activeThreadContextFallbackMode}
          hasConversation={timelineLength > 0}
          onComplianceNotice={onComplianceNotice}
          onProviderChange={onProviderChange}
          onModelChange={onModelChange}
          onRefreshProviders={onRefreshProviders}
          contextUsage={contextUsage}
          disabled={disabled}
          isStreaming={isStreaming}
          canSend={canSend && !cursorExecutionBlocked}
          agentQuickActionsEnabled={agentQuickActionsEnabled}
          agentMenuOpen={agentMenuOpen}
          onAgentMenuOpenChange={setAgentMenuOpen}
          onSend={onSend}
          onStop={onStop}
          threads={threads}
          onThreadSelect={onThreadSelect}
          onCreateThread={onCreateThread}
          onRenameThread={onRenameThread}
          onOpenJobsModal={onOpenJobsModal}
          commandPaletteEvent={commandPaletteEvent}
          terminalButtonEnabled={Boolean(activeThreadId && projectFolder)}
          terminalButtonActive={terminalDockCollapsed !== true}
          onToggleTerminalDock={handleToggleTerminalDock}
        />
        <ChatModeFooterTip />
      </div>
      </div>

      <div className="pointer-events-auto px-3 py-1">
        <ChatTerminalDock
          activeThreadId={activeThreadId}
          projectFolder={projectFolder}
          permissionMode={permissionMode}
          commandPaletteEvent={commandPaletteEvent}
        />
      </div>
    </div>
    </ConversationComposerFoundation>
  )
}
