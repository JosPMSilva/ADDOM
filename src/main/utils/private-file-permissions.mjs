import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'

export function applyOwnerOnlyFilePermissions(targetPath, options = {}) {
  const safeTargetPath = String(targetPath || '').trim()
  if (!safeTargetPath) return false

  const {
    platform = process.platform,
    username = safeResolveUsername(),
    chmodSyncImpl = fs.chmodSync,
    execFileSyncImpl = execFileSync,
  } = options

  try {
    if (platform === 'win32') {
      const safeUsername = String(username || '').trim()
      if (!safeUsername) return false
      execFileSyncImpl(
        'icacls',
        [safeTargetPath, '/inheritance:r', '/grant:r', `${safeUsername}:(R,W)`],
        { stdio: 'ignore' },
      )
      return true
    }

    chmodSyncImpl(safeTargetPath, 0o600)
    return true
  } catch {
    return false
  }
}

function safeResolveUsername() {
  try {
    return os.userInfo().username
  } catch {
    return ''
  }
}
