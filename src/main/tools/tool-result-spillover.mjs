import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getUserDataPath } from '../platform/electron-app.mjs'

const TOOL_RESULT_SPILLOVER_DIR_NAME = 'tool-result-spillover'
const TOOL_RESULT_SPILLOVER_SCHEMA_VERSION = 1
const DEFAULT_TOOL_RESULT_SPILLOVER_RETENTION_POLICY = Object.freeze({
  maxFileCount: 64,
  maxAggregateBytes: 20 * 1024 * 1024,
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
})
const spilloverStateCache = new Map()

function resolveBaseUserDataPath(userDataPath = '') {
  const normalized = String(userDataPath || getUserDataPath()).trim()
  return path.resolve(normalized)
}

function normalizeFileSegment(value = '', fallback = 'unknown') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return normalized || fallback
}

function clampPositiveInt(value, fallback = 0) {
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized <= 0) return fallback
  return Math.trunc(normalized)
}

function clampNonNegativeInt(value, fallback = 0) {
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized < 0) return fallback
  return Math.trunc(normalized)
}

function normalizeContextId(value = '') {
  return String(value || '').trim()
}

function atomicWriteFile(targetPath = '', text = '') {
  const safeTargetPath = String(targetPath || '').trim()
  if (!safeTargetPath) return
  const tempPath = `${safeTargetPath}.${crypto.randomBytes(8).toString('hex')}.tmp`
  fs.mkdirSync(path.dirname(safeTargetPath), { recursive: true })
  fs.writeFileSync(tempPath, text, { encoding: 'utf8', mode: 0o600 })
  try {
    fs.renameSync(tempPath, safeTargetPath)
  } catch {
    fs.writeFileSync(safeTargetPath, text, { encoding: 'utf8', mode: 0o600 })
  } finally {
    try { fs.unlinkSync(tempPath) } catch { /* best-effort temp cleanup */ }
  }
}

function isPathWithinRoot(rootPath = '', candidatePath = '') {
  const normalizedRootPath = path.resolve(String(rootPath || ''))
  const normalizedCandidatePath = path.resolve(String(candidatePath || ''))
  if (!normalizedRootPath || !normalizedCandidatePath) return false
  return normalizedCandidatePath.startsWith(`${normalizedRootPath}${path.sep}`)
}

function resolveCacheKey(rootPath = '') {
  const normalizedRootPath = String(rootPath || '').trim()
  return normalizedRootPath ? path.resolve(normalizedRootPath) : ''
}

function rememberToolResultSpilloverState(rootPath = '', snapshot = {}) {
  const cacheKey = resolveCacheKey(rootPath)
  if (!cacheKey) return null
  const normalizedSnapshot = {
    sessionCleanupState: String(snapshot?.sessionCleanupState || 'none').trim() || 'none',
    sessionCleanupAt: clampNonNegativeInt(snapshot?.sessionCleanupAt, 0),
    sessionCleanupDeletedFileCount: clampNonNegativeInt(snapshot?.sessionCleanupDeletedFileCount, 0),
    sessionCleanupDeletedBytes: clampNonNegativeInt(snapshot?.sessionCleanupDeletedBytes, 0),
  }
  spilloverStateCache.set(cacheKey, normalizedSnapshot)
  return normalizedSnapshot
}

function readToolResultSpilloverState(rootPath = '') {
  const cacheKey = resolveCacheKey(rootPath)
  if (!cacheKey) return null
  return spilloverStateCache.get(cacheKey) || null
}

function listToolResultSpilloverEntries(rootPath = '') {
  const safeRootPath = String(rootPath || '').trim()
  if (!safeRootPath || !fs.existsSync(safeRootPath)) return []
  return fs.readdirSync(safeRootPath, { withFileTypes: true })
    .filter((entry) => entry?.isFile?.() === true && entry.name.toLowerCase().endsWith('.json'))
    .map((entry) => {
      const entryPath = path.join(safeRootPath, entry.name)
      const stats = fs.statSync(entryPath)
      return {
        name: entry.name,
        entryPath,
        size: Math.max(0, Number(stats.size || 0) || 0),
        mtimeMs: Math.max(0, Number(stats.mtimeMs || 0) || 0),
      }
    })
}

