import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  commitGitStaged,
  discardGitLines,
  discardGitHunk,
  getGitFileDiff,
  getGitRepositoryStatus,
  gitCheckoutFile,
  gitCommit,
  gitDiff,
  gitLog,
  gitStatus,
  restoreGitFile,
  stageGitAll,
  stageGitFile,
  stageGitLines,
  stageGitHunk,
  unstageGitAll,
  unstageGitFile,
  unstageGitHunk,
  unstageGitLines,
} from '../../src/main/tools/git-tools.mjs'
import { toAISDKTools } from '../../src/main/tools/tool-definitions.mjs'

function hasGitBinary() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const HAS_GIT = hasGitBinary()

function runGit(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

function commitFile(repoRoot, filePath, content, message) {
  fs.writeFileSync(path.join(repoRoot, filePath), content, 'utf8')
  runGit(repoRoot, ['add', '--', filePath])
  runGit(repoRoot, ['commit', '-m', message])
}

function commitAll(repoRoot, message) {
  runGit(repoRoot, ['add', '--all'])
  runGit(repoRoot, ['commit', '-m', message])
}

function createNumberedFile(lineCount = 14) {
  return Array.from({ length: lineCount }, (_value, index) => `line ${index + 1}`).join('\n') + '\n'
}

async function withTempRepo(fn) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-git-tools-'))
  try {
    runGit(repoRoot, ['init'])
    runGit(repoRoot, ['config', 'user.email', 'test@addom.local'])
    runGit(repoRoot, ['config', 'user.name', 'ADDOM Test'])
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), 'hello\n', 'utf8')
    runGit(repoRoot, ['add', '.'])
    runGit(repoRoot, ['commit', '-m', 'initial commit'])
    return await fn(repoRoot)
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true })
  }
}

test('toAISDKTools exposes the full git tool catalog in the base tool surface', () => {
  const tools = toAISDKTools('ask', false)
  assert.equal(Boolean(tools.git_status), true)
  assert.equal(Boolean(tools.git_diff), true)
  assert.equal(Boolean(tools.git_log), true)
  assert.equal(Boolean(tools.git_commit), true)
  assert.equal(Boolean(tools.git_checkout_file), true)
})

test('toAISDKTools ignores removed legacy git/file permission gating flags', () => {
  const baseline = toAISDKTools('ask', false)
  const legacyRestricted = toAISDKTools('ask', false, {
    writeFileEnabled: true,
    gitWriteEnabled: false,
    gitReadEnabled: false,
  })
  const legacyEnabled = toAISDKTools('ask', false, {
    gitWriteEnabled: true,
    writeFileEnabled: true,
  })

  for (const toolName of ['git_status', 'git_diff', 'git_log', 'git_commit', 'git_checkout_file']) {
    assert.equal(Boolean(baseline[toolName]), true)
    assert.equal(Boolean(legacyRestricted[toolName]), true)
    assert.equal(Boolean(legacyEnabled[toolName]), true)
  }
})

test('toAISDKTools reserves MoA gating for agent tools without changing git tool exposure', () => {
  const withoutMoa = toAISDKTools('ask', false)
  const withMoa = toAISDKTools('ask', true)

  for (const toolName of ['git_status', 'git_diff', 'git_log', 'git_commit', 'git_checkout_file']) {
    assert.equal(Boolean(withoutMoa[toolName]), true)
    assert.equal(Boolean(withMoa[toolName]), true)
  }
  assert.equal(Boolean(withoutMoa.delegate_to_agents), false)
  assert.equal(Boolean(withoutMoa.delegate_tasks), false)
  assert.equal(Boolean(withoutMoa.agent_catalog), false)
  assert.equal(Boolean(withoutMoa.apply_artifact_revision), false)
  assert.equal(Boolean(withMoa.delegate_to_agents), false)
  assert.equal(Boolean(withMoa.delegate_tasks), true)
  assert.equal(Boolean(withMoa.agent_catalog), true)
  assert.equal(Boolean(withMoa.apply_artifact_revision), true)
})

test('git repository discovery canonicalizes Windows junction aliases', {
  skip: process.platform !== 'win32' || !HAS_GIT,
}, async (t) => {
  await withTempRepo(async (repoRoot) => {
    const aliasRoot = `${repoRoot}-alias`
    try {
      fs.symlinkSync(repoRoot, aliasRoot, 'junction')
    } catch (error) {
      t.skip(`Directory junctions are unavailable: ${error.code || error.message}`)
      return
    }
    try {
      const result = await getGitRepositoryStatus(aliasRoot)
      assert.equal(result.ok, true)
      assert.equal(result.status, 'ok')
      assert.equal(result.projectRoot, result.repoRoot)
      assert.equal(path.basename(result.repoRoot), path.basename(repoRoot))
    } finally {
      fs.rmSync(aliasRoot, { recursive: true, force: true })
    }
  })
})

