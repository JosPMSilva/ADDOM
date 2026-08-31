import React from 'react'
import LiveExecutionStreamBlock from './LiveExecutionStreamBlock.jsx'
import EmptyState from './EmptyState.jsx'
import { MemoMessageBubble } from './MessageBubble.jsx'
import { MemoToolActivityLine } from './ToolActivityLine.jsx'
import TurnRunbook from './TurnRunbook.jsx'
import TurnFileChangesCard from './TurnFileChangesCard.jsx'
import TurnShell from './TurnShell.jsx'
import ThreadPromotionOriginNote from './ThreadPromotionOriginNote.jsx'
import { CHAT_TIMELINE_WINDOW_STEP } from './chat-utils.js'
import { buildTimelineRenderState } from './chat-panel-timeline-render-state.mjs'
import { hasVisibleMessageContent } from './message-content-visibility.mjs'
import useTimelineVirtualization from './use-timeline-virtualization.jsx'

const BackgroundJobsModalLazy = React.lazy(() => import('./BackgroundJobsModal.jsx'))
const ChatThreadModalsLazy = React.lazy(() => import('./ChatThreadModals.jsx'))

function getTimelineBlockTurnId(block = null) {
  if (block?.kind === 'runbook') return String(block?.turnId || '').trim()
  if (block?.kind !== 'entry' || block?.entry?.kind !== 'message') return ''
  return String(block?.entry?.message?.streamMeta?.turnId || '').trim()
}

function isAssistantMessageBlock(block = null) {
  return block?.kind === 'entry'
    && block?.entry?.kind === 'message'
    && String(block?.entry?.message?.role || '').trim() === 'assistant'
}

function joinsTurnHeaderDock(runbookBlock = null, messageBlock = null) {
  // Claim any same-turn runbook for the assistant TurnShell (files optional).
  // Activity-only legacy threads without liveExecutionTurns may still render
  // TurnRunbook in the runbook lane when there is no live turn to own chrome.
  if (runbookBlock?.kind !== 'runbook' || !isAssistantMessageBlock(messageBlock)) return false
  const runbookTurnId = getTimelineBlockTurnId(runbookBlock)
  return !!runbookTurnId && runbookTurnId === getTimelineBlockTurnId(messageBlock)
}

function isActiveStreamingMessage(message = null) {
  return String(message?.status || '').trim().toLowerCase() === 'streaming'
}

function buildPendingStreamingTurn(streamingMessage = null, liveTurn = null) {
  if (liveTurn) return liveTurn
  if (!streamingMessage || typeof streamingMessage !== 'object') return null
  const messageId = String(streamingMessage?.id || '').trim()
  const turnId = String(streamingMessage?.streamMeta?.turnId || '').trim() || (messageId ? `pending:${messageId}` : '')
  if (!turnId) return null
  const createdAt = Number(
    streamingMessage?.streamMeta?.startedAt
    || streamingMessage?.streamMeta?.createdAt
    || streamingMessage?.createdAt
    || 0
  ) || Date.now()
  return {
    turnId,
    status: 'active',
    createdAt,
    updatedAt: createdAt,
    eventOrder: [],
    eventsById: {},
  }
}

