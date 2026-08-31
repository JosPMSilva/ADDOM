import {
  ESLINT_DEBOUNCE_MS,
  OUTLINE_DEBOUNCE_MS,
  applyEditorServiceDiagnosticPolicy,
  applyEditorServiceMarkers,
  clearCustomLintMarkers,
  emptyOutlineState,
  findActiveOutlineSymbolId,
  normalizeOutlineState,
  normalizeProblemMarkers,
} from './editor-monaco-helpers.mjs'
import { registerEditorServiceLanguageProviders } from './editor-monaco-language-providers.mjs'
import {
  EMPTY_SERVICE_STATE,
  buildEditorServicePayload,
  getEditorServiceApi,
  getEditorServiceStateFingerprint,
  normalizeEditorServiceState,
} from './editor-monaco-service-helpers.mjs'

export function attachMonacoAnalysisObservers({
  editor,
  monaco,
  model,
  projectFolder,
  tabFilePath,
  tabLanguage,
  createInlineProviderDisposable,
  onProblemsChange,
  onOutlineChange,
  onEditorApiChange,
  onServiceStateChange,
}) {
  let inlineProviderDisposable = createInlineProviderDisposable()
  let languageProvidersDisposable = registerEditorServiceLanguageProviders({
    monaco,
    model,
    projectFolder,
    tabFilePath,
    tabLanguage,
    onServiceStateChange,
  })
  let diagnosticsTimer = null
  let diagnosticsSeq = 0
  let disposed = false
  let diagnosticsInFlight = false
  let rerunDiagnosticsAfterCurrent = false
  let markerTimer = null
  let outlineTimer = null
  let outlineSeq = 0
  let outlineInFlight = false
  let rerunOutlineAfterCurrent = false
  let outlineState = emptyOutlineState()
  let latestOutlineItems = []
  let serviceState = EMPTY_SERVICE_STATE
  let serviceStateFingerprint = getEditorServiceStateFingerprint(EMPTY_SERVICE_STATE)

  const emitServiceState = (nextState = null) => {
    if (disposed || !onServiceStateChange) return
    const normalizedState = normalizeEditorServiceState(nextState)
    const nextFingerprint = getEditorServiceStateFingerprint(normalizedState)
    if (nextFingerprint === serviceStateFingerprint) return
    serviceState = normalizedState
    serviceStateFingerprint = nextFingerprint
    onServiceStateChange(serviceState)
  }

  const emitOutline = (patch = null) => {
    if (disposed || !onOutlineChange) return
    outlineState = normalizeOutlineState({
      ...outlineState,
      ...(patch && typeof patch === 'object' ? patch : {}),
    })
    onOutlineChange(outlineState)
  }

  const updateActiveOutlineFromCursor = () => {
    if (disposed) return
    const position = editor.getPosition()
    if (!position) return
    const offset = model.getOffsetAt(position)
    const nextActiveId = findActiveOutlineSymbolId(latestOutlineItems, offset)
    if (nextActiveId !== outlineState.activeId) {
      emitOutline({ activeId: nextActiveId })
    }
  }

  const emitProblems = () => {
    if (disposed || !onProblemsChange) return
    try {
      const allMarkers = monaco.editor.getModelMarkers({ resource: model.uri })
      onProblemsChange(normalizeProblemMarkers(allMarkers))
    } catch {
      onProblemsChange([])
    }
  }

  const scheduleEmitProblems = () => {
    if (markerTimer) return
    markerTimer = setTimeout(() => {
      markerTimer = null
      emitProblems()
    }, 0)
  }

  const runDiagnostics = async () => {
    const api = getEditorServiceApi()
    const payload = buildEditorServicePayload({
      kind: 'diagnostics',
      model,
      projectFolder,
      tabFilePath,
      tabLanguage,
    })
    if (!api || !payload) {
      clearCustomLintMarkers(monaco, model)
      applyEditorServiceDiagnosticPolicy(monaco, model.getLanguageId?.() || tabLanguage, 'syntax-only')
      emitServiceState(EMPTY_SERVICE_STATE)
      scheduleEmitProblems()
      return
    }

    if (diagnosticsInFlight) {
      rerunDiagnosticsAfterCurrent = true
      return
    }

    diagnosticsInFlight = true
    rerunDiagnosticsAfterCurrent = false
    try {
      const seq = ++diagnosticsSeq
      const result = await api.request(payload)
      if (disposed || seq !== diagnosticsSeq) return

      const nextState = normalizeEditorServiceState(result?.serviceState)
      emitServiceState(nextState)
      applyEditorServiceDiagnosticPolicy(monaco, payload.language, result?.diagnosticOwnership?.mode || nextState.diagnosticOwnership?.mode)

      if (result?.ok && result?.available && Array.isArray(result.diagnostics)) {
        applyEditorServiceMarkers(monaco, model, result.diagnostics)
      } else {
        applyEditorServiceMarkers(monaco, model, [])
      }
      scheduleEmitProblems()
    } catch {
      clearCustomLintMarkers(monaco, model)
      applyEditorServiceDiagnosticPolicy(monaco, payload.language, 'syntax-only')
      emitServiceState(EMPTY_SERVICE_STATE)
      scheduleEmitProblems()
    } finally {
      diagnosticsInFlight = false
      if (!disposed && rerunDiagnosticsAfterCurrent) {
        rerunDiagnosticsAfterCurrent = false
        if (diagnosticsTimer) {
          clearTimeout(diagnosticsTimer)
          diagnosticsTimer = null
        }
        diagnosticsTimer = setTimeout(() => {
          diagnosticsTimer = null
          void runDiagnostics()
        }, ESLINT_DEBOUNCE_MS)
      }
    }
  }

  const runOutline = async () => {
    if (outlineInFlight) {
      rerunOutlineAfterCurrent = true
      return
    }

    outlineInFlight = true
    rerunOutlineAfterCurrent = false
    const seq = ++outlineSeq
    emitOutline({ supported: true, loading: true, reason: 'loading', message: '', available: outlineState.available })

    try {
      const api = getEditorServiceApi()
      const payload = buildEditorServicePayload({
        kind: 'symbols',
        model,
        projectFolder,
        tabFilePath,
        tabLanguage,
      })
      if (!api || !payload) {
        latestOutlineItems = []
        emitOutline({
          supported: true,
          available: false,
          loading: false,
          reason: 'service_unavailable',
          message: 'Symbols are unavailable because the editor service is not ready.',
          items: [],
          activeId: null,
        })
        return
      }

      const result = await api.request(payload)
      if (disposed || seq !== outlineSeq) return

      const nextState = normalizeEditorServiceState(result?.serviceState)
      emitServiceState(nextState)

      const outline = result?.outline && typeof result.outline === 'object'
        ? result.outline
        : result
      const items = Array.isArray(outline?.items) ? outline.items : []
      latestOutlineItems = items

      const position = editor.getPosition()
      const activeId = position ? findActiveOutlineSymbolId(items, model.getOffsetAt(position)) : null
      emitOutline({
        ...outline,
        items,
        loading: false,
        activeId,
      })
    } catch (error) {
      if (disposed || seq !== outlineSeq) return
      latestOutlineItems = []
      emitOutline({
        supported: true,
        available: false,
        loading: false,
        reason: 'load_failed',
        message: String(error?.message || error || 'Failed to load symbols.'),
        items: [],
        activeId: null,
      })
    } finally {
      outlineInFlight = false
      if (!disposed && rerunOutlineAfterCurrent) {
        rerunOutlineAfterCurrent = false
        if (outlineTimer) {
          clearTimeout(outlineTimer)
          outlineTimer = null
        }
        outlineTimer = setTimeout(() => {
          outlineTimer = null
          void runOutline()
        }, OUTLINE_DEBOUNCE_MS)
      }
    }
  }

  const scheduleDiagnostics = (immediate = false) => {
    if (diagnosticsTimer) {
      clearTimeout(diagnosticsTimer)
      diagnosticsTimer = null
    }
    if (immediate) {
      void runDiagnostics()
      return
    }
    diagnosticsTimer = setTimeout(() => {
      diagnosticsTimer = null
      void runDiagnostics()
    }, ESLINT_DEBOUNCE_MS)
  }

  const scheduleOutline = (immediate = false) => {
    if (outlineTimer) {
      clearTimeout(outlineTimer)
      outlineTimer = null
    }
    if (immediate) {
      void runOutline()
      return
    }
    outlineTimer = setTimeout(() => {
      outlineTimer = null
      void runOutline()
    }, OUTLINE_DEBOUNCE_MS)
  }

  const revealLocation = (lineNumberInput, columnInput) => {
    const lineNumber = Math.max(1, Number(lineNumberInput || 1) || 1)
    const column = Math.max(1, Number(columnInput || 1) || 1)
    editor.focus()
    editor.setPosition({ lineNumber, column })
    editor.revealPositionInCenter({ lineNumber, column })
  }

  onEditorApiChange?.({
    revealLocation(location = {}) {
      revealLocation(location?.lineNumber, location?.column)
    },
    revealProblem(problem) {
      revealLocation(problem?.startLineNumber, problem?.startColumn)
    },
    getSelectionContext() {
      const selection = editor.getSelection()
      if (!selection || typeof selection.isEmpty === 'function' && selection.isEmpty()) {
        return { ok: false, reason: 'no_selection' }
      }

      const selectedText = String(model.getValueInRange(selection) || '')
      if (!selectedText.trim()) {
        return { ok: false, reason: 'empty_selection' }
      }

      const lineCount = Math.max(1, Number(model.getLineCount?.() || 1) || 1)
      const contextPadding = 6
      const contextStartLineNumber = Math.max(1, selection.startLineNumber - contextPadding)
      const contextEndLineNumber = Math.min(lineCount, selection.endLineNumber + contextPadding)
      const lineNumberWidth = String(contextEndLineNumber).length
      const contextLines = []
      for (let line = contextStartLineNumber; line <= contextEndLineNumber; line += 1) {
        const marker = line >= selection.startLineNumber && line <= selection.endLineNumber ? '>' : ' '
        const lineNo = String(line).padStart(lineNumberWidth, ' ')
        contextLines.push(`${marker}${lineNo}| ${model.getLineContent(line)}`)
      }

      return {
        ok: true,
        filePath: tabFilePath,
        language: model.getLanguageId?.() || tabLanguage,
        selectedText,
        selectionStartLineNumber: selection.startLineNumber,
        selectionStartColumn: selection.startColumn,
        selectionEndLineNumber: selection.endLineNumber,
        selectionEndColumn: selection.endColumn,
        contextStartLineNumber,
        contextEndLineNumber,
        contextText: contextLines.join('\n'),
      }
    },
    revealSymbol(symbol) {
      revealLocation(symbol?.selectionLineNumber || symbol?.startLineNumber, symbol?.selectionColumn || symbol?.startColumn)
    },
  })

  scheduleDiagnostics(true)
  scheduleOutline(true)
  const d1 = model.onDidChangeContent(() => scheduleDiagnostics(false))
  const d2 = model.onDidChangeLanguage(() => {
    scheduleDiagnostics(true)
    scheduleOutline(true)
    inlineProviderDisposable.dispose()
    inlineProviderDisposable = createInlineProviderDisposable()
    languageProvidersDisposable.dispose()
    languageProvidersDisposable = registerEditorServiceLanguageProviders({
      monaco,
      model,
      projectFolder,
      tabFilePath,
      tabLanguage,
      onServiceStateChange,
    })
  })
  const d3 = monaco.editor.onDidChangeMarkers((resources) => {
    const target = String(model.uri)
    if (resources.some((resource) => String(resource) === target)) {
      scheduleEmitProblems()
    }
  })
  const d4 = editor.onDidChangeCursorPosition(() => {
    updateActiveOutlineFromCursor()
  })
  scheduleEmitProblems()
  updateActiveOutlineFromCursor()
  editor.onDidDispose(() => {
    disposed = true
    diagnosticsSeq += 1
    outlineSeq += 1
    if (diagnosticsTimer) clearTimeout(diagnosticsTimer)
    if (outlineTimer) clearTimeout(outlineTimer)
    if (markerTimer) clearTimeout(markerTimer)
    d1.dispose()
    d2.dispose()
    d3.dispose()
    d4.dispose()
    inlineProviderDisposable.dispose()
    languageProvidersDisposable.dispose()
    try {
      clearCustomLintMarkers(monaco, model)
    } catch {
      // Model may already be disposed.
    }
    onProblemsChange?.([])
    onOutlineChange?.(emptyOutlineState())
    onEditorApiChange?.(null)
    onServiceStateChange?.(EMPTY_SERVICE_STATE)
  })
}
