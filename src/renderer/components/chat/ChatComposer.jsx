import React from 'react'
import AttachedImagePreview from './AttachedImagePreview.jsx'
import ComposerAgentQuickMenu from './ComposerAgentQuickMenu.jsx'
import ComposerCodeBlockAdvancedEditorModal from './ComposerCodeBlockAdvancedEditorModal.jsx'
import ChatComposerAddContentControls from './ChatComposerAddContentControls.jsx'
import ChatComposerDraftTextarea from './ChatComposerDraftTextarea.jsx'
import LineNumberedBlockEditor from './LineNumberedBlockEditor.jsx'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import useChatComposerResize from './use-chat-composer-resize.mjs'
import {
  areComposerBlockListsEquivalent,
  composerBlockMatchesId,
  createCodeComposerBlock,
  createTextComposerBlock,
  deriveCodeBlockHighlightHtml,
  normalizeComposerBlockSnapshot,
  removeComposerBlockPreservingIdentity,
  replaceComposerBlockPreservingIdentity,
} from './chat-composer-block-utils.mjs'
import { applyCodeBlockKeymap } from './composer-code-keymap.mjs'

const CLOSED_ADVANCED_EDITOR_STATE = Object.freeze({
  open: false,
  blockId: '',
  language: 'plaintext',
  code: '',
})

function scheduleComposerHighlightWork(task) {
  if (typeof task !== 'function') return () => {}
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(() => {
      task()
    }, { timeout: 120 })
    return () => window.cancelIdleCallback?.(handle)
  }
  const handle = setTimeout(() => {
    task()
  }, 0)
  return () => clearTimeout(handle)
}