test('gitStatus and gitDiff report working tree changes', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), 'hello\nchanged\n', 'utf8')

    const status = await gitStatus(repoRoot, { short: true })
    assert.match(String(status), /a\.txt/i)
    assert.match(String(status), /\bM\b/)

    const diff = await gitDiff(repoRoot, { path: 'a.txt', staged: false })
    assert.match(String(diff), /\+changed/)
  })
})

test('gitLog returns recent commits with one-line format', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    const log = await gitLog(repoRoot, { max_count: 1 })
    assert.match(String(log), /initial commit/i)
  })
})

test('gitCommit stages selected paths and creates a commit', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), 'hello\ncommit change\n', 'utf8')
    const result = await gitCommit(repoRoot, {
      message: 'update a',
      paths: ['a.txt'],
    })
    assert.match(String(result), /Commit created\./i)
    assert.match(String(result), /update a/i)

    const log = await gitLog(repoRoot, { max_count: 1 })
    assert.match(String(log), /update a/i)
  })
})

test('gitCheckoutFile restores a file from HEAD', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), 'hello\nchanged locally\n', 'utf8')
    const output = await gitCheckoutFile(repoRoot, { path: 'a.txt', ref: 'HEAD' })
    assert.match(String(output), /Restored "a\.txt" from HEAD\./i)
    const content = fs.readFileSync(path.join(repoRoot, 'a.txt'), 'utf8')
    assert.equal(content.replace(/\r\n/g, '\n'), 'hello\n')
  })
})

test('getGitFileDiff returns structured current-file hunks for unstaged changes', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    commitFile(repoRoot, 'a.txt', createNumberedFile(), 'expand a')

    const modified = createNumberedFile()
      .replace('line 2\n', 'line 2 changed\n')
      .replace('line 12\n', '')
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), modified, 'utf8')

    const diff = await getGitFileDiff(repoRoot, { filePath: 'a.txt' })
    assert.equal(diff.ok, true)
    assert.equal(diff.status, 'ok')
    assert.equal(diff.relativePath, 'a.txt')
    assert.equal(diff.hunkCount, 2)
    assert.equal(diff.hunks[0].kind, 'modified')
    assert.equal(diff.hunks[1].kind, 'deleted')
    assert.match(diff.hunks[0].header, /^@@ -1,5 \+1,5 @@/)
    assert.match(diff.hunks[0].previewText, /-line 2/)
    assert.match(diff.hunks[0].patchText, /^diff --git a\/a\.txt b\/a\.txt/m)
    assert.match(diff.hunks[1].previewText, /-line 12/)
  })
})

test('stageGitHunk stages only the selected unstaged hunk', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    commitFile(repoRoot, 'a.txt', createNumberedFile(), 'expand a')

    const modified = createNumberedFile()
      .replace('line 2\n', 'line 2 changed\n')
      .replace('line 12\n', '')
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), modified, 'utf8')

    const diff = await getGitFileDiff(repoRoot, { filePath: 'a.txt' })
    assert.equal(diff.status, 'ok')
    assert.equal(diff.hunks.length, 2)

    const stageResult = await stageGitHunk(repoRoot, {
      filePath: 'a.txt',
      hunkId: diff.hunks[0].id,
    })
    assert.equal(stageResult.ok, true)

    const cachedDiff = runGit(repoRoot, ['diff', '--cached', '--', 'a.txt'])
    const workingDiff = runGit(repoRoot, ['diff', '--', 'a.txt'])
    assert.match(cachedDiff, /line 2 changed/)
    assert.doesNotMatch(cachedDiff, /line 12/)
    assert.match(workingDiff, /-line 12/)
    assert.doesNotMatch(workingDiff, /line 2 changed/)
  })
})

