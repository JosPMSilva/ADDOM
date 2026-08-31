import React from 'react'

import { buildCanonicalTurnFromEvents } from '../../../common/chat/canonical-turn-engine.mjs'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import { MemoMessageBubble } from '../chat/MessageBubble.jsx'
import TurnShell from '../chat/TurnShell.jsx'
import { hasVisibleMessageContent } from '../chat/message-content-visibility.mjs'
import useTimelineVirtualization from '../chat/use-timeline-virtualization.jsx'
import { MenuRow, MenuSurface } from '../ui/MenuSurface.jsx'
import AgentConversationComposer from './AgentConversationComposer.jsx'
import { AGENT_STATUS_TONE as STATUS_TONE } from './agent-status-tone.mjs'
import { runAgentConversationAction, listAgentConversationActions } from './agent-conversation-actions.mjs'
import useWorkspaceStore from '../../store/useWorkspaceStore.js'
import useVaultStore from '../../store/useVaultStore.js'
import {
  agentConversationCanFollowup,
  agentConversationHasActiveTurn,
  buildAgentConversationTurnGroups,
  resolveAgentConversationRoutePresentation,
} from './agent-conversation-view-model.mjs'

function BackIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5"><path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

function MoreIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5"><circle cx="3.5" cy="8" r="1.2" fill="currentColor" /><circle cx="8" cy="8" r="1.2" fill="currentColor" /><circle cx="12.5" cy="8" r="1.2" fill="currentColor" /></svg>
}

function Breadcrumb({ ancestry, rootLabel }) {
  if (ancestry.length === 0) return null
  const trail = ancestry.length > 2 ? [{ nodeId: 'ellipsis', label: '…' }, ancestry.at(-1)] : ancestry
  return (
    <span className="flex min-w-0 items-center gap-1 text-[11px] text-text-tertiary">
      <span className="truncate">{rootLabel}</span>
      {trail.map((entry) => <React.Fragment key={entry.nodeId}><span aria-hidden="true">›</span><span className="truncate">{entry.label}</span></React.Fragment>)}
      <span aria-hidden="true">›</span>
    </span>
  )
}

function AgentConversationOverflow({ conversation, node, hasCompletedTurn }) {
  const { t } = useRendererTranslation(['core'])
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const rootRef = React.useRef(null)
  const actions = React.useMemo(() => listAgentConversationActions(node, { hasCompletedTurn }).filter((action) => action.kind !== 'message'), [node, hasCompletedTurn])
  const openThreadInChat = useWorkspaceStore((state) => state.openThreadInChat)

  React.useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  if (actions.length === 0) return null

  const invoke = async (action) => {
    const api = typeof window === 'undefined' ? null : window?.addom?.agentRuns
    if (!api || busy) return
    setBusy(true); setError('')
    try {
      const result = await runAgentConversationAction({ agentRunsApi: api, scope: {
        projectId: conversation.projectId, threadId: conversation.threadId,
        runId: conversation.runId, nodeId: conversation.nodeId,
      }, action })
      if (result?.supported === false) throw new Error(result.reason || 'Conversation promotion is unavailable')
      if (action.kind === 'promote' && result?.thread?.id) await openThreadInChat(result.thread.id)
      setOpen(false)
    } catch {
      setError(t('core:agentConversation.actions.failure', { defaultValue: 'The agent action could not be completed.' }))
    } finally { setBusy(false) }
  }
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button type="button" aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => setOpen((value) => !value)} className="inline-flex items-center rounded-md p-1 text-text-tertiary hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-50" aria-label={t('core:agentConversation.actions.menu', { defaultValue: 'Agent actions' })} data-ui="agent-conversation-overflow"><MoreIcon /></button>
      {open ? <MenuSurface role="menu" className="absolute right-0 top-full z-40 mt-1 min-w-[10rem]" data-ui="agent-conversation-overflow-menu">{actions.map((action) => <MenuRow key={action.id} role="menuitem" disabled={busy} onClick={() => { void invoke(action) }}>{t(`core:agentConversation.actions.${action.id}`, { defaultValue: action.id })}</MenuRow>)}</MenuSurface> : null}
      {error ? <span className="absolute right-0 top-full z-40 mt-8 max-w-[12rem] rounded-md bg-surface-panel px-2 py-1 text-[10px] text-danger" role="alert">{error}</span> : null}
    </div>
  )
}

