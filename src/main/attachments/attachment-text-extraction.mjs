import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getAttachmentCacheRoot } from './attachment-cache.mjs'
import {
  ATTACHMENT_TEXT_EXTRACTION_SETTINGS_SECTION_ID,
  isImageMediaType,
  isSupportedTextExtractionExtension,
  normalizeAttachmentTextExtractionSettings,
  resolveAttachmentExtension,
  supportsNativeFileMediaTypeForProvider,
} from '../../common/attachments/attachment-support-policy.mjs'
import {
  convertFileWithMarkItDown,
  getMarkItDownRuntimeStatus,
} from './markitdown-runtime.mjs'

const MAX_SOURCE_ATTACHMENT_BYTES = 20 * 1024 * 1024
const MAX_PATH_SEGMENT_LENGTH = 120
const MAX_RUNBOOK_MESSAGE_CHARS = 1_500

function safeTrim(value = '') {
  return String(value || '').trim()
}

function normalizeId(value = '') {
  return safeTrim(value)
}

function normalizeMediaType(value = '', fallback = '') {
  const mediaType = safeTrim(value).toLowerCase()
  return mediaType || safeTrim(fallback).toLowerCase()
}

function safePathSegment(value = '', fallback = 'unknown') {
  const cleaned = safeTrim(value)
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '')
    .slice(0, MAX_PATH_SEGMENT_LENGTH)
  return cleaned || fallback
}

function sanitizeErrorMessage(value = '') {
  const collapsed = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!collapsed) return ''
  const withoutLocalFileUrls = collapsed.replace(/\bfile:\/\/\/?[^\s)]+/gi, '<path>')
  const withoutWindowsPaths = withoutLocalFileUrls
    .replace(/[A-Za-z]:[\\/][^\s)]+/g, '<path>')
    .replace(/\\\\[^\s\\]+\\[^\s)]+/g, '<path>')
  const text = withoutWindowsPaths
    .replace(/(^|[\s(])\/(?:Users|home|var|tmp|private|opt|etc|mnt|Volumes|Applications|Library)\/[^\s)]+/g, '$1<path>')
    .trim()
  if (!text) return ''
  return text.length > MAX_RUNBOOK_MESSAGE_CHARS
    ? `${text.slice(0, MAX_RUNBOOK_MESSAGE_CHARS)}...`
    : text
}

function parseDataPayload(rawValue = '') {
  const raw = safeTrim(rawValue)
  if (!raw) return { mediaType: '', base64: '' }
  if (!raw.startsWith('data:')) return { mediaType: '', base64: raw }
  const match = raw.match(/^data:([^;,]+)?(?:;[^,]*)?,([\s\S]+)$/i)
  if (!match) return { mediaType: '', base64: '' }
  return {
    mediaType: normalizeMediaType(match[1] || '', ''),
    base64: safeTrim(match[2] || ''),
  }
}

function decodeBase64Attachment(rawBase64 = '') {
  const compact = String(rawBase64 || '')
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  if (!compact || compact.length % 4 === 1) return null
  if (!/^[a-z0-9+/=]+$/i.test(compact)) return null
  try {
    const data = Buffer.from(compact, 'base64')
    return data.length > 0 ? data : null
  } catch {
    return null
  }
}

function buildDerivedRoot(projectId = '', threadId = '') {
  return path.join(
    getAttachmentCacheRoot(),
    'projects',
    safePathSegment(projectId, 'project'),
    'threads',
    safePathSegment(threadId, 'thread'),
    'derived',
    'markitdown',
  )
}

function ensureDirectory(dirPath = '') {
  fs.mkdirSync(dirPath, { recursive: true })
}