function ChatComposerCodeBlockRow({
  block,
  disabled,
  advancedEditorOpen = false,
  blockRefs,
  onOpenAdvanced,
  onRemove,
  onLanguageChange,
  onCodeChange,
  onCodeEditorKeyDown,
  onCodeLanguageKeyDown,
}) {
  const { t } = useRendererTranslation(['core'])
  const deferredCode = React.useDeferredValue(String(block.code || ''))
  const deferredLanguage = React.useDeferredValue(String(block.language || 'plaintext'))
  const [highlightHtml, setHighlightHtml] = React.useState(null)

  React.useEffect(() => {
    const cancelScheduledHighlight = scheduleComposerHighlightWork(() => {
      const nextHighlightHtml = deriveCodeBlockHighlightHtml(deferredCode, deferredLanguage)
      React.startTransition(() => {
        setHighlightHtml((prev) => (prev === nextHighlightHtml ? prev : nextHighlightHtml))
      })
    })
    return cancelScheduledHighlight
  }, [deferredCode, deferredLanguage])

  const setTextareaRef = React.useCallback((node) => {
    if (node) blockRefs.current.set(block.id, node)
    else blockRefs.current.delete(block.id)
  }, [block.id, blockRefs])

  const handleLanguageChange = React.useCallback((event) => {
    onLanguageChange(block.id, event.target.value)
  }, [block.id, onLanguageChange])

  const handleOpenAdvanced = React.useCallback(() => {
    onOpenAdvanced(block.id)
  }, [block.id, onOpenAdvanced])

  const handleRemove = React.useCallback(() => {
    onRemove(block.id)
  }, [block.id, onRemove])

  const handleCodeChange = React.useCallback((event) => {
    onCodeChange(block.id, event.target.value)
  }, [block.id, onCodeChange])

  const handleCodeKeyDown = React.useCallback((event) => {
    onCodeEditorKeyDown(event, block.id)
  }, [block.id, onCodeEditorKeyDown])

  const handleLanguageKeyDown = React.useCallback((event) => {
    onCodeLanguageKeyDown(event, block.id)
  }, [block.id, onCodeLanguageKeyDown])

  return (
    <div
      className="group shrink-0 rounded-lg border border-surface-border/40 bg-surface/30 shadow-inner overflow-hidden relative"
      data-ui="chat-composer-code-bubble"
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-surface-border/40 bg-surface-panel/20 backdrop-blur-sm relative z-10">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[9px] uppercase tracking-widest text-text-muted shrink-0">
            {t('core:chat.composer.blockLabels.code', { defaultValue: 'Code' })}
          </span>
          <input
            type="text"
            value={block.language ?? 'plaintext'}
            onChange={handleLanguageChange}
            onKeyDown={handleLanguageKeyDown}
            disabled={disabled}
            className="h-5 w-20 rounded border border-surface-border bg-surface-panel px-1.5 text-[10px] font-mono text-text-subtle outline-none focus:border-accent/60 disabled:opacity-40"
            title={t('core:chat.composer.codeLanguage', { defaultValue: 'Code language' })}
            aria-label={t('core:chat.composer.codeLanguage', { defaultValue: 'Code language' })}
          />
          <button
            type="button"
            onClick={handleOpenAdvanced}
            disabled={disabled}
            className={[
              'text-[10px] px-1.5 py-0.5 rounded border transition-colors disabled:opacity-40',
              advancedEditorOpen
                ? 'border-accent/60 bg-accent-muted/40 text-accent-soft'
                : 'border-surface-border text-text-muted hover:border-border-hover hover:text-text-secondary',
            ].join(' ')}
            title={t('core:chat.composer.openAdvancedEditor', { defaultValue: 'Open advanced code editor' })}
            data-ui="chat-composer-code-open-advanced"
          >
            {t('core:chat.composer.advanced', { defaultValue: 'Advanced' })}
          </button>
        </div>
        <button
          type="button"
          onClick={handleRemove}
          disabled={disabled}
          className="opacity-0 group-hover:opacity-100 inline-flex h-5 w-5 items-center justify-center rounded border border-surface-border/50 text-text-muted hover:border-surface-border hover:text-text-secondary hover:bg-surface-panel/50 disabled:opacity-40 transition-all duration-200"
          title={t('core:chat.composer.removeBlock', { defaultValue: 'Remove block' })}
          aria-label={t('core:chat.composer.removeCodeBlock', { defaultValue: 'Remove code block' })}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <LineNumberedBlockEditor
        setTextareaRef={setTextareaRef}
        rows={Math.max(3, Math.min(10, String(block.code || '').split('\n').length || 3))}
        value={String(block.code || '')}
        onChange={handleCodeChange}
        onKeyDown={handleCodeKeyDown}
        placeholder={t('core:chat.composer.codePlaceholder', { defaultValue: 'Code...' })}
        disabled={disabled}
        className="w-full min-h-[72px] max-h-44 overflow-y-auto bg-transparent placeholder-text-muted text-xs leading-5 font-mono resize-none outline-none disabled:opacity-40 px-3 py-2"
        dataUi="chat-composer-code-input"
        highlightHtml={highlightHtml}
        highlightLanguage={block.language}
      />
    </div>
  )
}

const MemoChatComposerCodeBlockRow = React.memo(ChatComposerCodeBlockRow)
MemoChatComposerCodeBlockRow.displayName = 'MemoChatComposerCodeBlockRow'

