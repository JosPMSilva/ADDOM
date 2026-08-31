import React, { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { projectStreamingFinalDocument } from '../../../../common/chat/final-document-stream-projector.mjs'
import {
  hasDelegationPayload,
  stripDelegationPayloads,
} from '../../../../common/chat/strip-delegation-payload.mjs'
import { MemoProseMarkdown } from '../../markdown/LazyMarkdownRenderer.jsx'
import { createFinalAnswerMarkdownComponents } from './final-answer-markdown-components.jsx'
import { normalizeGeneratedArtifactMarkdownImages } from './generated-artifact-image.mjs'

const CHAT_RENDER_DEBUG = import.meta.env.DEV && import.meta.env.VITE_CHAT_PERF_DEBUG === '1'

function FinalAnswerFallback({ text = '' }) {
  return <p className="final-answer-fallback whitespace-pre-wrap break-words">{String(text ?? '')}</p>
}

const FinalAnswerMarkdownBlock = React.memo(function FinalAnswerMarkdownBlock({
  block = null,
  components = null,
}) {
  useEffect(() => {
    if (!CHAT_RENDER_DEBUG || !block?.id) return undefined
    console.debug(`[chat perf] final-block:mount block=${block.id}`)
    return () => console.debug(`[chat perf] final-block:unmount block=${block.id}`)
  }, [block?.id])

  const text = String(block?.renderText ?? block?.text ?? '')
  if (!text) return null
  return (
    <MemoProseMarkdown
      text={text}
      components={components}
      fallback={<FinalAnswerFallback text={text} />}
    />
  )
})

export default function FinalAnswerDocument({
  text = '',
  messageId = '',
  threadId = '',
  isStreaming = false,
  generatedArtifacts = [],
}) {
  const { t } = useTranslation('core')
  const sourceText = String(text ?? '')
  const strippedText = useMemo(() => stripDelegationPayloads(sourceText), [sourceText])
  const echoSuppressed = !strippedText && hasDelegationPayload(sourceText)
  const normalizedText = echoSuppressed
    ? t('agentStream.delegationEchoSuppressed', {
      defaultValue: 'Delegation finished. Open Agents for the details.',
    })
    : strippedText
  const renderText = useMemo(
    () => normalizeGeneratedArtifactMarkdownImages(normalizedText, generatedArtifacts),
    [generatedArtifacts, normalizedText],
  )
  const components = useMemo(
    () => createFinalAnswerMarkdownComponents({ generatedArtifacts, messageId, threadId }),
    [generatedArtifacts, messageId, threadId],
  )
  const projectionRef = useRef(null)
  const projection = useMemo(() => projectStreamingFinalDocument({
    previous: projectionRef.current,
    messageId,
    text: renderText,
    settled: !isStreaming,
  }), [isStreaming, messageId, renderText])
  projectionRef.current = projection
  if (!renderText) return null

  return (
    <div
      className="final-answer-document min-w-0"
      data-final-answer-document="true"
      data-final-answer-message-id={String(messageId || '').trim() || undefined}
      data-final-answer-streaming={isStreaming ? 'true' : 'false'}
      data-final-answer-completed-blocks={projection.blocks.length}
      data-final-answer-delegation-echo-suppressed={echoSuppressed ? 'true' : undefined}
    >
      {projection.blocks.map((block) => (
        <FinalAnswerMarkdownBlock key={block.id} block={block} components={components} />
      ))}
      {projection.tail.renderText ? (
        <FinalAnswerMarkdownBlock
          key={projection.tail.id}
          block={projection.tail}
          components={components}
        />
      ) : null}
    </div>
  )
}
