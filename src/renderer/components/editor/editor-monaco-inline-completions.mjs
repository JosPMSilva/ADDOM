const INLINE_COMPLETION_DEBOUNCE_MS = 260
const INLINE_COMPLETION_MIN_CONTEXT_CHARS = 3
const INLINE_COMPLETION_PREFIX_CHARS = 3_000
const INLINE_COMPLETION_SUFFIX_CHARS = 900
const INLINE_COMPLETION_CACHE_TTL_MS = 6_000
const EMPTY_INLINE_COMPLETIONS = Object.freeze({ items: [] })

export const disposeInlineCompletionsNoop = () => {}

function buildInlineCompletionPayload({
  model,
  position,
  tabFilePath,
  tabLanguage,
  projectFolder,
  providerId,
  modelId,
}) {
  if (!model || !position) return null
  const activeProviderId = String(providerId || '').trim().toLowerCase()
  const activeModelId = String(modelId || '').trim()
  const activeProjectFolder = String(projectFolder || '').trim()
  const activeFilePath = String(tabFilePath || '').trim()
  if (!activeProviderId || !activeModelId || !activeProjectFolder || !activeFilePath) return null

  const fullText = String(model.getValue?.() || '')
  if (!fullText) return null
  const cursorOffset = model.getOffsetAt(position)
  const beforeCursor = fullText.slice(0, cursorOffset)
  const afterCursor = fullText.slice(cursorOffset)
  if (!beforeCursor && !afterCursor) return null
  if (beforeCursor.trim().length < INLINE_COMPLETION_MIN_CONTEXT_CHARS) return null

  return {
    providerId: activeProviderId,
    model: activeModelId,
    project: activeProjectFolder,
    filePath: activeFilePath,
    language: String(model.getLanguageId?.() || tabLanguage || 'plaintext').trim().toLowerCase(),
    prefix: beforeCursor.slice(Math.max(0, beforeCursor.length - INLINE_COMPLETION_PREFIX_CHARS)),
    suffix: afterCursor.slice(0, INLINE_COMPLETION_SUFFIX_CHARS),
    cursorLineNumber: Math.max(1, Number(position.lineNumber || 1) || 1),
    cursorColumn: Math.max(1, Number(position.column || 1) || 1),
  }
}

function buildInlineCompletionCacheKey(payload = {}) {
  const prefixTail = String(payload.prefix || '').slice(-160)
  const suffixHead = String(payload.suffix || '').slice(0, 120)
  return [
    String(payload.providerId || ''),
    String(payload.model || ''),
    String(payload.filePath || ''),
    String(payload.cursorLineNumber || 1),
    String(payload.cursorColumn || 1),
    prefixTail,
    suffixHead,
  ].join('|')
}

function toInlineCompletions(monaco, position, text = '') {
  const insertText = String(text || '')
  if (!insertText) return EMPTY_INLINE_COMPLETIONS
  return {
    items: [{
      insertText,
      range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
    }],
  }
}

export function registerMonacoEditorCommands({
  editor,
  monaco,
  tabLanguage,
  onSave,
  onFormat,
  onToggleMarkdownPreview,
  pendingInlineSuggestionRef,
  logInlineCompletionTelemetry,
}) {
  const markdownPreviewShortcutEnabled = String(tabLanguage || '').trim().toLowerCase() === 'markdown'
  const triggerInlineSuggest = () => editor.trigger('keyboard', 'editor.action.inlineSuggest.trigger', {})

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => { void onSave?.() })
  editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => { void onFormat?.() })
  if (markdownPreviewShortcutEnabled) {
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyV,
      () => { onToggleMarkdownPreview?.() },
    )
  }
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, triggerInlineSuggest)
  editor.addCommand(
    monaco.KeyMod.Alt | monaco.KeyCode.RightArrow,
    () => {
      editor.trigger('keyboard', 'editor.action.inlineSuggest.commit', {})
      const pending = pendingInlineSuggestionRef.current
      if (pending && pending.chars > 0) {
        logInlineCompletionTelemetry?.('accept', {
          chars: pending.chars,
          reason: 'alt_right',
        })
        pendingInlineSuggestionRef.current = null
      }
    },
  )
  editor.addCommand(
    monaco.KeyCode.Escape,
    () => {
      editor.trigger('keyboard', 'editor.action.inlineSuggest.hide', {})
      const pending = pendingInlineSuggestionRef.current
      if (pending && pending.chars > 0) {
        logInlineCompletionTelemetry?.('dismiss', {
          chars: pending.chars,
          reason: 'escape',
        })
        pendingInlineSuggestionRef.current = null
      }
    },
  )
}

