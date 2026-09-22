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

function finalAnswerFootnotePrefix(messageId = '') {
  const source = String(messageId || 'message')
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  const label = source.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(-32)
  return `addom-${label || 'message'}-${(hash >>> 0).toString(36)}-`
}

function FinalAnswerFallback({ text = '' }) {
  return <p className="final-answer-fallback whitespace-pre-wrap break-words">{String(text ?? '')}</p>
}

const FinalAnswerMarkdownBlock = React.memo(function FinalAnswerMarkdownBlock({
  block = null,
  components = null,
  remarkRehypeOptions = null,
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
      remarkRehypeOptions={remarkRehypeOptions}
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
  const remarkRehypeOptions = useMemo(
    () => ({ clobberPrefix: finalAnswerFootnotePrefix(messageId) }),
    [messageId],
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
  const renderedBlocks = projection.requiresDocumentContext
    ? [projection.document]
    : projection.blocks

  return (
    <div
      className="final-answer-document min-w-0"
      data-final-answer-document="true"
      data-final-answer-message-id={String(messageId || '').trim() || undefined}
      data-final-answer-streaming={isStreaming ? 'true' : 'false'}
      data-final-answer-completed-blocks={renderedBlocks.length}
      data-final-answer-document-context={projection.requiresDocumentContext ? 'true' : undefined}
      data-final-answer-delegation-echo-suppressed={echoSuppressed ? 'true' : undefined}
    >
      {renderedBlocks.map((block) => (
        <FinalAnswerMarkdownBlock
          key={block.id}
          block={block}
          components={components}
          remarkRehypeOptions={remarkRehypeOptions}
        />
      ))}
      {!projection.requiresDocumentContext && projection.tail.renderText ? (
        <FinalAnswerMarkdownBlock
          key={projection.tail.id}
          block={projection.tail}
          components={components}
          remarkRehypeOptions={remarkRehypeOptions}
        />
      ) : null}
    </div>
  )
}
