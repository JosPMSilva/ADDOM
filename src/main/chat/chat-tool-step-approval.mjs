import fs from 'node:fs/promises'
import path from 'path'
import { getRevision } from '../memory/artifact-store.mjs'
import { resolveApplyPatchPreview } from '../tools/apply-patch-core.mjs'

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

function isSameProjectPath(leftProject = '', rightProject = '') {
  const left = String(leftProject || '').trim()
  const right = String(rightProject || '').trim()
  if (!left || !right) return false
  const normalizedLeft = path.resolve(left)
  const normalizedRight = path.resolve(right)
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight
}

export async function prepareToolApprovalInput({
  tc = {},
  toolInput = {},
  projectFolder = '',
  fileSystemHostFullAccess = false,
} = {}) {
  let previewPrevContent = null
  let approvalToolInput = toolInput
  let applyPreviewContent = ''

  const toolName = String(tc?.name || '')
  const previewPath = toolName === 'rename_file'
    ? String(toolInput?.old_path || '').trim()
    : String(toolInput?.path || '').trim()

  if (
    (toolName === 'write_file' || toolName === 'edit_file' || toolName === 'delete_file' || toolName === 'rename_file')
    && projectFolder
    && previewPath
  ) {
    try {
      const absPath = path.resolve(projectFolder, previewPath)
      previewPrevContent = await readFileIfSmall(absPath)
    } catch {
      // Non-fatal.
    }
  } else if (toolName === 'apply_artifact_revision' && projectFolder && toolInput?.revision_id) {
    try {
      const revisionId = String(toolInput.revision_id || '').trim()
      const revision = revisionId ? getRevision(revisionId) : null
      if (revision && isSameProjectPath(revision.project, projectFolder)) {
        const filePath = String(revision.file_path || '').trim()
        if (filePath) {
          const absPath = path.resolve(projectFolder, filePath)
          const rel = path.relative(projectFolder, absPath)
          if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
            previewPrevContent = await readFileIfSmall(absPath)
            applyPreviewContent = String(revision.content ?? '')
            approvalToolInput = {
              revision_id: revisionId,
              reason: String(toolInput.reason ?? '').trim(),
              path: filePath,
              content: applyPreviewContent,
            }
          }
        }
      }
    } catch {
      // Non-fatal.
    }
  } else if (
    toolName === 'apply_patch'
    && projectFolder
    && typeof toolInput?.patch === 'string'
    && toolInput.patch.trim()
  ) {
    try {
      const preview = resolveApplyPatchPreview({
        projectRoot: projectFolder,
        toolInput,
        fileSystemHostFullAccess,
      })
      previewPrevContent = preview.previousContent
      applyPreviewContent = preview.nextContent
      approvalToolInput = {
        path: preview.targetRelativePath || preview.relativePath,
        patch: toolInput.patch,
        content: preview.nextContent,
      }
    } catch {
      // Non-fatal.
    }
  }

  return {
    previewPrevContent,
    approvalToolInput,
    applyPreviewContent,
  }
}
