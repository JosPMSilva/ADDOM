import { promises as fs } from 'node:fs'
import path from 'node:path'

import { getRevision, recordWrite } from '../memory/artifact-store.mjs'
import { MAX_WRITE_FILE_BYTES } from './file-tools.mjs'
import { safePath, sameProjectRoot } from './path-guards.mjs'
import { parseStagedArtifactNote } from './staged-artifact-note.mjs'

async function statIfExists(absPath = '') {
  try {
    return await fs.stat(absPath)
  } catch (error) {
    const code = String(error?.code || '')
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw error
  }
}

async function readTextIfSmall(absPath = '', displayPath = '') {
  const stat = await statIfExists(absPath)
  if (!stat) return { stat: null, content: null }
  if (stat.isDirectory()) {
    throw new Error(`"${displayPath || absPath}" is a directory, not a file.`)
  }
  return {
    stat,
    content: stat.size <= 1_048_576 ? await fs.readFile(absPath, 'utf8') : null,
  }
}

export async function applyArtifactRevision(projectRoot, { revision_id, reason = '' } = {}) {
  const revisionId = String(revision_id ?? '').trim()
  if (!revisionId) {
    throw new Error('Missing required field: revision_id')
  }

  const revision = getRevision(revisionId)
  if (!revision) {
    throw new Error(`Artifact revision not found: ${revisionId}`)
  }

  const revisionProject = String(revision.project || '')
  if (!sameProjectRoot(projectRoot, revisionProject)) {
    throw new Error('Artifact revision does not belong to the active project root.')
  }

  const revisionFilePath = String(revision.file_path || '').trim()
  if (!revisionFilePath) {
    throw new Error(`Artifact revision "${revisionId}" has no file path.`)
  }

  const stagedMeta = parseStagedArtifactNote(revision.note)
  const operationType = String(stagedMeta?.operationType || '').trim().toLowerCase()
  const targetPath = String(stagedMeta?.targetPath || revisionFilePath).trim() || revisionFilePath
  const sourcePath = String(stagedMeta?.originalPath || revisionFilePath).trim() || revisionFilePath
  const targetAbs = safePath(projectRoot, targetPath)
  const sourceAbs = safePath(projectRoot, sourcePath)

  const nextContent = String(revision.content ?? '')
  const bytes = Buffer.byteLength(nextContent, 'utf8')
  if (bytes > MAX_WRITE_FILE_BYTES) {
    throw new Error(`Refusing oversized artifact apply payload (> ${Math.round(MAX_WRITE_FILE_BYTES / 1024)} KB): ${targetPath}`)
  }

  const noteReason = String(reason ?? '').trim()

  if (operationType === 'delete_file') {
    const { stat, content: prevContent } = await readTextIfSmall(targetAbs, targetPath)
    if (stat) {
      await fs.unlink(targetAbs)
    }
    const record = recordWrite({
      project: projectRoot,
      filePath: targetPath,
      newContent: '',
      prevContent,
      source: 'ai_write',
      note: noteReason
        ? `Applied staged delete ${revisionId}: ${noteReason.slice(0, 200)}`
        : `Applied staged delete ${revisionId}.`,
    })
    return {
      message: `Artifact revision applied to disk: deleted ${targetPath}`,
      prevContent,
      filePath: targetPath,
      appliedRevisionId: revisionId,
      appliedFromRev: Number(revision.rev || 0) || 0,
      newRevId: String(record?.newRevId || ''),
      prevRevId: String(record?.prevRevId || ''),
      newRev: Number(record?.rev || 0) || 0,
      contentBytes: 0,
      changeType: 'deleted',
      renamedFrom: '',
      auxiliaryPaths: [],
    }
  }

  if (operationType === 'move_file' && sourcePath !== targetPath) {
    const { content: prevSourceContent } = await readTextIfSmall(sourceAbs, sourcePath)
    const { content: prevTargetContent } = await readTextIfSmall(targetAbs, targetPath)
    await fs.mkdir(path.dirname(targetAbs), { recursive: true })
    await fs.writeFile(targetAbs, nextContent, 'utf8')
    const sourceStat = await statIfExists(sourceAbs)
    if (sourceStat && !sourceStat.isDirectory()) {
      await fs.unlink(sourceAbs)
    }
    const createdRecord = recordWrite({
      project: projectRoot,
      filePath: targetPath,
      newContent: nextContent,
      prevContent: prevTargetContent ?? prevSourceContent,
      source: 'ai_write',
      note: noteReason
        ? `Applied staged move ${revisionId}: ${noteReason.slice(0, 200)}`
        : `Applied staged move ${revisionId}.`,
    })
    recordWrite({
      project: projectRoot,
      filePath: sourcePath,
      newContent: '',
      prevContent: prevSourceContent,
      source: 'ai_write',
      note: `Moved to ${targetPath} via staged revision ${revisionId}.`,
    })
    return {
      message: `Artifact revision applied to disk: moved ${sourcePath} -> ${targetPath}`,
      prevContent: prevSourceContent,
      filePath: targetPath,
      appliedRevisionId: revisionId,
      appliedFromRev: Number(revision.rev || 0) || 0,
      newRevId: String(createdRecord?.newRevId || ''),
      prevRevId: String(createdRecord?.prevRevId || ''),
      newRev: Number(createdRecord?.rev || 0) || 0,
      contentBytes: bytes,
      changeType: 'renamed',
      renamedFrom: sourcePath,
      auxiliaryPaths: [sourcePath],
    }
  }

  const { content: prevContent } = await readTextIfSmall(targetAbs, targetPath)
  await fs.mkdir(path.dirname(targetAbs), { recursive: true })
  await fs.writeFile(targetAbs, nextContent, 'utf8')

  const record = recordWrite({
    project: projectRoot,
    filePath: targetPath,
    newContent: nextContent,
    prevContent,
    source: 'ai_write',
    note: noteReason
      ? `Applied staged revision ${revisionId}: ${noteReason.slice(0, 200)}`
      : `Applied staged revision ${revisionId}.`,
  })

  return {
    message: `Artifact revision applied to disk: ${targetPath}`,
    prevContent,
    filePath: targetPath,
    appliedRevisionId: revisionId,
    appliedFromRev: Number(revision.rev || 0) || 0,
    newRevId: String(record?.newRevId || ''),
    prevRevId: String(record?.prevRevId || ''),
    newRev: Number(record?.rev || 0) || 0,
    contentBytes: bytes,
    changeType: operationType === 'create_file'
      ? 'created'
      : operationType === 'update_file' || operationType === 'write_file'
        ? 'modified'
        : 'applied',
    renamedFrom: '',
    auxiliaryPaths: [],
  }
}
