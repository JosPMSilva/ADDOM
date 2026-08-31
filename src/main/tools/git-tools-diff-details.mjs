import {
  GIT_FILE_DIFF_CONTEXT_LINES,
  runGitInCwd,
} from './git-tools-runtime.mjs'
import {
  buildUntrackedFileDiffText,
  readGitBlobContent,
  readStageEntriesForRepoPath,
  readSubmoduleStatusSummary,
  readUnmergedStageEntriesForRepoPath,
  readWorktreeFileContent,
  statWorktreeFile,
} from './git-tools-status.mjs'

export function buildDiffResponseBase(repoInfo, scope, fileStatus = null) {
  return {
    ok: true,
    scope,
    insideWorkTree: true,
    repoRoot: repoInfo.repoRoot,
    relativePath: repoInfo.relativePath,
    projectRelativePath: repoInfo.projectRelativePath,
    absolutePath: repoInfo.absolutePath,
    fileStatus,
    dirtyBufferBlocked: false,
    editorRenderable: true,
    editorBlockedReason: '',
    contentSource: scope === 'staged' ? 'worktree' : 'worktree',
    previewContent: '',
    previewNotice: '',
    previewReadOnly: false,
    detailKind: '',
    detail: null,
  }
}

export function buildNoDiffResult(repoInfo, scope, fileStatus = null) {
  return {
    ...buildDiffResponseBase(repoInfo, scope, fileStatus),
    status: 'no_diff',
    hasDiff: false,
    unsupportedReason: '',
    hunks: [],
    hunkCount: 0,
    addedLineCount: 0,
    deletedLineCount: 0,
    rawDiff: '',
  }
}

export function buildUnsupportedDiffResult(repoInfo, scope, fileStatus = null, unsupportedReason = 'unsupported_diff_type', rawDiff = '') {
  return {
    ...buildDiffResponseBase(repoInfo, scope, fileStatus),
    status: 'unsupported',
    hasDiff: false,
    editorRenderable: false,
    editorBlockedReason: unsupportedReason,
    unsupportedReason,
    hunks: [],
    hunkCount: 0,
    addedLineCount: 0,
    deletedLineCount: 0,
    rawDiff: String(rawDiff || ''),
  }
}

export function buildEditorBlockedReason(_scope, fileStatus = null) {
  if (!fileStatus) return ''
  if (fileStatus.inlineUnsupportedReason) return fileStatus.inlineUnsupportedReason
  return ''
}

export function buildFileMutationUnavailable(error = 'git_file_action_unavailable', message = '') {
  return {
    ok: false,
    error,
    message: String(message || error),
  }
}

function buildDetailResult(repoInfo, scope, fileStatus = null, detailKind = 'unsupported_state', detail = {}) {
  return {
    ...buildDiffResponseBase(repoInfo, scope, fileStatus),
    status: 'detail',
    hasDiff: false,
    editorRenderable: false,
    editorBlockedReason: detailKind,
    unsupportedReason: '',
    hunks: [],
    hunkCount: 0,
    addedLineCount: 0,
    deletedLineCount: 0,
    rawDiff: '',
    detailKind,
    detail,
  }
}

export async function resolvePreviewContent(repoRoot, source = 'none', repoRelativePath = '', absolutePath = '') {
  if (source === 'index') {
    const result = await readGitBlobContent(repoRoot, `:${repoRelativePath}`)
    if (result.ok) return { contentSource: 'index', previewContent: result.content }
  }
  if (source === 'head') {
    const result = await readGitBlobContent(repoRoot, `HEAD:${repoRelativePath}`)
    if (result.ok) return { contentSource: 'head', previewContent: result.content }
  }
  if (source === 'worktree') {
    const result = await readWorktreeFileContent(absolutePath)
    if (result.ok) return { contentSource: 'worktree', previewContent: result.content }
  }
  return { contentSource: 'none', previewContent: '' }
}

async function buildDeletedFileDetail(repoInfo, fileStatus, scope) {
  const previewSource = scope === 'staged' ? 'head' : 'index'
  const preview = await resolvePreviewContent(
    repoInfo.repoRoot,
    previewSource,
    repoInfo.relativePath,
    repoInfo.absolutePath,
  )
  return buildDetailResult(repoInfo, scope, fileStatus, 'deleted_file', {
    title: 'Deleted file',
    summary: scope === 'staged'
      ? 'Showing the last committed file content because the staged delete removed it from the index.'
      : 'Showing the indexed file content because the worktree file has been deleted.',
    projectRelativePath: repoInfo.projectRelativePath,
    previousProjectRelativePath: String(fileStatus?.previousProjectRelativePath || '').trim(),
    previewSource: preview.contentSource,
    previewContent: preview.previewContent,
    canRestore: scope === 'unstaged' && fileStatus?.unstagedKind === 'deleted',
    canUnstage: scope === 'staged' && fileStatus?.stagedKind === 'deleted',
  })
}

