import React from 'react'

import { SendIcon, StopIcon } from '../chat/ChatComposerIcons.jsx'
import ChatComposerDraftTextarea from '../chat/ChatComposerDraftTextarea.jsx'
import ConversationComposerFoundation, {
  ConversationComposerActionButton,
  ConversationComposerControlSurface,
  ConversationComposerInputSurface,
} from '../chat/ConversationComposerFoundation.jsx'

export default function AgentConversationComposer({
  disabled = false,
  submitting = false,
  active = false,
  stopping = false,
  placeholder = '',
  sendLabel = 'Send',
  stopLabel = 'Stop',
  route = null,
  onSubmit = () => {},
  onStop = () => {},
}) {
  const [text, setText] = React.useState('')
  const providerLabel = String(route?.providerLabel || '').trim()
  const modelLabel = String(route?.modelLabel || '').trim()
  const routeLabel = String(route?.label || '').trim()
  const busyLabel = submitting ? `${sendLabel}…` : stopping ? `${stopLabel}…` : ''
  const submit = async () => {
    const value = text.trim()
    if (!value || disabled || submitting) return
    const accepted = await onSubmit(value)
    if (accepted !== false) setText((current) => current.trim() === value ? '' : current)
  }
  return (
    <ConversationComposerFoundation variant="agent">
      <div
        className="mx-auto w-full p-4"
        style={{ maxWidth: 'var(--app-chat-composer-max-width)' }}
        data-ui="agent-conversation-composer"
        aria-busy={submitting || stopping}
      >
        <ConversationComposerInputSurface data-ui="agent-conversation-composer-input-surface">
          <div className="px-4 py-1.5 text-sm text-text-primary">
            <ChatComposerDraftTextarea
              composerDraftText={text}
              onDraftTextChange={(value) => {
                setText(value)
                return value
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void submit()
                }
              }}
              disabled={disabled || submitting}
              placeholder={placeholder}
              activeDraftTextareaMaxHeight={160}
              slashCommandsEnabled={false}
            />
          </div>
        </ConversationComposerInputSurface>
        <ConversationComposerControlSurface data-ui="agent-conversation-composer-control-rail">
          <div className="flex min-h-8 items-center gap-2">
            {providerLabel && modelLabel ? (
              <div
                className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px]"
                title={routeLabel}
                aria-label={routeLabel}
                data-ui="agent-conversation-composer-route"
              >
                <span className="max-w-[42%] shrink-0 truncate font-medium text-text-secondary">{providerLabel}</span>
                <span className="shrink-0 text-text-muted" aria-hidden="true">·</span>
                <span className="min-w-0 truncate text-text-tertiary">{modelLabel}</span>
              </div>
            ) : <span className="flex-1" aria-hidden="true" />}
            <p
              className="shrink-0 text-[11px] text-text-tertiary"
              role="status"
              aria-live="polite"
            >
              {busyLabel}
            </p>
            <ConversationComposerActionButton
              onClick={() => { void submit() }}
              disabled={disabled || submitting || !text.trim()}
              aria-label={sendLabel}
              title={sendLabel}
              data-ui="agent-conversation-composer-send"
            >
              <SendIcon />
            </ConversationComposerActionButton>
            {active ? (
              <ConversationComposerActionButton
                tone="stop"
                onClick={() => { void onStop() }}
                disabled={stopping}
                aria-label={stopLabel}
                title={stopLabel}
                data-ui="agent-conversation-composer-stop"
              >
                <StopIcon />
              </ConversationComposerActionButton>
            ) : null}
          </div>
        </ConversationComposerControlSurface>
      </div>
    </ConversationComposerFoundation>
  )
}