function matchesProtectionContext(record = null, {
  threadId = '',
  turnId = '',
} = {}) {
  const normalizedThreadId = normalizeContextId(threadId)
  const normalizedTurnId = normalizeContextId(turnId)
  if (!normalizedThreadId && !normalizedTurnId) return false
  if (!record || typeof record !== 'object') return false
  const recordThreadId = normalizeContextId(record.threadId)
  const recordTurnId = normalizeContextId(record.turnId)
  if (normalizedThreadId && recordThreadId !== normalizedThreadId) return false
  if (normalizedTurnId && recordTurnId !== normalizedTurnId) return false
  return true
}

function collectProtectedSpilloverPaths({
  rootPath = '',
  threadId = '',
  turnId = '',
} = {}) {
  const safeRootPath = String(rootPath || '').trim()
  const result = {
    protectedPaths: [],
    degraded: false,
    failureReasons: [],
  }
  if (!safeRootPath || !fs.existsSync(safeRootPath)) return result
  let entries = []
  try {
    entries = listToolResultSpilloverEntries(safeRootPath)
  } catch (error) {
    result.degraded = true
    result.failureReasons.push(`protect_scan_failed:${error?.code || error?.name || 'unknown'}`)
    return result
  }
  for (const entry of entries) {
    try {
      const parsed = JSON.parse(fs.readFileSync(entry.entryPath, 'utf8'))
      if (matchesProtectionContext(parsed, { threadId, turnId })) {
        result.protectedPaths.push(entry.entryPath)
      }
    } catch (error) {
      result.degraded = true
      result.failureReasons.push(`protect_parse_failed:${error?.code || error?.name || 'unknown'}`)
      result.protectedPaths.push(entry.entryPath)
    }
  }
  return result
}

export function resolveToolResultSpilloverRetentionPolicy(policy = null) {
  const source = policy && typeof policy === 'object' ? policy : {}
  return {
    maxFileCount: clampPositiveInt(source.maxFileCount, DEFAULT_TOOL_RESULT_SPILLOVER_RETENTION_POLICY.maxFileCount),
    maxAggregateBytes: clampPositiveInt(
      source.maxAggregateBytes,
      DEFAULT_TOOL_RESULT_SPILLOVER_RETENTION_POLICY.maxAggregateBytes,
    ),
    maxAgeMs: clampPositiveInt(source.maxAgeMs, DEFAULT_TOOL_RESULT_SPILLOVER_RETENTION_POLICY.maxAgeMs),
  }
}

export function resolveToolResultSpilloverRoot(userDataPath = '') {
  return path.join(resolveBaseUserDataPath(userDataPath), TOOL_RESULT_SPILLOVER_DIR_NAME)
}

