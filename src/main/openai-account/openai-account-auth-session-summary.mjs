import { sanitizeTextForSecrets } from './openai-account-sanitization.mjs'
import {
  asOptionalNumber,
  asOptionalObject,
  asTrimmedString,
  cloneJson,
  firstNonEmptyString,
} from './openai-account-auth-normalization.mjs'

export function asAvailability(value = null) {
  const source = asOptionalObject(value) || {}
  return {
    supported: source.supported === true,
    reason: asTrimmedString(source.reason) || (source.supported === true ? '' : 'bridge_unavailable'),
    message: asTrimmedString(source.message) || (source.supported === true ? '' : 'OpenAI account auth is unavailable because the local account bridge is not ready.'),
  }
}

export function buildDefaultSessionSummary(availability = asAvailability()) {
  return {
    hasSession: false,
    status: 'needs_login',
    bridgeAuthMode: '',
    email: '',
    label: '',
    planType: '',
    rateLimitSummary: null,
    collaborationModes: [],
    defaultCollaborationModeId: '',
    connectedAt: 0,
    updatedAt: 0,
    lastErrorCode: '',
    lastErrorMessage: '',
    availability,
  }
}

export function normalizeSessionStatus(value = '', hasSession = false) {
  const normalized = asTrimmedString(value).toLowerCase()
  if (hasSession && normalized === 'connected') return 'connected'
  if (['needs_login', 'expired', 'error', 'unsupported_auth_mode'].includes(normalized)) return normalized
  return hasSession ? 'connected' : 'needs_login'
}

export function normalizeSessionSummary(raw = null, availability = asAvailability()) {
  const source = asOptionalObject(raw) || {}
  const hasSession = source.hasSession === true
  const collaborationModes = Array.isArray(source.collaborationModes)
    ? source.collaborationModes
      .map((entry) => {
        const row = asOptionalObject(entry)
        if (!row) return null
        const id = asTrimmedString(row.id)
        if (!id) return null
        return {
          id,
          name: asTrimmedString(row.name) || id,
          description: asTrimmedString(row.description),
          isDefault: row.isDefault === true,
        }
      })
      .filter(Boolean)
    : []
  const defaultCollaborationModeId = selectPreferredCollaborationModeId(
    collaborationModes,
    asTrimmedString(source.defaultCollaborationModeId),
  )
  return {
    hasSession,
    status: normalizeSessionStatus(source.status, hasSession),
    bridgeAuthMode: asTrimmedString(source.bridgeAuthMode),
    email: asTrimmedString(source.email),
    label: asTrimmedString(source.label || source.email),
    planType: asTrimmedString(source.planType),
    rateLimitSummary: source.rateLimitSummary && typeof source.rateLimitSummary === 'object'
      ? cloneJson(source.rateLimitSummary)
      : null,
    collaborationModes,
    defaultCollaborationModeId,
    connectedAt: asOptionalNumber(source.connectedAt),
    updatedAt: asOptionalNumber(source.updatedAt),
    lastErrorCode: asTrimmedString(source.lastErrorCode),
    lastErrorMessage: asTrimmedString(sanitizeTextForSecrets(source.lastErrorMessage)),
    availability,
  }
}

export function scoreCollaborationMode(entry = null) {
  const row = asOptionalObject(entry) || {}
  const id = asTrimmedString(row.id).toLowerCase()
  const name = asTrimmedString(row.name).toLowerCase()
  const description = asTrimmedString(row.description).toLowerCase()
  let score = 0
  if (row.isDefault === true) score += 100
  if (id === 'default' || name === 'default') score += 80
  if (id.includes('default') || name.includes('default')) score += 40
  if (description.includes('default')) score += 10
  return score
}

export function selectPreferredCollaborationModeId(collaborationModes = [], preferredId = '') {
  const normalizedPreferredId = asTrimmedString(preferredId)
  const source = Array.isArray(collaborationModes)
    ? collaborationModes.filter((entry) => asTrimmedString(entry?.id))
    : []
  if (normalizedPreferredId && source.some((entry) => asTrimmedString(entry?.id) === normalizedPreferredId)) {
    return normalizedPreferredId
  }
  if (source.length === 1) return asTrimmedString(source[0]?.id)
  const scored = source
    .map((entry) => ({ id: asTrimmedString(entry?.id), score: scoreCollaborationMode(entry) }))
    .sort((left, right) => right.score - left.score)
  return (scored[0]?.score || 0) > 0 ? asTrimmedString(scored[0]?.id) : ''
}

