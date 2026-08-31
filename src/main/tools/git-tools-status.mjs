import fs from 'node:fs/promises'
import path from 'node:path'
import {
  canonicalizeExistingPath,
  isGitNotRepositoryError,
  normalizeGitScope,
  normalizeNewlines,
  normalizeProjectRoot,
  normalizeStatusPath,
  projectRelativePathFromRepoPath,
  runGitInCwd,
} from './git-tools-runtime.mjs'

const NULL_DEVICE_PATH = '/dev/null'

function readScopedStatusKind(code = '') {
  const normalized = String(code || ' ').slice(0, 1)
  switch (normalized) {
    case 'M': return 'modified'
    case 'A': return 'added'
    case 'D': return 'deleted'
    case 'R': return 'renamed'
    case 'C': return 'copied'
    case 'T': return 'type_changed'
    case 'U': return 'unmerged'
    case '?': return 'untracked'
    case '!': return 'ignored'
    default: return 'none'
  }
}

function buildStatusKey(entry = {}) {
  const pathPart = String(entry.repoRelativePath || '').trim()
  const previousPart = String(entry.previousRepoRelativePath || '').trim()
  return `${pathPart}::${previousPart}`
}

export async function resolveGitRepoForProject(projectRoot) {
  const normalizedProjectRoot = normalizeProjectRoot(projectRoot)
  const probeRun = await runGitInCwd(normalizedProjectRoot, ['rev-parse', '--show-toplevel'], 'rev-parse')
  if (!probeRun.ok) {
    if (isGitNotRepositoryError(probeRun.error)) {
      return {
        ok: true,
        insideWorkTree: false,
        repoRoot: '',
        projectRoot: normalizedProjectRoot,
      }
    }
    return {
      ok: false,
      error: 'git_repo_probe_failed',
      message: probeRun.error,
    }
  }

  const [canonicalProjectRoot, canonicalRepoRoot] = await Promise.all([
    canonicalizeExistingPath(normalizedProjectRoot),
    canonicalizeExistingPath(String(probeRun.stdout || '').trim()),
  ])
  return {
    ok: true,
    insideWorkTree: true,
    repoRoot: canonicalRepoRoot,
    projectRoot: canonicalProjectRoot,
  }
}

function parsePorcelainStatusOutput(output = '') {
  const parts = String(output || '').split('\0')
  const entries = []

  for (let index = 0; index < parts.length; index += 1) {
    const rawEntry = parts[index]
    if (!rawEntry || rawEntry.length < 3) continue

    const stagedCode = rawEntry[0]
    const unstagedCode = rawEntry[1]
    const repoRelativePath = normalizeStatusPath(rawEntry.slice(3))
    let previousRepoRelativePath = ''

    if ((stagedCode === 'R' || stagedCode === 'C') && parts[index + 1]) {
      previousRepoRelativePath = normalizeStatusPath(parts[index + 1])
      index += 1
    }

    entries.push({
      stagedCode,
      unstagedCode,
      repoRelativePath,
      previousRepoRelativePath,
      isUntracked: stagedCode === '?' && unstagedCode === '?',
      isIgnored: stagedCode === '!' && unstagedCode === '!',
      isConflicted: stagedCode === 'U'
        || unstagedCode === 'U'
        || ['A', 'D'].includes(stagedCode) && ['A', 'D'].includes(unstagedCode),
      isRenamed: stagedCode === 'R' || unstagedCode === 'R',
      isCopied: stagedCode === 'C' || unstagedCode === 'C',
    })
  }

  return entries
}

function parseNumstatBinaryPaths(output = '') {
  const binaryPaths = new Set()
  const lines = normalizeNewlines(output).split('\n')
  for (const line of lines) {
    const trimmed = String(line || '').trim()
    if (!trimmed) continue
    const parts = trimmed.split('\t')
    if (parts.length < 3) continue
    if (parts[0] !== '-' || parts[1] !== '-') continue
    const repoRelativePath = normalizeStatusPath(parts.slice(2).join('\t'))
    if (repoRelativePath) {
      binaryPaths.add(repoRelativePath)
    }
  }
  return binaryPaths
}

function normalizeNumstatPath(value = '') {
  const normalized = normalizeStatusPath(value)
  if (!normalized.includes(' => ')) return normalized

  const braceMatch = normalized.match(/^(.*)\{([^{}]+) => ([^{}]+)\}(.*)$/)
  if (braceMatch) {
    return normalizeStatusPath(`${braceMatch[1]}${braceMatch[3]}${braceMatch[4]}`)
  }

  const plainMatch = normalized.match(/^(.+?) => (.+)$/)
  if (plainMatch) {
    return normalizeStatusPath(plainMatch[2])
  }

  return normalized
}

