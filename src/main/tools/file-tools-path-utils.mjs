import path from 'node:path'

import { safePath } from './path-guards.mjs'

const MAX_PATH_SEGMENTS = 40
const MAX_PATH_SEGMENT_LENGTH = 120
const CAPABILITY_CATALOG_VIRTUAL_ROOT = 'addom://capabilities'

export function isCapabilityCatalogVirtualPath(value = '') {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .toLowerCase()
  return normalized === CAPABILITY_CATALOG_VIRTUAL_ROOT
    || normalized.startsWith(`${CAPABILITY_CATALOG_VIRTUAL_ROOT}/`)
    || normalized === 'addom:/capabilities'
    || normalized.startsWith('addom:/capabilities/')
}

export function hasHostFileAccess(options = {}) {
  return options?.fileSystemHostFullAccess === true
}

export function resolveToolPath(projectRoot, filePath, options = {}) {
  if (isCapabilityCatalogVirtualPath(filePath)) {
    throw new Error('addom://capabilities is a virtual catalog path. Use read_file or search_code for catalog reads; write and filesystem tools cannot modify it.')
  }
  return safePath(projectRoot, filePath, {
    allowOutsideProjectRoot: hasHostFileAccess(options),
  })
}

export function isPathWithinProjectRoot(projectRoot, targetPath) {
  const root = path.resolve(String(projectRoot || '.'))
  const target = path.resolve(String(targetPath || '.'))
  const rel = path.relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export function clampInt(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export async function statIfExists(fs, absPath) {
  try {
    return await fs.stat(absPath)
  } catch (error) {
    const code = String(error?.code || '')
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw error
  }
}

export async function lstatIfExists(fs, absPath) {
  try {
    return await fs.lstat(absPath)
  } catch (error) {
    const code = String(error?.code || '')
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw error
  }
}

export async function ensureNotSymlink(fs, absPath, operation = 'access') {
  const stat = await lstatIfExists(fs, absPath)
  if (stat?.isSymbolicLink()) {
    throw new Error(`Refusing to ${operation} through a symbolic link.`)
  }
  return stat
}

export async function writeFileAtomic(fs, absPath, content) {
  const tempPath = `${absPath}.addom-tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  try {
    await fs.writeFile(tempPath, content, 'utf8')
    await fs.rename(tempPath, absPath)
  } catch (error) {
    try { await fs.unlink(tempPath) } catch { /* best-effort temp file cleanup after atomic write failure */ }
    throw error
  }
}

export function toPosixRel(relPath) {
  return String(relPath || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
}

export function formatDisplayPath(projectRoot, targetPath) {
  if (!targetPath) return ''
  if (isPathWithinProjectRoot(projectRoot, targetPath)) {
    return toPosixRel(path.relative(projectRoot, targetPath)) || '.'
  }
  return path.normalize(targetPath)
}

export function sortDirEntries(entries = []) {
  return [...entries].sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function isSymbolicLinkEntry(entry) {
  return !!(entry && typeof entry.isSymbolicLink === 'function' && entry.isSymbolicLink())
}

export async function ensureNoSymlinkSegments(fs, projectRoot, relPath, operation = 'access', options = {}) {
  if (hasHostFileAccess(options)) return
  const rootAbs = resolveToolPath(projectRoot, '', options)
  const parts = String(relPath ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
  let current = rootAbs
  for (const part of parts) {
    current = path.join(current, part)
    const stat = await lstatIfExists(fs, current)
    if (!stat) return
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to ${operation} through a symbolic link.`)
    }
  }
}

export function validatePathShape(relPath, label = 'path') {
  const raw = String(relPath ?? '').trim()
  if (!raw) throw new Error(`${label} is required.`)
  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length > MAX_PATH_SEGMENTS) {
    throw new Error(`${label} has too many nested segments (${parts.length}). Maximum is ${MAX_PATH_SEGMENTS}.`)
  }
  for (const part of parts) {
    if (part.length > MAX_PATH_SEGMENT_LENGTH) {
      throw new Error(`${label} has a segment longer than ${MAX_PATH_SEGMENT_LENGTH} characters.`)
    }
  }
}
