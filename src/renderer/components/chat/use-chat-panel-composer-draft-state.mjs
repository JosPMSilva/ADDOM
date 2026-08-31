import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CHAT_DRAFT_STORAGE_KEY,
  CHAT_DRAFT_SAVE_DEBOUNCE_MS,
} from './chat-utils.js'
import {
  createTextComposerBlock,
  extractComposerBlocksFromDraftText,
  normalizeComposerBlocks,
  parseComposerMarkdownToBlocksAndDraft,
  serializeComposerBlocksAndDraft,
} from './composer-segments.mjs'
import { isDirectAgentCommandText } from './direct-agent-command-parser.mjs'
import {
  composerHasMeaningfulContent,
  normalizeInjectedComposerBlocksPayload,
  normalizePendingEditorDraftPrelude,
} from './chat-panel-helpers.mjs'
import { appendComposerSnippet } from './markdown-reference-example-cells.mjs'

function normalizeBlocks(blocks = []) {
  return normalizeComposerBlocks(blocks, {
    ensureTextSegment: false,
    ensureTrailingTextSegment: false,
  })
}

export function hasTripleBacktickFenceCandidate(value = '') {
  return String(value || '').includes('```')
}

function hasMeaningfulComposerBlocks(blocks = []) {
  return (Array.isArray(blocks) ? blocks : []).some((block) => {
    if (!block || typeof block !== 'object') return false
    if (String(block.type || '').trim().toLowerCase() === 'code') return true
    return String(block.text || '').trim().length > 0
  })
}

export function deriveComposerDraftMetadata({
  composerBlocks = [],
  composerDraftText = '',
} = {}) {
  const hasBlockContent = hasMeaningfulComposerBlocks(composerBlocks)
  const draftText = String(composerDraftText || '')
  return {
    hasComposerContent: hasBlockContent || draftText.trim().length > 0,
    isDirectAgentDraft: !hasBlockContent && isDirectAgentCommandText(draftText),
  }
}

export function resolveComposerDraftTextChange({
  nextDraftValue = '',
  previousBlocks = [],
} = {}) {
  const rawNext = String(nextDraftValue ?? '')
  const priorBlocks = Array.isArray(previousBlocks) ? previousBlocks : []
  if (!hasTripleBacktickFenceCandidate(rawNext)) {
    return {
      nextComposerBlocks: priorBlocks,
      nextComposerDraftText: rawNext,
      usedFenceParsing: false,
      parseFailed: false,
      error: null,
    }
  }

  try {
    const { blocksToAppend, remainingDraftText } = extractComposerBlocksFromDraftText(rawNext)
    if (blocksToAppend.length <= 0) {
      return {
        nextComposerBlocks: priorBlocks,
        nextComposerDraftText: String(remainingDraftText || ''),
        usedFenceParsing: true,
        parseFailed: false,
        error: null,
      }
    }

    return {
      nextComposerBlocks: normalizeBlocks([
        ...priorBlocks,
        ...blocksToAppend,
      ]),
      nextComposerDraftText: String(remainingDraftText || ''),
      usedFenceParsing: true,
      parseFailed: false,
      error: null,
    }
  } catch (error) {
    return {
      nextComposerBlocks: priorBlocks,
      nextComposerDraftText: rawNext,
      usedFenceParsing: true,
      parseFailed: true,
      error,
    }
  }
}

export function flushComposerDraftBeforeThreadChange({
  currentThreadId = '',
  nextThreadId = '',
  clearScheduledDraftPersist = () => {},
  persistComposerDraftNow = () => {},
} = {}) {
  clearScheduledDraftPersist()
  const current = String(currentThreadId || '').trim()
  const next = String(nextThreadId || '').trim()
  if (!current || current === next) return false
  persistComposerDraftNow()
  return true
}

