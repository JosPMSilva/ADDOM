import path from 'node:path'
import {
  findHunkSegmentByLineRange,
  parseUnifiedDiffForSingleFile,
} from './git-unified-diff.mjs'
import { createGitCommandOps } from './git-tools-command-ops.mjs'
import {
  buildAdvancedDetailResult,
  buildDiffResponseBase,
  buildEditorBlockedReason,
  buildFileMutationUnavailable,
  buildNoDiffResult,
  buildUnsupportedDiffResult,
  readDiffTextForScope,
  resolvePreviewContent,
} from './git-tools-diff-details.mjs'
import { createGitPatchOps } from './git-tools-patch-ops.mjs'
import {
  collectGitStatusEntries,
  findStatusEntryForRepoPath,
  resolveExistingGitProbeCwd,
  resolveGitRepoForProject,
} from './git-tools-status.mjs'
import {
  canonicalizeExistingPath,
  clampInt,
  isGitNotRepositoryError,
  normalizeCommitMessage,
  normalizeFileInputPath,
  normalizeGitScope,
  normalizeLineSelection,
  normalizeNewlines,
  normalizeProjectRoot,
  normalizeRef,
  normalizeRepoPath,
  normalizeRepoPaths,
  normalizeRepoRelativePath,
  resolveProjectFilePath,
  resolveRepoRelativeProjectPath,
  runGit,
  runGitInCwd,
} from './git-tools-runtime.mjs'

export async function resolveGitFileRepo(projectRoot, filePath = '') {
  const target = resolveProjectFilePath(projectRoot, filePath)
  const probeCwd = await resolveExistingGitProbeCwd(target.projectRoot, target.absolutePath)
  const probeRun = await runGitInCwd(probeCwd, ['rev-parse', '--show-toplevel'], 'rev-parse')
  if (!probeRun.ok) {
    if (isGitNotRepositoryError(probeRun.error)) {
      return {
        ok: true,
        insideWorkTree: false,
        repoRoot: '',
        relativePath: '',
        projectRoot: target.projectRoot,
        projectRelativePath: target.projectRelativePath,
        absolutePath: target.absolutePath,
      }
    }
    return {
      ok: false,
      error: 'git_repo_probe_failed',
      message: probeRun.error,
    }
  }

  const [canonicalProjectRoot, repoRoot] = await Promise.all([
    canonicalizeExistingPath(target.projectRoot),
    canonicalizeExistingPath(String(probeRun.stdout || '').trim()),
  ])
  const absolutePath = path.resolve(
    canonicalProjectRoot,
    ...target.projectRelativePath.split('/').filter(Boolean),
  )
  const relativePath = normalizeRepoRelativePath(repoRoot, absolutePath)
  if (!relativePath) {
    return {
      ok: true,
      insideWorkTree: false,
      repoRoot,
      relativePath: '',
      projectRoot: canonicalProjectRoot,
      projectRelativePath: target.projectRelativePath,
      absolutePath,
    }
  }

  return {
    ok: true,
    insideWorkTree: true,
    repoRoot,
    relativePath,
    projectRoot: canonicalProjectRoot,
    projectRelativePath: target.projectRelativePath,
    absolutePath,
  }
}

export async function getGitHeaderStatus(projectRoot) {
  const normalizedProjectRoot = normalizeProjectRoot(projectRoot)
  const [branchRun, statRun] = await Promise.all([
    runGitInCwd(normalizedProjectRoot, ['rev-parse', '--abbrev-ref', 'HEAD'], 'rev-parse'),
    runGitInCwd(normalizedProjectRoot, ['diff', 'HEAD', '--shortstat'], 'diff'),
  ])
  if (!branchRun.ok) {
    if (isGitNotRepositoryError(branchRun.error)) {
      return { ok: false, error: 'not_a_git_repository' }
    }
    return { ok: false, error: 'git_error', message: branchRun.error }
  }
  if (!statRun.ok && !isGitNotRepositoryError(statRun.error)) {
    return { ok: false, error: 'git_error', message: statRun.error }
  }
  const statRaw = String(statRun.stdout || '').trim()
  return {
    ok: true,
    branch: String(branchRun.stdout || '').trim(),
    added: Number((statRaw.match(/(\d+) insertion/) || [])[1] || 0),
    removed: Number((statRaw.match(/(\d+) deletion/) || [])[1] || 0),
  }
}