test('discardGitHunk reverses only the selected unstaged hunk in the working tree', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    commitFile(repoRoot, 'a.txt', createNumberedFile(), 'expand a')

    const modified = createNumberedFile()
      .replace('line 2\n', 'line 2 changed\n')
      .replace('line 12\n', '')
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), modified, 'utf8')

    const diff = await getGitFileDiff(repoRoot, { filePath: 'a.txt' })
    assert.equal(diff.status, 'ok')

    const discardResult = await discardGitHunk(repoRoot, {
      filePath: 'a.txt',
      hunkId: diff.hunks[1].id,
    })
    assert.equal(discardResult.ok, true)

    const content = fs.readFileSync(path.join(repoRoot, 'a.txt'), 'utf8').replace(/\r\n/g, '\n')
    assert.match(content, /line 12\n/)

    const workingDiff = runGit(repoRoot, ['diff', '--', 'a.txt'])
    assert.match(workingDiff, /line 2 changed/)
    assert.doesNotMatch(workingDiff, /line 12/)
  })
})

test('stageGitHunk returns stale_hunk when the current-file diff changed after selection', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    commitFile(repoRoot, 'a.txt', createNumberedFile(), 'expand a')

    fs.writeFileSync(
      path.join(repoRoot, 'a.txt'),
      createNumberedFile().replace('line 2\n', 'line 2 changed\n'),
      'utf8',
    )

    const diff = await getGitFileDiff(repoRoot, { filePath: 'a.txt' })
    assert.equal(diff.status, 'ok')

    fs.writeFileSync(path.join(repoRoot, 'a.txt'), createNumberedFile(), 'utf8')

    const stageResult = await stageGitHunk(repoRoot, {
      filePath: 'a.txt',
      hunkId: diff.hunks[0].id,
    })
    assert.equal(stageResult.ok, false)
    assert.equal(stageResult.error, 'stale_hunk')
  })
})

test('getGitRepositoryStatus returns repo-wide staged and unstaged file state', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    commitFile(repoRoot, 'b.txt', 'base\n', 'add b')

    fs.writeFileSync(path.join(repoRoot, 'a.txt'), 'hello\nstaged change\n', 'utf8')
    runGit(repoRoot, ['add', '--', 'a.txt'])
    fs.writeFileSync(path.join(repoRoot, 'b.txt'), 'base\nunstaged change\n', 'utf8')

    const status = await getGitRepositoryStatus(repoRoot)
    assert.equal(status.ok, true)
    assert.equal(status.status, 'ok')
    assert.equal(status.totals.staged, 1)
    assert.equal(status.totals.unstaged, 1)

    const stagedEntry = status.entries.find((entry) => entry.projectRelativePath === 'a.txt')
    const unstagedEntry = status.entries.find((entry) => entry.projectRelativePath === 'b.txt')
    assert.equal(stagedEntry?.hasStagedChanges, true)
    assert.equal(stagedEntry?.hasUnstagedChanges, false)
    assert.equal(stagedEntry?.stagedAddedLines, 1)
    assert.equal(stagedEntry?.stagedDeletedLines, 0)
    assert.equal(unstagedEntry?.hasStagedChanges, false)
    assert.equal(unstagedEntry?.hasUnstagedChanges, true)
    assert.equal(unstagedEntry?.unstagedAddedLines, 1)
    assert.equal(unstagedEntry?.unstagedDeletedLines, 0)
  })
})

test('getGitRepositoryStatus treats untracked files as unstaged only', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    fs.writeFileSync(path.join(repoRoot, 'new.txt'), 'untracked\n', 'utf8')

    const status = await getGitRepositoryStatus(repoRoot)
    const entry = status.entries.find((candidate) => candidate.projectRelativePath === 'new.txt')

    assert.equal(entry?.isUntracked, true)
    assert.equal(entry?.hasStagedChanges, false)
    assert.equal(entry?.hasUnstagedChanges, true)
    assert.equal(status.totals.staged, 0)
    assert.equal(status.totals.unstaged, 1)
  })
})

test('getGitFileDiff returns a new-file diff for untracked files', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    fs.writeFileSync(path.join(repoRoot, 'new.txt'), 'untracked\n', 'utf8')

    const diff = await getGitFileDiff(repoRoot, { filePath: 'new.txt', scope: 'unstaged' })

    assert.equal(diff.ok, true)
    assert.equal(diff.status, 'ok')
    assert.equal(diff.scope, 'unstaged')
    assert.equal(diff.relativePath, 'new.txt')
    assert.equal(diff.hunkCount, 1)
    assert.equal(diff.addedLineCount, 1)
    assert.match(diff.rawDiff, /^--- \/dev\/null$/m)
    assert.match(diff.rawDiff, /^\+\+\+ b\/new\.txt$/m)
    assert.match(diff.rawDiff, /^\+untracked$/m)
  })
})

