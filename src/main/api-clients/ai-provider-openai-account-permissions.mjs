import path from 'node:path'

const MAX_PERMISSION_PATHS = 64
const MAX_PERMISSION_PATH_LENGTH = 32_768

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function hasOnlyKeys(value, allowedKeys) {
  if (!isPlainObject(value)) return false
  const allowed = new Set(allowedKeys)
  return Object.keys(value).every((key) => allowed.has(key))
}

function normalizeAbsolutePathList(value) {
  if (value == null) return { valid: true, paths: [] }
  if (!Array.isArray(value) || value.length > MAX_PERMISSION_PATHS) {
    return { valid: false, paths: [] }
  }
  const paths = new Map()
  for (const entry of value) {
    const raw = typeof entry === 'string' ? entry.trim() : ''
    if (!raw || raw.length > MAX_PERMISSION_PATH_LENGTH || !path.isAbsolute(raw)) {
      return { valid: false, paths: [] }
    }
    const resolved = path.resolve(raw)
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved
    if (!paths.has(key)) paths.set(key, resolved)
  }
  return { valid: true, paths: Array.from(paths.values()) }
}

export function normalizeOpenAIAccountPermissionRequest(value = null) {
  if (!hasOnlyKeys(value, ['network', 'fileSystem'])) {
    return { valid: false, permissions: {}, hasRequestedPermissions: false }
  }

  const permissions = {}
  const network = value.network
  if (network != null) {
    if (
      !hasOnlyKeys(network, ['enabled'])
      || !(
        network.enabled == null
        || typeof network.enabled === 'boolean'
      )
    ) {
      return { valid: false, permissions: {}, hasRequestedPermissions: false }
    }
    if (network.enabled === true) permissions.network = { enabled: true }
  }

  const fileSystem = value.fileSystem
  if (fileSystem != null) {
    if (!hasOnlyKeys(fileSystem, ['read', 'write'])) {
      return { valid: false, permissions: {}, hasRequestedPermissions: false }
    }
    const read = normalizeAbsolutePathList(fileSystem.read)
    const write = normalizeAbsolutePathList(fileSystem.write)
    if (!read.valid || !write.valid) {
      return { valid: false, permissions: {}, hasRequestedPermissions: false }
    }
    if (read.paths.length > 0 || write.paths.length > 0) {
      permissions.fileSystem = {
        read: read.paths.length > 0 ? read.paths : null,
        write: write.paths.length > 0 ? write.paths : null,
      }
    }
  }

  return {
    valid: true,
    permissions,
    hasRequestedPermissions: Object.keys(permissions).length > 0,
  }
}

export function buildDeniedOpenAIAccountPermissionResponse() {
  return {
    scope: 'turn',
    permissions: {},
  }
}
