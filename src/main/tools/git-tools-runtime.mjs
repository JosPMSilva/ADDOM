import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const DEFAULT_GIT_TIMEOUT_MS = 15_000
const MAX_GIT_OUTPUT_CHARS = 120_000
const MAX_GIT_BUFFER_BYTES = 2 * 1024 * 1024

export const GIT_FILE_DIFF_CONTEXT_LINES = 3

export function normalizeNewlines(value = '') {
  return String(value || '').replace(/\r\n/g, '\n')
}

export function normalizeProjectRoot(projectRoot) {
  const root = String(projectRoot || '').trim()
  if (!root) throw new Error('Project root is required.')
  return path.resolve(root)
}

export async function canonicalizeExistingPath(inputPath = '') {
  const resolved = path.resolve(String(inputPath || '').trim() || '.')
  try {
    return await fs.realpath(resolved)
  } catch {
    return resolved
  }
}

export function normalizeRepoPath(projectRoot, targetPath = '.') {
  const root = normalizeProjectRoot(projectRoot)
  const raw = String(targetPath || '').trim() || '.'
  const abs = path.resolve(root, raw)
  const rel = path.relative(root, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path "${targetPath}" escapes the project root.`)
  }
  return rel ? rel.split(path.sep).join('/') : '.'
}

export function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

export function trimOutput(value, maxChars = MAX_GIT_OUTPUT_CHARS) {
  const text = String(value || '')
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n...[truncated]`
}

export function normalizeRepoPaths(projectRoot, rawPaths) {
  if (!Array.isArray(rawPaths)) return []
  const out = []
  const seen = new Set()
  for (const item of rawPaths) {
    const next = normalizeRepoPath(projectRoot, item)
    if (!next || next === '.') continue
    const key = next.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(next)
  }
  return out
}

export function normalizeCommitMessage(message) {
  const text = String(message || '').trim()
  if (!text) throw new Error('Commit message is required.')
  if (text.length > 300) throw new Error('Commit message is too long (max 300 chars).')
  return text
}

export function normalizeRef(inputRef = 'HEAD') {
  const ref = String(inputRef || 'HEAD').trim()
  if (!ref) return 'HEAD'
  if (ref.startsWith('-')) throw new Error('Invalid git ref.')
  if (ref.includes('\0')) throw new Error('Invalid git ref.')
  return ref
}

export function normalizeGitScope(scope = 'unstaged') {
  const normalized = String(scope || '').trim().toLowerCase()
  return normalized === 'staged' ? 'staged' : 'unstaged'
}

export function normalizeLineSelection(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.trunc(parsed))
}

export function isGitNotRepositoryError(message = '') {
  return /not a git repository/i.test(String(message || ''))
}

function toGitErrorResult(opName, err) {
  const code = String(err?.code || '').trim().toUpperCase()
  if (code === 'ENOENT') {
    return 'Git is not available on this system PATH.'
  }
  const stderr = trimOutput(String(err?.stderr || '').trim(), 12_000)
  const stdout = trimOutput(String(err?.stdout || '').trim(), 12_000)
  const message = String(err?.message || `git ${opName} failed`).trim()
  const parts = [`git ${opName} failed: ${message}`]
  if (stderr) parts.push(`stderr:\n${stderr}`)
  if (stdout) parts.push(`stdout:\n${stdout}`)
  return parts.join('\n\n')
}

async function runGitCommand(cwd, args, opName, { allowedExitCodes = [0] } = {}) {
  const normalizedCwd = path.resolve(String(cwd || '').trim() || '.')
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd: normalizedCwd,
      timeout: DEFAULT_GIT_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: MAX_GIT_BUFFER_BYTES,
    })
    return {
      ok: true,
      stdout: normalizeNewlines(trimOutput(String(stdout || '').trimEnd())),
      stderr: normalizeNewlines(trimOutput(String(stderr || '').trimEnd())),
      exitCode: 0,
    }
  } catch (err) {
    const exitCode = Number.isInteger(err?.code) ? Number(err.code) : null
    if (exitCode != null && allowedExitCodes.includes(exitCode)) {
      return {
        ok: true,
        stdout: normalizeNewlines(trimOutput(String(err?.stdout || '').trimEnd())),
        stderr: normalizeNewlines(trimOutput(String(err?.stderr || '').trimEnd())),
        exitCode,
      }
    }
    return {
      ok: false,
      error: toGitErrorResult(opName, err),
    }
  }
}

export async function runGit(projectRoot, args, opName) {
  return runGitCommand(normalizeProjectRoot(projectRoot), args, opName)
}

export async function runGitInCwd(cwd, args, opName, options = {}) {
  return runGitCommand(cwd, args, opName, options)
}

export function normalizeFileInputPath(filePath = '') {
  const normalized = String(filePath || '').trim()
  if (!normalized) throw new Error('A file path is required.')
  return normalized
}

export function resolveProjectFilePath(projectRoot, filePath = '') {
  const root = normalizeProjectRoot(projectRoot)
  const normalizedPath = normalizeFileInputPath(filePath)
  const absolutePath = path.resolve(root, normalizedPath)
  const relativePath = path.relative(root, absolutePath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Path "${filePath}" escapes the project root.`)
  }
  return {
    projectRoot: root,
    absolutePath,
    projectRelativePath: relativePath.split(path.sep).join('/'),
  }
}

export function normalizeRepoRelativePath(repoRoot, absolutePath) {
  const relativePath = path.relative(repoRoot, absolutePath)
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return ''
  }
  return relativePath.split(path.sep).join('/')
}

export function projectRelativePathFromRepoPath(projectRoot, repoRoot, repoRelativePath = '') {
  const raw = String(repoRelativePath || '').trim()
  if (!raw) return ''
  const absolutePath = path.resolve(repoRoot, raw.split('/').join(path.sep))
  const relativePath = path.relative(projectRoot, absolutePath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return ''
  }
  return relativePath.split(path.sep).join('/')
}

export function normalizeStatusPath(value = '') {
  return String(value || '').replace(/\0/g, '').replace(/\\/g, '/').trim()
}

export function resolveRepoRelativeProjectPath(projectRoot, repoRoot, filePath = '') {
  const target = resolveProjectFilePath(projectRoot, filePath)
  const repoRelativePath = normalizeRepoRelativePath(repoRoot, target.absolutePath)
  if (!repoRelativePath) {
    throw new Error(`Path "${filePath}" is not inside the git repository.`)
  }
  return {
    ...target,
    repoRelativePath,
  }
}