function parseNumstatLineStats(output = '') {
  const statsByPath = new Map()
  const lines = normalizeNewlines(output).split('\n')
  for (const line of lines) {
    const trimmed = String(line || '').trim()
    if (!trimmed) continue
    const parts = trimmed.split('\t')
    if (parts.length < 3) continue

    const pathPart = normalizeNumstatPath(parts.slice(2).join('\t'))
    if (!pathPart) continue

    const isBinary = parts[0] === '-' || parts[1] === '-'
    const nextStats = {
      addedLines: isBinary ? 0 : Math.max(0, Number(parts[0] || 0) || 0),
      deletedLines: isBinary ? 0 : Math.max(0, Number(parts[1] || 0) || 0),
      isBinary,
    }
    statsByPath.set(pathPart, nextStats)
  }
  return statsByPath
}

function parseSubmodulePaths(output = '') {
  const submodulePaths = new Set()
  const lines = normalizeNewlines(output).split('\n')
  for (const line of lines) {
    const trimmed = String(line || '').trim()
    if (!trimmed) continue
    const [meta, ...rest] = trimmed.split('\t')
    const repoRelativePath = normalizeStatusPath(rest.join('\t'))
    if (!repoRelativePath) continue
    if (String(meta || '').startsWith('160000 ')) {
      submodulePaths.add(repoRelativePath)
    }
  }
  return submodulePaths
}

function parseLsFilesStageOutput(output = '') {
  const entries = []
  const lines = normalizeNewlines(output).split('\n')
  for (const line of lines) {
    const trimmed = String(line || '').trim()
    if (!trimmed) continue
    const match = trimmed.match(/^(\d{6}) ([0-9a-f]{40}) (\d)\t(.+)$/i)
    if (!match) continue
    entries.push({
      mode: match[1],
      oid: match[2],
      stage: Number(match[3]),
      repoRelativePath: normalizeStatusPath(match[4]),
    })
  }
  return entries
}

export async function readStageEntriesForRepoPath(repoRoot, repoRelativePath = '') {
  const normalizedPath = String(repoRelativePath || '').trim()
  if (!normalizedPath) return []
  const run = await runGitInCwd(repoRoot, ['ls-files', '--stage', '--', normalizedPath], 'ls-files')
  if (!run.ok) return []
  return parseLsFilesStageOutput(run.stdout)
}

export async function readUnmergedStageEntriesForRepoPath(repoRoot, repoRelativePath = '') {
  const normalizedPath = String(repoRelativePath || '').trim()
  if (!normalizedPath) return []
  const run = await runGitInCwd(repoRoot, ['ls-files', '-u', '--', normalizedPath], 'ls-files')
  if (!run.ok) return []
  return parseLsFilesStageOutput(run.stdout)
}

export async function readGitBlobContent(repoRoot, spec = '') {
  const normalizedSpec = String(spec || '').trim()
  if (!normalizedSpec) return { ok: false, error: 'missing_blob_spec', message: 'A git blob spec is required.' }
  const run = await runGitInCwd(repoRoot, ['show', normalizedSpec], 'show')
  if (!run.ok) {
    return {
      ok: false,
      error: 'git_show_failed',
      message: run.error,
    }
  }
  return {
    ok: true,
    content: normalizeNewlines(String(run.stdout || '')),
  }
}

export async function readWorktreeFileContent(absolutePath = '') {
  try {
    const content = await fs.readFile(String(absolutePath || ''), 'utf8')
    return {
      ok: true,
      content: normalizeNewlines(content),
    }
  } catch (error) {
    return {
      ok: false,
      error: 'file_read_failed',
      message: String(error?.message || error || 'file_read_failed'),
    }
  }
}

export function buildUntrackedFileDiffText(repoRelativePath = '', content = '') {
  const normalizedPath = String(repoRelativePath || '').replace(/\\/g, '/').trim()
  const normalizedContent = normalizeNewlines(String(content || ''))
  if (!normalizedPath || !normalizedContent) return ''

  const lines = normalizedContent.endsWith('\n')
    ? normalizedContent.slice(0, -1).split('\n')
    : normalizedContent.split('\n')
  const lineCount = lines.length
  if (lineCount === 0) return ''

  return [
    `diff --git a/${normalizedPath} b/${normalizedPath}`,
    'new file mode 100644',
    'index 00000000..00000000',
    `--- ${NULL_DEVICE_PATH}`,
    `+++ b/${normalizedPath}`,
    `@@ -0,0 +1,${lineCount} @@`,
    ...lines.map((line) => `+${line}`),
    ...(normalizedContent.endsWith('\n') ? [] : ['\\ No newline at end of file']),
  ].join('\n')
}

