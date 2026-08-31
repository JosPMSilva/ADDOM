import { buildCanonicalFileUri } from '../../store/editor-model-registry.js'

export const EMPTY_SERVICE_STATE = Object.freeze({
  capabilities: {},
  diagnosticOwnership: { mode: 'syntax-only', owner: 'syntax-only', summary: '' },
  health: { status: 'idle', message: '', providers: [] },
})

export function getEditorServiceApi() {
  if (typeof window === 'undefined') return null
  const api = window?.addom?.editor?.service
  if (!api || typeof api.request !== 'function') return null
  return api
}

export function reportMonacoTrace(kind, details = {}) {
  if (typeof window === 'undefined') return
  const api = window?.addom?.diagnostics
  if (!api || typeof api.trace !== 'function') return
  void api.trace({ kind, details }).catch(() => {})
}

export function buildEditorServicePayload({ kind, model, projectFolder, tabFilePath, tabLanguage }) {
  if (!model) return null
  const canonicalUri = buildCanonicalFileUri(projectFolder, tabFilePath)
  return {
    kind,
    projectFolder: String(projectFolder || '').trim(),
    filePath: String(tabFilePath || '').trim(),
    uri: canonicalUri || String(model.uri || ''),
    language: String(model.getLanguageId?.() || tabLanguage || 'plaintext').trim().toLowerCase(),
    content: String(model.getValue?.() || ''),
  }
}

export function normalizeEditorServiceState(state = null) {
  if (!state || typeof state !== 'object') return EMPTY_SERVICE_STATE
  return {
    ...EMPTY_SERVICE_STATE,
    ...state,
    capabilities: state.capabilities && typeof state.capabilities === 'object' ? state.capabilities : {},
    diagnosticOwnership: state.diagnosticOwnership && typeof state.diagnosticOwnership === 'object'
      ? state.diagnosticOwnership
      : EMPTY_SERVICE_STATE.diagnosticOwnership,
    health: state.health && typeof state.health === 'object'
      ? state.health
      : EMPTY_SERVICE_STATE.health,
  }
}

export function getEditorServiceStateFingerprint(state = null) {
  const normalized = normalizeEditorServiceState(state)
  return JSON.stringify({
    capabilities: normalized.capabilities,
    diagnosticOwnership: normalized.diagnosticOwnership,
    health: normalized.health,
  })
}

export function isSameModelUri(left, right) {
  return String(left || '') === String(right || '')
}

export function mapEditorServiceRange(monaco, range = null) {
  if (!range || typeof range !== 'object') return null
  return new monaco.Range(
    Math.max(1, Number(range.startLineNumber || 1) || 1),
    Math.max(1, Number(range.startColumn || 1) || 1),
    Math.max(1, Number(range.endLineNumber || range.startLineNumber || 1) || 1),
    Math.max(1, Number(range.endColumn || range.startColumn || 1) || 1),
  )
}

export function mapEditorServiceLocation(monaco, location = null) {
  const uriValue = String(location?.uri || '').trim()
  const range = mapEditorServiceRange(monaco, location?.range)
  if (!uriValue || !range) return null
  try {
    return {
      uri: monaco.Uri.parse(uriValue),
      range,
    }
  } catch {
    return null
  }
}