function readTextFile(filePath = '') {
  try {
    if (!filePath || !fs.existsSync(filePath)) return ''
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

function writeTextFile(filePath = '', content = '') {
  try {
    ensureDirectory(path.dirname(filePath))
    fs.writeFileSync(filePath, String(content || ''), 'utf8')
    return true
  } catch {
    return false
  }
}

function writeBinaryFile(filePath = '', content = null) {
  try {
    ensureDirectory(path.dirname(filePath))
    fs.writeFileSync(filePath, content)
    return true
  } catch {
    return false
  }
}

function buildSetupNotice(message = '') {
  return {
    type: 'warning',
    text: `Local attachment extraction is not ready. ${message || 'Open setup instructions to install MarkItDown.'}`.trim(),
    meta: {
      sessionSuppressKey: 'attachment_text_extraction:setup',
      action: {
        type: 'open_settings_target',
        label: 'Open setup instructions',
        payload: {
          categoryId: 'providers',
          sectionId: ATTACHMENT_TEXT_EXTRACTION_SETTINGS_SECTION_ID,
        },
      },
    },
  }
}

function buildFailureReason({
  reasonCode = 'conversion_failed',
  message = '',
  nextActionHint = '',
  diagnostics = {},
} = {}) {
  const safeMessage = sanitizeErrorMessage(message) || 'Attachment text extraction failed.'
  const safeHint = sanitizeErrorMessage(nextActionHint)
  const lines = [
    'Error: No output generated.',
    `Why it failed: ${safeMessage}`,
    safeHint ? `What to do next: ${safeHint}` : '',
    'Diagnostics:',
    `- conversion_attempted: ${diagnostics.conversion_attempted ? 'true' : 'false'}`,
    `- converted_count: ${Number(diagnostics.converted_count || 0) || 0}`,
    `- skipped_count: ${Number(diagnostics.skipped_count || 0) || 0}`,
    `- failed_count: ${Number(diagnostics.failed_count || 0) || 0}`,
    `- failure_reason_code: ${safeTrim(reasonCode || '') || 'conversion_failed'}`,
    safeMessage ? `- failure_message_sanitized: ${safeMessage}` : '',
    safeHint ? `- next_action_hint: ${safeHint}` : '',
  ].filter(Boolean)
  return lines.join('\n')
}

function toTextExtractionMessage(label = '', text = '') {
  const safeLabel = safeTrim(label) || 'attachment'
  return `[Attachment text extracted: ${safeLabel}]\n${String(text || '')}`.trim()
}

function toHistoricalAttachmentPlaceholder(label = '') {
  const safeLabel = safeTrim(label) || 'attachment'
  return `[Attachment omitted from prior turn for current model: ${safeLabel}]`
}

function buildOutcomeBase(historyMessages = [], diagnostics = {}) {
  return {
    ok: true,
    history: Array.isArray(historyMessages) ? historyMessages : [],
    diagnostics: {
      conversion_attempted: !!diagnostics.conversion_attempted,
      converted_count: Number(diagnostics.converted_count || 0) || 0,
      skipped_count: Number(diagnostics.skipped_count || 0) || 0,
      failed_count: Number(diagnostics.failed_count || 0) || 0,
      failure_reason_code: safeTrim(diagnostics.failure_reason_code || ''),
      failure_message_sanitized: safeTrim(diagnostics.failure_message_sanitized || ''),
      next_action_hint: safeTrim(diagnostics.next_action_hint || ''),
    },
  }
}

function buildFailureOutcome({
  historyMessages = [],
  diagnostics = {},
  reasonCode = 'conversion_failed',
  message = '',
  nextActionHint = '',
  includeSetupNotice = false,
} = {}) {
  const nextDiagnostics = {
    ...diagnostics,
    failed_count: Number(diagnostics.failed_count || 0) + 1,
    failure_reason_code: safeTrim(reasonCode || 'conversion_failed'),
    failure_message_sanitized: sanitizeErrorMessage(message),
    next_action_hint: sanitizeErrorMessage(nextActionHint),
  }
  return {
    ok: false,
    history: Array.isArray(historyMessages) ? historyMessages : [],
    diagnostics: buildOutcomeBase([], nextDiagnostics).diagnostics,
    failure: {
      reasonCode: safeTrim(reasonCode || 'conversion_failed'),
      message: sanitizeErrorMessage(message),
      nextActionHint: sanitizeErrorMessage(nextActionHint),
      runbookReason: buildFailureReason({
        reasonCode,
        message,
        nextActionHint,
        diagnostics: nextDiagnostics,
      }),
    },
    ...(includeSetupNotice
      ? { notice: buildSetupNotice(nextActionHint || message) }
      : {}),
  }
}

async function convertAttachmentBytesToText({
  bytes = null,
  extension = '',
  projectId = '',
  threadId = '',
  timeoutMs = 20_000,
  runtimeExecutable = '',
} = {}) {
  if (!bytes || !Buffer.isBuffer(bytes) || bytes.length <= 0) {
    return { ok: false, reasonCode: 'conversion_failed', message: 'Attachment payload is empty.' }
  }
  if (bytes.length > MAX_SOURCE_ATTACHMENT_BYTES) {
    return {
      ok: false,
      reasonCode: 'file_too_large',
      message: `Attachment exceeds ${MAX_SOURCE_ATTACHMENT_BYTES} bytes.`,
    }
  }

  const hash = crypto.createHash('sha256').update(bytes).digest('hex')
  const derivedRoot = buildDerivedRoot(projectId, threadId)
  const safeExtension = safeTrim(extension) || '.bin'
  const sourcePath = path.join(derivedRoot, `source_${hash}${safeExtension}`)
  const derivedPath = path.join(derivedRoot, `result_${hash}.md`)
  const cachedText = readTextFile(derivedPath)
  if (cachedText) {
    return { ok: true, text: cachedText, fromCache: true, reasonCode: 'ok' }
  }

  if (!writeBinaryFile(sourcePath, bytes)) {
    return { ok: false, reasonCode: 'conversion_failed', message: 'Failed to write temporary attachment file.' }
  }

  const converted = await convertFileWithMarkItDown({
    inputPath: sourcePath,
    timeoutMs,
    executable: runtimeExecutable,
  })
  if (!converted?.ok) {
    return {
      ok: false,
      reasonCode: safeTrim(converted?.reasonCode || 'conversion_failed'),
      message: safeTrim(converted?.message || 'markitdown conversion failed'),
    }
  }

  const text = String(converted.text || '')
  if (!writeTextFile(derivedPath, text)) {
    // Non-fatal: return extracted text even when derived cache write fails.
    return { ok: true, text, fromCache: false, reasonCode: 'ok' }
  }
  return { ok: true, text, fromCache: false, reasonCode: 'ok' }
}

function shouldFallbackFilePart({
  providerId = '',
  modelAttachmentSupport = null,
  part = {},
} = {}) {
  const type = safeTrim(part?.type || '').toLowerCase()
  if (type !== 'file') return false
  return !supportsNativeFileMediaTypeForProvider({
    providerId,
    modelAttachmentSupport,
    mediaType: part?.mediaType || part?.mimeType || '',
    fileName: part?.filename || part?.fileName || '',
  })
}

function findActiveUserMessageIndex(rows = []) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const message = rows[index]
    if (String(message?.role || '').trim().toLowerCase() !== 'user') continue
    if (!Array.isArray(message?.content)) continue
    return index
  }
  return -1
}