export async function statWorktreeFile(absolutePath = '') {
  try {
    const stat = await fs.stat(String(absolutePath || ''))
    return {
      ok: true,
      size: Number(stat.size || 0) || 0,
      isFile: stat.isFile?.() === true,
      isDirectory: stat.isDirectory?.() === true,
    }
  } catch {
    return {
      ok: false,
      size: 0,
      isFile: false,
      isDirectory: false,
    }
  }
}

async function pathExists(inputPath = '') {
  try {
    await fs.stat(String(inputPath || ''))
    return true
  } catch {
    return false
  }
}

export async function resolveExistingGitProbeCwd(projectRoot, absolutePath = '') {
  const boundary = normalizeProjectRoot(projectRoot)
  let current = path.dirname(path.resolve(String(absolutePath || boundary)))

  while (true) {
    const relativeToBoundary = path.relative(boundary, current)
    if (relativeToBoundary.startsWith('..') || path.isAbsolute(relativeToBoundary)) {
      return boundary
    }
    if (await pathExists(current)) return current
    if (current === boundary) return boundary
    const parent = path.dirname(current)
    if (parent === current) return boundary
    current = parent
  }
}

export async function readSubmoduleStatusSummary(repoRoot, repoRelativePath = '') {
  const normalizedPath = String(repoRelativePath || '').trim()
  if (!normalizedPath) return null
  const run = await runGitInCwd(repoRoot, ['submodule', 'status', '--', normalizedPath], 'submodule')
  if (!run.ok) return null
  const line = String(run.stdout || '').trim().split('\n')[0] || ''
  const match = line.match(/^([ +\-U]?)([0-9a-f]{40})\s+([^\s]+)(?:\s+\((.+)\))?$/i)
  if (!match) return null
  const prefix = match[1] || ' '
  return {
    path: normalizeStatusPath(match[3]),
    oid: match[2],
    summary: String(match[4] || '').trim(),
    statusPrefix: prefix,
    isDirty: prefix === '+',
    isUninitialized: prefix === '-',
    hasMergeConflict: prefix === 'U',
  }
}

async function readBinaryPathSet(repoRoot, scope, repoPaths = []) {
  const normalizedPaths = Array.isArray(repoPaths) ? repoPaths.filter(Boolean) : []
  if (normalizedPaths.length === 0) return new Set()
  const args = ['diff', '--numstat']
  if (normalizeGitScope(scope) === 'staged') args.push('--cached')
  args.push('--', ...normalizedPaths)
  const run = await runGitInCwd(repoRoot, args, 'diff')
  if (!run.ok) return new Set()
  return parseNumstatBinaryPaths(run.stdout)
}

async function readSubmodulePathSet(repoRoot, repoPaths = []) {
  const normalizedPaths = Array.isArray(repoPaths) ? repoPaths.filter(Boolean) : []
  if (normalizedPaths.length === 0) return new Set()
  const run = await runGitInCwd(repoRoot, ['ls-files', '--stage', '--', ...normalizedPaths], 'ls-files')
  if (!run.ok) return new Set()
  return parseSubmodulePaths(run.stdout)
}

async function readScopedNumstatMap(repoRoot, scope, repoPaths = []) {
  const normalizedPaths = Array.isArray(repoPaths) ? repoPaths.filter(Boolean) : []
  if (normalizedPaths.length === 0) return new Map()
  const args = ['diff', '--numstat']
  if (normalizeGitScope(scope) === 'staged') args.push('--cached')
  args.push('--', ...normalizedPaths)
  const run = await runGitInCwd(repoRoot, args, 'diff')
  if (!run.ok) return new Map()
  return parseNumstatLineStats(run.stdout)
}

