import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export function now() {
  return Date.now()
}

export function normalizeId(value = '') {
  return String(value || '').trim()
}

export function normalizeLowerId(value = '') {
  return normalizeId(value).toLowerCase()
}

export function parseJson(value = '{}') {
  try {
    const parsed = JSON.parse(String(value || '{}'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function stringifyJson(value = {}) {
  try {
    return JSON.stringify(value && typeof value === 'object' ? value : {})
  } catch {
    return '{}'
  }
}

export function normalizeStatus(value = '', fallback = '') {
  const normalized = normalizeId(value).toLowerCase()
  return normalized || fallback
}

export function sanitizeMetadataValue(value, fallback = '') {
  const normalized = String(value ?? '').trim()
  return normalized.slice(0, 512) || fallback
}

export function projectVectorStoreMetadata(projectId = '', { vectorStoreScope = 'project' } = {}) {
  return {
    addom_project_id: sanitizeMetadataValue(projectId),
    addom_scope: vectorStoreScope,
    managed_by: 'addom',
  }
}

export function createRemoteSummary(value) {
  if (!value || typeof value !== 'object') return {}
  const summary = {}
  const keys = [
    'id',
    'status',
    'filename',
    'bytes',
    'purpose',
    'created_at',
    'vector_store_id',
    'usage_bytes',
    'last_error',
    'file_counts',
    'last_active_at',
    'name',
  ]
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue
    summary[key] = value[key]
  }
  return summary
}

export function resolveProjectVectorStoreName(projectId = '') {
  const normalizedProjectId = normalizeId(projectId)
  if (!normalizedProjectId) return 'ADDOM Project'
  return `ADDOM ${normalizedProjectId}`
}

export function inferMimeType(filePath = '', fallback = 'application/octet-stream') {
  const extension = path.extname(String(filePath || '')).trim().toLowerCase()
  const map = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.markdown': 'text/markdown',
    '.json': 'application/json',
    '.jsonl': 'application/jsonl',
    '.csv': 'text/csv',
    '.ts': 'text/plain',
    '.tsx': 'text/plain',
    '.js': 'text/plain',
    '.jsx': 'text/plain',
    '.mjs': 'text/plain',
    '.cjs': 'text/plain',
    '.py': 'text/x-python',
    '.go': 'text/plain',
    '.java': 'text/plain',
    '.rs': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.xml': 'application/xml',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  }
  return map[extension] || fallback
}

export function computeFileSha256(filePath = '') {
  const hash = crypto.createHash('sha256')
  const stream = fs.createReadStream(filePath)
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export function normalizeUploadInputFile(entry = {}) {
  if (typeof entry === 'string') {
    return {
      path: normalizeId(entry),
      attachmentId: '',
      threadId: '',
      fileName: '',
      mimeType: '',
    }
  }
  const source = entry && typeof entry === 'object' ? entry : {}
  return {
    path: normalizeId(source.path || source.filePath || ''),
    attachmentId: normalizeId(source.attachmentId),
    threadId: normalizeId(source.threadId),
    fileName: normalizeId(source.fileName || source.name || ''),
    mimeType: normalizeId(source.mimeType || source.mediaType || ''),
  }
}