test('getGitFileDiff avoids quadratic line-action variants for large untracked files', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    fs.writeFileSync(path.join(repoRoot, 'large-new.txt'), createNumberedFile(604), 'utf8')

    const diff = await getGitFileDiff(repoRoot, { filePath: 'large-new.txt', scope: 'unstaged' })

    assert.equal(diff.ok, true)
    assert.equal(diff.status, 'ok')
    assert.equal(diff.hunkCount, 1)
    assert.equal(diff.hunks[0].segments.length, 1)
    assert.equal(diff.hunks[0].segments[0].lineActionEligible, true)
    assert.equal(diff.addedLineCount, 604)
  })
})

test('getGitFileDiff separates staged and unstaged scope for the current file', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    commitFile(repoRoot, 'a.txt', createNumberedFile(), 'expand a')

    const modified = createNumberedFile()
      .replace('line 2\n', 'line 2 staged\n')
      .replace('line 12\n', '')
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), modified, 'utf8')

    const initialUnstaged = await getGitFileDiff(repoRoot, { filePath: 'a.txt', scope: 'unstaged' })
    assert.equal(initialUnstaged.status, 'ok')
    assert.equal(initialUnstaged.hunks.length, 2)

    const stageResult = await stageGitHunk(repoRoot, {
      filePath: 'a.txt',
      hunkId: initialUnstaged.hunks[0].id,
    })
    assert.equal(stageResult.ok, true)

    const stagedDiff = await getGitFileDiff(repoRoot, { filePath: 'a.txt', scope: 'staged' })
    const unstagedDiff = await getGitFileDiff(repoRoot, { filePath: 'a.txt', scope: 'unstaged' })
    assert.equal(stagedDiff.scope, 'staged')
    assert.equal(unstagedDiff.scope, 'unstaged')
    assert.equal(stagedDiff.status, 'ok')
    assert.equal(unstagedDiff.status, 'ok')
    assert.equal(stagedDiff.contentSource, 'index')
    assert.match(stagedDiff.previewContent, /line 2 staged/)
    assert.match(stagedDiff.rawDiff, /line 2 staged/)
    assert.doesNotMatch(stagedDiff.rawDiff, /line 12/)
    assert.match(unstagedDiff.rawDiff, /-line 12/)
    assert.doesNotMatch(unstagedDiff.rawDiff, /line 2 staged/)
  })
})

test('unstageGitHunk reverses only the selected staged hunk out of the index', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    commitFile(repoRoot, 'a.txt', createNumberedFile(), 'expand a')

    const modified = createNumberedFile()
      .replace('line 2\n', 'line 2 staged\n')
      .replace('line 12\n', '')
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), modified, 'utf8')

    const unstagedDiff = await getGitFileDiff(repoRoot, { filePath: 'a.txt', scope: 'unstaged' })
    await stageGitHunk(repoRoot, { filePath: 'a.txt', hunkId: unstagedDiff.hunks[0].id })

    const stagedDiff = await getGitFileDiff(repoRoot, { filePath: 'a.txt', scope: 'staged' })
    const unstageResult = await unstageGitHunk(repoRoot, {
      filePath: 'a.txt',
      hunkId: stagedDiff.hunks[0].id,
    })
    assert.equal(unstageResult.ok, true)

    const cachedDiff = runGit(repoRoot, ['diff', '--cached', '--', 'a.txt'])
    const workingDiff = runGit(repoRoot, ['diff', '--', 'a.txt'])
    assert.equal(cachedDiff.trim(), '')
    assert.match(workingDiff, /line 2 staged/)
    assert.match(workingDiff, /-line 12/)
  })
})

test('stageGitLines stages only an exact deterministic changed line segment', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    commitFile(repoRoot, 'a.txt', createNumberedFile(), 'expand a')

    const modified = createNumberedFile()
      .replace('line 2\n', 'line 2 staged\n')
      .replace('line 3\n', 'line 3 staged\n')
      .replace('line 12\n', '')
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), modified, 'utf8')

    const diff = await getGitFileDiff(repoRoot, { filePath: 'a.txt', scope: 'unstaged' })
    const lineSegment = diff.hunks[0]?.segments?.find((segment) => segment?.lineActionEligible)
    assert.equal(Boolean(lineSegment), true)

    const stageResult = await stageGitLines(repoRoot, {
      filePath: 'a.txt',
      hunkId: diff.hunks[0].id,
      startLine: lineSegment.selectableLineStart,
      endLine: lineSegment.selectableLineEnd,
    })
    assert.equal(stageResult.ok, true)

    const stagedDiff = runGit(repoRoot, ['diff', '--cached', '--', 'a.txt'])
    const workingDiff = runGit(repoRoot, ['diff', '--', 'a.txt'])
    assert.match(stagedDiff, /line 2 staged/)
    assert.match(stagedDiff, /line 3 staged/)
    assert.doesNotMatch(stagedDiff, /line 12/)
    assert.match(workingDiff, /-line 12/)
    assert.doesNotMatch(workingDiff, /line 2 staged/)
  })
})

