import { normalizeEditorFilePath } from './editor-model-registry.js'

export function sameEditorFilePath(a, b) {
  return normalizeEditorFilePath(a) === normalizeEditorFilePath(b)
}

export function normalizeEditorLocation(line, column) {
  const nextLine = Number(line)
  if (!Number.isFinite(nextLine) || nextLine < 1) return null
  const nextColumn = Number(column)
  return {
    line: Math.max(1, Math.round(nextLine)),
    column: Number.isFinite(nextColumn) && nextColumn >= 1 ? Math.round(nextColumn) : 1,
  }
}

export function serviceStateFingerprint(serviceState = null) {
  if (!serviceState || typeof serviceState !== 'object') return ''
  return JSON.stringify({
    capabilities: serviceState.capabilities || {},
    diagnosticOwnership: serviceState.diagnosticOwnership || {},
    health: serviceState.health || {},
  })
}

export function syncEditorServiceDocument(event, payload = {}) {
  if (typeof window === 'undefined') return
  const api = window?.addom?.editor?.service
  if (!api || typeof api.syncDocument !== 'function') return
  api.syncDocument({ event, ...payload }).catch(() => { })
}