async function buildRenameDetail(repoInfo, fileStatus, scope) {
  const preview = await resolvePreviewContent(
    repoInfo.repoRoot,
    scope === 'staged' ? 'index' : 'worktree',
    repoInfo.relativePath,
    repoInfo.absolutePath,
  )
  return buildDetailResult(repoInfo, scope, fileStatus, 'rename', {
    title: fileStatus?.isCopied ? 'Copied file' : 'Renamed file',
    summary: fileStatus?.isCopied
      ? 'Source Control is tracking this change as a copy. Inline text diff stays explicit about the path transition.'
      : 'Source Control is tracking this change as a rename. Old and new paths stay visible together.',
    projectRelativePath: repoInfo.projectRelativePath,
    previousProjectRelativePath: String(fileStatus?.previousProjectRelativePath || '').trim(),
    previewSource: preview.contentSource,
    previewContent: preview.previewContent,
    canOpenCurrentPath: preview.contentSource === 'worktree',
    canUnstage: scope === 'staged'
      && (fileStatus?.isRenamed === true || fileStatus?.isCopied === true)
      && Boolean(String(fileStatus?.previousProjectRelativePath || '').trim()),
  })
}

async function buildBinaryFileDetail(repoInfo, fileStatus, scope) {
  const stat = await statWorktreeFile(repoInfo.absolutePath)
  return buildDetailResult(repoInfo, scope, fileStatus, 'binary_file', {
    title: 'Binary file',
    summary: 'Binary files do not render as inline text diffs in the editor.',
    projectRelativePath: repoInfo.projectRelativePath,
    previousProjectRelativePath: String(fileStatus?.previousProjectRelativePath || '').trim(),
    worktreeSizeBytes: stat.size,
    hasWorktreeFile: stat.ok && (stat.isFile || stat.isDirectory),
  })
}

async function buildSubmoduleDetail(repoInfo, fileStatus, scope) {
  const [stageEntries, submoduleStatus] = await Promise.all([
    readStageEntriesForRepoPath(repoInfo.repoRoot, repoInfo.relativePath),
    readSubmoduleStatusSummary(repoInfo.repoRoot, repoInfo.relativePath),
  ])
  const indexEntry = stageEntries.find((entry) => entry.stage === 0) || null
  return buildDetailResult(repoInfo, scope, fileStatus, 'submodule', {
    title: 'Submodule',
    summary: 'Submodule changes are tracked as commit pointers, not normal text hunks.',
    projectRelativePath: repoInfo.projectRelativePath,
    previousProjectRelativePath: String(fileStatus?.previousProjectRelativePath || '').trim(),
    indexOid: String(indexEntry?.oid || '').trim(),
    worktreeOid: String(submoduleStatus?.oid || '').trim(),
    worktreeDirty: submoduleStatus?.isDirty === true,
    worktreeSummary: String(submoduleStatus?.summary || '').trim(),
    statusPrefix: String(submoduleStatus?.statusPrefix || '').trim(),
  })
}

async function buildConflictDetail(repoInfo, fileStatus, scope) {
  const unmergedEntries = await readUnmergedStageEntriesForRepoPath(repoInfo.repoRoot, repoInfo.relativePath)
  return buildDetailResult(repoInfo, scope, fileStatus, 'merge_conflict', {
    title: 'Merge conflict',
    summary: 'Conflict resolution is not implemented in inline SCM yet. Stage metadata is shown to make the conflict explicit.',
    projectRelativePath: repoInfo.projectRelativePath,
    unmergedStages: unmergedEntries.map((entry) => ({
      stage: entry.stage,
      mode: entry.mode,
      oid: entry.oid,
      repoRelativePath: entry.repoRelativePath,
      label: entry.stage === 1 ? 'base' : entry.stage === 2 ? 'ours' : entry.stage === 3 ? 'theirs' : `stage_${entry.stage}`,
    })),
  })
}

export async function buildAdvancedDetailResult(repoInfo, fileStatus, scope) {
  const reason = String(fileStatus?.inlineUnsupportedReason || fileStatus?.unsupportedReason || '').trim()
  switch (reason) {
    case 'deleted_file':
      return buildDeletedFileDetail(repoInfo, fileStatus, scope)
    case 'rename':
      return buildRenameDetail(repoInfo, fileStatus, scope)
    case 'binary_file':
      return buildBinaryFileDetail(repoInfo, fileStatus, scope)
    case 'submodule':
      return buildSubmoduleDetail(repoInfo, fileStatus, scope)
    case 'merge_conflict':
      return buildConflictDetail(repoInfo, fileStatus, scope)
    default:
      return null
  }
}

export async function readDiffTextForScope(repoInfo, fileStatus, scope) {
  if (scope === 'unstaged' && fileStatus?.unstagedKind === 'untracked') {
    const result = await readWorktreeFileContent(repoInfo.absolutePath)
    if (!result.ok) {
      return {
        ok: false,
        error: result.message || result.error || 'file_read_failed',
      }
    }
    return {
      ok: true,
      stdout: buildUntrackedFileDiffText(repoInfo.relativePath, result.content),
      stderr: '',
      exitCode: 0,
    }
  }

  const args = [
    'diff',
    '--no-color',
    '--no-ext-diff',
    '--no-renames',
    `--unified=${GIT_FILE_DIFF_CONTEXT_LINES}`,
  ]
  if (scope === 'staged') args.push('--cached')
  args.push('--', repoInfo.relativePath)
  return runGitInCwd(repoInfo.repoRoot, args, 'diff')
}
