import {
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
  MIN_TERMINAL_COLS,
  MIN_TERMINAL_ROWS,
  MAX_TERMINAL_COLS,
  MAX_TERMINAL_ROWS,
  DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_MAX_CHARS,
  MAX_TERMINAL_SESSION_READ_SNAPSHOT_MAX_CHARS,
  DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_PREVIEW_MAX_CHARS,
  DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_MODE,
  DEFAULT_TERMINAL_SESSION_WAIT_FOR_OUTPUT_TIMEOUT_MS,
  MAX_TERMINAL_SESSION_WAIT_FOR_OUTPUT_TIMEOUT_MS,
  TERMINAL_SESSION_READ_SNAPSHOT_MODES,
} from './terminal-session-manager-constants.mjs'

export function asTrimmedString(value = '') {
  return String(value || '').trim()
}

export function normalizeProjectPathKey(value = '', platform = process.platform) {
  const normalized = asTrimmedString(value)
    .replace(/\\/g, '/')
    .replace(/\/+$/g, '')
  if (!normalized) return ''
  return platform === 'win32'
    ? normalized.toLowerCase()
    : normalized
}

export function createTerminalSessionError(code, message, extras = {}) {
  const error = new Error(asTrimmedString(message) || code)
  error.code = asTrimmedString(code) || 'terminal_session_error'
  Object.assign(error, extras)
  return error
}

export function normalizeTerminalSessionSequence(value) {
  return Number.isFinite(Number(value))
    ? Math.max(0, Number(value))
    : 0
}

export function normalizeReadSnapshotMode(mode = '') {
  const normalized = asTrimmedString(mode).toLowerCase()
  return TERMINAL_SESSION_READ_SNAPSHOT_MODES.includes(normalized)
    ? normalized
    : DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_MODE
}

export function normalizeWaitForOutputTimeoutMs(timeoutMs) {
  if (timeoutMs === undefined || timeoutMs === null || timeoutMs === '') {
    return DEFAULT_TERMINAL_SESSION_WAIT_FOR_OUTPUT_TIMEOUT_MS
  }
  const numeric = Number(timeoutMs)
  if (!Number.isFinite(numeric)) {
    return DEFAULT_TERMINAL_SESSION_WAIT_FOR_OUTPUT_TIMEOUT_MS
  }
  return Math.max(
    1,
    Math.min(MAX_TERMINAL_SESSION_WAIT_FOR_OUTPUT_TIMEOUT_MS, Math.round(numeric)),
  )
}

export function normalizeReadSnapshotMaxChars(maxChars) {
  if (maxChars === undefined || maxChars === null || maxChars === '') {
    return DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_MAX_CHARS
  }
  const numeric = Number(maxChars)
  if (!Number.isFinite(numeric)) {
    return DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_MAX_CHARS
  }
  return Math.max(
    1,
    Math.min(MAX_TERMINAL_SESSION_READ_SNAPSHOT_MAX_CHARS, Math.round(numeric)),
  )
}

export function clampReadSnapshotPreview(text = '') {
  const source = String(text || '')
  if (source.length <= DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_PREVIEW_MAX_CHARS) return source
  return `${source.slice(0, Math.max(0, DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_PREVIEW_MAX_CHARS - 16)).trimEnd()}... [truncated]`
}

function normalizeDimension(value, {
  fallback,
  min,
  max,
  label,
} = {}) {
  if (value === undefined || value === null || value === '') return fallback
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    throw createTerminalSessionError('terminal_session_invalid_size', `${label} must be a finite number.`)
  }
  const rounded = Math.round(numeric)
  if (rounded < min || rounded > max) {
    throw createTerminalSessionError(
      'terminal_session_invalid_size',
      `${label} must be between ${min} and ${max}.`,
    )
  }
  return rounded
}

export function normalizeTerminalSize(input = {}, defaults = {}) {
  return {
    cols: normalizeDimension(input.cols, {
      fallback: defaults.cols ?? DEFAULT_TERMINAL_COLS,
      min: MIN_TERMINAL_COLS,
      max: MAX_TERMINAL_COLS,
      label: 'cols',
    }),
    rows: normalizeDimension(input.rows, {
      fallback: defaults.rows ?? DEFAULT_TERMINAL_ROWS,
      min: MIN_TERMINAL_ROWS,
      max: MAX_TERMINAL_ROWS,
      label: 'rows',
    }),
  }
}
