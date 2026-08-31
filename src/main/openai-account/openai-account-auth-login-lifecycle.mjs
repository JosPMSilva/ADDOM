import crypto from 'node:crypto'
import { sanitizeTextForSecrets } from './openai-account-sanitization.mjs'
import {
  asOptionalNumber,
  asOptionalObject,
  asTrimmedString,
} from './openai-account-auth-normalization.mjs'

export const LOGIN_COMPLETION_REFRESH_ATTEMPTS = 3
export const LOGIN_COMPLETION_REFRESH_DELAY_MS = 250

const PENDING_LOGIN_PHASES = new Set(['starting', 'waiting_for_browser', 'waiting_for_callback'])
const TERMINAL_LOGIN_PHASES = new Set(['succeeded', 'cancelled', 'timed_out', 'failed'])
const LOGIN_TIMEOUT_MS = 15 * 60 * 1000

export function normalizeLoginPhase(value = '') {
  const normalized = asTrimmedString(value).toLowerCase()
  if (PENDING_LOGIN_PHASES.has(normalized) || TERMINAL_LOGIN_PHASES.has(normalized)) return normalized
  return 'failed'
}

export function normalizeActiveLogin(raw = null) {
  const source = asOptionalObject(raw)
  if (!source) return null
  const loginId = asTrimmedString(source.loginId)
  if (!loginId) return null
  const phase = normalizeLoginPhase(source.phase)
  return {
    loginId,
    phase,
    authUrl: asTrimmedString(source.authUrl),
    browserOpened: source.browserOpened === true,
    startedAt: asOptionalNumber(source.startedAt),
    updatedAt: asOptionalNumber(source.updatedAt),
    completedAt: asOptionalNumber(source.completedAt),
    errorCode: asTrimmedString(source.errorCode),
    errorMessage: asTrimmedString(sanitizeTextForSecrets(source.errorMessage)),
  }
}

export function sanitizeActiveLoginForPersistence(login = null) {
  const normalized = normalizeActiveLogin(login)
  if (!normalized) return null
  return {
    ...normalized,
    authUrl: '',
  }
}

export function isPendingLogin(login = null) {
  return !!login && PENDING_LOGIN_PHASES.has(asTrimmedString(login.phase).toLowerCase())
}

export function shouldTimeOutLogin(login = null, now = Date.now()) {
  if (!isPendingLogin(login)) return false
  const startedAt = asOptionalNumber(login?.startedAt)
  if (!startedAt) return true
  return (Number(now) - startedAt) >= LOGIN_TIMEOUT_MS
}

export function buildTimedOutLogin(login = null, now = Date.now()) {
  const normalizedLogin = normalizeActiveLogin(login)
  if (!normalizedLogin || !shouldTimeOutLogin(normalizedLogin, now)) return normalizedLogin
  return {
    ...normalizedLogin,
    phase: 'timed_out',
    updatedAt: asOptionalNumber(now),
    completedAt: asOptionalNumber(now),
    errorCode: asTrimmedString(normalizedLogin?.errorCode) || 'login_timed_out',
    errorMessage: asTrimmedString(normalizedLogin?.errorMessage) || 'OpenAI account login timed out before the browser callback completed.',
  }
}

export function buildFailedLogin(login = null, {
  now = Date.now(),
  errorCode = 'login_failed',
  errorMessage = 'OpenAI account login failed.',
} = {}) {
  const base = normalizeActiveLogin(login) || {
    loginId: `openai_login_${crypto.randomBytes(6).toString('hex')}`,
    phase: 'failed',
    authUrl: '',
    browserOpened: false,
    startedAt: asOptionalNumber(now),
    updatedAt: asOptionalNumber(now),
    completedAt: asOptionalNumber(now),
    errorCode: asTrimmedString(errorCode),
    errorMessage: asTrimmedString(errorMessage),
  }
  return {
    ...base,
    phase: 'failed',
    updatedAt: asOptionalNumber(now),
    completedAt: asOptionalNumber(now),
    errorCode: asTrimmedString(errorCode),
    errorMessage: asTrimmedString(errorMessage),
  }
}

export function buildBrowserLaunchResult(login = null, {
  now = Date.now(),
  browserOpened = false,
  errorCode = '',
  errorMessage = '',
} = {}) {
  const normalizedLogin = normalizeActiveLogin(login)
  if (!normalizedLogin) return null
  const timestamp = asOptionalNumber(now)
  return {
    ...normalizedLogin,
    browserOpened,
    phase: browserOpened ? 'waiting_for_callback' : 'waiting_for_browser',
    updatedAt: timestamp,
    errorCode: browserOpened ? '' : asTrimmedString(errorCode),
    errorMessage: browserOpened ? '' : asTrimmedString(errorMessage),
  }
}
