import React from 'react'
import AgentConversationView from '../agents/AgentConversationView.jsx'
import useSelectedAgentConversation from '../agents/use-selected-agent-conversation.mjs'
import ChatPanelComposerArea from './ChatPanelComposerArea.jsx'
import ChatPanelHeaderBar from './ChatPanelHeaderBar.jsx'
import { MemoChatPanelTimelineArea as ChatPanelTimelineArea } from './ChatPanelTimelineArea.jsx'
import { JumpToLatestIcon } from './ChatComposerIcons.jsx'

export default function ChatPanelView(props) {
  const {
    workspaceRailEnabled, workspaceRailOpen, onOpenWorkspaceRail, workspaceRailActivitySummary,
    activeThreadId, activeThreadTitle, timelineLength,
    permissionMode, permissionModeChangePending,
    handlePermissionModeChange, activeThreadIsEmpty, activeThreadContextFallbackMode,
    providerSwitchHint, actionsDisabled, handleInjectSwitchContext,
    dismissProviderSwitchHint, handleCreateThread, timelineScrollRef, notices, dismissNotice,
    suppressNoticeForSession, handleNoticeAction, hiddenTimelineCount,
    setTimelineVisibleCount, visibleTimelineLength, streamingMessage,
    configuredProvidersCount, timelineBlocks, timelineBlockMeta,
    liveExecutionTurns, liveExecutionStreamEnabled, handleContinueInterruptedTurn, projectFolder,
    isStreaming, jobsModalOpen, backgroundJobs,
    jobsLoading, jobsError, jobsLastUpdated,
    jobsStoppingId, refreshBackgroundJobs, handleStopBackgroundJob,
    handleStopAllBackgroundJobs, handleCloseJobsModal, createThreadModalOpen,
    newThreadTitle, setNewThreadTitle, handleCreateThreadSubmit,
    handleCloseCreateThreadModal, renameThreadModalOpen, renameThreadTitle,
    setRenameThreadTitle, handleRenameThreadSubmit, handleCloseRenameThreadModal,
    bottomRef, terminalMemorySuggestionCard,
    writeConflictCards, showJumpToLatest, handleJumpToLatest,
    handleComposerPaste, handleComposerDrop,
    attachmentsEnabled, fileAttachmentsEnabled, imageAttachmentsEnabled,
    selectedProvider, selectedModel, modelCatalogVisibility,
    inlineCompletionEnabled, selectedModelMissing, loaded,
    refreshing, setSelectedProvider, setSelectedModel,
    handleRefreshProviders, pushNotice, contextMeterUsage,
    threads,
    handleThreadSelect, handleRenameThread, providers,
    handleOpenJobsModal, commandPaletteEvent,
    composerInputRef, composerBlocks, composerBlocksSyncVersion,
    composerDraftText, composerDraftSyncVersion, handleComposerDraftTextChange,
    syncComposerBlocks, handleKeyDown, composerPlaceholder,
    canSend, composerAgentRoles, composerAgentRolesLoading,
    loadComposerAgentRoles, handleInsertDirectAgentTarget, focusComposerInput,
    pendingQuestionUser, handleSubmitQuestionUserAnswer, handleSend,
    handleStopCurrentTurn, attachedImages, handleComposerFilesSelected,
    setAttachedImages, openAIProviderConfigured, activeProjectId,
    openAIKnowledgeBaseStateByAttachmentId, openAIKnowledgeBaseBusyAttachmentIds, handleAddAttachmentToOpenAIKnowledgeBase,
    activeThreadOrigin, originInspectionBusy, originInspectionError, handleInspectThreadOrigin, handlePlanLifecycleAction,
  } = props

  // The thread stays mounted behind the opened agent so its scroll position and draft survive.
  const agentConversation = useSelectedAgentConversation()
  const agentOpen = agentConversation.active
  const behind = agentOpen ? { inert: '', 'aria-hidden': true } : null

  return (
    <div className="flex flex-col h-full min-h-0">
      <ChatPanelHeaderBar
        workspaceRailEnabled={workspaceRailEnabled}
        workspaceRailOpen={workspaceRailOpen}
        workspaceRailActivitySummary={workspaceRailActivitySummary}
        onOpenWorkspaceRail={onOpenWorkspaceRail}
        activeThreadId={activeThreadId}
        activeThreadTitle={activeThreadTitle}
        timelineLength={timelineLength}
        permissionMode={permissionMode}
        permissionModeChangePending={permissionModeChangePending}
        onPermissionModeChange={handlePermissionModeChange}
        activeThreadIsEmpty={activeThreadIsEmpty}
        providerSwitchHint={providerSwitchHint}
        actionsDisabled={actionsDisabled}
        onInjectSwitchContext={handleInjectSwitchContext}
        onDismissProviderSwitchHint={dismissProviderSwitchHint}
        onCreateThread={handleCreateThread}
      />

      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        data-ui="chat-panel-content-layer"
      >
        <div
          className="relative min-h-0 flex-1"
          data-ui="chat-timeline-region"
          {...behind}
        >
          <ChatPanelTimelineArea
          key={activeThreadId || 'no-thread'}
          scrollContainerRef={timelineScrollRef}
          notices={notices}
          onDismissNotice={dismissNotice}
          onSuppressNoticeForSession={suppressNoticeForSession}
          onNoticeAction={handleNoticeAction}
          hiddenTimelineCount={hiddenTimelineCount}
          onLoadOlderEntries={setTimelineVisibleCount}
          visibleTimelineLength={visibleTimelineLength}
          streamingMessage={streamingMessage}
          configuredProvidersCount={configuredProvidersCount}
          timelineBlocks={timelineBlocks}
          timelineBlockMeta={timelineBlockMeta}
          liveExecutionTurns={liveExecutionTurns}
          liveExecutionEnabled={liveExecutionStreamEnabled}
          onContinueInterruptedTurn={handleContinueInterruptedTurn}
          projectFolder={projectFolder}
          isStreaming={isStreaming}
          jobsModalOpen={jobsModalOpen}
          backgroundJobs={backgroundJobs}
          jobsLoading={jobsLoading}
          jobsError={jobsError}
          jobsLastUpdated={jobsLastUpdated}
          jobsStoppingId={jobsStoppingId}
          onRefreshBackgroundJobs={refreshBackgroundJobs}
          onStopBackgroundJob={handleStopBackgroundJob}
          onStopAllBackgroundJobs={handleStopAllBackgroundJobs}
          onCloseJobsModal={handleCloseJobsModal}
          createThreadModalOpen={createThreadModalOpen}
          newThreadTitle={newThreadTitle}
          onNewThreadTitleChange={setNewThreadTitle}
          onCreateThreadSubmit={handleCreateThreadSubmit}
          onCloseCreateThreadModal={handleCloseCreateThreadModal}
          renameThreadModalOpen={renameThreadModalOpen}
          renameThreadTitle={renameThreadTitle}
          onRenameThreadTitleChange={setRenameThreadTitle}
          onRenameThreadSubmit={handleRenameThreadSubmit}
          onCloseRenameThreadModal={handleCloseRenameThreadModal}
          bottomRef={bottomRef}
          terminalMemorySuggestionCard={terminalMemorySuggestionCard}
          writeConflictCards={writeConflictCards}
          threadOrigin={activeThreadOrigin}
          originInspectionBusy={originInspectionBusy}
          originInspectionError={originInspectionError}
          onInspectThreadOrigin={handleInspectThreadOrigin}
          />

          {showJumpToLatest && (
            <button
              type="button"
              onClick={handleJumpToLatest}
              className="pointer-events-auto absolute bottom-3 left-1/2 z-30 inline-flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-surface-border bg-surface-panel text-text-secondary shadow-[0_4px_12px_rgb(var(--theme-shadow-rgb)_/_0.18)] transition-colors hover:border-border-hover hover:text-text-primary"
              aria-label="Jump to latest message"
              title="Jump to latest message"
              data-ui="chat-jump-to-latest"
            >
              <JumpToLatestIcon />
            </button>
          )}
        </div>

        <div
          className="relative z-20 shrink-0"
          data-ui="chat-composer-region"
          {...behind}
        >
          <ChatPanelComposerArea
              onComposerPaste={handleComposerPaste}
              onComposerDrop={handleComposerDrop}
              attachmentsEnabled={attachmentsEnabled}
              fileAttachmentsEnabled={fileAttachmentsEnabled}
              imageAttachmentsEnabled={imageAttachmentsEnabled}
              selectedProvider={selectedProvider}
              selectedModel={selectedModel}
              modelCatalogVisibility={modelCatalogVisibility}
              projectFolder={projectFolder}
              inlineCompletionEnabled={inlineCompletionEnabled}
              configuredProvidersCount={configuredProvidersCount}
              activeThreadId={activeThreadId}
              activeThreadIsEmpty={activeThreadIsEmpty}
              activeThreadContextFallbackMode={activeThreadContextFallbackMode}
              selectedModelMissing={selectedModelMissing}
              providers={providers}
              loaded={loaded}
              refreshing={refreshing}
              onProviderChange={setSelectedProvider}
              onModelChange={setSelectedModel}
              onRefreshProviders={handleRefreshProviders}
              onComplianceNotice={pushNotice}
              contextUsage={contextMeterUsage}
              threads={threads}
              onThreadSelect={handleThreadSelect}
              onCreateThread={handleCreateThread}
              onRenameThread={handleRenameThread}
              onOpenJobsModal={handleOpenJobsModal}
              commandPaletteEvent={commandPaletteEvent}
              timelineLength={timelineLength}
              composerInputRef={composerInputRef}
              composerBlocks={composerBlocks}
              composerBlocksSyncVersion={composerBlocksSyncVersion}
              composerDraftText={composerDraftText}
              composerDraftSyncVersion={composerDraftSyncVersion}
              onComposerDraftTextChange={handleComposerDraftTextChange}
              onComposerBlocksChange={syncComposerBlocks}
              onComposerKeyDown={handleKeyDown}
              composerPlaceholder={composerPlaceholder}
              disabled={!activeThreadId}
              isStreaming={isStreaming}
              canSend={canSend}
              agentQuickActionsEnabled={Boolean(activeThreadId)}
              directAgentRoles={composerAgentRoles}
              directAgentRolesLoading={composerAgentRolesLoading}
              onRefreshDirectAgentRoles={loadComposerAgentRoles}
              onInsertDirectAgentTarget={handleInsertDirectAgentTarget}
              onFocusComposer={focusComposerInput}
              pendingQuestionUser={pendingQuestionUser}
              onSubmitQuestionUserAnswer={handleSubmitQuestionUserAnswer}
              onSend={handleSend}
              onStop={handleStopCurrentTurn}
              attachedImages={attachedImages}
              onImagesAttached={handleComposerFilesSelected}
              onImageRemove={(id) => setAttachedImages((prev) => prev.filter((img) => img.id !== id))}
              openAIKnowledgeBaseEnabled={openAIProviderConfigured && !!activeProjectId}
              openAIKnowledgeBaseStateByAttachmentId={openAIKnowledgeBaseStateByAttachmentId}
              openAIKnowledgeBaseBusyAttachmentIds={openAIKnowledgeBaseBusyAttachmentIds}
              onAddToOpenAIKnowledgeBase={handleAddAttachmentToOpenAIKnowledgeBase}
              permissionMode={permissionMode}
              permissionModeChangePending={permissionModeChangePending}
              onPermissionModeChange={handlePermissionModeChange}
              onPlanLifecycleAction={handlePlanLifecycleAction}
          />
        </div>

        {agentOpen ? <AgentConversationView conversation={agentConversation} /> : null}
      </div>
    </div>
  )
}