export async function getGitRepositoryStatus(projectRoot) {
  const repoInfo = await resolveGitRepoForProject(projectRoot)
  if (!repoInfo.ok) return repoInfo
  if (!repoInfo.insideWorkTree) {
    return {
      ok: true,
      status: 'no_repo',
      repoRoot: '',
      projectRoot: repoInfo.projectRoot,
      branch: '',
      entries: [],
      totals: {
        staged: 0,
        unstaged: 0,
        conflicted: 0,
        unsupported: 0,
      },
    }
  }

  const branchRun = await runGitInCwd(repoInfo.repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'], 'rev-parse')
  const result = await collectGitStatusEntries(projectRoot, repoInfo)
  if (!result.ok) return result
  return {
    ok: true,
    status: 'ok',
    repoRoot: repoInfo.repoRoot,
    projectRoot: repoInfo.projectRoot,
    branch: branchRun.ok ? String(branchRun.stdout || '').trim() : '',
    entries: result.entries,
    totals: result.totals,
  }
}

export async function getGitFileDiff(projectRoot, input = {}) {
  const filePath = normalizeFileInputPath(input?.filePath || input?.path || '')
  const scope = normalizeGitScope(input?.scope || 'unstaged')
  const repoInfo = await resolveGitFileRepo(projectRoot, filePath)
  if (!repoInfo.ok) return repoInfo
  if (!repoInfo.insideWorkTree) {
    return {
      ok: true,
      scope,
      status: 'no_repo',
      insideWorkTree: false,
      repoRoot: '',
      relativePath: '',
      projectRelativePath: repoInfo.projectRelativePath,
      absolutePath: repoInfo.absolutePath,
      hasDiff: false,
      dirtyBufferBlocked: false,
      editorRenderable: false,
      editorBlockedReason: 'no_repo',
      unsupportedReason: '',
      hunks: [],
      hunkCount: 0,
      addedLineCount: 0,
      deletedLineCount: 0,
      rawDiff: '',
      fileStatus: null,
    }
  }

  const statusResult = await collectGitStatusEntries(projectRoot, repoInfo)
  if (!statusResult.ok) return statusResult
  const fileStatus = findStatusEntryForRepoPath(statusResult.entries, repoInfo.relativePath)

  if (fileStatus?.inlineUnsupportedReason || fileStatus?.unsupportedReason) {
    const detailResult = await buildAdvancedDetailResult(repoInfo, fileStatus, scope)
    if (detailResult) return detailResult
    const reason = String(fileStatus?.inlineUnsupportedReason || fileStatus?.unsupportedReason || 'unsupported_diff_type')
    return buildUnsupportedDiffResult(repoInfo, scope, fileStatus, reason)
  }

  const diffRun = await readDiffTextForScope(repoInfo, fileStatus, scope)
  if (!diffRun.ok) {
    return {
      ok: false,
      error: 'git_diff_failed',
      message: diffRun.error,
    }
  }

  const parsed = parseUnifiedDiffForSingleFile(diffRun.stdout)
  if (!parsed.ok) return parsed

  if (parsed.status === 'no_diff') {
    const noDiffResult = buildNoDiffResult(repoInfo, scope, fileStatus)
    const blockedReason = buildEditorBlockedReason(scope, fileStatus)
    if (blockedReason) {
      noDiffResult.editorRenderable = false
      noDiffResult.editorBlockedReason = blockedReason
    }
    return noDiffResult
  }

  if (parsed.status === 'unsupported') {
    const reason = fileStatus?.inlineUnsupportedReason || parsed.unsupportedReason || 'unsupported_diff_type'
    return buildUnsupportedDiffResult(repoInfo, scope, fileStatus, reason, parsed.rawText)
  }

  const editorBlockedReason = buildEditorBlockedReason(scope, fileStatus)
  const usesIndexPreview = scope === 'staged'
    && fileStatus?.hasStagedChanges
    && fileStatus?.hasUnstagedChanges
  const preview = usesIndexPreview
    ? await resolvePreviewContent(repoInfo.repoRoot, 'index', repoInfo.relativePath, repoInfo.absolutePath)
    : { contentSource: 'worktree', previewContent: '' }
  const result = {
    ...buildDiffResponseBase(repoInfo, scope, fileStatus),
    status: 'ok',
    hasDiff: parsed.hunks.length > 0,
    unsupportedReason: '',
    hunks: parsed.hunks,
    hunkCount: parsed.hunkCount,
    addedLineCount: parsed.addedLineCount,
    deletedLineCount: parsed.deletedLineCount,
    rawDiff: parsed.rawText,
    contentSource: preview.contentSource,
    previewContent: preview.previewContent,
    previewReadOnly: usesIndexPreview,
    previewNotice: usesIndexPreview
      ? 'Showing staged content from the git index. The live editor buffer may differ because unstaged changes still exist.'
      : '',
  }
  if (editorBlockedReason) {
    result.editorRenderable = false
    result.editorBlockedReason = editorBlockedReason
  }
  return result
}

const {
  findGitDiffHunkById,
  findGitDiffSegmentByRange,
  mutateGitPatch,
} = createGitPatchOps({
  findHunkSegmentByLineRange,
  getGitFileDiff,
  normalizeFileInputPath,
  normalizeGitScope,
  normalizeLineSelection,
  runGitInCwd,
})

export async function stageGitHunk(projectRoot, input = {}) {
  return mutateGitPatch(projectRoot, input, {
    resolvePatchTarget(fileDiff, mutationInput) {
      const hunkId = String(mutationInput?.hunkId || '').trim()
      if (!hunkId) {
        return { patchText: '', error: 'missing_hunk_id', message: 'A hunk id is required.' }
      }
      const hunk = findGitDiffHunkById(fileDiff, hunkId)
      if (!hunk) {
        return { patchText: '', error: 'stale_hunk', message: 'The selected hunk no longer matches the file on disk.' }
      }
      return { patchText: hunk.patchText, hunkId: hunk.id }
    },
    validateArgs: ['--check', '--cached', '--'],
    applyArgs: ['--cached', '--'],
    fallbackError: 'stage_hunk_failed',
  })
}

export async function discardGitHunk(projectRoot, input = {}) {
  return mutateGitPatch(projectRoot, input, {
    resolvePatchTarget(fileDiff, mutationInput) {
      const hunkId = String(mutationInput?.hunkId || '').trim()
      if (!hunkId) {
        return { patchText: '', error: 'missing_hunk_id', message: 'A hunk id is required.' }
      }
      const hunk = findGitDiffHunkById(fileDiff, hunkId)
      if (!hunk) {
        return { patchText: '', error: 'stale_hunk', message: 'The selected hunk no longer matches the file on disk.' }
      }
      return { patchText: hunk.patchText, hunkId: hunk.id }
    },
    validateArgs: ['--check', '-R', '--'],
    applyArgs: ['-R', '--'],
    fallbackError: 'discard_hunk_failed',
  })
}

export async function unstageGitHunk(projectRoot, input = {}) {
  return mutateGitPatch(projectRoot, { ...input, scope: 'staged' }, {
    resolvePatchTarget(fileDiff, mutationInput) {
      const hunkId = String(mutationInput?.hunkId || '').trim()
      if (!hunkId) {
        return { patchText: '', error: 'missing_hunk_id', message: 'A hunk id is required.' }
      }
      const hunk = findGitDiffHunkById(fileDiff, hunkId)
      if (!hunk) {
        return { patchText: '', error: 'stale_hunk', message: 'The selected hunk no longer matches the staged diff.' }
      }
      return { patchText: hunk.patchText, hunkId: hunk.id }
    },
    validateArgs: ['--check', '-R', '--cached', '--'],
    applyArgs: ['-R', '--cached', '--'],
    fallbackError: 'unstage_hunk_failed',
  })
}

export async function restoreGitFile(projectRoot, input = {}) {
  const filePath = normalizeFileInputPath(input?.filePath || input?.path || '')
  const repoInfo = await resolveGitFileRepo(projectRoot, filePath)
  if (!repoInfo.ok) return repoInfo
  if (!repoInfo.insideWorkTree) {
    return buildFileMutationUnavailable('no_repo', 'The selected file is not inside a git repository.')
  }

  const statusResult = await collectGitStatusEntries(projectRoot, repoInfo)
  if (!statusResult.ok) return statusResult
  const fileStatus = findStatusEntryForRepoPath(statusResult.entries, repoInfo.relativePath)
  if (!fileStatus) {
    return buildFileMutationUnavailable('no_file_change', 'The selected file has no Source Control entry.')
  }
  if (fileStatus.isConflicted) {
    return buildFileMutationUnavailable('merge_conflict', 'Restore file is not available for unmerged paths.')
  }
  if (fileStatus.unstagedKind !== 'deleted') {
    return buildFileMutationUnavailable('restore_file_not_available', 'Restore file is available only for unstaged deleted files.')
  }

  const restoreRun = await runGitInCwd(repoInfo.repoRoot, ['restore', '--worktree', '--', repoInfo.relativePath], 'restore')
  if (!restoreRun.ok) {
    return {
      ok: false,
      error: 'restore_file_failed',
      message: restoreRun.error,
    }
  }

  return {
    ok: true,
    status: 'ok',
    action: 'restore_file',
    scope: 'unstaged',
    filePath: repoInfo.projectRelativePath,
    repoRoot: repoInfo.repoRoot,
    relativePath: repoInfo.relativePath,
  }
}

export async function stageGitFile(projectRoot, input = {}) {
  const filePath = normalizeFileInputPath(input?.filePath || input?.path || '')
  const repoInfo = await resolveGitFileRepo(projectRoot, filePath)
  if (!repoInfo.ok) return repoInfo
  if (!repoInfo.insideWorkTree) {
    return buildFileMutationUnavailable('no_repo', 'The selected file is not inside a git repository.')
  }

  const statusResult = await collectGitStatusEntries(projectRoot, repoInfo)
  if (!statusResult.ok) return statusResult
  const fileStatus = findStatusEntryForRepoPath(statusResult.entries, repoInfo.relativePath)
  if (!fileStatus) {
    return buildFileMutationUnavailable('no_file_change', 'The selected file has no Source Control entry.')
  }
  if (fileStatus.isConflicted) {
    return buildFileMutationUnavailable('merge_conflict', 'Stage file is not available for unmerged paths.')
  }

  const pathsToStage = [repoInfo.relativePath]
  let previousRepoRelativePath = ''
  const rawPreviousFilePath = String(input?.previousFilePath || input?.previousPath || '').trim()
  if (fileStatus.isRenamed || fileStatus.isCopied) {
    if (!rawPreviousFilePath) {
      return buildFileMutationUnavailable('missing_previous_file_path', 'Stage rename requires the previous file path.')
    }
    const previousFilePath = normalizeFileInputPath(rawPreviousFilePath)
    const previousTarget = resolveRepoRelativeProjectPath(repoInfo.projectRoot, repoInfo.repoRoot, previousFilePath)
    previousRepoRelativePath = previousTarget.repoRelativePath
    if (!fileStatus.previousRepoRelativePath || fileStatus.previousRepoRelativePath !== previousRepoRelativePath) {
      return buildFileMutationUnavailable('rename_metadata_mismatch', 'Stage rename requires matching previous path metadata.')
    }
    pathsToStage.unshift(previousRepoRelativePath)
  }

  const addRun = await runGitInCwd(repoInfo.repoRoot, ['add', '--all', '--', ...pathsToStage], 'add')
  if (!addRun.ok) {
    return { ok: false, error: 'stage_file_failed', message: addRun.error }
  }

  return {
    ok: true,
    status: 'ok',
    action: 'stage_file',
    scope: 'unstaged',
    filePath: repoInfo.projectRelativePath,
    repoRoot: repoInfo.repoRoot,
    relativePath: repoInfo.relativePath,
    previousRelativePath: previousRepoRelativePath,
  }
}

export async function unstageGitFile(projectRoot, input = {}) {
  const filePath = normalizeFileInputPath(input?.filePath || input?.path || '')
  const repoInfo = await resolveGitFileRepo(projectRoot, filePath)
  if (!repoInfo.ok) return repoInfo
  if (!repoInfo.insideWorkTree) {
    return buildFileMutationUnavailable('no_repo', 'The selected file is not inside a git repository.')
  }

  const statusResult = await collectGitStatusEntries(projectRoot, repoInfo)
  if (!statusResult.ok) return statusResult
  const fileStatus = findStatusEntryForRepoPath(statusResult.entries, repoInfo.relativePath)
  if (!fileStatus) {
    return buildFileMutationUnavailable('no_file_change', 'The selected file has no Source Control entry.')
  }
  if (fileStatus.isConflicted) {
    return buildFileMutationUnavailable('merge_conflict', 'Unstage file is not available for unmerged paths.')
  }

  const pathsToUnstage = []
  let previousRepoRelativePath = ''
  let previousProjectRelativePath = ''

  if (!fileStatus.hasStagedChanges) {
    return buildFileMutationUnavailable('unstage_file_not_available', 'The selected file has no staged changes.')
  }

  if (fileStatus.stagedKind === 'deleted') {
    pathsToUnstage.push(repoInfo.relativePath)
  } else if (
    (fileStatus.isRenamed || fileStatus.isCopied)
    && (fileStatus.stagedKind === 'renamed' || fileStatus.stagedKind === 'copied')
  ) {
    const rawPreviousFilePath = String(input?.previousFilePath || input?.previousPath || '').trim()
    if (!rawPreviousFilePath) {
      return buildFileMutationUnavailable('missing_previous_file_path', 'Unstage rename requires the previous file path.')
    }
    const previousFilePath = normalizeFileInputPath(rawPreviousFilePath)
    const previousTarget = resolveRepoRelativeProjectPath(repoInfo.projectRoot, repoInfo.repoRoot, previousFilePath)
    previousRepoRelativePath = previousTarget.repoRelativePath
    previousProjectRelativePath = previousTarget.projectRelativePath

    if (!fileStatus.previousRepoRelativePath || fileStatus.previousRepoRelativePath !== previousRepoRelativePath) {
      return buildFileMutationUnavailable('rename_metadata_mismatch', 'Unstage rename requires matching previous path metadata.')
    }

    pathsToUnstage.push(previousRepoRelativePath, repoInfo.relativePath)
  } else {
    pathsToUnstage.push(repoInfo.relativePath)
  }

  const restoreRun = await runGitInCwd(repoInfo.repoRoot, ['restore', '--staged', '--', ...pathsToUnstage], 'restore')
  if (!restoreRun.ok) {
    return {
      ok: false,
      error: 'unstage_file_failed',
      message: restoreRun.error,
    }
  }

  return {
    ok: true,
    status: 'ok',
    action: fileStatus.stagedKind === 'deleted'
      ? 'unstage_deletion'
      : fileStatus.stagedKind === 'copied'
        ? 'unstage_copy'
        : fileStatus.stagedKind === 'renamed'
          ? 'unstage_rename'
          : 'unstage_file',
    scope: 'staged',
    filePath: repoInfo.projectRelativePath,
    previousFilePath: previousProjectRelativePath,
    repoRoot: repoInfo.repoRoot,
    relativePath: repoInfo.relativePath,
    previousRelativePath: previousRepoRelativePath,
  }
}

export async function stageGitAll(projectRoot) {
  const repoInfo = await resolveGitRepoForProject(projectRoot)
  if (!repoInfo.ok) return repoInfo
  if (!repoInfo.insideWorkTree) {
    return buildFileMutationUnavailable('no_repo', 'The project is not inside a git repository.')
  }
  const addRun = await runGitInCwd(repoInfo.repoRoot, ['add', '--all'], 'add')
  if (!addRun.ok) return { ok: false, error: 'stage_all_failed', message: addRun.error }
  return { ok: true, status: 'ok', action: 'stage_all', repoRoot: repoInfo.repoRoot }
}

export async function unstageGitAll(projectRoot) {
  const repoInfo = await resolveGitRepoForProject(projectRoot)
  if (!repoInfo.ok) return repoInfo
  if (!repoInfo.insideWorkTree) {
    return buildFileMutationUnavailable('no_repo', 'The project is not inside a git repository.')
  }
  const restoreRun = await runGitInCwd(repoInfo.repoRoot, ['restore', '--staged', '--', '.'], 'restore')
  if (!restoreRun.ok) return { ok: false, error: 'unstage_all_failed', message: restoreRun.error }
  return { ok: true, status: 'ok', action: 'unstage_all', repoRoot: repoInfo.repoRoot }
}

export async function stageGitLines(projectRoot, input = {}) {
  return mutateGitPatch(projectRoot, { ...input, scope: 'unstaged' }, {
    resolvePatchTarget(fileDiff, mutationInput) {
      const resolved = findGitDiffSegmentByRange(fileDiff, mutationInput)
      if (!resolved.segment) {
        return { patchText: '', error: resolved.error, message: resolved.message }
      }
      return {
        patchText: resolved.segment.patchText,
        hunkId: String(mutationInput?.hunkId || '').trim(),
        segmentId: resolved.segment.id,
        startLine: resolved.segment.selectableLineStart,
        endLine: resolved.segment.selectableLineEnd,
      }
    },
    validateArgs: ['--check', '--cached', '--'],
    applyArgs: ['--cached', '--'],
    fallbackError: 'stage_lines_failed',
  })
}

export async function discardGitLines(projectRoot, input = {}) {
  return mutateGitPatch(projectRoot, { ...input, scope: 'unstaged' }, {
    resolvePatchTarget(fileDiff, mutationInput) {
      const resolved = findGitDiffSegmentByRange(fileDiff, mutationInput)
      if (!resolved.segment) {
        return { patchText: '', error: resolved.error, message: resolved.message }
      }
      return {
        patchText: resolved.segment.patchText,
        hunkId: String(mutationInput?.hunkId || '').trim(),
        segmentId: resolved.segment.id,
        startLine: resolved.segment.selectableLineStart,
        endLine: resolved.segment.selectableLineEnd,
      }
    },
    validateArgs: ['--check', '-R', '--'],
    applyArgs: ['-R', '--'],
    fallbackError: 'discard_lines_failed',
  })
}

export async function unstageGitLines(projectRoot, input = {}) {
  return mutateGitPatch(projectRoot, { ...input, scope: 'staged' }, {
    resolvePatchTarget(fileDiff, mutationInput) {
      const resolved = findGitDiffSegmentByRange(fileDiff, mutationInput)
      if (!resolved.segment) {
        return { patchText: '', error: resolved.error, message: resolved.message }
      }
      return {
        patchText: resolved.segment.patchText,
        hunkId: String(mutationInput?.hunkId || '').trim(),
        segmentId: resolved.segment.id,
        startLine: resolved.segment.selectableLineStart,
        endLine: resolved.segment.selectableLineEnd,
      }
    },
    validateArgs: ['--check', '-R', '--cached', '--'],
    applyArgs: ['-R', '--cached', '--'],
    fallbackError: 'unstage_lines_failed',
  })
}

const {
  commitGitStaged,
  gitCheckoutFile,
  gitCommit,
  gitDiff,
  gitLog,
  gitStatus,
} = createGitCommandOps({
  clampInt,
  normalizeCommitMessage,
  normalizeRef,
  normalizeRepoPath,
  normalizeRepoPaths,
  normalizeNewlines,
  runGit,
})

export {
  commitGitStaged,
  gitCheckoutFile,
  gitCommit,
  gitDiff,
  gitLog,
  gitStatus,
}