export function pruneToolResultSpillover({
  userDataPath = '',
  rootPath = '',
  retentionPolicy = null,
  now = Date.now(),
  projectedAdditionalFiles = 0,
  projectedAdditionalBytes = 0,
  protectedPaths = [],
} = {}) {
  const safeRootPath = String(rootPath || resolveToolResultSpilloverRoot(userDataPath)).trim()
  const policy = resolveToolResultSpilloverRetentionPolicy(retentionPolicy)
  const protectedPathSet = new Set(
    (Array.isArray(protectedPaths) ? protectedPaths : [])
      .map((candidatePath) => String(candidatePath || '').trim())
      .filter(Boolean)
      .map((candidatePath) => path.resolve(candidatePath)),
  )
  const result = {
    rootPath: safeRootPath,
    applied: false,
    degraded: false,
    failureReasons: [],
    deletedFileCount: 0,
    deletedBytes: 0,
    retainedFileCount: 0,
    retainedBytes: 0,
    scannedFileCount: 0,
    cleanupState: 'none',
    retentionExceeded: false,
    retentionPolicy: policy,
  }
  if (!safeRootPath || !fs.existsSync(safeRootPath)) {
    return result
  }

  let entries = []
  try {
    entries = listToolResultSpilloverEntries(safeRootPath)
  } catch (error) {
    result.degraded = true
    result.cleanupState = 'failed'
    result.failureReasons.push(`scan_failed:${error?.code || error?.name || 'unknown'}`)
    return result
  }
  result.scannedFileCount = entries.length

  const safeDeleteEntry = (entry) => {
    if (!entry || typeof entry !== 'object') return false
    const targetPath = String(entry.entryPath || '').trim()
    if (!targetPath || !isPathWithinRoot(safeRootPath, targetPath)) {
      result.degraded = true
      result.failureReasons.push('scope_check_failed')
      return false
    }
    if (protectedPathSet.has(path.resolve(targetPath))) {
      return false
    }
    try {
      fs.unlinkSync(targetPath)
      result.applied = true
      result.deletedFileCount += 1
      result.deletedBytes += Math.max(0, Number(entry.size || 0) || 0)
      return true
    } catch (error) {
      result.degraded = true
      result.failureReasons.push(`delete_failed:${error?.code || error?.name || 'unknown'}`)
      return false
    }
  }

  const normalizedNow = Number.isFinite(Number(now)) ? Number(now) : Date.now()
  const expirationCutoff = normalizedNow - policy.maxAgeMs
  const expiredEntries = entries
    .filter((entry) => entry.mtimeMs > 0 && entry.mtimeMs < expirationCutoff)
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name))
  for (const entry of expiredEntries) {
    safeDeleteEntry(entry)
  }

  try {
    entries = listToolResultSpilloverEntries(safeRootPath)
  } catch (error) {
    result.degraded = true
    result.cleanupState = result.deletedFileCount > 0 ? 'pruned_with_failures' : 'failed'
    result.failureReasons.push(`rescan_failed:${error?.code || error?.name || 'unknown'}`)
    return result
  }

  let retainedBytes = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.size || 0) || 0), 0)
  let retainedCount = entries.length
  const projectedFiles = Math.max(0, clampPositiveInt(projectedAdditionalFiles, 0))
  const projectedBytes = Math.max(0, clampPositiveInt(projectedAdditionalBytes, 0))
  const overflowCandidates = [...entries].sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name))
  while (
    overflowCandidates.length > 0
    && (
      retainedCount + projectedFiles > policy.maxFileCount
      || retainedBytes + projectedBytes > policy.maxAggregateBytes
    )
  ) {
    const candidate = overflowCandidates.shift()
    if (!safeDeleteEntry(candidate)) continue
    retainedCount = Math.max(0, retainedCount - 1)
    retainedBytes = Math.max(0, retainedBytes - Math.max(0, Number(candidate?.size || 0) || 0))
  }

  result.retentionExceeded = (
    retainedCount + projectedFiles > policy.maxFileCount
    || retainedBytes + projectedBytes > policy.maxAggregateBytes
  )
  result.retainedFileCount = retainedCount
  result.retainedBytes = retainedBytes
  if (result.deletedFileCount > 0 && result.degraded) {
    result.cleanupState = 'pruned_with_failures'
  } else if (result.deletedFileCount > 0) {
    result.cleanupState = 'pruned'
  } else if (result.degraded) {
    result.cleanupState = 'failed'
  }
  rememberToolResultSpilloverState(safeRootPath, {
    sessionCleanupState: result.cleanupState,
    sessionCleanupAt: normalizedNow,
    sessionCleanupDeletedFileCount: result.deletedFileCount,
    sessionCleanupDeletedBytes: result.deletedBytes,
  })
  return result
}

