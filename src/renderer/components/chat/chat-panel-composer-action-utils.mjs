export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader()
      reader.onload = (event) => resolve(String(event?.target?.result || ''))
      reader.onerror = () => reject(reader.error || new Error('file_read_failed'))
      reader.readAsDataURL(file)
    } catch (error) {
      reject(error)
    }
  })
}

export function normalizeStagedAttachmentDescriptor(descriptor = {}) {
  const attachmentId = String(descriptor.attachmentId || descriptor.id || '').trim()
  const mediaType = String(descriptor.mediaType || descriptor.mimeType || '').trim().toLowerCase()
  const kind = String(descriptor.kind || '').trim().toLowerCase() || (mediaType.startsWith('image/') ? 'image' : 'file')
  const fileName = String(descriptor.fileName || descriptor.filename || '').trim()
  return {
    id: attachmentId || crypto.randomUUID(),
    attachmentId: attachmentId || '',
    kind,
    mediaType: mediaType || (kind === 'image' ? 'image/png' : 'application/octet-stream'),
    fileName,
    sizeBytes: Number(descriptor.sizeBytes || 0) || 0,
    previewUrl: String(descriptor.previewUrl || '').trim(),
  }
}

export function buildAttachmentCapabilityNoticeMessage({ blocked = [], providerLabel = 'selected provider', modelLabel = 'selected model' } = {}) {
  const blockedRows = Array.isArray(blocked) ? blocked : []
  if (blockedRows.length === 0) return ''
  const blockedImages = blockedRows.filter((row) => row?.reason === 'images_disabled').length
  const blockedFiles = blockedRows.filter((row) => row?.reason === 'files_disabled').length
  if (blockedImages > 0 && blockedFiles === 0) return `Image attachments are not supported by ${providerLabel}/${modelLabel}. File attachments remain enabled.`
  if (blockedFiles > 0 && blockedImages === 0) return `File attachments are not supported by ${providerLabel}/${modelLabel}. Remove the blocked files and retry.`
  return `Some attachments are no longer supported by ${providerLabel}/${modelLabel}. Remove blocked items and retry.`
}

function normalizeContentFingerprint(value = '') {
  return String(value || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function toUserMessageText(content) {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content.map((part) => (part && typeof part === 'object' && String(part.type || '').trim().toLowerCase() === 'text' ? String(part.text || '') : '')).filter(Boolean).join('\n').trim()
}

export function countSimilarRecentUserMessages(messages = [], fingerprint = '', { maxScan = 12 } = {}) {
  if (!fingerprint) return 0
  const recentUser = (Array.isArray(messages) ? messages : []).filter((row) => row && row.role === 'user').slice(-maxScan)
  let count = 0
  for (const row of recentUser) {
    if (normalizeContentFingerprint(toUserMessageText(row.content)) === fingerprint) count += 1
  }
  return count
}

export function buildRecentUserMessageFingerprint(content = '') {
  return normalizeContentFingerprint(content).slice(0, 220)
}

export function logComplianceEvent({
  noticeAction = 'shown',
  noticeType = '',
  threadId = '',
  providerId = '',
  model = '',
  termsVersion = '',
  summary = '',
  source = 'composer',
  sessionSuppressKey = '',
  repeatedCount = 0,
} = {}) {
  const chatApi = typeof window !== 'undefined' ? window?.addom?.chat : null
  if (!chatApi || typeof chatApi.logComplianceEvent !== 'function') return
  const normalizedThreadId = String(threadId || '').trim()
  if (!normalizedThreadId) return
  chatApi.logComplianceEvent({
    noticeAction: String(noticeAction || '').trim().toLowerCase(),
    noticeType: String(noticeType || '').trim().toLowerCase(),
    threadId: normalizedThreadId,
    providerId: String(providerId || '').trim().toLowerCase(),
    model: String(model || '').trim(),
    termsVersion: String(termsVersion || '').trim(),
    summary: String(summary || '').trim(),
    source: String(source || '').trim().toLowerCase(),
    sessionSuppressKey: String(sessionSuppressKey || '').trim().toLowerCase(),
    repeatedCount: Number(repeatedCount || 0) || 0,
  })
}

function isMoaExecutionTerminalStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === 'completed' || normalized === 'failed' || normalized === 'aborted'
}

export async function waitForMoaExecutionResult({
  getStatus = async () => ({ ok: false }),
  executionId = '',
  maxAttempts = 1200,
  intervalMs = 500,
} = {}) {
  const normalizedExecutionId = String(executionId || '').trim()
  if (!normalizedExecutionId) return { ok: false, error: 'missing_id', message: 'Execution ID is required.' }
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let status = null
    try {
      status = await getStatus(normalizedExecutionId)
    } catch (error) {
      return { ok: false, error: 'status_error', message: String(error?.message || 'Failed to read execution status.') }
    }
    if (!status?.ok) return status || { ok: false, error: 'status_error', message: 'Failed to read execution status.' }
    if (isMoaExecutionTerminalStatus(status.status)) {
      if (status.status === 'completed') {
        return status.result && typeof status.result === 'object'
          ? { ...status.result, executionId: normalizedExecutionId, status: status.status }
          : { ok: true, executionId: normalizedExecutionId, status: status.status }
      }
      return status.result && typeof status.result === 'object'
        ? { ...status.result, executionId: normalizedExecutionId, status: status.status }
        : { ok: false, error: status.error || status.status || 'execution_error', message: status.message || `Execution ${status.status || 'failed'}.`, executionId: normalizedExecutionId, status: status.status }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return { ok: false, error: 'status_timeout', message: 'Timed out while waiting for execution result.', executionId: normalizedExecutionId }
}
