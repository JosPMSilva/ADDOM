import fs from 'node:fs/promises'
import path from 'path'
import { getLatestRevision, getRevision, recordWrite, getBaseRevisionId } from '../memory/artifact-store.mjs'
import { countLineDelta } from './diff-math.mjs'
import { buildPreviewableUnifiedDiff } from '../tools/apply-patch-core.mjs'

const MAX_PREVIEW_FILE_BYTES = 1_048_576

async function readFileIfSmall(absPath) {
  try {
    const stat = await fs.stat(absPath)
    if (stat.isDirectory() || stat.size > MAX_PREVIEW_FILE_BYTES) return null
    return await fs.readFile(absPath, 'utf8')
  } catch {
    return null
  }
}

function readKnownContent(value) {
  return typeof value === 'string' ? value : null
}

function buildArtifactBackedFileChange({
  filePath = '',
  artifactRecord = null,
  fallbackBeforeContent = null,
  fallbackAfterContent = null,
  changeType = '',
  source = '',
  renamedFrom = '',
  contentBytes = null,
} = {}) {
  const normalizedPath = String(filePath || '').trim()
  if (!normalizedPath) return null
  const newRevId = String(artifactRecord?.newRevId || artifactRecord?.id || '').trim()
  const prevRevId = String(artifactRecord?.prevRevId || artifactRecord?.prev_rev_id || '').trim()
  const previousRevision = prevRevId ? getRevision(prevRevId) : null
  const nextRevision = newRevId ? getRevision(newRevId) : null
  const previousContent = readKnownContent(previousRevision?.content) ?? readKnownContent(fallbackBeforeContent)
  const nextContent = readKnownContent(nextRevision?.content) ?? readKnownContent(fallbackAfterContent)
  const hasExactContent = previousContent !== null && nextContent !== null
  const lineDelta = hasExactContent ? countLineDelta(previousContent, nextContent) : null
  const exactContentBytes = nextContent === null ? null : Buffer.byteLength(nextContent, 'utf8')
  const normalizedContentBytes = Number.isFinite(Number(contentBytes))
    ? Math.max(0, Number(contentBytes) || 0)
    : (exactContentBytes ?? 0)

  return {
    filePath: normalizedPath,
    renamedFrom: String(renamedFrom || '').trim(),
    newRevId,
    prevRevId,
    rev: Number(artifactRecord?.rev || 0) || 0,
    contentBytes: normalizedContentBytes,
    ...(lineDelta
      ? {
          addedLines: Number(lineDelta.addedLines || 0) || 0,
          removedLines: Number(lineDelta.removedLines || 0) || 0,
        }
      : {}),
    ...(hasExactContent
      ? {
          diffText: buildPreviewableUnifiedDiff({
            previousContent,
            nextContent,
          }),
        }
      : {}),
    changeType,
    source,
    ...(artifactRecord?.conflict
      ? {
          conflict: true,
          conflictBaseRevId: artifactRecord.conflictBaseRevId,
          conflictActualRevId: artifactRecord.conflictActualRevId,
        }
      : {}),
  }
}