export function registerInlineCompletionProvider({
  monaco,
  model,
  tabFilePath,
  tabLanguage,
  projectFolderRef,
  providerIdRef,
  modelIdRef,
  inlineCompletionEnabledRef,
  pendingInlineSuggestionRef,
}) {
  let inlineRequestSequence = 0
  let lastInlineRequestAt = 0
  let inlineCache = {
    key: '',
    completion: '',
    at: 0,
  }

  const languageId = String(model.getLanguageId?.() || tabLanguage || 'plaintext').trim().toLowerCase()
  return monaco.languages.registerInlineCompletionsProvider(languageId, {
    provideInlineCompletions: async (_model, position, _context, token) => {
      if (
        token?.isCancellationRequested
        || inlineCompletionEnabledRef.current !== true
        || typeof window?.addom?.editor?.requestInlineCompletion !== 'function'
      ) {
        pendingInlineSuggestionRef.current = null
        return EMPTY_INLINE_COMPLETIONS
      }

      const payload = buildInlineCompletionPayload({
        model,
        position,
        tabFilePath,
        tabLanguage,
        projectFolder: projectFolderRef.current,
        providerId: providerIdRef.current,
        modelId: modelIdRef.current,
      })
      if (!payload) {
        pendingInlineSuggestionRef.current = null
        return EMPTY_INLINE_COMPLETIONS
      }

      const key = buildInlineCompletionCacheKey(payload)
      const nowTs = Date.now()
      if (
        inlineCache.key === key
        && inlineCache.completion
        && (nowTs - inlineCache.at) <= INLINE_COMPLETION_CACHE_TTL_MS
      ) {
        pendingInlineSuggestionRef.current = { key, chars: inlineCache.completion.length }
        return toInlineCompletions(monaco, position, inlineCache.completion)
      }

      if ((nowTs - lastInlineRequestAt) < INLINE_COMPLETION_DEBOUNCE_MS) {
        pendingInlineSuggestionRef.current = null
        return EMPTY_INLINE_COMPLETIONS
      }
      lastInlineRequestAt = nowTs

      const seq = ++inlineRequestSequence
      try {
        const result = await window.addom.editor.requestInlineCompletion(payload)
        if (token?.isCancellationRequested || seq !== inlineRequestSequence) {
          return EMPTY_INLINE_COMPLETIONS
        }
        if (!result?.ok || !result?.available) {
          pendingInlineSuggestionRef.current = null
          return EMPTY_INLINE_COMPLETIONS
        }
        const completion = String(result?.completion || '')
        if (!completion) {
          pendingInlineSuggestionRef.current = null
          return EMPTY_INLINE_COMPLETIONS
        }

        inlineCache = {
          key,
          completion,
          at: Date.now(),
        }
        pendingInlineSuggestionRef.current = { key, chars: completion.length }
        return toInlineCompletions(monaco, position, completion)
      } catch {
        if (seq === inlineRequestSequence) pendingInlineSuggestionRef.current = null
        return EMPTY_INLINE_COMPLETIONS
      }
    },
    disposeInlineCompletions: disposeInlineCompletionsNoop,
    freeInlineCompletions: disposeInlineCompletionsNoop,
  })
}
