import React, { useMemo } from 'react'
import { groupPatchSegments, parseChatRenderSegments } from './chat-render-segments.mjs'
import { ensureUniqueSegmentIds, MemoProseMarkdown, normalizeAssistantDisplayProse, renderPlainProseText } from './message-bubble-render-utils.mjs'
import { renderChatRichContentSegments, useChatMarkdownComponents } from './chat-rich-content-renderer.jsx'

const TYPOGRAPHY_ROLE_CLASSNAME = {
  'assistant-bubble': 'chat-typo-content-prose',
  'exec-reasoning': 'chat-typo-exec-reasoning-prose',
  'agent-task': 'chat-typo-agent-task',
  'agent-result': 'chat-typo-agent-result',
}

const TYPOGRAPHY_ROLE_SURFACE_CLASSNAME = {
  'exec-reasoning': 'text-text-secondary',
}

const PLAIN_PROSE_CLASSNAME_BY_ROLE = {
  'exec-reasoning': 'whitespace-pre-wrap break-words text-text-secondary',
}

const DEFAULT_PLAIN_PROSE_CLASSNAME = 'whitespace-pre-wrap break-words text-chat-text'

export default function AssistantRichContent({
  text = '',
  keyPrefix = 'assistant-rich',
  mode = 'assistant-message',
  markdownComponentConfig = null,
  typographyRole = '',
  featurePolicy = null,
  className = '',
}) {
  const normalizedText = String(text ?? '')
  const normalizedTypographyRole = String(typographyRole || '').trim()
  const typographyRoleClassName = TYPOGRAPHY_ROLE_CLASSNAME[normalizedTypographyRole] || ''
  const typographySurfaceClassName = TYPOGRAPHY_ROLE_SURFACE_CLASSNAME[normalizedTypographyRole] || 'text-chat-text'
  const plainProseClassName = PLAIN_PROSE_CLASSNAME_BY_ROLE[normalizedTypographyRole] || DEFAULT_PLAIN_PROSE_CLASSNAME
  const markdownComponents = useChatMarkdownComponents({
    mode,
    config: markdownComponentConfig,
  })
  const renderMarkdown = ({ key, text: proseText }) => (
    <MemoProseMarkdown
      key={key}
      text={normalizeAssistantDisplayProse(proseText)}
      components={markdownComponents}
      fallback={renderPlainProseText(proseText, {
        keyPrefix: `${key}:fallback`,
        className: plainProseClassName,
      })}
    />
  )
  const renderPlainProse = ({ key, text: proseText }) => renderPlainProseText(proseText, {
    keyPrefix: key,
    className: plainProseClassName,
  })
  const segments = useMemo(() => {
    try {
      const parsed = parseChatRenderSegments(normalizedText, {
        mode: 'final',
        extractStandaloneCode: true,
        tailStrategy: 'raw_fallback',
      })
      return groupPatchSegments(ensureUniqueSegmentIds(parsed.segments))
    } catch {
      return [{
        id: 'assistant-rich-fallback',
        type: 'prose_markdown',
        text: normalizedText,
      }]
    }
  }, [normalizedText])

  if (!normalizedText.trim()) return null

  return (
    <div className={`min-w-0 break-words select-text ${typographySurfaceClassName} prose-chat ${typographyRoleClassName} ${className}`.trim()}>
      {renderChatRichContentSegments(segments, {
        keyPrefix,
        mode,
        featurePolicy,
        renderMarkdown,
        renderPlainProse,
      })}
    </div>
  )
}