function replaceHistoricalUnsupportedFileParts({
  historyMessages = [],
  activeUserMessageIndex = -1,
  providerId = '',
  modelAttachmentSupport = null,
} = {}) {
  const rows = Array.isArray(historyMessages) ? historyMessages : []
  let changed = false
  const nextRows = rows.map((message, index) => {
    if (index === activeUserMessageIndex) return message
    if (String(message?.role || '').trim().toLowerCase() !== 'user') return message
    if (!Array.isArray(message?.content)) return message

    let messageChanged = false
    const nextParts = []
    for (const rawPart of message.content) {
      const part = rawPart && typeof rawPart === 'object' ? rawPart : {}
      if (!shouldFallbackFilePart({ providerId, modelAttachmentSupport, part })) {
        nextParts.push(rawPart)
        continue
      }
      const label = safeTrim(part.filename || part.fileName || '')
        || normalizeMediaType(part.mediaType || part.mimeType || '', 'attachment')
      nextParts.push({
        type: 'text',
        text: toHistoricalAttachmentPlaceholder(label),
      })
      messageChanged = true
    }

    if (!messageChanged) return message
    changed = true
    if (nextParts.length === 1 && nextParts[0]?.type === 'text') {
      return {
        ...message,
        content: String(nextParts[0].text || ''),
      }
    }
    return {
      ...message,
      content: nextParts,
    }
  })

  return {
    changed,
    history: nextRows,
  }
}

