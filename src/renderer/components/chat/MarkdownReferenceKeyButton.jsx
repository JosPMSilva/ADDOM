import React, { useCallback } from 'react'
import useAppStore from '../../store/useAppStore.js'

export default function MarkdownReferenceKeyButton({
  insertText = '',
  label = '',
  children = null,
}) {
  const queueChatDraftInjection = useAppStore((state) => state.queueChatDraftInjection)
  const setActivePanel = useAppStore((state) => state.setActivePanel)
  const snippet = String(insertText || '').trim()
  const visibleLabel = String(label || snippet).trim() || snippet

  const handleClick = useCallback((event) => {
    event.preventDefault()
    event.stopPropagation()
    if (!snippet) return
    setActivePanel?.('chat')
    queueChatDraftInjection?.({
      text: snippet,
      mode: 'snippet',
      source: 'markdown_reference_key',
      focusComposer: true,
    })
  }, [queueChatDraftInjection, setActivePanel, snippet])

  if (!snippet) {
    return <span className="chat-markdown-key-static">{children || visibleLabel}</span>
  }

  return (
    <button
      type="button"
      className="chat-markdown-key-insert"
      onClick={handleClick}
      title={`Insert ${snippet} into composer`}
      aria-label={`Insert ${snippet} into composer`}
    >
      {children || visibleLabel}
    </button>
  )
}