function ChatComposerTextBlockRow({
  block,
  disabled,
  blockRefs,
  onRemove,
  onTextChange,
  onTextKeyDown,
}) {
  const { t } = useRendererTranslation(['core'])
  const setTextareaRef = React.useCallback((node) => {
    if (node) blockRefs.current.set(block.id, node)
    else blockRefs.current.delete(block.id)
  }, [block.id, blockRefs])

  const handleRemove = React.useCallback(() => {
    onRemove(block.id)
  }, [block.id, onRemove])

  const handleTextChange = React.useCallback((event) => {
    onTextChange(block.id, event.target.value)
  }, [block.id, onTextChange])

  const handleTextKeyDown = React.useCallback((event) => {
    onTextKeyDown(event, block.id)
  }, [block.id, onTextKeyDown])

  return (
    <div
      className="group shrink-0 rounded-lg border border-surface-border/40 bg-surface/30 shadow-inner overflow-hidden relative"
      data-ui="chat-composer-text-block"
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-surface-border/40 bg-surface-panel/20 backdrop-blur-sm relative z-10">
        <span className="text-[9px] uppercase tracking-widest text-text-muted">
          {t('core:chat.composer.blockLabels.text', { defaultValue: 'Text' })}
        </span>
        <button
          type="button"
          onClick={handleRemove}
          disabled={disabled}
          className="opacity-0 group-hover:opacity-100 inline-flex h-5 w-5 items-center justify-center rounded border border-surface-border/50 text-text-muted hover:border-surface-border hover:text-text-secondary hover:bg-surface-panel/50 disabled:opacity-40 transition-all duration-200"
          title={t('core:chat.composer.removeBlock', { defaultValue: 'Remove block' })}
          aria-label={t('core:chat.composer.removeTextBlock', { defaultValue: 'Remove text block' })}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <LineNumberedBlockEditor
        setTextareaRef={setTextareaRef}
        rows={Math.max(2, Math.min(8, String(block.text || '').split('\n').length || 2))}
        value={String(block.text || '')}
        onChange={handleTextChange}
        onKeyDown={handleTextKeyDown}
        placeholder=""
        disabled={disabled}
        className="w-full min-h-[56px] max-h-36 overflow-y-auto bg-transparent text-text-subtle placeholder-text-muted text-sm leading-5 resize-none outline-none disabled:opacity-40 px-3 py-2"
        dataUi="chat-composer-input-segment"
      />
    </div>
  )
}

const MemoChatComposerTextBlockRow = React.memo(ChatComposerTextBlockRow)
MemoChatComposerTextBlockRow.displayName = 'MemoChatComposerTextBlockRow'

