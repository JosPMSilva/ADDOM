import {
  bindMonacoAppearance,
  ensureAddomMonacoTheme,
  resolveAddomMonacoThemeId,
} from '../../theme/specialized-theme-adapters.mjs'

export { bindMonacoAppearance, resolveAddomMonacoThemeId }

export const MONACO_OPTIONS = {
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  fontLigatures: true,
  lineHeight: 21,
  minimap: { enabled: true, scale: 1 },
  scrollBeyondLastLine: true,
  wordWrap: 'off',
  renderWhitespace: 'selection',
  renderLineHighlight: 'all',
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  bracketPairColorization: { enabled: true },
  guides: { bracketPairs: true, indentation: true },
  glyphMargin: true,
  renderValidationDecorations: 'on',
  formatOnPaste: true,
  tabSize: 2,
  insertSpaces: true,
  overviewRulerBorder: false,
  automaticLayout: false,
  scrollbar: {
    useShadows: false,
  },
}

export function ensureTheme(monaco) {
  ensureAddomMonacoTheme(monaco)
}

export const ADDOM_LINT_OWNER = 'addom-eslint-lite'
export const ADDOM_ESLINT_OWNER = 'addom-eslint-engine'
export const ADDOM_EDITOR_SERVICE_OWNER = 'addom-editor-service'
export const ESLINT_DEBOUNCE_MS = 500
export const OUTLINE_DEBOUNCE_MS = 250

function normalizeEditorLanguageId(language = '') {
  return String(language || '').trim().toLowerCase()
}

function mapEslintSeverity(monaco, severity, fatal = false) {
  if (fatal || Number(severity || 0) >= 2) return monaco.MarkerSeverity.Error
  if (Number(severity || 0) <= 0) return monaco.MarkerSeverity.Info
  return monaco.MarkerSeverity.Warning
}

export function mapEslintMessagesToMonaco(monaco, messages = []) {
  return (Array.isArray(messages) ? messages : []).map((m) => ({
    startLineNumber: Math.max(1, Number(m.line || 1) || 1),
    startColumn: Math.max(1, Number(m.column || 1) || 1),
    endLineNumber: Math.max(1, Number(m.endLine || m.line || 1) || 1),
    endColumn: Math.max(
      1,
      Number(m.endColumn || (Number(m.column || 1) + 1)) || (Math.max(1, Number(m.column || 1) || 1) + 1),
    ),
    message: String(m.message || '').trim() || 'Lint issue',
    code: String(m.ruleId || '').trim() || undefined,
    source: 'eslint',
    severity: mapEslintSeverity(monaco, m.severity, !!m.fatal),
  }))
}

export function clearCustomLintMarkers(monaco, model) {
  monaco.editor.setModelMarkers(model, ADDOM_LINT_OWNER, [])
  monaco.editor.setModelMarkers(model, ADDOM_ESLINT_OWNER, [])
  monaco.editor.setModelMarkers(model, ADDOM_EDITOR_SERVICE_OWNER, [])
}

function mapEditorServiceSeverity(monaco, severity, fatal = false) {
  if (fatal || Number(severity || 0) >= 2) return monaco.MarkerSeverity.Error
  if (Number(severity || 0) <= 0) return monaco.MarkerSeverity.Info
  return monaco.MarkerSeverity.Warning
}

export function mapEditorServiceDiagnosticsToMonaco(monaco, diagnostics = []) {
  return (Array.isArray(diagnostics) ? diagnostics : []).map((diagnostic) => ({
    startLineNumber: Math.max(1, Number(diagnostic.line || 1) || 1),
    startColumn: Math.max(1, Number(diagnostic.column || 1) || 1),
    endLineNumber: Math.max(1, Number(diagnostic.endLine || diagnostic.line || 1) || 1),
    endColumn: Math.max(
      1,
      Number(diagnostic.endColumn || (Number(diagnostic.column || 1) + 1)) || (Math.max(1, Number(diagnostic.column || 1) || 1) + 1),
    ),
    message: String(diagnostic.message || '').trim() || 'Issue',
    code: String(diagnostic.ruleId || '').trim() || undefined,
    source: String(diagnostic.source || 'editor-service').trim() || 'editor-service',
    severity: mapEditorServiceSeverity(monaco, diagnostic.severity, diagnostic.fatal === true),
  }))
}

export function applyEditorServiceMarkers(monaco, model, diagnostics = []) {
  monaco.editor.setModelMarkers(
    model,
    ADDOM_EDITOR_SERVICE_OWNER,
    mapEditorServiceDiagnosticsToMonaco(monaco, diagnostics),
  )
}

