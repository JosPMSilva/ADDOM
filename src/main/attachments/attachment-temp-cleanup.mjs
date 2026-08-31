import fs from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_ATTACHMENT_TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000

function normalizePositiveNumber(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

export async function cleanupAttachmentTempDir(tempDir = '', {
  olderThanMs = DEFAULT_ATTACHMENT_TEMP_MAX_AGE_MS,
  nowMs = Date.now(),
} = {}) {
  const targetDir = String(tempDir || '').trim()
  if (!targetDir) {
    return {
      ok: false,
      scannedEntries: 0,
      deletedEntries: 0,
      errorCount: 0,
      error: 'temp_dir_missing',
    }
  }
  const maxAgeMs = normalizePositiveNumber(olderThanMs, DEFAULT_ATTACHMENT_TEMP_MAX_AGE_MS)
  const referenceNowMs = normalizePositiveNumber(nowMs, Date.now())

  let entries = []
  try {
    entries = await fs.readdir(targetDir, { withFileTypes: true })
  } catch (error) {
    if (String(error?.code || '').toUpperCase() === 'ENOENT') {
      return {
        ok: true,
        scannedEntries: 0,
        deletedEntries: 0,
        errorCount: 0,
      }
    }
    return {
      ok: false,
      scannedEntries: 0,
      deletedEntries: 0,
      errorCount: 1,
      error: String(error?.message || 'attachment_temp_cleanup_failed'),
    }
  }

  let scannedEntries = 0
  let deletedEntries = 0
  let errorCount = 0

  for (const entry of entries) {
    const name = String(entry?.name || '').trim()
    if (!name) continue
    scannedEntries += 1
    const absolutePath = path.join(targetDir, name)

    let stat = null
    try {
      stat = await fs.stat(absolutePath)
    } catch {
      errorCount += 1
      continue
    }

    const ageMs = Math.max(0, referenceNowMs - Number(stat?.mtimeMs || 0))
    if (ageMs < maxAgeMs) continue

    try {
      if (entry?.isDirectory?.()) {
        await fs.rm(absolutePath, { recursive: true, force: true })
      } else {
        await fs.unlink(absolutePath)
      }
      deletedEntries += 1
    } catch {
      errorCount += 1
    }
  }

  return {
    ok: errorCount === 0,
    scannedEntries,
    deletedEntries,
    errorCount,
  }
}
