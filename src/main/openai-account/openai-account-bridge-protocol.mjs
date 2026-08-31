import { normalizeId } from './openai-account-bridge-shared.mjs'

export function createProtocolError(payload = null, fallbackMessage = 'Codex app-server returned an error.') {
  const source = payload && typeof payload === 'object' ? payload : {}
  const details = source.error && typeof source.error === 'object' ? source.error : source
  const error = new Error(normalizeId(details.message) || fallbackMessage)
  error.reason = normalizeId(details.code) || 'bridge_protocol_error'
  error.code = 'bridge_protocol_error'
  error.data = details.data
  return error
}

function createBridgeCompatibilityError(reason = 'bridge_protocol_incompatible', message = 'Codex app-server returned an incompatible protocol response.') {
  const error = new Error(normalizeId(message) || 'Codex app-server returned an incompatible protocol response.')
  error.reason = normalizeId(reason) || 'bridge_protocol_incompatible'
  error.code = 'bridge_protocol_incompatible'
  return error
}

export function validateInitializeResult(result = null) {
  const source = result && typeof result === 'object' ? result : null
  const platformFamily = normalizeId(source?.platformFamily)
  const platformOs = normalizeId(source?.platformOs)
  if (platformFamily && platformOs) {
    return {
      platformFamily,
      platformOs,
    }
  }
  throw createBridgeCompatibilityError(
    'bridge_protocol_incompatible',
    'Codex app-server initialize response is incompatible with the protocol ADDOM expects.',
  )
}

function normalizeCollaborationModePreset(entry = null) {
  const source = entry && typeof entry === 'object' ? entry : null
  if (!source) return null
  const id = normalizeId(
    source.id
    || source.modeId
    || source.key
    || source.value
    || source.slug
    || source.name,
  )
  if (!id) return null
  const name = normalizeId(source.name || source.title || source.label || id)
  const description = normalizeId(source.description || source.summary)
  return {
    id,
    name,
    description,
    isDefault: source.isDefault === true || source.default === true || id.toLowerCase() === 'default',
    raw: { ...source },
  }
}

export function normalizeCollaborationModePresetList(result = null) {
  const source = result && typeof result === 'object' ? result : null
  const rawEntries = Array.isArray(result)
    ? result
    : (Array.isArray(source?.collaborationModes)
        ? source.collaborationModes
        : (Array.isArray(source?.modes)
            ? source.modes
            : (Array.isArray(source?.items) ? source.items : [])))
  return rawEntries
    .map((entry) => normalizeCollaborationModePreset(entry))
    .filter(Boolean)
}