test('discardGitLines reverts only an exact deterministic changed line segment', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    commitFile(repoRoot, 'a.txt', createNumberedFile(), 'expand a')

    const modified = createNumberedFile()
      .replace('line 2\n', 'line 2 discard\n')
      .replace('line 3\n', 'line 3 discard\n')
      .replace('line 12\n', '')
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), modified, 'utf8')

    const diff = await getGitFileDiff(repoRoot, { filePath: 'a.txt', scope: 'unstaged' })
    const lineSegment = diff.hunks[0]?.segments?.find((segment) => segment?.lineActionEligible)
    assert.equal(Boolean(lineSegment), true)

    const discardResult = await discardGitLines(repoRoot, {
      filePath: 'a.txt',
      hunkId: diff.hunks[0].id,
      startLine: lineSegment.selectableLineStart,
      endLine: lineSegment.selectableLineEnd,
    })
    assert.equal(discardResult.ok, true)

    const content = fs.readFileSync(path.join(repoRoot, 'a.txt'), 'utf8').replace(/\r\n/g, '\n')
    assert.match(content, /line 2\nline 3\n/)
    assert.doesNotMatch(content, /line 2 discard/)
    const workingDiff = runGit(repoRoot, ['diff', '--', 'a.txt'])
    assert.match(workingDiff, /-line 12/)
    assert.doesNotMatch(workingDiff, /line 2 discard/)
  })
})

test('unstageGitLines reverses only an exact deterministic staged line segment', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    commitFile(repoRoot, 'a.txt', createNumberedFile(), 'expand a')

    const modified = createNumberedFile()
      .replace('line 2\n', 'line 2 staged\n')
      .replace('line 3\n', 'line 3 staged\n')
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), modified, 'utf8')

    const unstagedDiff = await getGitFileDiff(repoRoot, { filePath: 'a.txt', scope: 'unstaged' })
    const lineSegment = unstagedDiff.hunks[0]?.segments?.find((segment) => segment?.lineActionEligible)
    await stageGitLines(repoRoot, {
      filePath: 'a.txt',
      hunkId: unstagedDiff.hunks[0].id,
      startLine: lineSegment.selectableLineStart,
      endLine: lineSegment.selectableLineEnd,
    })

    const stagedDiff = await getGitFileDiff(repoRoot, { filePath: 'a.txt', scope: 'staged' })
    const stagedSegment = stagedDiff.hunks[0]?.segments?.find((segment) => segment?.lineActionEligible)
    const unstageResult = await unstageGitLines(repoRoot, {
      filePath: 'a.txt',
      hunkId: stagedDiff.hunks[0].id,
      startLine: stagedSegment.selectableLineStart,
      endLine: stagedSegment.selectableLineEnd,
    })
    assert.equal(unstageResult.ok, true)

    const cachedDiff = runGit(repoRoot, ['diff', '--cached', '--', 'a.txt'])
    const workingDiff = runGit(repoRoot, ['diff', '--', 'a.txt'])
    assert.equal(cachedDiff.trim(), '')
    assert.match(workingDiff, /line 2 staged/)
    assert.match(workingDiff, /line 3 staged/)
  })
})

test('broader subset patch generation supports deterministic staged subsets inside one changed block', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    commitFile(repoRoot, 'a.txt', createNumberedFile(8), 'expand a')

    const modified = createNumberedFile(8)
      .replace('line 2\n', 'inserted alpha\ninserted beta\ninserted gamma\nline 2\n')
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), modified, 'utf8')

    const diff = await getGitFileDiff(repoRoot, { filePath: 'a.txt', scope: 'unstaged' })
    const subsetSegment = diff.hunks[0]?.segments?.find((segment) => (
      segment?.lineActionEligible
      && segment.selectableLineStart === segment.selectableLineEnd
    ))
    assert.equal(Boolean(subsetSegment), true)

    const stageResult = await stageGitLines(repoRoot, {
      filePath: 'a.txt',
      hunkId: diff.hunks[0].id,
      startLine: subsetSegment.selectableLineStart,
      endLine: subsetSegment.selectableLineEnd,
    })
    assert.equal(stageResult.ok, true)

    const cachedDiff = runGit(repoRoot, ['diff', '--cached', '--', 'a.txt'])
    const workingDiff = runGit(repoRoot, ['diff', '--', 'a.txt'])
    assert.match(cachedDiff, /\+inserted /)
    assert.equal((cachedDiff.match(/\+inserted /g) || []).length, 1)
    assert.equal((workingDiff.match(/\+inserted /g) || []).length, 2)
  })
})