export async function applyAttachmentTextExtractionFallback({
  historyMessages = [],
  providerId = '',
  modelAttachmentSupport = null,
  projectId = '',
  threadId = '',
  extractionSettings = {},
} = {}) {
  const normalizedSettings = normalizeAttachmentTextExtractionSettings(extractionSettings)
  const baseDiagnostics = buildOutcomeBase([], {
    conversion_attempted: false,
    converted_count: 0,
    skipped_count: 0,
    failed_count: 0,
    failure_reason_code: '',
    failure_message_sanitized: '',
    next_action_hint: '',
  }).diagnostics
  const rows = Array.isArray(historyMessages) ? historyMessages : []

  if (!normalizedSettings.enabled || normalizedSettings.mode !== 'fallback_only') {
    return buildOutcomeBase(rows, baseDiagnostics)
  }

  const activeUserMessageIndex = findActiveUserMessageIndex(rows)
  if (activeUserMessageIndex < 0) {
    return buildOutcomeBase(rows, baseDiagnostics)
  }
  const historicalSanitization = replaceHistoricalUnsupportedFileParts({
    historyMessages: rows,
    activeUserMessageIndex,
    providerId,
    modelAttachmentSupport,
  })
  const workingRows = historicalSanitization.history
  const activeUserMessage = workingRows[activeUserMessageIndex]
  const activeContentParts = Array.isArray(activeUserMessage?.content) ? activeUserMessage.content : []
  const hasUnsupportedFiles = activeContentParts.some((part) => shouldFallbackFilePart({
    providerId,
    modelAttachmentSupport,
    part,
  }))
  if (!hasUnsupportedFiles) {
    return buildOutcomeBase(historicalSanitization.changed ? workingRows : rows, baseDiagnostics)
  }

  const diagnostics = {
    ...baseDiagnostics,
    conversion_attempted: true,
  }
  const runtimeStatus = await getMarkItDownRuntimeStatus({
    timeoutMs: Math.min(10_000, Number(normalizedSettings.timeoutMs || 20_000)),
  })
  if (!runtimeStatus?.ready || !runtimeStatus.executable) {
    return buildFailureOutcome({
      historyMessages: workingRows,
      diagnostics,
      reasonCode: 'runtime_missing',
      message: runtimeStatus?.reason || 'Local MarkItDown runtime is not ready.',
      nextActionHint: 'Open setup instructions, install MarkItDown locally, then click "Re-check runtime".',
      includeSetupNotice: true,
    })
  }

  const nextRows = [...workingRows]
  let convertedCount = 0
  let skippedCount = 0
  let totalChars = 0
  const maxCharsPerAttachment = Number(normalizedSettings.maxCharsPerAttachment || 12_000)
  const maxCharsPerTurn = Number(normalizedSettings.maxCharsPerTurn || 60_000)
  const maxAttachmentsPerTurn = Number(normalizedSettings.maxAttachmentsPerTurn || 4)

  const nextParts = []
  for (const rawPart of activeContentParts) {
    const part = rawPart && typeof rawPart === 'object' ? rawPart : {}
    if (!shouldFallbackFilePart({ providerId, modelAttachmentSupport, part })) {
      nextParts.push(rawPart)
      continue
    }

    const mediaType = normalizeMediaType(part.mediaType || part.mimeType || '', 'application/octet-stream')
    const fileName = safeTrim(part.filename || part.fileName || '')
    if (isImageMediaType(mediaType)) {
      skippedCount += 1
      nextParts.push(rawPart)
      continue
    }
    if (convertedCount >= maxAttachmentsPerTurn) {
      return buildFailureOutcome({
        historyMessages: workingRows,
        diagnostics: {
          ...diagnostics,
          converted_count: convertedCount,
          skipped_count: skippedCount,
        },
        reasonCode: 'conversion_failed',
        message: `Attachment conversion cap reached (${maxAttachmentsPerTurn} per turn).`,
        nextActionHint: 'Reduce attachments in this turn or increase the conversion cap in settings.',
      })
    }
    if (!isSupportedTextExtractionExtension({ fileName, mediaType })) {
      return buildFailureOutcome({
        historyMessages: workingRows,
        diagnostics: {
          ...diagnostics,
          converted_count: convertedCount,
          skipped_count: skippedCount,
        },
        reasonCode: 'unsupported_file_type',
        message: `Unsupported file type for local extraction: ${fileName || mediaType || 'attachment'}.`,
        nextActionHint: 'Use one of the supported formats listed in settings or switch to a native file-capable model.',
      })
    }

    const payload = parseDataPayload(part.data || '')
    const payloadMediaType = normalizeMediaType(mediaType || payload.mediaType || '', mediaType)
    const bytes = decodeBase64Attachment(payload.base64 || '')
    if (!bytes) {
      return buildFailureOutcome({
        historyMessages: workingRows,
        diagnostics: {
          ...diagnostics,
          converted_count: convertedCount,
          skipped_count: skippedCount,
        },
        reasonCode: 'conversion_failed',
        message: `Attachment payload could not be decoded (${fileName || payloadMediaType || 'attachment'}).`,
        nextActionHint: 'Remove and re-attach the file, then retry.',
      })
    }

    const extension = resolveAttachmentExtension({
      fileName,
      mediaType: payloadMediaType,
    }) || '.bin'
    const converted = await convertAttachmentBytesToText({
      bytes,
      extension,
      projectId: normalizeId(projectId),
      threadId: normalizeId(threadId),
      timeoutMs: Number(normalizedSettings.timeoutMs || 20_000),
      runtimeExecutable: runtimeStatus.executable,
    })
    if (!converted?.ok) {
      const reasonCode = safeTrim(converted?.reasonCode || 'conversion_failed')
      const includeSetupNotice = reasonCode === 'runtime_missing'
      return buildFailureOutcome({
        historyMessages: workingRows,
        diagnostics: {
          ...diagnostics,
          converted_count: convertedCount,
          skipped_count: skippedCount,
        },
        reasonCode,
        message: converted?.message || 'MarkItDown conversion failed.',
        nextActionHint: reasonCode === 'runtime_timeout'
          ? 'Retry with fewer/lighter attachments or increase conversion timeout in settings.'
          : 'Open setup instructions and verify local runtime installation.',
        includeSetupNotice,
      })
    }

    let extractedText = safeTrim(converted.text || '')
    if (!extractedText) {
      return buildFailureOutcome({
        historyMessages: workingRows,
        diagnostics: {
          ...diagnostics,
          converted_count: convertedCount,
          skipped_count: skippedCount,
        },
        reasonCode: 'conversion_failed',
        message: `Conversion returned empty text (${fileName || payloadMediaType || 'attachment'}).`,
        nextActionHint: 'Try a different model/provider with native support for this attachment.',
      })
    }

    if (extractedText.length > maxCharsPerAttachment) {
      extractedText = extractedText.slice(0, maxCharsPerAttachment)
    }
    const remainingChars = maxCharsPerTurn - totalChars
    if (remainingChars <= 0) {
      return buildFailureOutcome({
        historyMessages: workingRows,
        diagnostics: {
          ...diagnostics,
          converted_count: convertedCount,
          skipped_count: skippedCount,
        },
        reasonCode: 'conversion_failed',
        message: 'Converted attachment text exceeds the per-turn extraction budget.',
        nextActionHint: 'Send fewer attachments or lower attachment verbosity in this turn.',
      })
    }
    if (extractedText.length > remainingChars) {
      extractedText = extractedText.slice(0, remainingChars)
    }
    totalChars += extractedText.length

    nextParts.push({
      type: 'text',
      text: toTextExtractionMessage(fileName || payloadMediaType, extractedText),
    })
    convertedCount += 1
  }

  nextRows[activeUserMessageIndex] = {
    ...activeUserMessage,
    content: nextParts,
  }

  return buildOutcomeBase(nextRows, {
    ...diagnostics,
    converted_count: convertedCount,
    skipped_count: skippedCount,
  })
}