export function AgentConversationTurn({ group }) {
  const authoredMessages = group.messages.filter((message) => message.role === 'user')
  const assistantMessages = group.messages.filter((message) => message.role === 'assistant')
  const executionTurn = React.useMemo(() => ({
    ...buildCanonicalTurnFromEvents(group.executionItems, { status: group.turn.status }),
    turnId: group.turn.id,
  }), [group.executionItems, group.turn.id, group.turn.status])
  const isLiveTurn = agentConversationHasActiveTurn([group.turn])
  const finalAnswerStarted = assistantMessages.some(hasVisibleMessageContent)
  return (
    <div className="space-y-2" data-agent-turn-id={group.turn.id}>
      {authoredMessages.map((message) => <MemoMessageBubble key={message.id} message={message} />)}
      <TurnShell
        turnId={group.turn.id}
        isLiveTurn={isLiveTurn}
        executionTurn={executionTurn}
        finalAnswerStarted={finalAnswerStarted}
      >
        {assistantMessages.length > 0
          ? assistantMessages.map((message) => <MemoMessageBubble key={message.id} message={message} />)
          : null}
      </TurnShell>
    </div>
  )
}

export default function AgentConversationView({ conversation }) {
  const { t } = useRendererTranslation(['core'])
  const {
    missing, node, ancestry, items, pending, error, close,
    durableConversation, submitting, stopping, submitFollowup, stopActiveTurn,
  } = conversation
  const providers = useVaultStore((state) => state.providers)
  const backRef = React.useRef(null)
  const scrollContainerRef = React.useRef(null)
  React.useEffect(() => { backRef.current?.focus() }, [node?.id])
  const turnGroups = React.useMemo(() => buildAgentConversationTurnGroups({
    turns: durableConversation?.turns,
    messages: durableConversation?.messages,
    executionItems: items,
    threadId: conversation.threadId,
  }), [conversation.threadId, durableConversation?.messages, durableConversation?.turns, items])
  const timelineBlocks = React.useMemo(() => turnGroups.map((group) => ({
    id: `agent-turn:${group.turn.id}`,
    group,
  })), [turnGroups])
  const {
    renderedBlockEntries,
    timelineBlocksContainerStyle,
    wrapTimelineBlock,
    scrollHandlers,
  } = useTimelineVirtualization({ timelineBlocks, scrollContainerRef })
  const activeTurn = agentConversationHasActiveTurn(durableConversation?.turns)
  const followupSupported = agentConversationCanFollowup(node, { missing })
  const canFollowup = agentConversationCanFollowup(node, { missing, submitting })
  const canStop = activeTurn && node?.capabilitySnapshot?.childCancellation === true
  const queuedCount = durableConversation?.mailbox?.filter((entry) => entry.deliveryState === 'queued').length || 0
  const latestTurn = durableConversation?.turns?.at(-1) || null
  const displayStatus = activeTurn ? String(latestTurn?.status || 'running') : String(node?.status || '')
  const messageCount = turnGroups.reduce((total, group) => total + group.messages.length, 0)
  const routePresentation = React.useMemo(() => resolveAgentConversationRoutePresentation({
    node,
    providers,
  }), [node, providers])

  return (
    <section className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-surface" aria-label={t('core:agentConversation.regionLabel', { defaultValue: 'Agent conversation' })} data-ui="agent-conversation">
      <div className="flex h-[44px] shrink-0 items-center gap-2 border-b border-surface-border px-3">
        <button ref={backRef} type="button" onClick={close} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent" data-ui="agent-conversation-back"><BackIcon />{t('core:agentConversation.back', { defaultValue: 'Back' })}</button>
        <div className="flex min-w-0 flex-1 items-center gap-1.5"><Breadcrumb ancestry={ancestry} rootLabel={t('core:agentConversation.rootLabel', { defaultValue: 'Thread' })} /><span className="truncate text-xs font-medium text-text-primary">{node?.roleLabel || node?.taskSummary || conversation.nodeId}</span></div>
        {node ? <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-text-tertiary"><span aria-hidden="true" data-agent-status={displayStatus} className={`h-1.5 w-1.5 rounded-full ${STATUS_TONE[displayStatus] || 'bg-text-tertiary'}`} />{t(`core:agentNavigator.status.${displayStatus}`, { defaultValue: displayStatus })}</span> : null}
        {!missing && node ? <AgentConversationOverflow conversation={conversation} node={node} hasCompletedTurn={durableConversation?.turns?.some((turn) => turn.status === 'completed') === true} /> : null}
      </div>
      <div ref={scrollContainerRef} onScroll={scrollHandlers.onScroll} onFocusCapture={scrollHandlers.onFocusCapture} onBlurCapture={scrollHandlers.onBlurCapture} className="min-h-0 flex-1 overflow-y-auto px-4 py-3 select-text" data-ui="agent-conversation-body">
        <div className="mx-auto w-full space-y-2" style={{ ...timelineBlocksContainerStyle, maxWidth: 'var(--app-chat-content-max-width)' }}>
          {missing ? <div className="mx-auto max-w-xl pt-10 text-center"><p className="text-xs font-medium text-text-secondary">{t('core:agentConversation.unavailableTitle', { defaultValue: 'Agent unavailable' })}</p><p className="mt-1 text-[11px] text-text-muted">{t('core:agentConversation.unavailableBody', { defaultValue: 'This agent is no longer part of the run.' })}</p></div> : null}
          {!missing && node?.taskSummary && !pending && messageCount === 0 ? <p className="mb-3 text-[11px] text-text-tertiary" data-ui="agent-conversation-task">{node.taskSummary}</p> : null}
          {!missing && renderedBlockEntries.map(({ block, blockId }) => (
            wrapTimelineBlock(blockId, blockId, <AgentConversationTurn group={block.group} />)
          ))}
          {!missing && pending && messageCount === 0 ? <p className="text-[11px] text-text-muted">{t('core:agentConversation.loading', { defaultValue: 'Loading transcript…' })}</p> : null}
          {!missing && !pending && !error && messageCount === 0 ? <p className="text-[11px] text-text-muted">{t('core:agentConversation.empty', { defaultValue: 'No transcript recorded yet.' })}</p> : null}
          {error ? <p className="text-[11px] text-danger" role="status">{t('core:agentConversation.error', { defaultValue: "Could not load this agent's transcript." })}</p> : null}
          {!missing && !followupSupported ? <p className="mt-3 text-[11px] text-text-muted" data-ui="agent-conversation-followup-unavailable">{t('core:agentConversation.unavailableBody', { defaultValue: 'This agent conversation is read-only.' })}</p> : null}
          {queuedCount > 0 ? <p className="mt-3 text-[11px] text-text-tertiary" data-ui="agent-conversation-queued">{t('core:agentNavigator.status.queued', { defaultValue: 'Queued' })} · {queuedCount}</p> : null}
        </div>
      </div>
      {followupSupported ? <AgentConversationComposer route={routePresentation} active={canStop} disabled={!canFollowup} submitting={submitting} stopping={stopping} placeholder={t('core:agentConversation.actions.messagePlaceholder', { defaultValue: 'Write a concise instruction…' })} sendLabel={t('core:agentConversation.actions.send', { defaultValue: 'Send' })} stopLabel={t('core:agentConversation.actions.interrupt', { defaultValue: 'Stop' })} onSubmit={submitFollowup} onStop={stopActiveTurn} /> : null}
    </section>
  )
}