export function normalizePlanType(raw = null) {
  const source = asOptionalObject(raw) || {}
  return firstNonEmptyString(
    source.planType,
    source.account?.planType,
    source.plan?.type,
    source.plan?.name,
    source.subscription?.planType,
    source.subscription?.plan?.type,
    source.rateLimits?.planType,
  )
}

export function normalizeEmail(raw = null) {
  const source = asOptionalObject(raw) || {}
  return firstNonEmptyString(
    source.email,
    source.account?.email,
    source.user?.email,
    source.account?.email,
    source.chatgpt?.email,
    source.profile?.email,
  )
}

export function normalizeLabel(raw = null) {
  const source = asOptionalObject(raw) || {}
  return firstNonEmptyString(
    source.label,
    source.account?.name,
    source.user?.name,
    source.account?.name,
    source.profile?.name,
    normalizeEmail(raw),
  )
}

export function normalizeAuthMode(raw = null) {
  const source = asOptionalObject(raw) || {}
  return firstNonEmptyString(
    source.authMode,
    source.mode,
    source.type,
    source.account?.authMode,
    source.account?.mode,
    source.account?.type,
  ).toLowerCase()
}

export function normalizeRateLimitSummary(raw = null) {
  if (!raw || typeof raw !== 'object') return null
  return cloneJson(raw)
}

export function buildSessionSummaryFromBridge(account = null, {
  rateLimitSummary = null,
  collaborationModes = null,
  availability = asAvailability({ supported: true }),
  now = Date.now(),
} = {}) {
  const authMode = normalizeAuthMode(account)
  const hasSession = authMode === 'chatgpt'
  const unsupportedAuthMode = !!authMode && !hasSession
  const planType = normalizePlanType(account) || firstNonEmptyString(rateLimitSummary?.planType, rateLimitSummary?.tier)
  const email = normalizeEmail(account)
  const label = normalizeLabel(account)
  const accountError = asOptionalObject(account)?.error
  const unsupportedMessage = unsupportedAuthMode
    ? `OpenAI account bridge reported unsupported auth mode "${authMode}".`
    : ''
  const normalizedCollaborationModes = Array.isArray(collaborationModes)
    ? collaborationModes.map((entry) => ({
      id: asTrimmedString(entry?.id),
      name: asTrimmedString(entry?.name) || asTrimmedString(entry?.id),
      description: asTrimmedString(entry?.description),
      isDefault: entry?.isDefault === true,
    })).filter((entry) => entry.id)
    : []
  const effectiveCollaborationModes = hasSession ? normalizedCollaborationModes : []
  return normalizeSessionSummary({
    hasSession,
    status: hasSession ? 'connected' : (unsupportedAuthMode ? 'unsupported_auth_mode' : 'needs_login'),
    bridgeAuthMode: authMode,
    email,
    label,
    planType,
    rateLimitSummary: normalizeRateLimitSummary(rateLimitSummary),
    collaborationModes: effectiveCollaborationModes,
    defaultCollaborationModeId: selectPreferredCollaborationModeId(effectiveCollaborationModes),
    connectedAt: hasSession ? asOptionalNumber(now) : 0,
    updatedAt: asOptionalNumber(now),
    lastErrorCode: hasSession ? '' : (unsupportedAuthMode ? 'unsupported_auth_mode' : firstNonEmptyString(accountError?.code)),
    lastErrorMessage: hasSession ? '' : (unsupportedAuthMode ? unsupportedMessage : firstNonEmptyString(accountError?.message)),
  }, availability)
}

export function buildAvailabilityFromRuntimeState(runtimeState = null) {
  const source = asOptionalObject(runtimeState) || {}
  if (asTrimmedString(source.status) === 'runtime_ready') {
    return asAvailability({ supported: true })
  }
  return asAvailability({
    supported: false,
    reason: asTrimmedString(source.reason) || asTrimmedString(source.status) || 'runtime_missing',
    message: asTrimmedString(source.message) || 'Pinned Codex runtime is unavailable.',
  })
}