export function applyEditorServiceDiagnosticPolicy(monaco, language, mode = 'syntax-only') {
  const languageId = normalizeEditorLanguageId(language)
  if (languageId !== 'javascript' && languageId !== 'typescript') return
  const ts = monaco?.languages?.typescript
  if (!ts) return
  const defaults = languageId === 'typescript' ? ts.typescriptDefaults : ts.javascriptDefaults
  if (!defaults?.setDiagnosticsOptions) return

  const syntaxOnly = mode === 'syntax-only' || mode === 'provider'
  defaults.setDiagnosticsOptions({
    noSemanticValidation: syntaxOnly,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: syntaxOnly,
  })
}

function normalizeMarkerCode(code) {
  if (!code) return ''
  if (typeof code === 'string' || typeof code === 'number') return String(code)
  if (typeof code === 'object') {
    if (typeof code.value === 'string' || typeof code.value === 'number') return String(code.value)
  }
  return ''
}

function severitySortWeight(severity) {
  const n = Number(severity || 0)
  if (n >= 8) return 0
  if (n >= 4) return 1
  if (n >= 2) return 2
  return 3
}

export function normalizeProblemMarkers(markers = []) {
  return (Array.isArray(markers) ? markers : [])
    .map((marker, index) => ({
      id: `${marker.owner || 'marker'}:${marker.startLineNumber || 1}:${marker.startColumn || 1}:${index}`,
      message: String(marker.message || '').trim() || 'Issue',
      severity: Number(marker.severity || 0) || 0,
      source: String(marker.source || marker.owner || 'diagnostic'),
      code: normalizeMarkerCode(marker.code),
      startLineNumber: Math.max(1, Number(marker.startLineNumber || 1) || 1),
      startColumn: Math.max(1, Number(marker.startColumn || 1) || 1),
      endLineNumber: Math.max(1, Number(marker.endLineNumber || marker.startLineNumber || 1) || 1),
      endColumn: Math.max(1, Number(marker.endColumn || marker.startColumn || 1) || 1),
    }))
    .sort((a, b) => {
      const sev = severitySortWeight(a.severity) - severitySortWeight(b.severity)
      if (sev !== 0) return sev
      if (a.startLineNumber !== b.startLineNumber) return a.startLineNumber - b.startLineNumber
      if (a.startColumn !== b.startColumn) return a.startColumn - b.startColumn
      return a.message.localeCompare(b.message)
    })
}

export function flattenOutlineRows(items = [], depth = 0, rows = []) {
  for (const item of Array.isArray(items) ? items : []) {
    rows.push({ ...item, depth })
    if (Array.isArray(item.children) && item.children.length > 0) {
      flattenOutlineRows(item.children, depth + 1, rows)
    }
  }
  return rows
}

export function findActiveOutlineSymbolId(items = [], offset = 0) {
  let best = null
  const targetOffset = Math.max(0, Number(offset || 0))

  const visit = (list, depth = 0) => {
    for (const item of Array.isArray(list) ? list : []) {
      if (!item) continue
      const start = Math.max(0, Number(item.rangeStartOffset || 0))
      const end = Math.max(start, Number(item.rangeEndOffset || start))
      if (targetOffset < start || targetOffset > end) continue

      const spanLength = Math.max(1, end - start)
      if (
        !best
        || depth > best.depth
        || (depth === best.depth && spanLength < best.spanLength)
      ) {
        best = { id: item.id, depth, spanLength }
      }

      if (Array.isArray(item.children) && item.children.length > 0) {
        visit(item.children, depth + 1)
      }
    }
  }

  visit(items, 0)
  return best?.id ?? null
}

export function emptyOutlineState() {
  return {
    supported: false,
    available: false,
    loading: false,
    reason: 'idle',
    message: '',
    items: [],
    activeId: null,
  }
}

export function normalizeOutlineState(outline) {
  const base = emptyOutlineState()
  if (!outline || typeof outline !== 'object') return base
  const items = Array.isArray(outline.items) ? outline.items : []
  return {
    supported: !!outline.supported,
    available: !!outline.available,
    loading: !!outline.loading,
    reason: outline.reason ? String(outline.reason) : (outline.available ? null : base.reason),
    message: outline.message ? String(outline.message) : '',
    items,
    activeId: outline.activeId ? String(outline.activeId) : null,
  }
}