export function summarizeToolResultSpillover({
  userDataPath = '',
  rootPath = '',
  retentionPolicy = null,
} = {}) {
  const safeRootPath = String(rootPath || resolveToolResultSpilloverRoot(userDataPath)).trim()
  const policy = resolveToolResultSpilloverRetentionPolicy(retentionPolicy)
  const cachedState = readToolResultSpilloverState(safeRootPath)
  const summary = {
    rootPath: safeRootPath,
    fileCount: 0,
    totalBytes: 0,
    retentionPolicy: policy,
    sessionCleanupRecorded: cachedState !== null,
    sessionCleanupState: String(cachedState?.sessionCleanupState || 'none').trim() || 'none',
    sessionCleanupAt: clampNonNegativeInt(cachedState?.sessionCleanupAt, 0),
    sessionCleanupDeletedFileCount: clampNonNegativeInt(cachedState?.sessionCleanupDeletedFileCount, 0),
    sessionCleanupDeletedBytes: clampNonNegativeInt(cachedState?.sessionCleanupDeletedBytes, 0),
    degraded: false,
    failureReasons: [],
  }
  if (!safeRootPath || !fs.existsSync(safeRootPath)) {
    return summary
  }
  try {
    const entries = listToolResultSpilloverEntries(safeRootPath)
    summary.fileCount = entries.length
    summary.totalBytes = entries.reduce((sum, entry) => sum + clampNonNegativeInt(entry?.size, 0), 0)
  } catch (error) {
    summary.degraded = true
    summary.failureReasons.push(`scan_failed:${error?.code || error?.name || 'unknown'}`)
  }
  return summary
}

export function cleanupToolResultSpillover({
  userDataPath = '',
  rootPath = '',
  retentionPolicy = null,
  now = Date.now(),
} = {}) {
  const cleanup = pruneToolResultSpillover({
    userDataPath,
    rootPath,
    retentionPolicy,
    now,
    projectedAdditionalFiles: 0,
    projectedAdditionalBytes: 0,
  })
  return {
    ok: true,
    deletedCount: clampNonNegativeInt(cleanup.deletedFileCount, 0),
    deletedBytes: clampNonNegativeInt(cleanup.deletedBytes, 0),
    cleanupState: String(cleanup.cleanupState || 'none').trim() || 'none',
    retentionExceeded: cleanup.retentionExceeded === true,
    summary: summarizeToolResultSpillover({
      userDataPath,
      rootPath: cleanup.rootPath,
      retentionPolicy,
    }),
  }
}

export function resetToolResultSpillover({
  userDataPath = '',
  rootPath = '',
  now = Date.now(),
} = {}) {
  const safeRootPath = String(rootPath || resolveToolResultSpilloverRoot(userDataPath)).trim()
  const result = {
    ok: true,
    deletedCount: 0,
    deletedBytes: 0,
    cleanupState: 'cleared',
    summary: null,
  }
  if (safeRootPath && fs.existsSync(safeRootPath)) {
    let entries = []
    try {
      entries = listToolResultSpilloverEntries(safeRootPath)
    } catch (error) {
      rememberToolResultSpilloverState(safeRootPath, {
        sessionCleanupState: 'failed',
        sessionCleanupAt: now,
        sessionCleanupDeletedFileCount: 0,
        sessionCleanupDeletedBytes: 0,
      })
      throw error
    }
    for (const entry of entries) {
      const targetPath = String(entry?.entryPath || '').trim()
      if (!targetPath || !isPathWithinRoot(safeRootPath, targetPath)) continue
      fs.unlinkSync(targetPath)
      result.deletedCount += 1
      result.deletedBytes += clampNonNegativeInt(entry?.size, 0)
    }
  }
  rememberToolResultSpilloverState(safeRootPath, {
    sessionCleanupState: result.cleanupState,
    sessionCleanupAt: now,
    sessionCleanupDeletedFileCount: result.deletedCount,
    sessionCleanupDeletedBytes: result.deletedBytes,
  })
  result.summary = summarizeToolResultSpillover({ userDataPath, rootPath: safeRootPath })
  return result
}

