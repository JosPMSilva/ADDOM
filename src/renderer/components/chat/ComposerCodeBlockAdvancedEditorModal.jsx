import React, { useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { LoadingPane } from '../editor/EditorFileTree.jsx'
import {
  MONACO_OPTIONS,
  bindMonacoAppearance,
  resolveAddomMonacoThemeId,
} from '../editor/editor-monaco-helpers.mjs'
import { DIALOG_Z_IMMERSIVE } from '../dialog-layering.mjs'
import { useDialogFocusTrap } from '../use-dialog-focus-trap.mjs'
import { useDialogEscapeDismiss } from '../use-dialog-escape-dismiss.mjs'

const MODAL_EDITOR_OPTIONS = Object.freeze({
  ...MONACO_OPTIONS,
  minimap: { enabled: false },
  inlineSuggest: { enabled: true, mode: 'prefix' },
  suggest: { preview: true },
  scrollBeyondLastLine: false,
})

const EMPTY_INLINE_COMPLETIONS = Object.freeze({ items: [] })
const INLINE_COMPLETION_DISPOSE_NOOP = () => { }
const ComposerCodeBlockAdvancedEditorSurface = React.lazy(() => import('./ComposerCodeBlockAdvancedEditorSurface.jsx'))

const LANGUAGE_ALIAS_MAP = Object.freeze({
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  pyw: 'python',
  rb: 'ruby',
  rs: 'rust',
  cs: 'csharp',
  yml: 'yaml',
  md: 'markdown',
  txt: 'plaintext',
  text: 'plaintext',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ps1: 'powershell',
})

const LANGUAGE_EXTENSION_MAP = Object.freeze({
  javascript: 'js',
  typescript: 'ts',
  python: 'py',
  ruby: 'rb',
  rust: 'rs',
  csharp: 'cs',
  yaml: 'yaml',
  markdown: 'md',
  plaintext: 'txt',
  shell: 'sh',
  powershell: 'ps1',
})

function normalizeMonacoLanguage(language = '') {
  const normalized = String(language || '').trim().toLowerCase()
  if (!normalized) return 'plaintext'
  return LANGUAGE_ALIAS_MAP[normalized] || normalized
}

function normalizeSnippetExtension(language = '') {
  const normalizedLanguage = normalizeMonacoLanguage(language)
  return LANGUAGE_EXTENSION_MAP[normalizedLanguage] || normalizedLanguage || 'txt'
}

function buildInlinePayload({
  model,
  position,
  projectFolder,
  providerId,
  modelId,
  language,
  filePath,
}) {
  if (!model || !position) return null
  const project = String(projectFolder || '').trim()
  const provider = String(providerId || '').trim().toLowerCase()
  const selectedModel = String(modelId || '').trim()
  if (!project || !provider || !selectedModel) return null

  const fullText = String(model.getValue?.() || '')
  if (!fullText) return null
  const cursorOffset = model.getOffsetAt(position)
  const prefix = fullText.slice(0, cursorOffset)
  const suffix = fullText.slice(cursorOffset)
  if (!prefix && !suffix) return null

  return {
    providerId: provider,
    model: selectedModel,
    project,
    filePath: String(filePath || `chat-composer-snippet.${language || 'txt'}`),
    language: String(language || model.getLanguageId?.() || 'plaintext').trim().toLowerCase(),
    prefix: prefix.slice(Math.max(0, prefix.length - 3_000)),
    suffix: suffix.slice(0, 900),
    cursorLineNumber: Math.max(1, Number(position.lineNumber || 1) || 1),
    cursorColumn: Math.max(1, Number(position.column || 1) || 1),
  }
}

function toInlineCompletions(monaco, position, completion = '') {
  const insertText = String(completion || '')
  if (!insertText) return EMPTY_INLINE_COMPLETIONS
  return {
    items: [{
      insertText,
      range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
    }],
  }
}

export default function ComposerCodeBlockAdvancedEditorModal({
  open = false,
  language = 'plaintext',
  code = '',
  providerId = '',
  modelId = '',
  projectFolder = '',
  inlineCompletionEnabled = true,
  onCodeChange = () => { },
  onLanguageChange = () => { },
  onApply = () => { },
  onCancel = () => { },
}) {
  const dialogRef = useRef(null)
  const onApplyRef = useRef(onApply)
  const onCancelRef = useRef(onCancel)
  const providerIdRef = useRef(providerId)
  const modelIdRef = useRef(modelId)
  const projectFolderRef = useRef(projectFolder)
  const inlineCompletionEnabledRef = useRef(inlineCompletionEnabled !== false)
  const languageRef = useRef(normalizeMonacoLanguage(language))
  const snippetExtensionRef = useRef(normalizeSnippetExtension(language))
  const normalizedEditorLanguage = normalizeMonacoLanguage(language)
  useDialogFocusTrap(open, dialogRef)
  useDialogEscapeDismiss(open, dialogRef, onCancel)

  onApplyRef.current = onApply
  onCancelRef.current = onCancel
  providerIdRef.current = providerId
  modelIdRef.current = modelId
  projectFolderRef.current = projectFolder
  inlineCompletionEnabledRef.current = inlineCompletionEnabled !== false
  languageRef.current = normalizedEditorLanguage
  snippetExtensionRef.current = normalizeSnippetExtension(language)

  const handleMount = useCallback((editor, monaco) => {
    bindMonacoAppearance(monaco, { editor })

    const triggerInlineSuggest = () => editor.trigger('keyboard', 'editor.action.inlineSuggest.trigger', {})
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => { onApplyRef.current?.() },
    )
    editor.addCommand(
      monaco.KeyCode.Escape,
      () => { onCancelRef.current?.() },
    )
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI,
      triggerInlineSuggest,
    )
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL,
      triggerInlineSuggest,
    )
    editor.addCommand(
      monaco.KeyMod.Alt | monaco.KeyCode.RightArrow,
      () => editor.trigger('keyboard', 'editor.action.inlineSuggest.commit', {}),
    )

    const model = editor.getModel()
    if (!model) return
    const registerInlineProvider = () => {
      const languageId = normalizeMonacoLanguage(model.getLanguageId?.() || languageRef.current || 'plaintext')
      return monaco.languages.registerInlineCompletionsProvider(
        languageId,
        {
          provideInlineCompletions: async (_model, position, _context, token) => {
            if (
              token?.isCancellationRequested
              || inlineCompletionEnabledRef.current !== true
              || typeof window.addom?.editor?.requestInlineCompletion !== 'function'
            ) {
              return EMPTY_INLINE_COMPLETIONS
            }
            const payload = buildInlinePayload({
              model,
              position,
              projectFolder: projectFolderRef.current,
              providerId: providerIdRef.current,
              modelId: modelIdRef.current,
              language: languageRef.current,
              filePath: `chat-composer-snippet.${snippetExtensionRef.current || 'txt'}`,
            })
            if (!payload) return EMPTY_INLINE_COMPLETIONS

            try {
              const result = await window.addom.editor.requestInlineCompletion(payload)
              if (token?.isCancellationRequested || !result?.ok || !result?.available) {
                return EMPTY_INLINE_COMPLETIONS
              }
              return toInlineCompletions(monaco, position, result.completion)
            } catch {
              return EMPTY_INLINE_COMPLETIONS
            }
          },
          disposeInlineCompletions: INLINE_COMPLETION_DISPOSE_NOOP,
          freeInlineCompletions: INLINE_COMPLETION_DISPOSE_NOOP,
        },
      )
    }

    let inlineProviderDisposable = registerInlineProvider()
    const languageDisposable = typeof model.onDidChangeLanguage === 'function'
      ? model.onDidChangeLanguage(() => {
        inlineProviderDisposable?.dispose()
        inlineProviderDisposable = registerInlineProvider()
      })
      : { dispose: () => { } }

    editor.onDidDispose(() => {
      languageDisposable.dispose()
      inlineProviderDisposable?.dispose()
    })
  }, [])

  if (!open) return null

  const modal = (
    <div className={`fixed inset-0 ${DIALOG_Z_IMMERSIVE} bg-overlay-scrim-strong backdrop-blur-sm flex items-center justify-center p-4`}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="composer-advanced-editor-title"
        className="w-full max-w-5xl h-[78vh] rounded-xl border border-surface-border/50 bg-surface-panel/80 backdrop-blur-xl overflow-hidden shadow-2xl focus:outline-none flex flex-col"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 border-b border-surface-border/40 bg-surface/30">
          <div className="min-w-0 flex-1">
            <p id="composer-advanced-editor-title" className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Advanced Code Editor</p>
            <p className="text-xs text-text-tertiary mt-0.5">Ctrl/Cmd+Enter apply - Esc cancel - Ctrl/Cmd+I or Ctrl/Cmd+L inline suggest - Alt+Right accept</p>
          </div>
          <input
            type="text"
            value={language ?? 'plaintext'}
            onChange={(event) => onLanguageChange?.(event.target.value)}
            className="h-8 w-28 rounded-md border border-surface-border/50 bg-surface/30 px-2 text-[11px] font-mono text-text-subtle outline-none focus:border-accent/60 shadow-inner hover:bg-surface/50 transition-colors"
            title="Code language"
            aria-label="Code language"
          />
        </div>
        <div className="flex-1 min-h-0 relative bg-surface/20">
          <React.Suspense fallback={<LoadingPane />}>
            <ComposerCodeBlockAdvancedEditorSurface
              language={normalizedEditorLanguage}
              value={String(code || '')}
              onChange={(nextValue) => onCodeChange?.(String(nextValue || ''))}
              onMount={handleMount}
              theme={resolveAddomMonacoThemeId()}
              options={MODAL_EDITOR_OPTIONS}
              loading={<LoadingPane />}
            />
          </React.Suspense>
        </div>
        <div className="shrink-0 h-[52px] px-4 border-t border-surface-border/40 bg-surface/30 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onCancelRef.current?.()}
            className="px-4 py-1.5 rounded-md border border-surface-border/50 bg-transparent text-xs text-text-subtle hover:bg-surface-panel hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onApplyRef.current?.()}
            className="px-4 py-1.5 rounded-md text-xs font-medium bg-accent text-accent-fg hover:bg-accent-hover transition-colors shadow-sm"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined' || !document.body) {
    return modal
  }

  return createPortal(modal, document.body)
}