test('getGitRepositoryStatus marks renamed files explicitly', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    runGit(repoRoot, ['mv', 'a.txt', 'renamed.txt'])

    const status = await getGitRepositoryStatus(repoRoot)
    const entry = status.entries.find((candidate) => candidate.projectRelativePath === 'renamed.txt')
    assert.equal(entry?.isRenamed, true)
    assert.equal(entry?.previousProjectRelativePath, 'a.txt')
    assert.equal(entry?.inlineUnsupportedReason, 'rename')

    const diff = await getGitFileDiff(repoRoot, { filePath: 'renamed.txt', scope: 'staged' })
    assert.equal(diff.ok, true)
    assert.equal(diff.status, 'detail')
    assert.equal(diff.detailKind, 'rename')
    assert.equal(diff.detail?.previousProjectRelativePath, 'a.txt')
  })
})

test('getGitRepositoryStatus marks binary files as unsupported', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    fs.writeFileSync(path.join(repoRoot, 'image.bin'), Buffer.from([0, 159, 146, 150, 0, 13, 10]))
    commitAll(repoRoot, 'add binary')
    fs.writeFileSync(path.join(repoRoot, 'image.bin'), Buffer.from([1, 2, 3, 4, 5, 6, 7]))

    const status = await getGitRepositoryStatus(repoRoot)
    const entry = status.entries.find((candidate) => candidate.projectRelativePath === 'image.bin')
    assert.equal(entry?.isBinary, true)
    assert.equal(entry?.unsupportedReason, 'binary_file')

    const diff = await getGitFileDiff(repoRoot, { filePath: 'image.bin', scope: 'unstaged' })
    assert.equal(diff.ok, true)
    assert.equal(diff.status, 'detail')
    assert.equal(diff.detailKind, 'binary_file')
  })
})

test('getGitRepositoryStatus marks submodule changes as unsupported', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    const submoduleOrigin = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-submodule-origin-'))
    try {
      runGit(submoduleOrigin, ['init'])
      runGit(submoduleOrigin, ['config', 'user.email', 'test@addom.local'])
      runGit(submoduleOrigin, ['config', 'user.name', 'ADDOM Test'])
      fs.writeFileSync(path.join(submoduleOrigin, 'nested.txt'), 'nested\n', 'utf8')
      runGit(submoduleOrigin, ['add', '.'])
      runGit(submoduleOrigin, ['commit', '-m', 'initial nested'])

      runGit(repoRoot, ['-c', 'protocol.file.allow=always', 'submodule', 'add', submoduleOrigin, 'vendor/nested'])
      commitAll(repoRoot, 'add submodule')

      fs.writeFileSync(path.join(repoRoot, 'vendor/nested/nested.txt'), 'nested changed\n', 'utf8')

      const status = await getGitRepositoryStatus(repoRoot)
      const entry = status.entries.find((candidate) => candidate.projectRelativePath === 'vendor/nested')
      assert.equal(entry?.isSubmodule, true)
      assert.equal(entry?.unsupportedReason, 'submodule')

      const diff = await getGitFileDiff(repoRoot, { filePath: 'vendor/nested', scope: 'unstaged' })
      assert.equal(diff.ok, true)
      assert.equal(diff.status, 'detail')
      assert.equal(diff.detailKind, 'submodule')
      assert.equal(Boolean(diff.detail?.indexOid), true)
    } finally {
      fs.rmSync(submoduleOrigin, { recursive: true, force: true })
    }
  })
})

