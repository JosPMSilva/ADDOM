import { createHash } from 'node:crypto'
import { constants as fsConstants, promises as fs } from 'node:fs'
import path from 'node:path'

import { runGitInCwd } from '../../tools/git-tools-runtime.mjs'
import { resolveOwnedWorkspacePath } from './agent-workspace-cleanup.mjs'
import { assertWorkspaceSymlinksOwned } from './agent-workspace-path-safety.mjs'

function splitNull(value) {
  return String(value || '').split('\0').map((entry) => entry.trim()).filter(Boolean)
}

function assertProjectInsideRepo(projectRoot, repoRoot) {
  const relative = path.relative(repoRoot, projectRoot)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new TypeError('Project root must stay inside its Git repository')
  }
  return relative
}

async function copyPath(source, target) {
  const stat = await fs.lstat(source).catch((error) => {
    if (error?.code === 'ENOENT') return null
    throw error
  })
  if (!stat) {
    await fs.rm(target, { recursive: true, force: true })
    return
  }
  await fs.mkdir(path.dirname(target), { recursive: true })
  if (stat.isSymbolicLink()) {
    const link = await fs.readlink(source)
    await fs.rm(target, { recursive: true, force: true })
    await fs.symlink(link, target)
    return
  }
  if (stat.isDirectory()) {
    await fs.cp(source, target, {
      recursive: true,
      force: true,
      mode: fsConstants.COPYFILE_FICLONE,
    })
    return
  }
  await fs.copyFile(source, target, fsConstants.COPYFILE_FICLONE)
}

async function listDirtyPaths(repoRoot) {
  const [tracked, untracked] = await Promise.all([
    runGitInCwd(repoRoot, ['diff', '--name-only', '--no-renames', '-z', 'HEAD', '--'], 'diff'),
    runGitInCwd(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z'], 'ls-files'),
  ])
  if (!tracked.ok) throw new Error(tracked.error)
  if (!untracked.ok) throw new Error(untracked.error)
  return [...new Set([...splitNull(tracked.stdout), ...splitNull(untracked.stdout)])]
}

async function copyDirtyProjectSnapshot({
  repoRoot,
  worktreeRoot,
  projectRelativePath,
}) {
  const projectPrefix = projectRelativePath
    ? `${projectRelativePath.split(path.sep).join('/')}/`
    : ''
  const dirtyPaths = await listDirtyPaths(repoRoot)
  for (const repoPath of dirtyPaths) {
    const normalized = repoPath.replaceAll('\\', '/')
    if (
      projectPrefix
      && normalized !== projectRelativePath.replaceAll('\\', '/')
      && !normalized.startsWith(projectPrefix)
    ) continue
    const source = path.resolve(repoRoot, ...normalized.split('/'))
    const target = path.resolve(worktreeRoot, ...normalized.split('/'))
    const sourceRelative = path.relative(repoRoot, source)
    const targetRelative = path.relative(worktreeRoot, target)
    if (
      sourceRelative.startsWith('..')
      || targetRelative.startsWith('..')
      || path.isAbsolute(sourceRelative)
      || path.isAbsolute(targetRelative)
    ) {
      throw new TypeError('Git snapshot path escaped the owned repository')
    }
    await copyPath(source, target)
  }
}

export function createAgentWorktreeManager({
  storageRoot,
  runGit = runGitInCwd,
} = {}) {
  const root = path.resolve(String(storageRoot || '').trim() || '.')

  async function probe(projectRootInput) {
    const projectRoot = path.resolve(String(projectRootInput || '').trim() || '.')
    const rootStat = await fs.stat(projectRoot).catch(() => null)
    if (!rootStat?.isDirectory()) {
      return { eligible: false, reason: 'missing_project_root', projectRoot }
    }
    const repoResult = await runGit(projectRoot, ['rev-parse', '--show-toplevel'], 'rev-parse')
    if (!repoResult.ok) {
      return { eligible: false, reason: 'not_a_git_repository', projectRoot }
    }
    const [canonicalProjectRoot, repoRoot] = await Promise.all([
      fs.realpath(projectRoot),
      fs.realpath(path.resolve(String(repoResult.stdout || '').trim())),
    ])
    const projectRelativePath = assertProjectInsideRepo(canonicalProjectRoot, repoRoot)
    const head = await runGit(repoRoot, ['rev-parse', 'HEAD'], 'rev-parse')
    if (!head.ok || !/^[a-f0-9]{40}$/iu.test(String(head.stdout || '').trim())) {
      return { eligible: false, reason: 'missing_base_revision', projectRoot, repoRoot }
    }
    const status = await runGit(
      repoRoot,
      ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
      'status',
    )
    if (!status.ok) throw new Error(status.error)
    const headRevision = String(head.stdout || '').trim()
    const dirtyHash = status.stdout
      ? createHash('sha256').update(String(status.stdout)).digest('hex')
      : ''
    return {
      eligible: true,
      projectRoot: canonicalProjectRoot,
      repoRoot,
      projectRelativePath,
      headRevision,
      baseRevision: dirtyHash
        ? `git:${headRevision}+dirty:${dirtyHash}`
        : `git:${headRevision}`,
    }
  }

  async function create({ workspaceId, projectRoot }) {
    const source = await probe(projectRoot)
    if (!source.eligible) {
      throw new TypeError(`Git worktree is unavailable: ${source.reason}`)
    }
    await fs.mkdir(root, { recursive: true })
    const workspaceRoot = resolveOwnedWorkspacePath(root, workspaceId)
    const existing = await fs.stat(workspaceRoot).catch(() => null)
    if (existing) throw new TypeError(`Workspace root already exists: ${workspaceRoot}`)
    const add = await runGit(
      source.repoRoot,
      ['worktree', 'add', '--detach', workspaceRoot, source.headRevision],
      'worktree add',
    )
    if (!add.ok) throw new Error(add.error)
    const projectViewRoot = source.projectRelativePath
      ? path.join(workspaceRoot, source.projectRelativePath)
      : workspaceRoot
    try {
      if (source.baseRevision.includes('+dirty:')) {
        await copyDirtyProjectSnapshot({
          repoRoot: source.repoRoot,
          worktreeRoot: workspaceRoot,
          projectRelativePath: source.projectRelativePath,
        })
      }
      await assertWorkspaceSymlinksOwned(projectViewRoot)
    } catch (error) {
      await runGit(source.repoRoot, ['worktree', 'remove', '--force', workspaceRoot], 'worktree remove')
      throw error
    }
    return {
      sourceRoot: source.projectRoot,
      repoRoot: source.repoRoot,
      workspaceRoot,
      projectViewRoot,
      baseRevision: source.baseRevision,
    }
  }

  async function remove(workspace) {
    const workspaceRoot = path.resolve(String(workspace?.workspaceRoot || '').trim() || '.')
    const relative = path.relative(root, workspaceRoot)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new TypeError('Worktree removal target is not an owned workspace root')
    }
    const repoRoot = path.resolve(String(workspace?.ownership?.repoRoot || '').trim() || '.')
    const removeResult = await runGit(
      repoRoot,
      ['worktree', 'remove', '--force', workspaceRoot],
      'worktree remove',
    )
    if (!removeResult.ok) {
      await fs.rm(workspaceRoot, { recursive: true, force: true })
    }
    await runGit(repoRoot, ['worktree', 'prune'], 'worktree prune')
    return { removed: true, workspaceRoot }
  }

  return Object.freeze({ create, probe, remove, storageRoot: root })
}
