import path from 'node:path'
import { getUserDataPath } from '../platform/electron-app.mjs'

export function resolveManagedPlanStorageRoot(userDataPath = '') {
  return path.resolve(String(userDataPath || getUserDataPath()).trim(), 'managed-plans')
}

export function isManagedPlanStoragePath(filePath = '', { userDataPath = '' } = {}) {
  const candidate = String(filePath || '').trim()
  if (!candidate) return false
  const root = resolveManagedPlanStorageRoot(userDataPath)
  const absolute = path.resolve(candidate)
  const relative = path.relative(root, absolute)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
