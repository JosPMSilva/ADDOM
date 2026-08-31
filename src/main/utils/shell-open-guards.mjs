import fs from 'node:fs/promises'
import path from 'node:path'

export const BLOCKED_ATTACHMENT_EXTENSIONS = new Set([
  '.app', '.action', '.bat', '.bash', '.bin', '.cmd', '.com', '.command', '.cpl', '.dll', '.drv',
  '.exe', '.hta', '.inf', '.js', '.jse', '.ksh', '.lnk', '.msi', '.msp', '.mst', '.ocx', '.pif',
  '.ps1', '.ps1xml', '.psd1', '.psm1', '.pssc', '.reg', '.run', '.scr', '.sh', '.sys', '.url',
  '.vbe', '.vbs', '.workflow', '.ws', '.wsf', '.wsh',
])

export const BLOCKED_ATTACHMENT_MIME_TYPES = new Set([
  'application/javascript',
  'application/x-bat',
  'application/x-cmd',
  'application/x-dosexec',
  'application/x-executable',
  'application/x-msdos-program',
  'application/x-msdownload',
  'application/x-msi',
  'application/x-powershell',
  'application/x-shellscript',
  'text/javascript',
  'text/x-shellscript',
])

function normalizeAbsolutePath(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return path.resolve(raw)
}

function sameOrInside(rootPath = '', candidatePath = '') {
  const root = normalizeAbsolutePath(rootPath)
  const candidate = normalizeAbsolutePath(candidatePath)
  if (!root || !candidate) return false

  const left = process.platform === 'win32' ? root.toLowerCase() : root
  const right = process.platform === 'win32' ? candidate.toLowerCase() : candidate
  if (left === right) return true

  const rel = path.relative(root, candidate)
  if (!rel) return true
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false
  return true
}

export async function validateOpenDirectoryPath(requestedPath, allowedProjectPaths = []) {
  const raw = String(requestedPath || '').trim()
  if (!raw) return { ok: false, error: 'path_required' }

  const resolved = normalizeAbsolutePath(raw)
  let stat
  try {
    stat = await fs.stat(resolved)
  } catch {
    return { ok: false, error: 'path_not_found' }
  }

  if (!stat.isDirectory()) {
    return { ok: false, error: 'not_a_directory' }
  }

  const allowedRoots = Array.isArray(allowedProjectPaths)
    ? allowedProjectPaths.map((entry) => normalizeAbsolutePath(entry)).filter(Boolean)
    : []

  if (allowedRoots.length > 0 && !allowedRoots.some((rootPath) => sameOrInside(rootPath, resolved))) {
    return { ok: false, error: 'path_not_allowed' }
  }

  return { ok: true, path: resolved }
}

export function validateExternalHttpUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return { ok: false, error: 'url_required' }

  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, error: 'invalid_url' }
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'unsupported_protocol' }
  }

  return { ok: true, url: parsed.toString() }
}

export function validateAttachmentOpenRequest({ mediaType = '', extension = '' } = {}) {
  const normalizedMime = String(mediaType || '').trim().toLowerCase()
  const normalizedExtension = String(extension || '').trim().toLowerCase()

  if (normalizedMime && BLOCKED_ATTACHMENT_MIME_TYPES.has(normalizedMime)) {
    return {
      ok: false,
      error: 'blocked_mime_type',
      detail: `MIME type ${normalizedMime} is not allowed.`,
    }
  }

  if (normalizedExtension && BLOCKED_ATTACHMENT_EXTENSIONS.has(normalizedExtension)) {
    return {
      ok: false,
      error: 'blocked_extension',
      detail: `Extension ${normalizedExtension} is not allowed.`,
    }
  }

  return { ok: true }
}
