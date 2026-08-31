import fs from 'node:fs/promises'
import path from 'node:path'
import { TextDecoder } from 'node:util'

export const MAX_PROJECT_DOCUMENT_BYTES = 2 * 1024 * 1024

const SUPPORTED_MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx'])

function normalizeRelativePath(value = '') {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '')
}

function errorResult(error, projectId = '', filePath = '') {
  return {
    ok: false,
    error,
    projectId: String(projectId || '').trim(),
    filePath: normalizeRelativePath(filePath),
  }
}

function isPathInside(rootPath = '', targetPath = '') {
  const relative = path.relative(rootPath, targetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function findProject(projectId = '', listProjects = () => []) {
  const normalizedId = String(projectId || '').trim()
  if (!normalizedId) return null
  const projects = typeof listProjects === 'function' ? listProjects() : []
  return (Array.isArray(projects) ? projects : []).find(
    (project) => String(project?.id || '').trim() === normalizedId,
  ) || null
}

async function resolveDocumentTarget(payload = {}, deps = {}) {
  const projectId = String(payload?.projectId || '').trim()
  const filePath = normalizeRelativePath(payload?.filePath)
  const project = findProject(projectId, deps.listProjects)
  if (!project) return errorResult('project_not_found', projectId, filePath)
  if (!filePath || path.isAbsolute(filePath) || /^[a-z]:\//i.test(filePath) || filePath.startsWith('/')) {
    return errorResult('path_not_allowed', projectId, filePath)
  }
  if (!SUPPORTED_MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return errorResult('unsupported_document_type', projectId, filePath)
  }

  let projectRoot
  try {
    projectRoot = await fs.realpath(path.resolve(String(project.path || '')))
  } catch {
    return errorResult('project_not_found', projectId, filePath)
  }

  const logicalTarget = path.resolve(projectRoot, filePath)
  if (!isPathInside(projectRoot, logicalTarget) || logicalTarget === projectRoot) {
    return errorResult('path_not_allowed', projectId, filePath)
  }

  let canonicalTarget
  try {
    canonicalTarget = await fs.realpath(logicalTarget)
  } catch (error) {
    return errorResult(
      error?.code === 'ENOENT' ? 'document_not_found' : 'document_unavailable',
      projectId,
      filePath,
    )
  }
  if (!isPathInside(projectRoot, canonicalTarget) || canonicalTarget === projectRoot) {
    return errorResult('symlink_escape', projectId, filePath)
  }

  let stat
  try {
    stat = await fs.stat(canonicalTarget)
  } catch {
    return errorResult('document_unavailable', projectId, filePath)
  }
  if (!stat.isFile()) return errorResult('document_not_found', projectId, filePath)
  if (stat.size > MAX_PROJECT_DOCUMENT_BYTES) {
    return errorResult('document_too_large', projectId, filePath)
  }

  const canonicalRelativePath = normalizeRelativePath(path.relative(projectRoot, canonicalTarget))
  return {
    ok: true,
    projectId,
    filePath: canonicalRelativePath,
    name: path.basename(canonicalTarget),
    size: stat.size,
    modifiedAt: stat.mtimeMs,
    targetPath: canonicalTarget,
  }
}

export async function readProjectDocument(payload = {}, deps = {}) {
  const resolved = await resolveDocumentTarget(payload, deps)
  if (!resolved.ok) return resolved
  try {
    const buffer = await fs.readFile(resolved.targetPath)
    if (buffer.byteLength > MAX_PROJECT_DOCUMENT_BYTES) {
      return errorResult('document_too_large', resolved.projectId, resolved.filePath)
    }
    if (buffer.includes(0)) {
      return errorResult('unsupported_document_encoding', resolved.projectId, resolved.filePath)
    }
    let content
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '')
    } catch {
      return errorResult('unsupported_document_encoding', resolved.projectId, resolved.filePath)
    }
    return {
      ok: true,
      projectId: resolved.projectId,
      filePath: resolved.filePath,
      name: resolved.name,
      size: resolved.size,
      modifiedAt: resolved.modifiedAt,
      content,
    }
  } catch {
    return errorResult('document_unavailable', resolved.projectId, resolved.filePath)
  }
}

export async function revealProjectDocument(payload = {}, deps = {}) {
  const resolved = await resolveDocumentTarget(payload, deps)
  if (!resolved.ok) return resolved
  if (typeof deps.showItemInFolder !== 'function') {
    return errorResult('reveal_unavailable', resolved.projectId, resolved.filePath)
  }
  try {
    await deps.showItemInFolder(resolved.targetPath)
  } catch {
    return errorResult('reveal_unavailable', resolved.projectId, resolved.filePath)
  }
  return {
    ok: true,
    projectId: resolved.projectId,
    filePath: resolved.filePath,
  }
}