test('getGitRepositoryStatus marks merge conflicts as unmerged and blocks inline diff actions', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    const baseBranch = runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).trim()
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), 'base\nshared\n', 'utf8')
    commitAll(repoRoot, 'prepare conflict base')

    runGit(repoRoot, ['checkout', '-b', 'feature/conflict'])
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), 'base\nfeature branch\n', 'utf8')
    commitAll(repoRoot, 'feature change')

    runGit(repoRoot, ['checkout', baseBranch])
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), 'base\nmain branch\n', 'utf8')
    commitAll(repoRoot, 'main change')

    try {
      runGit(repoRoot, ['merge', 'feature/conflict'])
    } catch {
      // Expected merge conflict.
    }

    const status = await getGitRepositoryStatus(repoRoot)
    const entry = status.entries.find((candidate) => candidate.projectRelativePath === 'a.txt')
    assert.equal(entry?.isConflicted, true)
    assert.equal(entry?.unsupportedReason, 'merge_conflict')

    const diff = await getGitFileDiff(repoRoot, { filePath: 'a.txt', scope: 'unstaged' })
    assert.equal(diff.ok, true)
    assert.equal(diff.status, 'detail')
    assert.equal(diff.detailKind, 'merge_conflict')
    assert.equal(Array.isArray(diff.detail?.unmergedStages), true)
    assert.equal(diff.detail.unmergedStages.length >= 2, true)
  })
})

test('getGitFileDiff returns deleted-file preview payloads for staged and unstaged deletes', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    fs.unlinkSync(path.join(repoRoot, 'a.txt'))

    const unstagedDetail = await getGitFileDiff(repoRoot, { filePath: 'a.txt', scope: 'unstaged' })
    assert.equal(unstagedDetail.ok, true)
    assert.equal(unstagedDetail.status, 'detail')
    assert.equal(unstagedDetail.detailKind, 'deleted_file')
    assert.equal(unstagedDetail.detail?.previewSource, 'index')
    assert.match(String(unstagedDetail.detail?.previewContent || ''), /hello/)

    runGit(repoRoot, ['add', '--', 'a.txt'])
    const stagedDetail = await getGitFileDiff(repoRoot, { filePath: 'a.txt', scope: 'staged' })
    assert.equal(stagedDetail.ok, true)
    assert.equal(stagedDetail.status, 'detail')
    assert.equal(stagedDetail.detail?.previewSource, 'head')
    assert.equal(stagedDetail.detail?.canUnstage, true)
  })
})

test('getGitFileDiff resolves deleted nested files after parent directory removal', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    fs.mkdirSync(path.join(repoRoot, 'nested'))
    fs.writeFileSync(path.join(repoRoot, 'nested', 'deleted.txt'), 'nested content\n', 'utf8')
    commitAll(repoRoot, 'add nested file')

    fs.rmSync(path.join(repoRoot, 'nested'), { recursive: true, force: true })

    const detail = await getGitFileDiff(repoRoot, { filePath: 'nested/deleted.txt', scope: 'unstaged' })
    assert.equal(detail.ok, true)
    assert.equal(detail.status, 'detail')
    assert.equal(detail.detailKind, 'deleted_file')
    assert.equal(detail.detail?.previewSource, 'index')
    assert.match(String(detail.detail?.previewContent || ''), /nested content/)
  })
})

test('restoreGitFile restores an unstaged deleted file from the index', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    fs.unlinkSync(path.join(repoRoot, 'a.txt'))

    const result = await restoreGitFile(repoRoot, { filePath: 'a.txt' })
    assert.equal(result.ok, true)
    assert.equal(result.action, 'restore_file')

    const content = fs.readFileSync(path.join(repoRoot, 'a.txt'), 'utf8').replace(/\r\n/g, '\n')
    assert.equal(content, 'hello\n')
    const status = runGit(repoRoot, ['status', '--short', '--', 'a.txt'])
    assert.equal(status.trim(), '')
  })
})

test('stageGitFile stages one changed file without staging adjacent worktree changes', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), 'hello\nchanged\n', 'utf8')
    fs.writeFileSync(path.join(repoRoot, 'other.txt'), 'other\n', 'utf8')

    const result = await stageGitFile(repoRoot, { filePath: 'a.txt' })
    assert.equal(result.ok, true)
    assert.equal(result.action, 'stage_file')
    assert.match(runGit(repoRoot, ['diff', '--cached', '--name-only']), /^a\.txt$/m)
    assert.doesNotMatch(runGit(repoRoot, ['diff', '--cached', '--name-only']), /other\.txt/)
    assert.match(runGit(repoRoot, ['status', '--short']), /^\?\? other\.txt$/m)
  })
})

