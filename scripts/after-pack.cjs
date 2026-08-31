const fs = require('fs/promises')
const path = require('path')

function updatesEnabled() {
  return String(process.env.ADDOM_UPDATE_BASE_URL || '').trim().length > 0
}

async function removeIfPresent(targetPath) {
  try {
    await fs.rm(targetPath, { force: true })
  } catch {
    // Best-effort cleanup only.
  }
}

module.exports = async function afterPack(context) {
  if (updatesEnabled()) return

  const appOutDir = String(context?.appOutDir || '').trim()
  if (!appOutDir) return

  const candidatePaths = [
    path.join(appOutDir, 'resources', 'app-update.yml'),
    path.join(appOutDir, 'Contents', 'Resources', 'app-update.yml'),
  ]

  await Promise.all(candidatePaths.map((targetPath) => removeIfPresent(targetPath)))
}
