import { normalizePermissionMode } from '../../common/chat/permission-mode.mjs'

function normalizeError(error) {
  if (error instanceof Error) return error
  return new Error(String(error || 'Permission mode persistence failed.'))
}

export async function savePermissionModeSelection({
  nextMode,
  currentPermissionMode = 'ask',
  settingsApi = null,
} = {}) {
  const normalizedCurrent = normalizePermissionMode(currentPermissionMode)
  const normalizedNext = normalizePermissionMode(nextMode, normalizedCurrent)

  if (normalizedNext === normalizedCurrent) {
    return {
      status: 'unchanged',
      permissionMode: normalizedCurrent,
      error: null,
    }
  }

  const api = settingsApi && typeof settingsApi === 'object' ? settingsApi : null
  if (!api || typeof api.set !== 'function') {
    return {
      status: 'failed',
      permissionMode: normalizedCurrent,
      error: new Error('Permission mode settings API is unavailable.'),
    }
  }

  try {
    const persisted = await api.set({ permissionMode: normalizedNext })
    return {
      status: 'saved',
      permissionMode: normalizePermissionMode(persisted?.permissionMode, normalizedNext),
      error: null,
    }
  } catch (error) {
    let fallbackMode = normalizedCurrent
    if (typeof api.get === 'function') {
      try {
        const persisted = await api.get()
        fallbackMode = normalizePermissionMode(persisted?.permissionMode, normalizedCurrent)
      } catch {
        fallbackMode = normalizedCurrent
      }
    }
    return {
      status: 'failed',
      permissionMode: fallbackMode,
      error: normalizeError(error),
    }
  }
}