test('unstageGitFile unstages an ordinary modified file without changing its worktree content', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    const content = 'hello\nmodified\n'
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), content, 'utf8')
    runGit(repoRoot, ['add', '--', 'a.txt'])

    const result = await unstageGitFile(repoRoot, { filePath: 'a.txt' })
    assert.equal(result.ok, true)
    assert.equal(result.action, 'unstage_file')
    assert.equal(runGit(repoRoot, ['diff', '--cached', '--name-only']).trim(), '')
    assert.match(runGit(repoRoot, ['diff', '--name-only']), /^a\.txt$/m)
    assert.equal(fs.readFileSync(path.join(repoRoot, 'a.txt'), 'utf8').replace(/\r\n/g, '\n'), content)
  })
})

test('stageGitAll and unstageGitAll mutate only the index for the whole repository', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    const content = 'hello\nmodified\n'
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), content, 'utf8')
    fs.writeFileSync(path.join(repoRoot, 'other.txt'), 'other\n', 'utf8')

    const stageResult = await stageGitAll(repoRoot)
    assert.equal(stageResult.ok, true)
    assert.equal(stageResult.action, 'stage_all')
    assert.deepEqual(
      runGit(repoRoot, ['diff', '--cached', '--name-only']).trim().split(/\r?\n/).sort(),
      ['a.txt', 'other.txt'],
    )

    const unstageResult = await unstageGitAll(repoRoot)
    assert.equal(unstageResult.ok, true)
    assert.equal(unstageResult.action, 'unstage_all')
    assert.equal(runGit(repoRoot, ['diff', '--cached', '--name-only']).trim(), '')
    assert.equal(fs.readFileSync(path.join(repoRoot, 'a.txt'), 'utf8').replace(/\r\n/g, '\n'), content)
    assert.equal(fs.readFileSync(path.join(repoRoot, 'other.txt'), 'utf8').replace(/\r\n/g, '\n'), 'other\n')
  })
})

test('unstageGitFile unstages a staged deletion without restoring the worktree file', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    fs.unlinkSync(path.join(repoRoot, 'a.txt'))
    runGit(repoRoot, ['add', '--', 'a.txt'])

    const result = await unstageGitFile(repoRoot, { filePath: 'a.txt' })
    assert.equal(result.ok, true)
    assert.equal(result.action, 'unstage_deletion')

    const cachedDiff = runGit(repoRoot, ['diff', '--cached', '--', 'a.txt'])
    const status = runGit(repoRoot, ['status', '--short', '--', 'a.txt'])
    assert.equal(cachedDiff.trim(), '')
    assert.match(status, /^ D a\.txt/m)
    assert.equal(fs.existsSync(path.join(repoRoot, 'a.txt')), false)
  })
})

test('unstageGitFile unstages a staged rename only with matching previous path metadata', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    runGit(repoRoot, ['mv', 'a.txt', 'renamed.txt'])

    const missingMetadata = await unstageGitFile(repoRoot, { filePath: 'renamed.txt' })
    assert.equal(missingMetadata.ok, false)
    assert.equal(missingMetadata.error, 'missing_previous_file_path')

    const result = await unstageGitFile(repoRoot, {
      filePath: 'renamed.txt',
      previousFilePath: 'a.txt',
    })
    assert.equal(result.ok, true)
    assert.equal(result.action, 'unstage_rename')

    const cachedDiff = runGit(repoRoot, ['diff', '--cached'])
    const status = runGit(repoRoot, ['status', '--short'])
    assert.equal(cachedDiff.trim(), '')
    assert.match(status, /^ D a\.txt/m)
    assert.match(status, /^\?\? renamed\.txt/m)
  })
})

test('commitGitStaged creates a commit from already staged changes only', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    fs.writeFileSync(path.join(repoRoot, 'a.txt'), 'hello\nstaged only\n', 'utf8')
    runGit(repoRoot, ['add', '--', 'a.txt'])

    const result = await commitGitStaged(repoRoot, { message: 'staged commit' })
    assert.equal(result.ok, true)
    assert.match(String(result.summary || ''), /staged commit/)

    const log = await gitLog(repoRoot, { max_count: 1 })
    assert.match(String(log), /staged commit/)
  })
})

test('git tools reject path traversal outside project root', { skip: !HAS_GIT }, async () => {
  await withTempRepo(async (repoRoot) => {
    await assert.rejects(
      () => gitDiff(repoRoot, { path: '../outside.txt' }),
      /escapes the project root/i,
    )
    await assert.rejects(
      () => gitCheckoutFile(repoRoot, { path: '../outside.txt' }),
      /escapes the project root/i,
    )
  })
})