export async function resolveToolWriteArtifactMeta({
  tc = {},
  projectFolder = '',
  toolInput = {},
  execResult = {},
  applyPreviewContent = '',
  sendArtifactsUpdated = () => {},
  expectedBaseRevId = '',
  threadId = '',
  turnId = '',
} = {}) {
  const toolName = String(tc?.name || '')

  if ((toolName === 'write_file' || toolName === 'edit_file') && projectFolder && toolInput?.path) {
    try {
      const newContent = toolName === 'edit_file'
        ? await fs.readFile(path.resolve(projectFolder, toolInput.path), 'utf8')
        : (toolInput.content ?? '')
      const artifactRecord = recordWrite({
        project: projectFolder,
        filePath: toolInput.path,
        newContent,
        prevContent: execResult.prevContent,
        source: 'ai_write',
        expectedBaseRevId,
        threadId,
        turnId,
      })
      const lineDelta = countLineDelta(execResult.prevContent ?? '', newContent)
      sendArtifactsUpdated(toolInput.path)
      return {
        filePath: String(toolInput.path ?? '').trim(),
        newRevId: artifactRecord?.newRevId ?? '',
        prevRevId: artifactRecord?.prevRevId ?? '',
        rev: Number(artifactRecord?.rev || 0),
        contentBytes: Buffer.byteLength(String(newContent), 'utf8'),
        addedLines: Number(lineDelta?.addedLines || 0),
        removedLines: Number(lineDelta?.removedLines || 0),
        changeType: toolName === 'edit_file' ? 'edited' : String(artifactRecord?.prevRevId ? 'modified' : 'created'),
        source: 'ai_write',
        ...(artifactRecord?.conflict ? { conflict: true, conflictBaseRevId: artifactRecord.conflictBaseRevId, conflictActualRevId: artifactRecord.conflictActualRevId } : {}),
      }
    } catch {
      return null
    }
  }

  if (toolName === 'apply_patch' && projectFolder && execResult?.applyPatchMeta && typeof execResult.applyPatchMeta === 'object') {
    try {
      const patchMeta = execResult.applyPatchMeta
      const originalPath = String(patchMeta.path || '').trim()
      const targetPath = String(patchMeta.newPath || patchMeta.path || '').trim()
      const changeType = String(patchMeta.type || '').trim().toLowerCase()
      const newContent = changeType === 'delete_file'
        ? ''
        : (Object.prototype.hasOwnProperty.call(patchMeta, 'newContent')
            ? String(patchMeta.newContent ?? '')
            : String(applyPreviewContent ?? ''))
      // For apply_patch, the target path may differ from the pre-captured
      // expectedBaseRevId (which was based on toolInput.path). Re-resolve
      // the base revision for the actual target path to avoid false
      // positive / false negative conflict detection.
      let patchExpectedBaseRevId = expectedBaseRevId
      if (targetPath && typeof getBaseRevisionId === 'function') {
        try {
          const resolvedBase = getBaseRevisionId(projectFolder, targetPath)
          if (resolvedBase) patchExpectedBaseRevId = resolvedBase
        } catch { /* non-fatal */ }
      }
      const artifactRecord = recordWrite({
        project: projectFolder,
        filePath: targetPath,
        newContent,
        prevContent: execResult.prevContent,
        source: 'ai_write',
        expectedBaseRevId: patchExpectedBaseRevId,
        threadId,
        turnId,
        ...(changeType === 'delete_file' ? { note: 'Deleted via apply_patch' } : {}),
      })
      const lineDelta = countLineDelta(execResult.prevContent ?? '', newContent)
      if (targetPath) sendArtifactsUpdated(targetPath)
      if (changeType === 'move_file' && originalPath && originalPath !== targetPath) {
        sendArtifactsUpdated(originalPath)
      }
      return {
        filePath: targetPath,
        newRevId: artifactRecord?.newRevId ?? '',
        prevRevId: artifactRecord?.prevRevId ?? '',
        rev: Number(artifactRecord?.rev || 0),
        contentBytes: Buffer.byteLength(String(newContent), 'utf8'),
        addedLines: Number(lineDelta?.addedLines || 0),
        removedLines: Number(lineDelta?.removedLines || 0),
        diffText: buildPreviewableUnifiedDiff({
          diffText: String(patchMeta.diffText || ''),
          previousContent: execResult.prevContent,
          nextContent: newContent,
        }),
        changeType: changeType === 'create_file'
          ? 'created'
          : changeType === 'delete_file'
            ? 'deleted'
            : changeType === 'move_file'
              ? 'moved'
              : String(artifactRecord?.prevRevId ? 'modified' : 'created'),
        source: 'ai_write',
        ...(artifactRecord?.conflict ? { conflict: true, conflictBaseRevId: artifactRecord.conflictBaseRevId, conflictActualRevId: artifactRecord.conflictActualRevId } : {}),
      }
    } catch {
      return null
    }
  }

  if (toolName === 'delete_file' && projectFolder && toolInput?.path) {
    try {
      const artifactRecord = recordWrite({
        project: projectFolder,
        filePath: toolInput.path,
        newContent: '',
        prevContent: execResult.prevContent,
        source: 'ai_write',
        note: 'Deleted via delete_file',
        expectedBaseRevId,
        threadId,
        turnId,
      })
      const lineDelta = countLineDelta(execResult.prevContent ?? '', '')
      sendArtifactsUpdated(toolInput.path)
      return {
        filePath: String(toolInput.path ?? '').trim(),
        newRevId: artifactRecord?.newRevId ?? '',
        prevRevId: artifactRecord?.prevRevId ?? '',
        rev: Number(artifactRecord?.rev || 0),
        contentBytes: 0,
        addedLines: Number(lineDelta?.addedLines || 0),
        removedLines: Number(lineDelta?.removedLines || 0),
        changeType: 'deleted',
        source: 'ai_write',
        ...(artifactRecord?.conflict ? { conflict: true, conflictBaseRevId: artifactRecord.conflictBaseRevId, conflictActualRevId: artifactRecord.conflictActualRevId } : {}),
      }
    } catch {
      return null
    }
  }

  if (toolName === 'rename_file' && projectFolder && toolInput?.old_path && toolInput?.new_path) {
    try {
      const oldPath = String(toolInput.old_path || '').trim()
      const newPath = String(toolInput.new_path || '').trim()
      const renamedAbs = path.resolve(projectFolder, newPath)
      const renamedStat = await fs.stat(renamedAbs)
      let previousContent = readKnownContent(execResult.prevContent)
      if (previousContent === null) {
        previousContent = readKnownContent(getLatestRevision(projectFolder, oldPath)?.content)
      }
      let newContent = null
      try {
        const maybe = await readFileIfSmall(renamedAbs)
        if (typeof maybe === 'string') newContent = maybe
      } catch {
        // Non-fatal.
      }
      if (newContent === null && previousContent !== null) {
        newContent = previousContent
      }
      if (newContent === null) {
        sendArtifactsUpdated(oldPath)
        sendArtifactsUpdated(newPath)
        return {
          filePath: newPath,
          renamedFrom: oldPath,
          contentBytes: Number(renamedStat.size || 0) || 0,
          changeType: 'renamed',
          source: 'ai_write',
        }
      }
      const createdRecord = recordWrite({
        project: projectFolder,
        filePath: newPath,
        newContent,
        prevContent: previousContent,
        source: 'ai_write',
        note: `Renamed from ${oldPath}`,
        threadId,
        turnId,
      })
      if (previousContent !== null) {
        recordWrite({
          project: projectFolder,
          filePath: oldPath,
          newContent: '',
          prevContent: previousContent,
          source: 'ai_write',
          expectedBaseRevId,
          note: `Renamed to ${newPath}`,
          threadId,
          turnId,
        })
      }
      sendArtifactsUpdated(oldPath)
      sendArtifactsUpdated(newPath)
      return buildArtifactBackedFileChange({
        filePath: newPath,
        artifactRecord: createdRecord,
        fallbackBeforeContent: previousContent,
        fallbackAfterContent: newContent,
        changeType: 'renamed',
        source: 'ai_write',
        renamedFrom: oldPath,
        contentBytes: Number(renamedStat.size || 0) || 0,
      })
    } catch {
      return null
    }
  }

  if (toolName === 'rollback_file' && projectFolder && toolInput?.path && execResult?.prevContent !== undefined) {
    try {
      const filePath = String(toolInput.path ?? '').trim()
      const latestRevision = getLatestRevision(projectFolder, filePath)
      const absPath = path.resolve(projectFolder, filePath)
      const fileStat = await fs.stat(absPath)
      let nextContent = readKnownContent(latestRevision?.content)
      if (nextContent === null) {
        nextContent = await fs.readFile(absPath, 'utf8')
      }
      sendArtifactsUpdated(filePath)
      return buildArtifactBackedFileChange({
        filePath,
        artifactRecord: latestRevision,
        fallbackBeforeContent: readKnownContent(execResult.prevContent),
        fallbackAfterContent: nextContent,
        changeType: 'rolled_back',
        source: 'rollback',
        contentBytes: Number(fileStat.size || 0) || 0,
      })
    } catch {
      return null
    }
  }

  if (toolName === 'apply_artifact_revision' && execResult?.artifactApply) {
    const applyMeta = execResult.artifactApply
    const lineDelta = countLineDelta(execResult.prevContent ?? '', applyPreviewContent ?? '')
    const writeArtifactMeta = {
      filePath: String(applyMeta.filePath || '').trim(),
      newRevId: String(applyMeta.newRevId || ''),
      prevRevId: String(applyMeta.prevRevId || ''),
      rev: Number(applyMeta.newRev || 0) || 0,
      contentBytes: Number(applyMeta.contentBytes || 0) || 0,
      addedLines: Number(lineDelta?.addedLines || 0),
      removedLines: Number(lineDelta?.removedLines || 0),
      changeType: String(applyMeta.changeType || 'applied').trim().toLowerCase() || 'applied',
      renamedFrom: String(applyMeta.renamedFrom || '').trim(),
      source: 'apply_artifact_revision',
    }
    if (writeArtifactMeta.filePath) {
      sendArtifactsUpdated(writeArtifactMeta.filePath)
    }
    for (const extraPath of Array.isArray(applyMeta.auxiliaryPaths) ? applyMeta.auxiliaryPaths : []) {
      const normalized = String(extraPath || '').trim()
      if (normalized) sendArtifactsUpdated(normalized)
    }
    return writeArtifactMeta
  }

  return null
}
