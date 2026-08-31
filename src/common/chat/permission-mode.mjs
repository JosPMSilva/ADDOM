export const PERMISSION_MODE_ASK = 'ask'
export const PERMISSION_MODE_AUTONOMY = 'autonomy'
export const PERMISSION_MODE_FULL_ACCESS = 'full_access'
export const DEFAULT_PERMISSION_MODE = PERMISSION_MODE_ASK

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

export function normalizePermissionMode(value, fallback = DEFAULT_PERMISSION_MODE) {
  const normalizedFallbackInput = String(fallback || '').trim().toLowerCase()
  const normalizedFallback = (
    normalizedFallbackInput === PERMISSION_MODE_AUTONOMY
    || normalizedFallbackInput === PERMISSION_MODE_FULL_ACCESS
  )
    ? normalizedFallbackInput
    : PERMISSION_MODE_ASK
  const normalizedValue = String(value || '').trim().toLowerCase()
  if (normalizedValue === PERMISSION_MODE_FULL_ACCESS) return PERMISSION_MODE_FULL_ACCESS
  if (normalizedValue === PERMISSION_MODE_AUTONOMY) return PERMISSION_MODE_AUTONOMY
  if (normalizedValue === PERMISSION_MODE_ASK) return PERMISSION_MODE_ASK
  if (normalizedValue === 'full_permissions' || normalizedValue === 'full') return PERMISSION_MODE_FULL_ACCESS
  return normalizedFallback
}

function normalizeLegacyCommandAccessMode(value) {
  const normalizedValue = String(value || '').trim().toLowerCase()
  if (normalizedValue === 'full_permissions' || normalizedValue === 'full') return 'full_permissions'
  if (normalizedValue === 'limited') return 'limited'
  if (normalizedValue === 'off') return 'off'
  return 'ask_when_needed'
}

function hasExplicitLegacyRestriction(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {}
  if (hasOwn(source, 'runCommandEnabled') && source.runCommandEnabled === false) return true
  if (hasOwn(source, 'webBrowsingEnabled') && source.webBrowsingEnabled === false) return true
  const toolPermissions = source.toolPermissions && typeof source.toolPermissions === 'object'
    ? source.toolPermissions
    : null
  if (!toolPermissions) return false
  return Object.keys(toolPermissions).some((key) => toolPermissions[key] === false)
}

export function resolvePermissionModeFromLegacySettings(raw = {}, fallback = DEFAULT_PERMISSION_MODE) {
  const source = raw && typeof raw === 'object' ? raw : {}
  if (hasOwn(source, 'permissionMode')) {
    return normalizePermissionMode(source.permissionMode, fallback)
  }

  const legacyCommandAccessMode = normalizeLegacyCommandAccessMode(
    source?.commandSafety?.commandAccessMode
    ?? source?.commandSafety?.commandAccess
    ?? source?.commandSafety?.commandAccessLevel
    ?? source?.commandAccessMode
    ?? source?.commandAccess
    ?? source?.commandAccessLevel,
  )

  if (legacyCommandAccessMode === 'full_permissions' && !hasExplicitLegacyRestriction(source)) {
    return PERMISSION_MODE_FULL_ACCESS
  }

  return normalizePermissionMode(fallback)
}