export default function ChatComposer({
  composerInputRef,
  composerBlocks = [],
  composerBlocksSyncVersion = 0,
  composerDraftText = '',
  composerDraftSyncVersion = 0,
  onDraftTextChange,
  onBlocksChange,
  onKeyDown,
  placeholder,
  disabled,
  isStreaming,
  agentQuickActionsEnabled = false,
  agentMenuOpen = false,
  onAgentMenuOpenChange = () => {},
  directAgentRoles = [],
  directAgentRolesLoading = false,
  onRefreshDirectAgentRoles,
  onInsertDirectAgentTarget,
  onFocusComposer,
  attachedImages = [],
  onImageRemove,
  openAIKnowledgeBaseEnabled = false,
  openAIKnowledgeBaseStateByAttachmentId = {},
  openAIKnowledgeBaseBusyAttachmentIds = [],
  onAddToOpenAIKnowledgeBase = null,
  attachButtonTitle = '',
  attachDisabled = true,
  onAttachFiles = null,
  selectedProvider = '',
  selectedModel = '',
  projectFolder = '',
  inlineCompletionEnabled = true,
}) {
  const { t } = useRendererTranslation(['core'])
  const [snippetMenuOpen, setSnippetMenuOpen] = React.useState(false)
  const [advancedEditorState, setAdvancedEditorState] = React.useState(CLOSED_ADVANCED_EDITOR_STATE)
  const [composerActionsWidth, setComposerActionsWidth] = React.useState(0)
  const [liveComposerBlocks, setLiveComposerBlocks] = React.useState(() => (
    normalizeComposerBlockSnapshot(composerBlocks)
  ))

  const blockRefs = React.useRef(new Map())
  const liveComposerBlocksRef = React.useRef(liveComposerBlocks)
  const fileInputRef = React.useRef(null)
  const snippetMenuRef = React.useRef(null)
  const snippetTriggerRef = React.useRef(null)
  const composerActionsRef = React.useRef(null)

  const normalizedBlocks = liveComposerBlocks

  React.useEffect(() => {
    liveComposerBlocksRef.current = liveComposerBlocks
  }, [liveComposerBlocks])

  React.useEffect(() => {
    const nextBlocks = normalizeComposerBlockSnapshot(composerBlocks)
    liveComposerBlocksRef.current = nextBlocks
    setLiveComposerBlocks((prev) => (
      areComposerBlockListsEquivalent(prev, nextBlocks) ? prev : nextBlocks
    ))
  }, [composerBlocksSyncVersion, composerBlocks])

  React.useEffect(() => {
    if (!agentQuickActionsEnabled || isStreaming) {
      onAgentMenuOpenChange(false)
    }
  }, [isStreaming, onAgentMenuOpenChange, agentQuickActionsEnabled])

  React.useEffect(() => {
    if (!snippetMenuOpen) return undefined
    const onPointerDown = (event) => {
      if (snippetMenuRef.current?.contains(event.target)) return
      if (snippetTriggerRef.current?.contains(event.target)) return
      setSnippetMenuOpen(false)
    }
    const handleWindowKeyDown = (event) => {
      if (event.key === 'Escape') setSnippetMenuOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', handleWindowKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [snippetMenuOpen])

  React.useEffect(() => {
    const node = composerActionsRef.current
    if (!node || typeof window === 'undefined') return undefined

    const syncWidth = () => {
      const nextWidth = Math.ceil(node.getBoundingClientRect().width || 0)
      setComposerActionsWidth((prev) => (prev === nextWidth ? prev : nextWidth))
    }

    syncWidth()

    if (typeof window.ResizeObserver !== 'function') return undefined
    const observer = new window.ResizeObserver(() => {
      syncWidth()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [agentQuickActionsEnabled, isStreaming, snippetMenuOpen, disabled])

  const {
    activeDraftTextareaMaxHeight,
    attachedPreviewRef,
    blocksViewportHeight,
    blocksViewportRef,
    clampBlocksViewportHeight,
    composerShellMaxHeight,
    draftMetaRowRef,
    handleComposerResizePointerDown,
    handleDraftResizePointerDown,
    explicitDraftTextareaHeight,
    minBlocksViewportHeight,
    minDraftTextareaHeightPx,
    setPrimaryComposerRef,
    shellRef,
  } = useChatComposerResize({
    composerInputRef,
    normalizedBlocksLength: normalizedBlocks.length,
    attachedImagesLength: attachedImages.length,
    agentMenuOpen,
    agentQuickActionsEnabled,
    isStreaming,
  })

  const emitBlocksChange = React.useCallback((nextBlocks, options = {}) => {
    if (typeof onBlocksChange === 'function') {
      onBlocksChange(nextBlocks, {
        ...options,
        assumeBlocksNormalized: options.assumeBlocksNormalized !== false,
      })
    }
  }, [onBlocksChange])

  const commitLocalBlocks = React.useCallback((nextBlocks, options = {}) => {
    const resolvedNextBlocks = Array.isArray(nextBlocks) ? nextBlocks : []
    liveComposerBlocksRef.current = resolvedNextBlocks
    setLiveComposerBlocks((prev) => (prev === resolvedNextBlocks ? prev : resolvedNextBlocks))
    emitBlocksChange(resolvedNextBlocks, {
      ...options,
      assumeBlocksNormalized: options.assumeBlocksNormalized !== false,
      syncExternalBlocks: options.syncExternalBlocks === true,
    })
    return resolvedNextBlocks
  }, [emitBlocksChange])

  const focusBlockOrDraft = React.useCallback((candidateBlockIds = []) => {
    requestAnimationFrame(() => {
      for (const candidateId of candidateBlockIds) {
        const id = String(candidateId || '').trim()
        if (!id) continue
        const node = blockRefs.current.get(id)
        if (node && typeof node.focus === 'function') {
          node.focus()
          return
        }
      }
      composerInputRef?.current?.focus?.()
    })
  }, [composerInputRef])

  const updateTextBlock = React.useCallback((blockId, nextText) => {
    const nextBlocks = replaceComposerBlockPreservingIdentity(
      liveComposerBlocksRef.current,
      blockId,
      () => createTextComposerBlock(nextText, blockId),
    )
    commitLocalBlocks(nextBlocks, { source: 'text_block' })
  }, [commitLocalBlocks])

  const updateCodeBlock = React.useCallback((blockId, nextCode) => {
    const nextBlocks = replaceComposerBlockPreservingIdentity(
      liveComposerBlocksRef.current,
      blockId,
      (current) => createCodeComposerBlock({
        language: current?.language || 'plaintext',
        code: nextCode,
      }, blockId),
    )
    commitLocalBlocks(nextBlocks, { source: 'code_block' })
  }, [commitLocalBlocks])

  const updateCodeBlockLanguage = React.useCallback((blockId, nextLanguage) => {
    const nextBlocks = replaceComposerBlockPreservingIdentity(
      liveComposerBlocksRef.current,
      blockId,
      (current) => createCodeComposerBlock({
        language: nextLanguage,
        code: current?.code || '',
      }, blockId),
    )
    commitLocalBlocks(nextBlocks, { source: 'code_block_language' })
  }, [commitLocalBlocks])

  const removeBlock = React.useCallback((blockId) => {
    const targetId = String(blockId || '').trim()
    const currentBlocks = liveComposerBlocksRef.current
    const index = currentBlocks.findIndex((block) => composerBlockMatchesId(block, targetId))
    const nextBlocks = removeComposerBlockPreservingIdentity(currentBlocks, targetId)
    commitLocalBlocks(nextBlocks, { source: 'block_delete' })
    setAdvancedEditorState((prev) => (
      prev.open && prev.blockId === targetId ? CLOSED_ADVANCED_EDITOR_STATE : prev
    ))
    const nextCandidateId = currentBlocks[index + 1]?.id || ''
    const prevCandidateId = currentBlocks[index - 1]?.id || ''
    focusBlockOrDraft([nextCandidateId, prevCandidateId])
  }, [commitLocalBlocks, focusBlockOrDraft])

  const openAdvancedCodeEditor = React.useCallback((blockId) => {
    const targetId = String(blockId || '').trim()
    if (!targetId || disabled) return
    const block = liveComposerBlocksRef.current.find((entry) => composerBlockMatchesId(entry, targetId))
    if (!block || block.type !== 'code') return
    setAdvancedEditorState({
      open: true,
      blockId: targetId,
      language: String(block.language || 'plaintext'),
      code: String(block.code || ''),
    })
  }, [disabled])

  const closeAdvancedCodeEditor = React.useCallback(() => {
    setAdvancedEditorState(CLOSED_ADVANCED_EDITOR_STATE)
  }, [])

  const applyAdvancedCodeEditor = React.useCallback(() => {
    if (!advancedEditorState.open || !advancedEditorState.blockId) return
    const nextBlocks = replaceComposerBlockPreservingIdentity(
      liveComposerBlocksRef.current,
      advancedEditorState.blockId,
      () => createCodeComposerBlock({
        language: String(advancedEditorState.language || 'plaintext'),
        code: String(advancedEditorState.code || ''),
      }, advancedEditorState.blockId),
    )
    commitLocalBlocks(nextBlocks, { source: 'code_block_advanced_editor' })
    const appliedBlockId = advancedEditorState.blockId
    setAdvancedEditorState(CLOSED_ADVANCED_EDITOR_STATE)
    focusBlockOrDraft([appliedBlockId])
  }, [advancedEditorState, commitLocalBlocks, focusBlockOrDraft])

  React.useEffect(() => {
    if (!advancedEditorState.open || !advancedEditorState.blockId) return
    const hasTargetBlock = normalizedBlocks.some(
      (entry) => composerBlockMatchesId(entry, advancedEditorState.blockId),
    )
    if (!hasTargetBlock) {
      setAdvancedEditorState(CLOSED_ADVANCED_EDITOR_STATE)
    }
  }, [advancedEditorState.blockId, advancedEditorState.open, normalizedBlocks])

  const addSnippetBlock = React.useCallback((type) => {
    const newBlock = type === 'code'
      ? createCodeComposerBlock({ language: 'plaintext', code: '' })
      : createTextComposerBlock('')
    const nextBlocks = [...liveComposerBlocksRef.current, newBlock]
    commitLocalBlocks(nextBlocks, { source: 'snippet_insert' })
    setSnippetMenuOpen(false)
    focusBlockOrDraft([newBlock.id])
  }, [commitLocalBlocks, focusBlockOrDraft])

  const handleAttachInputChange = React.useCallback((event) => {
    const files = Array.from(event?.target?.files || [])
    if (files.length && typeof onAttachFiles === 'function') {
      onAttachFiles(files)
    }
    if (event?.target) event.target.value = ''
  }, [onAttachFiles])

  const handleAttachClick = React.useCallback(() => {
    if (attachDisabled) return
    setSnippetMenuOpen(false)
    fileInputRef.current?.click?.()
  }, [attachDisabled])

  const handleCodeEditorKeyDown = React.useCallback((event, blockId) => {
    if (
      typeof HTMLTextAreaElement !== 'undefined'
      && event?.target instanceof HTMLTextAreaElement
    ) {
      const currentBlock = liveComposerBlocksRef.current.find((block) => (
        composerBlockMatchesId(block, blockId)
      ))
      if (currentBlock?.type === 'code') {
        const textarea = event.target
        const keymapResult = applyCodeBlockKeymap({
          value: String(currentBlock.code || ''),
          selectionStart: Number(textarea.selectionStart || 0),
          selectionEnd: Number(textarea.selectionEnd || 0),
          key: event.key,
          shiftKey: !!event.shiftKey,
          ctrlKey: !!event.ctrlKey,
          metaKey: !!event.metaKey,
          altKey: !!event.altKey,
          language: String(currentBlock.language || 'plaintext'),
        })

        if (keymapResult.handled) {
          event.preventDefault()
          const nextBlocks = replaceComposerBlockPreservingIdentity(
            liveComposerBlocksRef.current,
            blockId,
            () => createCodeComposerBlock({
              language: String(currentBlock.language || 'plaintext'),
              code: keymapResult.value,
            }, blockId),
          )
          commitLocalBlocks(nextBlocks, { source: 'code_block_keymap' })
          requestAnimationFrame(() => {
            if (typeof document === 'undefined') return
            if (!textarea || textarea !== document.activeElement) return
            textarea.selectionStart = keymapResult.selectionStart
            textarea.selectionEnd = keymapResult.selectionEnd
          })
          return
        }
      }
    }

    onKeyDown?.(event, {
      editorKind: 'block',
      blockType: 'code',
      blockId,
      source: 'code_editor',
    })
  }, [commitLocalBlocks, onKeyDown])

  const handleCodeLanguageKeyDown = React.useCallback((event, blockId) => {
    onKeyDown?.(event, {
      editorKind: 'block',
      blockType: 'code',
      blockId,
      source: 'code_language_input',
    })
  }, [onKeyDown])

  const handleTextBlockKeyDown = React.useCallback((event, blockId) => {
    onKeyDown?.(event, {
      editorKind: 'block',
      blockType: 'text',
      blockId,
      source: 'text_block_editor',
    })
  }, [onKeyDown])

  const hasAttachments = attachedImages.length > 0
  const hasSnippetBlocks = normalizedBlocks.length > 0
  const centerDraftWithinShell = !hasAttachments && !hasSnippetBlocks
  const showBlocksResizeHandle = hasSnippetBlocks || hasAttachments
  const showDraftResizeHandle = !(hasAttachments && !hasSnippetBlocks)
  const showShellTopResizeHandle = showBlocksResizeHandle || (!hasSnippetBlocks && showDraftResizeHandle)
  const showInlineDraftResizeHandle = hasSnippetBlocks && showDraftResizeHandle
  const showDraftMetaRow = showInlineDraftResizeHandle
  const topResizePointerDown = hasSnippetBlocks
    ? handleComposerResizePointerDown
    : handleDraftResizePointerDown
  const topResizeTitle = hasSnippetBlocks
    ? 'Resize snippets area'
    : 'Resize draft input area'

  return (
    <div className="w-full" data-ui="chat-composer-row">
      <div
        ref={shellRef}
        className="relative flex min-h-[38px] w-full min-w-0 items-stretch gap-3 rounded-t-2xl rounded-b-none bg-transparent px-4 py-1.5 transition-colors"
        style={{
          ...(composerShellMaxHeight > 0 ? { maxHeight: `${composerShellMaxHeight}px` } : {}),
        }}
        onMouseDown={onFocusComposer}
        data-ui="chat-composer-shell"
      >
        <ComposerAgentQuickMenu
          open={agentMenuOpen}
          onClose={() => onAgentMenuOpenChange(false)}
          roles={directAgentRoles}
          loading={directAgentRolesLoading}
          onRefresh={onRefreshDirectAgentRoles}
          onInsert={onInsertDirectAgentTarget}
        />

        {showShellTopResizeHandle && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-0 justify-center">
            <button
              type="button"
              onPointerDown={topResizePointerDown}
              className="pointer-events-auto relative z-20 h-4 w-24 flex items-center justify-center cursor-ns-resize opacity-60 hover:opacity-100 transition-opacity"
              title={topResizeTitle}
              aria-label={topResizeTitle}
              style={{ touchAction: 'none' }}
              data-ui="chat-composer-blocks-resize-handle"
            >
              <span className="block h-[2px] w-12 -translate-y-px rounded-full bg-surface-border" />
            </button>
          </div>
        )}

        <div className={`relative w-full min-w-0 self-start min-h-0 flex flex-col overflow-visible ${centerDraftWithinShell ? 'justify-center' : ''}`}>
          {attachedImages.length > 0 && (
            <div ref={attachedPreviewRef}>
              <AttachedImagePreview
                images={attachedImages}
                onRemove={onImageRemove}
                openAIKnowledgeBaseEnabled={openAIKnowledgeBaseEnabled}
                openAIKnowledgeBaseStateByAttachmentId={openAIKnowledgeBaseStateByAttachmentId}
                openAIKnowledgeBaseBusyAttachmentIds={openAIKnowledgeBaseBusyAttachmentIds}
                onAddToOpenAIKnowledgeBase={onAddToOpenAIKnowledgeBase}
              />
            </div>
          )}

          {normalizedBlocks.length > 0 && (
            <div
              ref={blocksViewportRef}
              className="mb-1.5 flex flex-col gap-1.5 overflow-y-auto pr-3"
              style={{
                maxHeight: `${clampBlocksViewportHeight(blocksViewportHeight)}px`,
                minHeight: `${minBlocksViewportHeight}px`,
                flexShrink: 0,
                scrollbarGutter: 'stable',
              }}
              data-ui="chat-composer-blocks-viewport"
            >
              {normalizedBlocks.map((block) => (
                block.type === 'code'
                  ? (
                    <MemoChatComposerCodeBlockRow
                      key={block.id}
                      block={block}
                      disabled={disabled}
                      advancedEditorOpen={advancedEditorState.open && advancedEditorState.blockId === block.id}
                      blockRefs={blockRefs}
                      onOpenAdvanced={openAdvancedCodeEditor}
                      onRemove={removeBlock}
                      onLanguageChange={updateCodeBlockLanguage}
                      onCodeChange={updateCodeBlock}
                      onCodeEditorKeyDown={handleCodeEditorKeyDown}
                      onCodeLanguageKeyDown={handleCodeLanguageKeyDown}
                    />
                  )
                  : (
                    <MemoChatComposerTextBlockRow
                      key={block.id}
                      block={block}
                      disabled={disabled}
                      blockRefs={blockRefs}
                      onRemove={removeBlock}
                      onTextChange={updateTextBlock}
                      onTextKeyDown={handleTextBlockKeyDown}
                    />
                  )
              ))}
            </div>
          )}

          <div
            className={`${normalizedBlocks.length > 0 ? 'border-t border-surface-border/50 pt-1.5' : ''} relative shrink-0 min-h-[38px]`}
          >
            {showDraftMetaRow && (
              <div ref={draftMetaRowRef} className="relative mb-1 min-h-3 flex justify-center">
                {showInlineDraftResizeHandle ? (
                  <button
                    type="button"
                    onPointerDown={handleDraftResizePointerDown}
                    className="h-2 w-24 flex items-center justify-center cursor-ns-resize opacity-60 hover:opacity-100 transition-opacity"
                    title="Resize draft input area"
                    aria-label="Resize draft input area"
                    style={{ touchAction: 'none' }}
                    data-ui="chat-composer-draft-resize-handle"
                  >
                    <span className="block h-[2px] w-12 rounded-full bg-border-strong" />
                  </button>
                ) : (
                  <div className="mx-auto h-2 w-24" aria-hidden="true" />
                )}
              </div>
            )}
            <div
              style={{
                marginRight: composerActionsWidth > 0 ? `${composerActionsWidth + 12}px` : undefined,
              }}
            >
              <ChatComposerDraftTextarea
                composerDraftText={composerDraftText}
                composerDraftSyncVersion={composerDraftSyncVersion}
                onDraftTextChange={onDraftTextChange}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                disabled={disabled}
                slashCommandsEnabled={normalizedBlocks.length === 0}
                slashMenuExtraWidthPx={composerActionsWidth > 0 ? composerActionsWidth + 12 : 0}
                activeDraftTextareaMaxHeight={activeDraftTextareaMaxHeight}
                draftTextareaExplicitHeight={explicitDraftTextareaHeight}
                minDraftTextareaHeightPx={minDraftTextareaHeightPx}
                setPrimaryComposerRef={setPrimaryComposerRef}
              />
            </div>
          </div>
        </div>

        <ChatComposerAddContentControls
          composerActionsRef={composerActionsRef}
          fileInputRef={fileInputRef}
          snippetTriggerRef={snippetTriggerRef}
          snippetMenuRef={snippetMenuRef}
          snippetMenuOpen={snippetMenuOpen}
          setSnippetMenuOpen={setSnippetMenuOpen}
          handleAttachInputChange={handleAttachInputChange}
          handleAttachClick={handleAttachClick}
          addSnippetBlock={addSnippetBlock}
          attachDisabled={attachDisabled}
          attachButtonTitle={attachButtonTitle}
          disabled={disabled}
          isStreaming={isStreaming}
          t={t}
        />
      </div>

      {advancedEditorState.open && (
        <ComposerCodeBlockAdvancedEditorModal
          open={advancedEditorState.open}
          language={advancedEditorState.language}
          code={advancedEditorState.code}
          providerId={selectedProvider}
          modelId={selectedModel}
          projectFolder={projectFolder}
          inlineCompletionEnabled={inlineCompletionEnabled}
          onCodeChange={(nextCode) => {
            setAdvancedEditorState((prev) => (
              prev.open ? { ...prev, code: String(nextCode || '') } : prev
            ))
          }}
          onLanguageChange={(nextLanguage) => {
            setAdvancedEditorState((prev) => (
              prev.open ? { ...prev, language: String(nextLanguage || 'plaintext') } : prev
            ))
          }}
          onApply={applyAdvancedCodeEditor}
          onCancel={closeAdvancedCodeEditor}
        />
      )}
    </div>
  )
}
