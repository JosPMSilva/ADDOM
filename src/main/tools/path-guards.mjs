import fs from 'node:fs'
import path from 'node:path'

function assertNoNullBytes(input = '') {
  if (String(input ?? '').includes('\0')) {
    throw new Error('Path contains null bytes. Access denied.')
  }
}

function normalizeAbsolutePath(input = '') {
  assertNoNullBytes(input)
  return path.resolve(String(input ?? ''))
}

function normalizeForComparison(input = '') {
  const resolved = normalizeAbsolutePath(input)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function isWithinRoot(rootPath, candidatePath) {
  const rel = path.relative(rootPath, candidatePath)
  if (!rel) return true
  return !rel.startsWith('..') && !path.isAbsolute(rel)
}

function realpathIfExists(targetPath) {
  try {
    if (typeof fs.realpathSync.native === 'function') {
      return fs.realpathSync.native(targetPath)
    }
    return fs.realpathSync(targetPath)
  } catch (error) {
    const code = String(error?.code || '')
    if (code === 'ENOENT' || code === 'ENOTDIR') return ''
    throw error
  }
}

function resolveRealPathFromNearestExistingAncestor(targetPath) {
  const requestedAbs = normalizeAbsolutePath(targetPath)
  let current = requestedAbs

  while (true) {
    const realCurrent = realpathIfExists(current)
    if (realCurrent) {
      const suffix = path.relative(current, requestedAbs)
      return suffix ? path.resolve(realCurrent, suffix) : realCurrent
    }
    const parent = path.dirname(current)
    if (parent === current) return requestedAbs
    current = parent
  }
}

export function classifyPathAccess(projectRoot, filePath) {
  const logicalRoot = normalizeAbsolutePath(projectRoot)
  assertNoNullBytes(filePath)
  const abs = path.resolve(logicalRoot, String(filePath ?? ''))
  const withinLogicalRoot = isWithinRoot(logicalRoot, abs)
  const realRoot = realpathIfExists(logicalRoot) || logicalRoot
  const realTarget = resolveRealPathFromNearestExistingAncestor(abs)
  const withinRealRoot = isWithinRoot(realRoot, realTarget)

  return {
    projectRoot: logicalRoot,
    requestedPath: String(filePath ?? ''),
    absolutePath: abs,
    realProjectRoot: realRoot,
    realTargetPath: realTarget,
    withinLogicalRoot,
    withinRealRoot,
    escapesProjectRoot: !withinLogicalRoot,
    escapesProjectRootViaSymlink: withinLogicalRoot && !withinRealRoot,
  }
}

/**
 * Resolve a user-supplied path relative to projectRoot and verify
 * it doesn't escape the project folder.
 */
export function safePath(projectRoot, filePath, options = {}) {
  const access = classifyPathAccess(projectRoot, filePath)
  if (options?.allowOutsideProjectRoot === true) return access.absolutePath
  if (!access.withinLogicalRoot) {
    throw new Error(`Path "${filePath}" escapes the project root. Access denied.`)
  }
  if (!access.withinRealRoot) {
    throw new Error(`Path "${filePath}" resolves outside the project root via symlink. Access denied.`)
  }
  return access.absolutePath
}

export function sameProjectRoot(a, b) {
  const left = realpathIfExists(a) || normalizeAbsolutePath(a)
  const right = realpathIfExists(b) || normalizeAbsolutePath(b)
  return normalizeForComparison(left) === normalizeForComparison(right)
}