function ChatPanelTimelineArea({
  scrollContainerRef,
  notices,
  onDismissNotice,
  onSuppressNoticeForSession,
  onNoticeAction,
  hiddenTimelineCount,
  onLoadOlderEntries,
  visibleTimelineLength,
  streamingMessage,
  configuredProvidersCount,
  timelineBlocks,
  timelineBlockMeta = null,
  liveExecutionTurns,
  liveExecutionEnabled = true,
  onContinueInterruptedTurn,
  projectFolder,
  isStreaming,
  jobsModalOpen,
  backgroundJobs,
  jobsLoading,
  jobsError,
  jobsLastUpdated,
  jobsStoppingId,
  onRefreshBackgroundJobs,
  onStopBackgroundJob,
  onStopAllBackgroundJobs,
  onCloseJobsModal,
  createThreadModalOpen,
  newThreadTitle,
  onNewThreadTitleChange,
  onCreateThreadSubmit,
  onCloseCreateThreadModal,
  renameThreadModalOpen,
  renameThreadTitle,
  onRenameThreadTitleChange,
  onRenameThreadSubmit,
  onCloseRenameThreadModal,
  bottomRef,
  terminalMemorySuggestionCard,
  writeConflictCards,
  threadOrigin,
  originInspectionBusy,
  originInspectionError,
  onInspectThreadOrigin,
}) {
  const resolvedLiveExecutionTurns = React.useMemo(
    () => (liveExecutionEnabled !== false && liveExecutionTurns && typeof liveExecutionTurns === 'object'
      ? liveExecutionTurns
      : {}),
    [liveExecutionEnabled, liveExecutionTurns],
  )
  const timelineRenderState = React.useMemo(() => buildTimelineRenderState({
    timelineBlocks,
    timelineBlockMeta,
    resolvedLiveExecutionTurns,
    streamingMessage,
  }), [resolvedLiveExecutionTurns, streamingMessage, timelineBlockMeta, timelineBlocks])
  const {
    assistantMessageTurnIdsWithLiveExecution,
    lastRunbookIndex,
    streamingLiveTurn: resolvedStreamingLiveTurn,
    streamingTurnId: resolvedStreamingTurnId,
  } = timelineRenderState
  const streamingMessageIsActive = isActiveStreamingMessage(streamingMessage)
  const shouldRenderStreamingMessageBubble = streamingMessageIsActive && hasVisibleMessageContent(streamingMessage)
  const streamingLiveTurn = React.useMemo(() => buildPendingStreamingTurn(
    streamingMessageIsActive ? streamingMessage : null,
    streamingMessageIsActive ? resolvedStreamingLiveTurn || null : null,
  ), [resolvedStreamingLiveTurn, streamingMessage, streamingMessageIsActive])
  const shouldRenderStreamingLiveExecution = !!streamingLiveTurn
  const streamingRunbookBlock = resolvedStreamingTurnId
    ? timelineBlocks.find((block) => (
      block?.kind === 'runbook'
      && String(block?.turnId || '').trim() === resolvedStreamingTurnId
    )) || null
    : null
  const streamingRunbookFiles = Array.isArray(streamingRunbookBlock?.fileChanges)
    ? streamingRunbookBlock.fileChanges
    : []
  const streamingMessageAnchored = streamingMessageIsActive && timelineBlocks.some((block) => (
    block?.kind === 'entry'
    && block?.entry?.kind === 'message'
    && String(block.entry.message?.id || '').trim() === String(streamingMessage?.id || '').trim()
  ))
  const streamingFooterActive = streamingMessageIsActive
    && !streamingMessageAnchored
    && (
      shouldRenderStreamingMessageBubble
      || shouldRenderStreamingLiveExecution
      || streamingRunbookFiles.length > 0
    )
  const {
    blockLayout,
    renderedBlockEntries,
    virtualizationEnabled,
    virtualStartIndex,
    timelineBlocksContainerStyle,
    wrapTimelineBlock,
    scrollHandlers,
  } = useTimelineVirtualization({ timelineBlocks, scrollContainerRef })

  return (
    <div
      ref={scrollContainerRef}
      onScroll={scrollHandlers.onScroll}
      onFocusCapture={scrollHandlers.onFocusCapture}
      onBlurCapture={scrollHandlers.onBlurCapture}
      className="h-full overflow-y-auto px-4 pt-4 pb-8 flex flex-col items-center gap-2"
      data-ui="chat-timeline-scroll"
    >
      <ThreadPromotionOriginNote
        origin={threadOrigin}
        busy={originInspectionBusy}
        error={originInspectionError}
        onInspectSource={onInspectThreadOrigin}
      />
      {notices.length > 0 && (
        <div className="w-full flex flex-col gap-2" style={{ maxWidth: 'var(--app-chat-content-max-width)' }}>
          {notices.map((notice) => (
            (() => {
              const type = String(notice?.type || 'info').trim().toLowerCase()
              const warning = type === 'warning'
              const cardClass = 'relative rounded-lg border border-surface-border/55 bg-surface-panel-alt/90 px-3 py-2 pr-9 text-xs shadow-[0_8px_24px_rgb(var(--theme-shadow-rgb)_/_0.18),inset_0_1px_0_rgb(var(--theme-highlight-rgb)_/_0.045)]'
              const textClass = warning ? 'text-warning-soft' : 'text-text-secondary'
              const primaryActionClass = warning
                ? 'rounded-md border border-warning/40 bg-warning/18 px-2 py-1 text-[11px] font-medium text-warning-soft transition-colors hover:bg-warning/24'
                : 'rounded-md border border-accent/45 bg-accent/25 px-2 py-1 text-[11px] font-medium text-text-primary transition-colors hover:bg-accent/30'
              const noticeAction = notice?.meta?.action && typeof notice.meta.action === 'object'
                ? notice.meta.action
                : null
              const noticeActionLabel = String(noticeAction?.label || '').trim()
              return (
                <div key={notice.id} className={cardClass}>
                  <button
                    type="button"
                    onClick={() => onDismissNotice(notice.id)}
                    className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-panel/70 hover:text-text-primary"
                    title="Dismiss"
                    aria-label="Dismiss notice"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                  <div className="min-w-0">
                    <p className={`leading-5 ${textClass}`}>{notice.text}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {noticeAction && noticeActionLabel && (
                        <button
                          type="button"
                          onClick={() => onNoticeAction?.(notice)}
                          className={primaryActionClass}
                          title={noticeActionLabel}
                        >
                          {noticeActionLabel}
                        </button>
                      )}
                      {notice?.meta?.sessionSuppressKey && (
                        <button
                          type="button"
                          onClick={() => onSuppressNoticeForSession?.(notice.meta.sessionSuppressKey)}
                          className="px-1 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:text-text-primary"
                          title="Don't show this notice again during this app session"
                        >
                          Mute session
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()
          ))}
        </div>
      )}

      {hiddenTimelineCount > 0 && (
        <div className="w-full flex justify-center" style={{ maxWidth: 'var(--app-chat-content-max-width)' }}>
          <button
            onClick={() => onLoadOlderEntries((n) => n + CHAT_TIMELINE_WINDOW_STEP)}
            className="text-[11px] px-2 py-1 rounded-md border border-surface-border bg-surface-panel text-text-subtle hover:border-border-hover transition-colors"
          >
            Load older entries ({hiddenTimelineCount} hidden)
          </button>
        </div>
      )}

      {visibleTimelineLength === 0 && !streamingMessage ? (
        <div className="w-full flex-1 flex flex-col" style={{ maxWidth: 'var(--app-chat-content-max-width)' }}>
          <EmptyState configuredCount={configuredProvidersCount} />
        </div>
      ) : (
        <div className="w-full space-y-2" style={{ ...timelineBlocksContainerStyle, maxWidth: 'var(--app-chat-content-max-width)' }}>
          {renderedBlockEntries.map(({ block, blockId }, idx) => {
            const blockIndex = virtualizationEnabled
              ? virtualStartIndex + idx
              : idx
            const blockKey = block.id || `timeline-block-${blockIndex}`
            const previousTimelineBlock = blockLayout.entries[blockIndex - 1]?.block || null
            const nextTimelineBlock = blockLayout.entries[blockIndex + 1]?.block || null
            if (block.kind === 'runbook') {
              const runbookFiles = Array.isArray(block.fileChanges) ? block.fileChanges : []
              const isLiveRunbook = isStreaming && blockIndex === lastRunbookIndex
              const runbookTurnId = String(block.turnId || '').trim()
              const liveTurn = resolvedLiveExecutionTurns[runbookTurnId] || null
              const movesToStreamingFooter = isLiveRunbook
                && !!streamingMessage
                && !!resolvedStreamingTurnId
                && runbookTurnId === resolvedStreamingTurnId
              const movesToCompletedFooter = joinsTurnHeaderDock(block, previousTimelineBlock)
                || joinsTurnHeaderDock(block, nextTimelineBlock)
              const shouldRenderLiveStreamInRunbook = !!liveTurn
                && !movesToStreamingFooter
                && !assistantMessageTurnIdsWithLiveExecution.has(runbookTurnId)
              if (isLiveRunbook && runbookFiles.length <= 0) {
                return shouldRenderLiveStreamInRunbook ? (
                  wrapTimelineBlock(blockKey, blockId, (
                    <LiveExecutionStreamBlock
                      key={`live-execution-${block.turnId || blockIndex}`}
                      turn={liveTurn}
                      isLiveTurn
                      onContinueInterruptedTurn={onContinueInterruptedTurn}
                    />
                  ))
                ) : null
              }
              const shouldRenderRunbook = !isLiveRunbook && !liveTurn
              const shouldRenderFilesHere = runbookFiles.length > 0
                && !movesToStreamingFooter
                && !movesToCompletedFooter
              if (!shouldRenderLiveStreamInRunbook && !shouldRenderRunbook && !shouldRenderFilesHere) {
                return null
              }
              return wrapTimelineBlock(blockKey, blockId, (
                  <div className="space-y-1.5">
                    {shouldRenderLiveStreamInRunbook ? (
                      <LiveExecutionStreamBlock
                        turn={liveTurn}
                        isLiveTurn={isLiveRunbook}
                        onContinueInterruptedTurn={onContinueInterruptedTurn}
                      />
                    ) : null}
                    {shouldRenderRunbook && (
                      <TurnRunbook
                        turnId={block.turnId}
                        activities={block.activities}
                        fileChanges={runbookFiles}
                        projectFolder={projectFolder}
                      />
                    )}
                    {shouldRenderFilesHere ? (
                      <TurnFileChangesCard
                        turnId={block.turnId}
                        activities={block.activities}
                        fileRows={runbookFiles}
                        projectFolder={projectFolder}
                        isLiveTurn={isLiveRunbook}
                      />
                    ) : null}
                  </div>
                ))
            }

            const entry = block.entry
            if (entry?.kind === 'message') {
              const isAssistantMessage = entry?.message?.role === 'assistant'
              const messageTurnId = String(entry?.message?.streamMeta?.turnId || '').trim()
              const isStreamingMessageAnchor = streamingMessageIsActive
                && String(entry?.message?.id || '').trim() === String(streamingMessage?.id || '').trim()
              const messageLiveTurn = messageTurnId
                ? resolvedLiveExecutionTurns[messageTurnId] || null
                : (isStreamingMessageAnchor ? streamingLiveTurn : null)
              const shouldRenderExecutionStream = isAssistantMessage && !!messageLiveTurn
              const footerRunbookBlock = joinsTurnHeaderDock(nextTimelineBlock, block)
                ? nextTimelineBlock
                : joinsTurnHeaderDock(previousTimelineBlock, block)
                  ? previousTimelineBlock
                  : null
              const footerRunbookFiles = Array.isArray(footerRunbookBlock?.fileChanges)
                ? footerRunbookBlock.fileChanges
                : []
              const messageBubble = (
                <MemoMessageBubble
                  message={entry.message}
                />
              )
              return wrapTimelineBlock(blockKey, blockId, (
                  <TurnShell
                    turnId={messageTurnId}
                    activities={footerRunbookBlock?.activities || []}
                    fileRows={footerRunbookFiles}
                    projectFolder={projectFolder}
                    isLiveTurn={isStreamingMessageAnchor && isStreaming}
                    executionTurn={shouldRenderExecutionStream ? messageLiveTurn : null}
                    finalAnswerStarted={hasVisibleMessageContent(entry.message)}
                    onContinueInterruptedTurn={onContinueInterruptedTurn}
                    dockSource="timeline"
                  >
                    {messageBubble}
                  </TurnShell>
                ))
            }

            return wrapTimelineBlock(blockKey, blockId, (
                <div className="pl-2">
                  <MemoToolActivityLine activity={entry.activity} />
                </div>
              ))
          })}
        </div>
      )}

      {streamingMessage && streamingFooterActive && (
        <div className="w-full space-y-2" style={{ maxWidth: 'var(--app-chat-content-max-width)' }}>
          <TurnShell
              turnId={resolvedStreamingTurnId}
              activities={streamingRunbookBlock?.activities || []}
              fileRows={streamingRunbookFiles}
              projectFolder={projectFolder}
              isLiveTurn={isStreaming}
              executionTurn={shouldRenderStreamingLiveExecution ? streamingLiveTurn : null}
              finalAnswerStarted={hasVisibleMessageContent(streamingMessage)}
              onContinueInterruptedTurn={onContinueInterruptedTurn}
              dockSource="streaming"
            >
              {shouldRenderStreamingMessageBubble ? (
                <MemoMessageBubble
                  key={`streaming-${streamingMessage.id}`}
                  message={streamingMessage}
                />
              ) : null}
          </TurnShell>
        </div>
      )}

      {terminalMemorySuggestionCard && (
        <div className="w-full" style={{ maxWidth: 'var(--app-chat-content-max-width)' }}>
          {terminalMemorySuggestionCard}
        </div>
      )}

      {jobsModalOpen && (
        <React.Suspense fallback={null}>
          <BackgroundJobsModalLazy
            jobs={backgroundJobs}
            loading={jobsLoading}
            error={jobsError}
            lastUpdated={jobsLastUpdated}
            busyId={jobsStoppingId}
            onRefresh={onRefreshBackgroundJobs}
            onStopJob={onStopBackgroundJob}
            onStopAll={onStopAllBackgroundJobs}
            onClose={onCloseJobsModal}
          />
        </React.Suspense>
      )}

      <React.Suspense fallback={null}>
        <ChatThreadModalsLazy
          createThreadModalOpen={createThreadModalOpen}
          newThreadTitle={newThreadTitle}
          onNewThreadTitleChange={onNewThreadTitleChange}
          onCreateThreadSubmit={onCreateThreadSubmit}
          onCloseCreateThreadModal={onCloseCreateThreadModal}
          renameThreadModalOpen={renameThreadModalOpen}
          renameThreadTitle={renameThreadTitle}
          onRenameThreadTitleChange={onRenameThreadTitleChange}
          onRenameThreadSubmit={onRenameThreadSubmit}
          onCloseRenameThreadModal={onCloseRenameThreadModal}
        />
      </React.Suspense>

      {writeConflictCards && (
        <div className="w-full" style={{ maxWidth: 'var(--app-chat-content-max-width)' }}>
          {writeConflictCards}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}

const MemoChatPanelTimelineArea = React.memo(ChatPanelTimelineArea)
MemoChatPanelTimelineArea.displayName = 'MemoChatPanelTimelineArea'

export { ChatPanelTimelineArea, MemoChatPanelTimelineArea }
export default ChatPanelTimelineArea