export function persistToolResultSpillover({
  providerId = '',
  model = '',
  toolName = '',
  resultText = '',
  originalChars = 0,
  userDataPath = '',
  threadId = '',
  turnId = '',
  retentionPolicy = null,
  now = Date.now(),
} = {}) {
  const output = String(resultText || '')
  if (!output) {
    return {
      persistedOutputPath: '',
      persistedOutputSha256: '',
      persistence: 'disabled',
      spilloverPersistenceState: 'empty_output',
      spilloverCleanupState: 'none',
      spilloverCleanupDeletedFileCount: 0,
      spilloverCleanupDeletedBytes: 0,
      spilloverRetentionExceeded: false,
      spilloverFailureReasons: [],
      spilloverDegraded: false,
      spilloverRetentionPolicy: resolveToolResultSpilloverRetentionPolicy(retentionPolicy),
    }
  }

  const resolvedRetentionPolicy = resolveToolResultSpilloverRetentionPolicy(retentionPolicy)
  try {
    const normalizedThreadId = normalizeContextId(threadId)
    const normalizedTurnId = normalizeContextId(turnId)
    const spilloverRoot = resolveToolResultSpilloverRoot(userDataPath)
    const sha256 = crypto.createHash('sha256').update(output, 'utf8').digest('hex')
    const createdAt = new Date().toISOString()
    const fileName = [
      createdAt.replace(/[:.]/g, '-'),
      normalizeFileSegment(providerId, 'provider'),
      normalizeFileSegment(toolName, 'tool'),
      sha256.slice(0, 12),
      crypto.randomBytes(4).toString('hex'),
    ].join('-')
    const targetPath = path.join(spilloverRoot, `${fileName}.json`)
    const spilloverRecord = {
      kind: 'tool_result_spillover',
      version: TOOL_RESULT_SPILLOVER_SCHEMA_VERSION,
      createdAt,
      providerId: String(providerId || '').trim().toLowerCase(),
      model: String(model || '').trim(),
      toolName: String(toolName || '').trim(),
      threadId: normalizedThreadId,
      turnId: normalizedTurnId,
      originalChars: Math.max(0, Number(originalChars || 0) || 0),
      outputChars: output.length,
      sha256,
      output,
    }
    const serializedRecord = JSON.stringify(spilloverRecord, null, 2)
    const protectedTurnPathsBeforeWrite = collectProtectedSpilloverPaths({
      rootPath: spilloverRoot,
      threadId: normalizedThreadId,
      turnId: normalizedTurnId,
    })
    const cleanupBeforeWrite = pruneToolResultSpillover({
      userDataPath,
      rootPath: spilloverRoot,
      retentionPolicy: resolvedRetentionPolicy,
      now,
      projectedAdditionalFiles: 1,
      projectedAdditionalBytes: Buffer.byteLength(serializedRecord, 'utf8'),
      protectedPaths: protectedTurnPathsBeforeWrite.protectedPaths,
    })
    atomicWriteFile(targetPath, serializedRecord)
    const protectedTurnPathsAfterWrite = collectProtectedSpilloverPaths({
      rootPath: spilloverRoot,
      threadId: normalizedThreadId,
      turnId: normalizedTurnId,
    })
    const cleanupAfterWrite = pruneToolResultSpillover({
      userDataPath,
      rootPath: spilloverRoot,
      retentionPolicy: resolvedRetentionPolicy,
      now,
      protectedPaths: [...protectedTurnPathsAfterWrite.protectedPaths, targetPath],
    })
    const persistedAfterCleanup = fs.existsSync(targetPath)
    const combinedFailureReasons = [
      ...(Array.isArray(protectedTurnPathsBeforeWrite.failureReasons) ? protectedTurnPathsBeforeWrite.failureReasons : []),
      ...(Array.isArray(cleanupBeforeWrite.failureReasons) ? cleanupBeforeWrite.failureReasons : []),
      ...(Array.isArray(protectedTurnPathsAfterWrite.failureReasons) ? protectedTurnPathsAfterWrite.failureReasons : []),
      ...(Array.isArray(cleanupAfterWrite.failureReasons) ? cleanupAfterWrite.failureReasons : []),
    ]
    const combinedDeletedFileCount = (
      Number(cleanupBeforeWrite.deletedFileCount || 0)
      + Number(cleanupAfterWrite.deletedFileCount || 0)
    ) || 0
    const combinedDeletedBytes = (
      Number(cleanupBeforeWrite.deletedBytes || 0)
      + Number(cleanupAfterWrite.deletedBytes || 0)
    ) || 0
    const cleanupDegraded = (
      protectedTurnPathsBeforeWrite.degraded === true
      || cleanupBeforeWrite.degraded === true
      || protectedTurnPathsAfterWrite.degraded === true
      || cleanupAfterWrite.degraded === true
    )
    const retentionExceeded = cleanupBeforeWrite.retentionExceeded === true || cleanupAfterWrite.retentionExceeded === true
    let spilloverCleanupState = 'none'
    if (retentionExceeded) {
      spilloverCleanupState = combinedDeletedFileCount > 0 ? 'pruned_retention_exceeded' : 'retention_exceeded'
    } else if (combinedDeletedFileCount > 0 && cleanupDegraded) {
      spilloverCleanupState = 'pruned_with_failures'
    } else if (combinedDeletedFileCount > 0) {
      spilloverCleanupState = 'pruned'
    } else if (cleanupDegraded) {
      spilloverCleanupState = 'failed'
    }
    if (!persistedAfterCleanup) {
      return {
        persistedOutputPath: '',
        persistedOutputSha256: '',
        persistence: 'disabled',
        spilloverPersistenceState: 'missing_after_cleanup',
        spilloverCleanupState,
        spilloverCleanupDeletedFileCount: combinedDeletedFileCount,
        spilloverCleanupDeletedBytes: combinedDeletedBytes,
        spilloverRetentionExceeded: retentionExceeded,
        spilloverFailureReasons: [
          ...combinedFailureReasons,
          'missing_after_cleanup',
        ],
        spilloverDegraded: true,
        spilloverRetentionPolicy: resolvedRetentionPolicy,
      }
    }
    return {
      persistedOutputPath: targetPath,
      persistedOutputSha256: sha256,
      persistence: 'enabled',
      spilloverPersistenceState: cleanupDegraded ? 'persisted_with_cleanup_degraded' : 'persisted',
      spilloverCleanupState,
      spilloverCleanupDeletedFileCount: combinedDeletedFileCount,
      spilloverCleanupDeletedBytes: combinedDeletedBytes,
      spilloverRetentionExceeded: retentionExceeded,
      spilloverFailureReasons: combinedFailureReasons,
      spilloverDegraded: cleanupDegraded,
      spilloverRetentionPolicy: resolvedRetentionPolicy,
    }
  } catch (error) {
    console.warn('[tool-result-spillover] failed to persist tool output:', error?.message || error)
    return {
      persistedOutputPath: '',
      persistedOutputSha256: '',
      persistence: 'disabled',
      spilloverPersistenceState: 'write_failed',
      spilloverCleanupState: 'none',
      spilloverCleanupDeletedFileCount: 0,
      spilloverCleanupDeletedBytes: 0,
      spilloverRetentionExceeded: false,
      spilloverFailureReasons: [`write_failed:${error?.code || error?.name || 'unknown'}`],
      spilloverDegraded: true,
      spilloverRetentionPolicy: resolvedRetentionPolicy,
    }
  }
}

export function readToolResultSpillover(spilloverPath = '') {
  const targetPath = String(spilloverPath || '').trim()
  if (!targetPath) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(targetPath, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    if (String(parsed.kind || '').trim() !== 'tool_result_spillover') return null
    if (typeof parsed.output !== 'string') return null
    return parsed
  } catch {
    return null
  }
}
