import fs from 'node:fs'

import { getLatestRevision } from '../memory/artifact-store.mjs'

function readFileIfExists(absPath) {
  try {
    if (fs.existsSync(absPath)) return fs.readFileSync(absPath, 'utf8')
  } catch {
    // Non-fatal. Treat unreadable files as drift.
  }
  return null
}

export function evaluateMergeResolutionApplyState({
  project,
  filePath,
  absPath,
  expectedLatestRevId = '',
} = {}) {
  return evaluateMergeResolutionApplySnapshot({
    latestRevision: getLatestRevision(project, filePath),
    expectedLatestRevId,
    diskContent: readFileIfExists(absPath),
  })
}

export function evaluateMergeResolutionApplySnapshot({
  latestRevision = null,
  expectedLatestRevId = '',
  diskContent = null,
} = {}) {
  const latest = latestRevision
  const latestId = String(latest?.id || '')
  const latestRev = Number(latest?.rev || 0) || 0
  const normalizedExpectedLatestRevId = String(expectedLatestRevId || '').trim()

  if (!latestId) {
    return {
      ok: false,
      conflict: true,
      reason: 'missing_latest_revision',
      latestId: '',
      latestRev: 0,
      error: 'The latest artifact revision is missing for this file. Retry from the latest thread state.',
    }
  }

  if (normalizedExpectedLatestRevId && latestId !== normalizedExpectedLatestRevId) {
    return {
      ok: false,
      conflict: true,
      reason: 'changed_since_conflict',
      latestId,
      latestRev,
      error: 'This file changed again after the conflict was detected. Retry from the latest thread state.',
    }
  }

  const latestContent = String(latest?.content ?? '')
  if (diskContent !== latestContent) {
    return {
      ok: false,
      conflict: true,
      reason: 'disk_changed_since_conflict',
      latestId,
      latestRev,
      error: 'This file was edited outside the tracked conflict state. Retry from the latest thread state.',
    }
  }

  return {
    ok: true,
    latestId,
    latestRev,
  }
}
