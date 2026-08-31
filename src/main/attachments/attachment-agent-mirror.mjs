import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getUserDataPath } from '../platform/electron-app.mjs'
import { getDb } from '../memory/db.mjs'
import { listCachedAttachmentsForThread } from './attachment-cache-records.mjs'

function normalizeId(value = '') {
  return String(value || '').trim()
}

function safePathSegment(value = '', fallback = 'unknown') {
  const cleaned = normalizeId(value)
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120)
  return cleaned || fallback
}

function sanitizeFileName(value = '') {
  const base = path.basename(normalizeId(value) || 'attachment')
  const cleaned = Array.from(base, (char) => {
    const code = char.charCodeAt(0)
    return code <= 0x1f || /[<>:"/\\|?*]/.test(char) ? '_' : char
  }).join('').replace(/^\.+/, '').trim()
  return (cleaned || 'attachment').slice(0, 120)
}

function isPathInside(rootPath = '', candidatePath = '') {
  const root = path.resolve(rootPath)
  const candidate = path.resolve(candidatePath)
  const comparableRoot = process.platform === 'win32' ? root.toLowerCase() : root
  const comparableCandidate = process.platform === 'win32' ? candidate.toLowerCase() : candidate
  return comparableCandidate === comparableRoot
    || comparableCandidate.startsWith(`${comparableRoot}${path.sep}`)
}

async function fileDigest(absolutePath = '') {
  try {
    const bytes = await fs.promises.readFile(absolutePath)
    return {
      ok: true,
      sizeBytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    }
  } catch {
    return { ok: false, sizeBytes: 0, sha256: '' }
  }
}

async function copyCanonicalFile(sourcePath = '', targetPath = '') {
  const targetDir = path.dirname(targetPath)
  const temporaryPath = path.join(
    targetDir,
    `.${path.basename(targetPath)}.${crypto.randomUUID()}.tmp`,
  )
  await fs.promises.copyFile(sourcePath, temporaryPath)
  try {
    await fs.promises.rm(targetPath, { force: true })
    await fs.promises.rename(temporaryPath, targetPath)
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

async function removeUnexpectedMirrorEntries(rootPath = '', expectedPaths = new Set()) {
  let entries = []
  try {
    entries = await fs.promises.readdir(rootPath, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const absolutePath = path.join(rootPath, entry.name)
    if (!isPathInside(rootPath, absolutePath)) continue
    if (entry.isFile() && expectedPaths.has(path.resolve(absolutePath))) continue
    await fs.promises.rm(absolutePath, { recursive: true, force: true })
  }
}

export function getAttachmentAgentMirrorRoot() {
  return path.resolve(path.join(getUserDataPath(), 'attachment-agent-mirrors'))
}

function resolveThreadFilesRoot(projectId = '', threadId = '') {
  return path.resolve(path.join(
    getAttachmentAgentMirrorRoot(),
    'projects',
    safePathSegment(projectId, 'project'),
    'threads',
    safePathSegment(threadId, 'thread'),
    'files',
  ))
}

function buildMirrorPath(rootPath = '', attachment = {}) {
  const fileName = `${safePathSegment(attachment.attachmentId, 'attachment')}_${sanitizeFileName(attachment.fileName)}`
  const absolutePath = path.resolve(path.join(rootPath, fileName))
  return isPathInside(rootPath, absolutePath) ? absolutePath : ''
}

export async function prepareThreadAttachmentAgentMirror({ projectId = '', threadId = '' } = {}) {
  const pid = normalizeId(projectId)
  const tid = normalizeId(threadId)
  if (!pid || !tid) {
    return { ok: false, rootPath: '', attachments: [], errors: [{ error: 'project_or_thread_missing' }] }
  }
  const rootPath = resolveThreadFilesRoot(pid, tid)
  try {
    await fs.promises.mkdir(rootPath, { recursive: true })
  } catch {
    return { ok: false, rootPath: '', attachments: [], errors: [{ error: 'attachment_mirror_prepare_failed' }] }
  }

  const listed = await listCachedAttachmentsForThread({ projectId: pid, threadId: tid })
  if (!listed.ok) {
    return { ok: false, rootPath, attachments: [], errors: listed.errors || [] }
  }
  const attachments = []
  const errors = [...(listed.errors || [])]
  const expectedPaths = new Set()
  for (const attachment of listed.attachments) {
    const targetPath = buildMirrorPath(rootPath, attachment)
    if (!targetPath) {
      errors.push({
        attachmentId: normalizeId(attachment.attachmentId),
        fileName: String(attachment.fileName || ''),
        error: 'attachment_mirror_path_invalid',
      })
      continue
    }
    const canonicalDigest = await fileDigest(attachment.absolutePath)
    if (
      !canonicalDigest.ok
      || canonicalDigest.sizeBytes !== Number(attachment.sizeBytes || 0)
      || canonicalDigest.sha256 !== String(attachment.sha256 || '')
    ) {
      errors.push({
        attachmentId: normalizeId(attachment.attachmentId),
        fileName: String(attachment.fileName || ''),
        error: canonicalDigest.ok ? 'attachment_integrity_mismatch' : 'attachment_missing',
      })
      continue
    }
    expectedPaths.add(path.resolve(targetPath))
    const mirrorDigest = await fileDigest(targetPath)
    if (
      !mirrorDigest.ok
      || mirrorDigest.sizeBytes !== canonicalDigest.sizeBytes
      || mirrorDigest.sha256 !== canonicalDigest.sha256
    ) {
      try {
        await copyCanonicalFile(attachment.absolutePath, targetPath)
      } catch {
        expectedPaths.delete(path.resolve(targetPath))
        errors.push({
          attachmentId: normalizeId(attachment.attachmentId),
          fileName: String(attachment.fileName || ''),
          error: 'attachment_mirror_copy_failed',
        })
        continue
      }
    }
    attachments.push({
      attachmentId: normalizeId(attachment.attachmentId),
      fileName: String(attachment.fileName || ''),
      mediaType: String(attachment.mediaType || 'application/octet-stream'),
      sizeBytes: canonicalDigest.sizeBytes,
      sha256: canonicalDigest.sha256,
      absolutePath: targetPath,
    })
  }
  try {
    await removeUnexpectedMirrorEntries(rootPath, expectedPaths)
  } catch {
    return { ok: false, rootPath, attachments: [], errors: [{ error: 'attachment_mirror_prepare_failed' }] }
  }
  return { ok: true, rootPath, attachments, errors }
}

async function removeDirectoryIfPresent(absolutePath = '') {
  try {
    const stat = await fs.promises.lstat(absolutePath)
    if (!stat.isDirectory() && !stat.isSymbolicLink()) return 0
    await fs.promises.rm(absolutePath, { recursive: true, force: true })
    return 1
  } catch (error) {
    if (error?.code === 'ENOENT') return 0
    throw error
  }
}

export async function clearThreadAttachmentAgentMirror(threadId = '') {
  const tid = normalizeId(threadId)
  if (!tid) return { ok: false, deletedDirs: 0, errorCount: 1 }
  const projectsRoot = path.join(getAttachmentAgentMirrorRoot(), 'projects')
  let projectEntries = []
  try {
    projectEntries = await fs.promises.readdir(projectsRoot, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: true, deletedDirs: 0, errorCount: 0 }
    return { ok: false, deletedDirs: 0, errorCount: 1 }
  }
  let deletedDirs = 0
  let errorCount = 0
  for (const projectEntry of projectEntries) {
    if (!projectEntry.isDirectory()) continue
    const threadDir = path.join(projectsRoot, projectEntry.name, 'threads', safePathSegment(tid, 'thread'))
    try {
      deletedDirs += await removeDirectoryIfPresent(threadDir)
    } catch {
      errorCount += 1
    }
  }
  return { ok: errorCount === 0, deletedDirs, errorCount }
}

export async function clearProjectAttachmentAgentMirrors(projectId = '') {
  const pid = normalizeId(projectId)
  if (!pid) return { ok: false, deletedDirs: 0, errorCount: 1 }
  const projectDir = path.join(
    getAttachmentAgentMirrorRoot(),
    'projects',
    safePathSegment(pid, 'project'),
  )
  try {
    const deletedDirs = await removeDirectoryIfPresent(projectDir)
    return { ok: true, deletedDirs, errorCount: 0 }
  } catch {
    return { ok: false, deletedDirs: 0, errorCount: 1 }
  }
}

export async function clearAllAttachmentAgentMirrors() {
  try {
    const deletedDirs = await removeDirectoryIfPresent(getAttachmentAgentMirrorRoot())
    return { ok: true, deletedDirs, errorCount: 0 }
  } catch {
    return { ok: false, deletedDirs: 0, errorCount: 1 }
  }
}

export async function cleanupAttachmentAgentMirrorOrphans() {
  const root = getAttachmentAgentMirrorRoot()
  const projectsRoot = path.join(root, 'projects')
  let projectEntries = []
  try {
    projectEntries = await fs.promises.readdir(projectsRoot, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: true, scannedDirs: 0, deletedDirs: 0, errorCount: 0 }
    return { ok: false, scannedDirs: 0, deletedDirs: 0, errorCount: 1 }
  }
  const db = getDb()
  const liveProjects = new Set(
    db.prepare('SELECT id FROM workspace_projects').all()
      .map((row) => safePathSegment(row?.id || '', 'project')),
  )
  const liveThreadsByProject = new Map()
  for (const row of db.prepare('SELECT id, project_id FROM chat_threads').all()) {
    const projectKey = safePathSegment(row?.project_id || '', 'project')
    const threadKey = safePathSegment(row?.id || '', 'thread')
    if (!liveThreadsByProject.has(projectKey)) liveThreadsByProject.set(projectKey, new Set())
    liveThreadsByProject.get(projectKey).add(threadKey)
  }
  let scannedDirs = 0
  let deletedDirs = 0
  let errorCount = 0
  for (const projectEntry of projectEntries) {
    if (!projectEntry.isDirectory()) continue
    scannedDirs += 1
    const projectDir = path.join(projectsRoot, projectEntry.name)
    if (!liveProjects.has(projectEntry.name)) {
      try {
        deletedDirs += await removeDirectoryIfPresent(projectDir)
      } catch {
        errorCount += 1
      }
      continue
    }
    const threadsRoot = path.join(projectDir, 'threads')
    let threadEntries = []
    try {
      threadEntries = await fs.promises.readdir(threadsRoot, { withFileTypes: true })
    } catch (error) {
      if (error?.code !== 'ENOENT') errorCount += 1
      continue
    }
    const liveThreads = liveThreadsByProject.get(projectEntry.name) || new Set()
    for (const threadEntry of threadEntries) {
      if (!threadEntry.isDirectory()) continue
      scannedDirs += 1
      if (liveThreads.has(threadEntry.name)) continue
      try {
        deletedDirs += await removeDirectoryIfPresent(path.join(threadsRoot, threadEntry.name))
      } catch {
        errorCount += 1
      }
    }
  }
  return { ok: errorCount === 0, scannedDirs, deletedDirs, errorCount }
}
