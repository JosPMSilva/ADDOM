export const EDITOR_SERVICE_SYNC_EVENTS = Object.freeze([
  'open',
  'change',
  'save',
  'close',
])

export const EDITOR_SERVICE_REQUEST_KINDS = Object.freeze([
  'diagnostics',
  'hover',
  'definition',
  'references',
  'symbols',
  'formatting',
  'codeActions',
])

export const EDITOR_SERVICE_CAPABILITY_KEYS = Object.freeze([
  'diagnostics',
  'hover',
  'definition',
  'references',
  'symbols',
  'formatting',
  'codeActions',
])

export function createUnavailableCapability({
  source = '',
  reason = 'unsupported',
  message = '',
  supported = false,
} = {}) {
  return {
    supported: supported === true,
    available: false,
    source: String(source || '').trim(),
    reason: String(reason || 'unsupported').trim() || 'unsupported',
    message: String(message || '').trim(),
  }
}

export function createAvailableCapability({
  source = '',
  reason = '',
  message = '',
  supported = true,
} = {}) {
  return {
    supported: supported !== false,
    available: true,
    source: String(source || '').trim(),
    reason: String(reason || '').trim(),
    message: String(message || '').trim(),
  }
}

