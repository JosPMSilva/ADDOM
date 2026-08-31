import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export function createGitPatchOps(dependencies = {}) {
  const {
    findHunkSegmentByLineRange,
    getGitFileDiff,
    normalizeFileInputPath,
    normalizeGitScope,
    normalizeLineSelection,
    runGitInCwd,
  } = dependencies

  async function writeTempPatchFile(patchText = '') {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-git-patch-'))
    const patchPath = path.join(tempDir, 'hunk.patch')
    await fs.writeFile(patchPath, String(patchText || ''), 'utf8')
    return { tempDir, patchPath }
  }

  async function removeTempPatchFile(tempDir = '') {
    if (!tempDir) return
    await fs.rm(tempDir, { recursive: true, force: true })
  }

  async function runGitApplyWithPatch(repoRoot, patchText, args, opName) {
    const { tempDir, patchPath } = await writeTempPatchFile(patchText)
    try {
      return await runGitInCwd(repoRoot, ['apply', ...args, patchPath], opName)
    } finally {
      await removeTempPatchFile(tempDir)
    }
  }

  function buildHunkMutationError(runResult, fallbackError = 'git_apply_failed') {
    const message = String(runResult?.error || '').trim()
    if (!message) {
      return {
        ok: false,
        error: fallbackError,
        message: 'Git patch apply failed.',
      }
    }
    if (/patch does not apply|error: corrupt patch|while searching for/i.test(message)) {
      return {
        ok: false,
        error: 'stale_hunk',
        message,
      }
    }
    return {
      ok: false,
      error: fallbackError,
      message,
    }
  }

  function findGitDiffHunkById(fileDiff, hunkId) {
    const normalizedHunkId = String(hunkId || '').trim()
    return (Array.isArray(fileDiff?.hunks) ? fileDiff.hunks : []).find((hunk) => hunk.id === normalizedHunkId) || null
  }

  function findGitDiffSegmentByRange(fileDiff, input = {}) {
    const normalizedHunkId = String(input?.hunkId || '').trim()
    const startLine = normalizeLineSelection(input?.startLine || input?.startLineNumber)
    const endLine = normalizeLineSelection(input?.endLine || input?.endLineNumber)
    if (!startLine || !endLine) {
      return {
        segment: null,
        error: 'missing_line_selection',
        message: 'A line selection is required.',
      }
    }

    const searchHunks = normalizedHunkId
      ? (Array.isArray(fileDiff?.hunks) ? fileDiff.hunks.filter((hunk) => hunk?.id === normalizedHunkId) : [])
      : (Array.isArray(fileDiff?.hunks) ? fileDiff.hunks : [])

    for (const hunk of searchHunks) {
      const segment = findHunkSegmentByLineRange(hunk, startLine, endLine)
      if (!segment) continue
      return { segment, error: '', message: '' }
    }

    return {
      segment: null,
      error: 'line_action_not_available',
      message: 'Line-level actions are available only when the selected lines match one deterministic changed segment.',
    }
  }

  async function mutateGitPatch(projectRoot, input = {}, {
    resolvePatchTarget,
    validateArgs = [],
    applyArgs = [],
    fallbackError = 'git_apply_failed',
  } = {}) {
    const filePath = normalizeFileInputPath(input?.filePath || input?.path || '')
    const fileDiff = await getGitFileDiff(projectRoot, {
      filePath,
      scope: normalizeGitScope(input?.scope || 'unstaged'),
    })
    if (!fileDiff.ok) return fileDiff
    if (fileDiff.status !== 'ok') {
      return {
        ok: false,
        error: fileDiff.status === 'no_diff' ? 'stale_hunk' : fileDiff.status,
        message: fileDiff.status === 'no_diff'
          ? 'The selected diff is no longer present.'
          : String(fileDiff.editorBlockedReason || fileDiff.unsupportedReason || fileDiff.status || 'git_patch_unavailable'),
      }
    }

    const patchTarget = resolvePatchTarget(fileDiff, input)
    if (!patchTarget?.patchText) {
      return {
        ok: false,
        error: patchTarget?.error || 'stale_hunk',
        message: String(patchTarget?.message || 'The selected diff no longer matches the file on disk.'),
      }
    }

    const validationRun = await runGitApplyWithPatch(fileDiff.repoRoot, patchTarget.patchText, validateArgs, 'apply')
    if (!validationRun.ok) {
      return buildHunkMutationError(validationRun, fallbackError)
    }

    const applyRun = await runGitApplyWithPatch(fileDiff.repoRoot, patchTarget.patchText, applyArgs, 'apply')
    if (!applyRun.ok) {
      return buildHunkMutationError(applyRun, fallbackError)
    }

    return {
      ok: true,
      status: 'ok',
      scope: fileDiff.scope,
      filePath: fileDiff.projectRelativePath,
      repoRoot: fileDiff.repoRoot,
      relativePath: fileDiff.relativePath,
      hunkId: String(patchTarget.hunkId || '').trim(),
      segmentId: String(patchTarget.segmentId || '').trim(),
      startLine: Number(patchTarget.startLine || 0) || 0,
      endLine: Number(patchTarget.endLine || 0) || 0,
    }
  }

  return {
    findGitDiffHunkById,
    findGitDiffSegmentByRange,
    mutateGitPatch,
  }
}