export async function collectGitStatusEntries(projectRoot, repoInfo) {
  const statusRun = await runGitInCwd(
    repoInfo.repoRoot,
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    'status',
  )
  if (!statusRun.ok) {
    return {
      ok: false,
      error: 'git_status_failed',
      message: statusRun.error,
    }
  }

  const rawEntries = parsePorcelainStatusOutput(statusRun.stdout)
    .filter((entry) => entry.isIgnored !== true)

  const repoPaths = Array.from(new Set(
    rawEntries
      .flatMap((entry) => [entry.repoRelativePath, entry.previousRepoRelativePath])
      .filter(Boolean),
  ))

  const [stagedBinaryPaths, unstagedBinaryPaths, submodulePaths, stagedNumstat, unstagedNumstat] = await Promise.all([
    readBinaryPathSet(repoInfo.repoRoot, 'staged', repoPaths),
    readBinaryPathSet(repoInfo.repoRoot, 'unstaged', repoPaths),
    readSubmodulePathSet(repoInfo.repoRoot, repoPaths),
    readScopedNumstatMap(repoInfo.repoRoot, 'staged', repoPaths),
    readScopedNumstatMap(repoInfo.repoRoot, 'unstaged', repoPaths),
  ])

  const entries = rawEntries
    .map((entry) => {
      const projectRelativePath = projectRelativePathFromRepoPath(
        repoInfo.projectRoot,
        repoInfo.repoRoot,
        entry.repoRelativePath,
      )
      const previousProjectRelativePath = projectRelativePathFromRepoPath(
        repoInfo.projectRoot,
        repoInfo.repoRoot,
        entry.previousRepoRelativePath,
      )
      if (!projectRelativePath && !previousProjectRelativePath) return null

      const preferredRepoRelativePath = entry.repoRelativePath || entry.previousRepoRelativePath
      const preferredProjectRelativePath = projectRelativePath || previousProjectRelativePath
      const stagedKind = readScopedStatusKind(entry.stagedCode)
      const unstagedKind = readScopedStatusKind(entry.unstagedCode)
      const hasStagedChanges = !entry.isUntracked && stagedKind !== 'none' && stagedKind !== 'ignored'
      const hasUnstagedChanges = entry.isUntracked || (unstagedKind !== 'none' && unstagedKind !== 'ignored')
      const isSubmodule = submodulePaths.has(entry.repoRelativePath) || submodulePaths.has(entry.previousRepoRelativePath)
      const isBinary = stagedBinaryPaths.has(entry.repoRelativePath)
        || stagedBinaryPaths.has(entry.previousRepoRelativePath)
        || unstagedBinaryPaths.has(entry.repoRelativePath)
        || unstagedBinaryPaths.has(entry.previousRepoRelativePath)
      const unsupportedReason = entry.isConflicted
        ? 'merge_conflict'
        : isBinary
          ? 'binary_file'
          : isSubmodule
            ? 'submodule'
            : ''
      const inlineUnsupportedReason = unsupportedReason
        || (entry.isRenamed || entry.isCopied ? 'rename' : '')
        || (stagedKind === 'deleted' || unstagedKind === 'deleted' ? 'deleted_file' : '')
      const stagedLineStats = stagedNumstat.get(entry.repoRelativePath)
        || stagedNumstat.get(entry.previousRepoRelativePath)
        || null
      const unstagedLineStats = unstagedNumstat.get(entry.repoRelativePath)
        || unstagedNumstat.get(entry.previousRepoRelativePath)
        || null

      return {
        key: buildStatusKey({
          repoRelativePath: preferredRepoRelativePath,
          previousRepoRelativePath: entry.previousRepoRelativePath,
        }),
        repoRelativePath: preferredRepoRelativePath,
        previousRepoRelativePath: entry.previousRepoRelativePath,
        projectRelativePath: preferredProjectRelativePath,
        previousProjectRelativePath,
        preferredProjectRelativePath,
        stagedCode: entry.stagedCode,
        unstagedCode: entry.unstagedCode,
        stagedKind,
        unstagedKind,
        hasStagedChanges,
        hasUnstagedChanges,
        isUntracked: entry.isUntracked,
        isIgnored: entry.isIgnored,
        isConflicted: entry.isConflicted,
        isRenamed: entry.isRenamed,
        isCopied: entry.isCopied,
        isDeleted: stagedKind === 'deleted' || unstagedKind === 'deleted',
        isBinary,
        isSubmodule,
        unsupportedReason,
        inlineUnsupportedReason,
        stagedAddedLines: Math.max(0, Number(stagedLineStats?.addedLines || 0) || 0),
        stagedDeletedLines: Math.max(0, Number(stagedLineStats?.deletedLines || 0) || 0),
        unstagedAddedLines: Math.max(0, Number(unstagedLineStats?.addedLines || 0) || 0),
        unstagedDeletedLines: Math.max(0, Number(unstagedLineStats?.deletedLines || 0) || 0),
      }
    })
    .filter(Boolean)
    .sort((left, right) => String(left.projectRelativePath || '').localeCompare(String(right.projectRelativePath || '')))

  const totals = entries.reduce((acc, entry) => {
    if (entry.hasStagedChanges) acc.staged += 1
    if (entry.hasUnstagedChanges) acc.unstaged += 1
    if (entry.isConflicted) acc.conflicted += 1
    if (entry.unsupportedReason) acc.unsupported += 1
    return acc
  }, {
    staged: 0,
    unstaged: 0,
    conflicted: 0,
    unsupported: 0,
  })

  return {
    ok: true,
    entries,
    totals,
  }
}

export function findStatusEntryForRepoPath(entries = [], repoRelativePath = '') {
  const normalizedPath = String(repoRelativePath || '').trim()
  if (!normalizedPath) return null
  return entries.find((entry) => (
    entry?.repoRelativePath === normalizedPath
    || entry?.previousRepoRelativePath === normalizedPath
  )) || null
}