export function useChatPanelComposerDraftState({
  activeThreadId = '',
  pendingChatDraftInjection = null,
  clearPendingChatDraftInjection = () => {},
  setPendingContextPrefix = () => {},
  composerInputRef = null,
} = {}) {
  const [composerDraftText, setComposerDraftTextState] = useState('')
  const [composerDraftSyncVersion, setComposerDraftSyncVersion] = useState(0)
  const [composerBlocksSyncVersion, setComposerBlocksSyncVersion] = useState(0)
  const [composerBlocks, setComposerBlocksState] = useState(() => normalizeBlocks([]))
  const [pendingEditorDraftPreludes, setPendingEditorDraftPreludes] = useState([])
  const [hasComposerContent, setHasComposerContent] = useState(false)
  const [isDirectAgentDraft, setIsDirectAgentDraft] = useState(false)

  const composerDraftTextRef = useRef('')
  const composerBlocksRef = useRef(normalizeBlocks([]))
  const activeThreadIdRef = useRef(String(activeThreadId || ''))
  const persistDraftTimerRef = useRef(null)

  const syncComposerMetadata = useCallback((nextBlocks = composerBlocksRef.current, nextDraftText = composerDraftTextRef.current) => {
    const nextMeta = deriveComposerDraftMetadata({
      composerBlocks: nextBlocks,
      composerDraftText: nextDraftText,
    })
    setHasComposerContent((prev) => (
      prev === nextMeta.hasComposerContent ? prev : nextMeta.hasComposerContent
    ))
    setIsDirectAgentDraft((prev) => (
      prev === nextMeta.isDirectAgentDraft ? prev : nextMeta.isDirectAgentDraft
    ))
    return nextMeta
  }, [])

  const clearScheduledDraftPersist = useCallback(() => {
    const timer = persistDraftTimerRef.current
    if (!timer) return
    clearTimeout(timer)
    persistDraftTimerRef.current = null
  }, [])

  const persistComposerDraftNow = useCallback(() => {
    const threadId = String(activeThreadIdRef.current || '').trim()
    if (!threadId) return
    try {
      const raw = window.localStorage.getItem(CHAT_DRAFT_STORAGE_KEY)
      const byThread = raw ? JSON.parse(raw) : {}
      const next = byThread && typeof byThread === 'object' ? { ...byThread } : {}
      const serializedDraft = serializeComposerBlocksAndDraft({
        blocks: composerBlocksRef.current,
        draftText: composerDraftTextRef.current,
        trimOuterWhitespace: false,
      })
      if (serializedDraft.trim()) {
        next[threadId] = serializedDraft
      } else {
        delete next[threadId]
      }
      window.localStorage.setItem(CHAT_DRAFT_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Non-fatal.
    }
  }, [])

  const scheduleComposerDraftPersist = useCallback(() => {
    clearScheduledDraftPersist()
    if (!String(activeThreadIdRef.current || '').trim()) return
    persistDraftTimerRef.current = setTimeout(() => {
      persistDraftTimerRef.current = null
      persistComposerDraftNow()
    }, CHAT_DRAFT_SAVE_DEBOUNCE_MS)
  }, [clearScheduledDraftPersist, persistComposerDraftNow])

  const applyComposerSnapshot = useCallback(({
    nextBlocks = composerBlocksRef.current,
    nextDraftText = composerDraftTextRef.current,
    assumeBlocksNormalized = false,
    syncExternalBlocks = true,
    forceBlocksSync = false,
    syncExternalDraftText = false,
    forceDraftSync = false,
    focusComposer = false,
    schedulePersist = true,
  } = {}) => {
    const normalizedBlocks = nextBlocks === composerBlocksRef.current
      ? composerBlocksRef.current
      : (assumeBlocksNormalized ? nextBlocks : normalizeBlocks(nextBlocks))
    const normalizedDraftText = String(nextDraftText ?? '')
    const blocksChanged = normalizedBlocks !== composerBlocksRef.current
    const draftChanged = normalizedDraftText !== composerDraftTextRef.current

    if (blocksChanged) {
      composerBlocksRef.current = normalizedBlocks
    }

    if (syncExternalBlocks && (blocksChanged || forceBlocksSync)) {
      setComposerBlocksState((prev) => (prev === normalizedBlocks ? prev : normalizedBlocks))
      setComposerBlocksSyncVersion((prev) => prev + 1)
    }

    if (draftChanged) {
      composerDraftTextRef.current = normalizedDraftText
    }

    if (syncExternalDraftText && (draftChanged || forceDraftSync)) {
      setComposerDraftTextState((prev) => (
        prev === normalizedDraftText ? prev : normalizedDraftText
      ))
      setComposerDraftSyncVersion((prev) => prev + 1)
    }

    syncComposerMetadata(normalizedBlocks, normalizedDraftText)
    if (schedulePersist) {
      scheduleComposerDraftPersist()
    }
    if (focusComposer) {
      requestAnimationFrame(() => {
        composerInputRef?.current?.focus?.()
      })
    }

    return {
      blocks: normalizedBlocks,
      draftText: normalizedDraftText,
      blocksChanged,
      draftChanged,
    }
  }, [
    composerInputRef,
    scheduleComposerDraftPersist,
    syncComposerMetadata,
  ])

  const focusComposerDraftInput = useCallback(() => {
    requestAnimationFrame(() => {
      composerInputRef?.current?.focus?.()
    })
  }, [composerInputRef])

  const setComposerDraftText = useCallback((valueOrUpdater, options = {}) => {
    const nextDraftText = typeof valueOrUpdater === 'function'
      ? valueOrUpdater(composerDraftTextRef.current)
      : valueOrUpdater
    return applyComposerSnapshot({
      nextBlocks: composerBlocksRef.current,
      nextDraftText,
      syncExternalDraftText: options.syncExternalDraftText !== false,
      forceDraftSync: options.forceDraftSync === true,
      focusComposer: options.focusComposer === true,
      schedulePersist: options.schedulePersist !== false,
    }).draftText
  }, [applyComposerSnapshot])

  const setComposerBlocks = useCallback((valueOrUpdater, options = {}) => {
    const nextBlocks = typeof valueOrUpdater === 'function'
      ? valueOrUpdater(composerBlocksRef.current)
      : valueOrUpdater
    return applyComposerSnapshot({
      nextBlocks,
      assumeBlocksNormalized: options.assumeBlocksNormalized === true,
      syncExternalBlocks: options.syncExternalBlocks !== false,
      forceBlocksSync: options.forceBlocksSync === true,
      nextDraftText: composerDraftTextRef.current,
      syncExternalDraftText: options.syncExternalDraftText === true,
      forceDraftSync: options.forceDraftSync === true,
      focusComposer: options.focusComposer === true,
      schedulePersist: options.schedulePersist !== false,
    }).blocks
  }, [applyComposerSnapshot])

  const syncComposerBlocks = useCallback((nextBlocks, options = {}) => ({
    blocks: setComposerBlocks(nextBlocks, {
      ...options,
      assumeBlocksNormalized: options.assumeBlocksNormalized !== false,
      syncExternalBlocks: options.syncExternalBlocks === true,
    }),
  }), [setComposerBlocks])

  const setComposerFromMarkdownText = useCallback((valueOrUpdater, options = {}) => {
    const currentMarkdown = serializeComposerBlocksAndDraft({
      blocks: composerBlocksRef.current,
      draftText: composerDraftTextRef.current,
      trimOuterWhitespace: false,
    })
    const nextValue = typeof valueOrUpdater === 'function'
      ? valueOrUpdater(currentMarkdown)
      : valueOrUpdater
    const nextMarkdown = String(nextValue ?? '')

    try {
      const parsed = parseComposerMarkdownToBlocksAndDraft(nextMarkdown)
      applyComposerSnapshot({
        nextBlocks: parsed.composerBlocks,
        nextDraftText: String(parsed.composerDraftText || ''),
        syncExternalDraftText: true,
        forceDraftSync: true,
        focusComposer: options.focusComposer === true,
      })
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[ADDOM chat composer] failed to parse markdown draft; preserving raw text', error)
      }
      applyComposerSnapshot({
        nextBlocks: normalizeBlocks([]),
        nextDraftText: nextMarkdown,
        syncExternalDraftText: true,
        forceDraftSync: true,
        focusComposer: options.focusComposer === true,
      })
    }
    return nextMarkdown
  }, [applyComposerSnapshot])

  const handleComposerDraftTextChange = useCallback((nextDraftValue) => {
    const {
      nextComposerBlocks,
      nextComposerDraftText,
      parseFailed,
      error,
    } = resolveComposerDraftTextChange({
      nextDraftValue,
      previousBlocks: composerBlocksRef.current,
    })

    const nextSnapshot = applyComposerSnapshot({
      nextBlocks: nextComposerBlocks,
      assumeBlocksNormalized: true,
      syncExternalBlocks: nextComposerBlocks !== composerBlocksRef.current,
      nextDraftText: nextComposerDraftText,
      syncExternalDraftText: false,
    })

    if (parseFailed) {
      if (import.meta.env.DEV) {
        console.warn('[ADDOM chat composer] failed to extract blocks from draft text', error)
      }
    }
    return nextSnapshot.draftText
  }, [applyComposerSnapshot])

  useEffect(() => {
    const nextThreadId = String(activeThreadId || '')
    flushComposerDraftBeforeThreadChange({
      currentThreadId: activeThreadIdRef.current,
      nextThreadId,
      clearScheduledDraftPersist,
      persistComposerDraftNow,
    })
    activeThreadIdRef.current = nextThreadId
    setPendingEditorDraftPreludes([])
    if (!activeThreadId) {
      applyComposerSnapshot({
        nextBlocks: normalizeBlocks([]),
        nextDraftText: '',
        syncExternalDraftText: true,
        forceDraftSync: true,
        schedulePersist: false,
      })
      return
    }

    try {
      const raw = window.localStorage.getItem(CHAT_DRAFT_STORAGE_KEY)
      const byThread = raw ? JSON.parse(raw) : {}
      const draft = byThread && typeof byThread === 'object'
        ? String(byThread[activeThreadId] ?? '')
        : ''
      const parsed = parseComposerMarkdownToBlocksAndDraft(draft)
      applyComposerSnapshot({
        nextBlocks: parsed.composerBlocks,
        nextDraftText: String(parsed.composerDraftText || ''),
        syncExternalDraftText: true,
        forceDraftSync: true,
        schedulePersist: false,
      })
    } catch {
      applyComposerSnapshot({
        nextBlocks: normalizeBlocks([]),
        nextDraftText: '',
        syncExternalDraftText: true,
        forceDraftSync: true,
        schedulePersist: false,
      })
    }
  }, [
    activeThreadId,
    applyComposerSnapshot,
    clearScheduledDraftPersist,
    persistComposerDraftNow,
  ])

  useEffect(() => {
    const pending = pendingChatDraftInjection
    if (!pending?.id) return
    if (!activeThreadId) return
    const targetThreadId = String(pending.threadId || '').trim()
    if (targetThreadId && targetThreadId !== activeThreadId) return

    const injectedText = String(pending.text || '').trim()
    const injectedBlocks = normalizeInjectedComposerBlocksPayload(
      pending.composerBlocks || pending.composerSegments || [],
    )
    if (!injectedText && injectedBlocks.length === 0) {
      clearPendingChatDraftInjection()
      return
    }

    let nextComposerBlocks = null
    let nextComposerDraftText = ''
    let insertedCodeBlockIds = []

    if (injectedBlocks.length > 0) {
      const currentBlocks = normalizeBlocks(composerBlocksRef.current)
      const currentDraftText = String(composerDraftTextRef.current || '')
      const replaceMode = pending.mode === 'replace'
      if (replaceMode || !composerHasMeaningfulContent(currentBlocks, currentDraftText)) {
        nextComposerBlocks = normalizeBlocks(injectedBlocks)
        nextComposerDraftText = ''
      } else {
        const baseBlocks = [...currentBlocks]
        if (currentDraftText.length > 0) {
          baseBlocks.push(createTextComposerBlock(currentDraftText))
        }
        nextComposerBlocks = normalizeBlocks([...baseBlocks, ...injectedBlocks])
        nextComposerDraftText = ''
      }
      insertedCodeBlockIds = injectedBlocks
        .filter((block) => block?.type === 'code')
        .map((block) => String(block.id || '').trim())
        .filter(Boolean)
    } else if (pending.mode === 'snippet') {
      nextComposerBlocks = normalizeBlocks(composerBlocksRef.current)
      nextComposerDraftText = appendComposerSnippet(
        composerDraftTextRef.current,
        injectedText,
      )
    } else {
      const currentMarkdown = serializeComposerBlocksAndDraft({
        blocks: composerBlocksRef.current,
        draftText: composerDraftTextRef.current,
        trimOuterWhitespace: false,
      })
      let nextMarkdown = injectedText
      if (pending.mode !== 'replace' && currentMarkdown.trim()) {
        nextMarkdown = `${currentMarkdown.replace(/\s+$/, '')}\n\n${injectedText}`
      }
      const parsed = parseComposerMarkdownToBlocksAndDraft(nextMarkdown)
      nextComposerBlocks = normalizeBlocks(parsed.composerBlocks)
      nextComposerDraftText = String(parsed.composerDraftText || '')
    }

    applyComposerSnapshot({
      nextBlocks: nextComposerBlocks,
      nextDraftText: nextComposerDraftText,
      syncExternalDraftText: true,
      forceDraftSync: true,
      focusComposer: pending.focusComposer !== false,
    })

    const editorPrelude = normalizePendingEditorDraftPrelude({
      ...pending,
      blockIds: insertedCodeBlockIds,
    })
    if (editorPrelude) {
      setPendingEditorDraftPreludes((prev) => {
        const next = prev.filter((item) => item && item.id !== editorPrelude.id)
        next.push(editorPrelude)
        return next
      })
    } else if (pending.hiddenPrefix) {
      setPendingContextPrefix(
        pending.hiddenPrefix,
        activeThreadId ? { threadId: activeThreadId } : undefined,
      )
    }

    clearPendingChatDraftInjection()
  }, [
    activeThreadId,
    clearPendingChatDraftInjection,
    pendingChatDraftInjection,
    setPendingContextPrefix,
    applyComposerSnapshot,
  ])

  useEffect(() => () => {
    clearScheduledDraftPersist()
    persistComposerDraftNow()
  }, [clearScheduledDraftPersist, persistComposerDraftNow])

  return {
    composerDraftText,
    composerDraftSyncVersion,
    composerBlocksSyncVersion,
    setComposerDraftText,
    composerBlocks,
    setComposerBlocks,
    pendingEditorDraftPreludes,
    setPendingEditorDraftPreludes,
    composerDraftTextRef,
    composerBlocksRef,
    hasComposerContent,
    isDirectAgentDraft,
    focusComposerDraftInput,
    syncComposerBlocks,
    setComposerFromMarkdownText,
    handleComposerDraftTextChange,
  }
}
