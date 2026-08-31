import React from 'react'
import SlashCommandMenu from './SlashCommandMenu.jsx'
import {
  applySlashCommandSelection,
  resolveSlashCommandMenuState,
} from './slash-command-registry.mjs'

function ChatComposerDraftTextarea({
  composerDraftText = '',
  composerDraftSyncVersion = 0,
  onDraftTextChange,
  onKeyDown,
  placeholder,
  disabled = false,
  activeDraftTextareaMaxHeight = 115,
  draftTextareaExplicitHeight = null,
  minDraftTextareaHeightPx = 38,
  setPrimaryComposerRef,
  slashCommandsEnabled = true,
  slashMenuExtraWidthPx = 0,
}) {
  const [draftText, setDraftText] = React.useState(() => String(composerDraftText || ''))
  const [layout, setLayout] = React.useState(() => ({
    heightPx: Math.max(Number(minDraftTextareaHeightPx) || 38, 38),
    shouldScroll: false,
  }))
  const [slashSelectionIndex, setSlashSelectionIndex] = React.useState(0)
  const [hasFocus, setHasFocus] = React.useState(false)
  const [selection, setSelection] = React.useState(() => ({ start: 0, end: 0 }))
  const [dismissedSlashToken, setDismissedSlashToken] = React.useState('')
  const textareaRef = React.useRef(null)
  const minHeight = Math.max(Number(minDraftTextareaHeightPx) || 38, 38)
  const maxHeight = Math.max(Number(activeDraftTextareaMaxHeight) || 0, minHeight)
  const numericExplicitHeight = draftTextareaExplicitHeight == null
    ? null
    : Number(draftTextareaExplicitHeight)
  const resolvedExplicitHeight = Number.isFinite(numericExplicitHeight)
    ? Math.max(minHeight, Math.round(numericExplicitHeight))
    : null

  const setComposerTextareaRef = React.useCallback((node) => {
    textareaRef.current = node || null
    setPrimaryComposerRef?.(node || null)
  }, [setPrimaryComposerRef])

  React.useEffect(() => {
    setDraftText(String(composerDraftText || ''))
  }, [composerDraftSyncVersion, composerDraftText])

  React.useEffect(() => {
    if (!dismissedSlashToken) return
    const nextState = resolveSlashCommandMenuState({
      draftText,
      selectionStart: selection.start,
      selectionEnd: selection.end,
      slashCommandsEnabled,
    })
    if (nextState.token !== dismissedSlashToken) {
      setDismissedSlashToken('')
    }
  }, [dismissedSlashToken, draftText, selection.end, selection.start, slashCommandsEnabled])

  const measureLayout = React.useCallback(() => {
    const node = textareaRef.current
    if (!node) return

    const previousHeight = node.style.height
    node.style.height = `${minHeight}px`
    const contentHeight = Math.max(minHeight, Math.ceil(Number(node.scrollHeight) || 0))
    node.style.height = previousHeight

    const nextHeight = Number.isFinite(resolvedExplicitHeight)
      ? Math.max(minHeight, Math.round(resolvedExplicitHeight))
      : Math.min(contentHeight, maxHeight)
    const nextShouldScroll = contentHeight > nextHeight

    setLayout((prev) => (
      prev.heightPx === nextHeight && prev.shouldScroll === nextShouldScroll
        ? prev
        : { heightPx: nextHeight, shouldScroll: nextShouldScroll }
    ))
  }, [maxHeight, minHeight, resolvedExplicitHeight])

  React.useLayoutEffect(() => {
    measureLayout()
  }, [measureLayout, draftText])

  React.useEffect(() => {
    const node = textareaRef.current
    if (!node || typeof ResizeObserver !== 'function') return undefined
    const observer = new ResizeObserver(() => {
      measureLayout()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [measureLayout])

  const handleDraftTextChange = React.useCallback((event) => {
    const rawNext = String(event?.target?.value || '')
    setDraftText(rawNext)
    const resolvedNext = typeof onDraftTextChange === 'function'
      ? onDraftTextChange(rawNext)
      : rawNext
    const nextDraftText = typeof resolvedNext === 'string'
      ? resolvedNext
      : rawNext
    if (nextDraftText !== rawNext) {
      setDraftText(String(nextDraftText || ''))
    }
  }, [onDraftTextChange])

  const syncSelectionFromNode = React.useCallback((node) => {
    if (!node) return
    setSelection((prev) => {
      const next = {
        start: Number(node.selectionStart ?? 0),
        end: Number(node.selectionEnd ?? 0),
      }
      return prev.start === next.start && prev.end === next.end ? prev : next
    })
  }, [])

  const slashMenuState = React.useMemo(() => (
    resolveSlashCommandMenuState({
      draftText,
      selectionStart: selection.start,
      selectionEnd: selection.end,
      slashCommandsEnabled,
    })
  ), [draftText, selection.end, selection.start, slashCommandsEnabled])

  const slashMenuOpen = hasFocus
    && slashMenuState.open
    && slashMenuState.token !== dismissedSlashToken

  const slashItems = slashMenuState.items
  const activeSlashIndex = slashItems.length <= 0
    ? 0
    : Math.max(0, Math.min(slashSelectionIndex, slashItems.length - 1))
  const activeSlashCommand = slashItems[activeSlashIndex] || null
  const slashListId = 'chat-composer-slash-menu-listbox'
  const activeSlashOptionId = activeSlashCommand ? `${slashListId}-option-${activeSlashCommand.id}` : undefined

  React.useEffect(() => {
    if (!slashMenuOpen) {
      setSlashSelectionIndex(0)
      return
    }
    setSlashSelectionIndex((prev) => Math.max(0, Math.min(prev, Math.max(0, slashItems.length - 1))))
  }, [slashItems.length, slashMenuOpen])

  const applySlashCommand = React.useCallback((command) => {
    const nextDraftText = applySlashCommandSelection({
      draftText,
      command,
      selectionStart: selection.start,
      selectionEnd: selection.end,
      slashCommandsEnabled,
    })
    if (!nextDraftText || nextDraftText === draftText) return
    setDismissedSlashToken('')
    setDraftText(nextDraftText)
    const resolvedNext = typeof onDraftTextChange === 'function'
      ? onDraftTextChange(nextDraftText)
      : nextDraftText
    const finalDraftText = typeof resolvedNext === 'string' ? resolvedNext : nextDraftText
    if (finalDraftText !== nextDraftText) {
      setDraftText(String(finalDraftText || ''))
    }
    requestAnimationFrame(() => {
      const node = textareaRef.current
      if (!node) return
      const caret = String(finalDraftText || '').length
      node.focus()
      node.setSelectionRange?.(caret, caret)
      syncSelectionFromNode(node)
    })
  }, [draftText, onDraftTextChange, selection.end, selection.start, slashCommandsEnabled, syncSelectionFromNode])

  const handleTextareaKeyDown = React.useCallback((e) => {
    if (slashMenuOpen && slashItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashSelectionIndex((prev) => Math.min(prev + 1, slashItems.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashSelectionIndex((prev) => Math.max(prev - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (activeSlashCommand) {
          e.preventDefault()
          applySlashCommand(activeSlashCommand)
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissedSlashToken(slashMenuState.token)
        return
      }
    }

    onKeyDown?.(e, {
      editorKind: 'draft',
      blockType: 'text',
      source: 'draft_row',
    })
  }, [activeSlashCommand, applySlashCommand, onKeyDown, slashItems.length, slashMenuOpen, slashMenuState.token])

  return (
    <div className="relative">
      <SlashCommandMenu
        open={slashMenuOpen}
        items={slashItems}
        selectedIndex={activeSlashIndex}
        listId={slashListId}
        extraWidthPx={slashMenuExtraWidthPx}
        onHighlight={setSlashSelectionIndex}
        onSelect={applySlashCommand}
      />
      <textarea
        ref={setComposerTextareaRef}
        rows={1}
        value={draftText}
        onChange={(event) => {
          handleDraftTextChange(event)
          syncSelectionFromNode(event?.target || null)
        }}
        onKeyDown={handleTextareaKeyDown}
        onSelect={(event) => syncSelectionFromNode(event?.target || null)}
        onClick={(event) => syncSelectionFromNode(event?.target || null)}
        onKeyUp={(event) => syncSelectionFromNode(event?.target || null)}
        onFocus={(event) => {
          setHasFocus(true)
          syncSelectionFromNode(event?.target || null)
        }}
        onBlur={() => {
          setHasFocus(false)
        }}
        placeholder={placeholder}
        aria-label={placeholder || undefined}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={slashMenuOpen}
        aria-controls={slashMenuOpen ? slashListId : undefined}
        aria-activedescendant={slashMenuOpen ? activeSlashOptionId : undefined}
        className={`w-full min-h-[38px] bg-transparent py-2 text-chat-text placeholder:text-text-secondary/65 text-[13px] leading-5 resize-none outline-none disabled:opacity-40 ${layout.shouldScroll ? 'overflow-y-auto' : 'overflow-y-hidden'}`}
        style={{
          height: `${Math.round(Number(layout.heightPx) || 0)}px`,
          maxHeight: `${activeDraftTextareaMaxHeight}px`,
          minHeight: `${minDraftTextareaHeightPx}px`,
          ...(layout.shouldScroll ? { scrollbarGutter: 'stable' } : {}),
        }}
        data-ui="chat-composer-input"
      />
    </div>
  )
}

const MemoChatComposerDraftTextarea = React.memo(ChatComposerDraftTextarea)
MemoChatComposerDraftTextarea.displayName = 'MemoChatComposerDraftTextarea'

export { ChatComposerDraftTextarea, MemoChatComposerDraftTextarea }
export default MemoChatComposerDraftTextarea
