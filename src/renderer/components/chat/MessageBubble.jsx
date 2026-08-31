import React from 'react'
import MessageBubbleUserAttachments from './MessageBubbleUserAttachments.jsx'
import FinalAnswerDocument from './final-document/FinalAnswerDocument.jsx'
import { useChatMarkdownComponents } from './chat-rich-content-renderer.jsx'
import {
  MemoProseMarkdown,
  messageTextNeedsMarkdownRuntime,
  renderPlainProseText,
} from './message-bubble-render-utils.mjs'

function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  const isError = message.status === 'error'
  const isStreaming = message.status === 'streaming'

  const assistantDisplayText = String(message.content ?? '')
  const canonicalFinalText = !isStreaming && typeof message?.finalDocument?.text === 'string'
    ? message.finalDocument.text
    : assistantDisplayText
  const userMessageNeedsMarkdownRuntime = isUser && messageTextNeedsMarkdownRuntime(String(message.content || ''))

  const markdownComponents = useChatMarkdownComponents({ mode: 'assistant-message' })
  const renderMarkdownText = ({ key, text }) => (
    <MemoProseMarkdown
      key={key}
      text={text}
      components={markdownComponents}
      fallback={renderPlainProseText(text, { keyPrefix: `${key}:fallback` })}
    />
  )

  const bubbleClassName = [
    'min-w-0 break-words select-text',
    isUser
      ? 'max-w-[58%] rounded-xl rounded-br-sm border border-chat-user-border bg-chat-user-surface text-chat-user-text whitespace-pre-wrap px-4 py-3 chat-typo-user-body'
      : isError
        ? 'max-w-[76%] rounded-2xl rounded-bl-sm border border-danger-border bg-chat-surface text-danger whitespace-pre-wrap px-4 py-3 chat-typo-error-body'
        : 'w-full max-w-none pr-2 py-1 text-chat-text prose-chat chat-typo-content-prose',
  ].join(' ')

  return (
    <>
      <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={bubbleClassName}>
          {isUser || isError ? (
            <>
              {isUser && Array.isArray(message.content) ? (
                <MessageBubbleUserAttachments
                  messageId={message.id}
                  parts={message.content}
                />
              ) : isUser && userMessageNeedsMarkdownRuntime ? (
                renderMarkdownText({ key: `${message.id}:user-markdown`, text: String(message.content || '') })
              ) : (
                message.content
              )}
              {isStreaming && <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-accent thinking-cursor-strong rounded-sm align-middle" />}
            </>
          ) : (
            <>
              <FinalAnswerDocument
                text={canonicalFinalText}
                messageId={message.id}
                threadId={message?.streamMeta?.threadId}
                isStreaming={isStreaming}
                generatedArtifacts={message.generatedArtifacts}
              />
            </>
          )}
        </div>
      </div>
    </>
  )
}

const MemoMessageBubble = React.memo(
  MessageBubble,
  (prev, next) => (
    prev.message?.id === next.message?.id
    && prev.message?.role === next.message?.role
    && prev.message?.status === next.message?.status
    && prev.message?.content === next.message?.content
    && prev.message?.finalDocument?.text === next.message?.finalDocument?.text
    && prev.message?.generatedArtifacts === next.message?.generatedArtifacts
    && prev.message?.streamMeta?.threadId === next.message?.streamMeta?.threadId
    && prev.message?.streamMeta?.turnId === next.message?.streamMeta?.turnId
    && prev.actionsDisabled === next.actionsDisabled
  ),
)

export { MessageBubble, MemoMessageBubble }
