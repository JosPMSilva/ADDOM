import { getTerminalSessionArchiveBySessionId, updateTerminalSessionArchiveCandidate } from '../terminal/terminal-session-archive-store.mjs'

const MAX_SUMMARY_LENGTH = 240
const MAX_REASON_LENGTH = 220
const MIN_SUMMARY_LENGTH = 12
const MIN_REASON_LENGTH = 12

const GENERIC_SUMMARY_PATTERNS = [
  /^done\b/i,
  /^completed\b/i,
  /^finished\b/i,
  /^fixed\b/i,
  /^task completed\b/i,
  /^session completed\b/i,
]

const SECRET_PATTERNS = [
  /\b(api[_ -]?key|token|secret|password|passwd|client[_ -]?secret|private[_ -]?key)\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
]

const TRANSCRIPT_PATTERNS = [
  /```/,
  /\b(stdout|stderr|exit code)\b/i,
  /(^|\n)\s*(PS [A-Z]:\\|[$#>%])\s+/m,
]

const LOW_SIGNAL_SUMMARY_PATTERNS = [
  /\b(current (working )?directory|working directory|cwd|repo(?:sitory)? root)\b/i,
  /\bshell (was|is|used)\b/i,
  /\bused (bash|zsh|pwsh|powershell|cmd)\b/i,
  /\b(session|terminal) (closed|ended) successfully\b/i,
  /\bpwd output\b/i,
  /\bls output\b/i,
]

const LOW_SIGNAL_REASON_PATTERNS = [
  /\bfor future reference\b/i,
  /\bin case we need it later\b/i,
  /\bjust to remember\b/i,
  /\bso we know where we were\b/i,
  /\brecords? the session\b/i,
]

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function collapseText(value = '', maxLength = 240) {
  return asTrimmedString(value)
    .replace(/\s+/g, ' ')
    .slice(0, maxLength)
}

function createValidationResult(ok, code = '', message = '', detail = {}) {
  return {
    ok: ok === true,
    code: asTrimmedString(code),
    message: asTrimmedString(message),
    detail: detail && typeof detail === 'object' ? { ...detail } : {},
  }
}

function reject(code, message, detail = {}) {
  return createValidationResult(false, code, message, detail)
}

function normalizeCandidateInput(toolInput = {}) {
  return {
    sessionId: asTrimmedString(toolInput?.sessionId),
    summary: collapseText(toolInput?.summary, MAX_SUMMARY_LENGTH),
    reason: collapseText(toolInput?.reason, MAX_REASON_LENGTH),
  }
}

function normalizeSuggestionContext(context = {}) {
  return {
    threadId: asTrimmedString(context?.threadId),
    turnId: asTrimmedString(context?.turnId),
  }
}

function containsBlockedContent(value = '', patterns = []) {
  return patterns.some((pattern) => pattern.test(String(value || '')))
}

function buildSuggestionPayload(archive = null, candidate = {}) {
  if (!archive) return null
  return {
    kind: 'terminal_memory_suggestion',
    source: 'terminal_session',
    sessionId: asTrimmedString(archive.sessionId),
    archiveId: asTrimmedString(archive.id),
    threadId: asTrimmedString(archive.threadId),
    turnId: asTrimmedString(archive.turnId),
    question: 'Save this terminal session insight to Memory?',
    summary: asTrimmedString(candidate.summary || archive.memoryCandidateSummary),
    reason: asTrimmedString(candidate.reason || archive.memoryCandidateReason),
    status: asTrimmedString(archive.memoryCandidateStatus || 'pending') || 'pending',
    saveLabel: 'Save',
    dismissLabel: 'Dismiss',
    closedAt: Number(archive.closedAt || 0) || 0,
    displayName: asTrimmedString(archive.sessionTitle || archive.displayName || archive.displayLabelPrimary || archive.sessionId),
  }
}

export function validateTerminalMemorySuggestionCandidate(toolInput = {}, context = {}) {
  const candidate = normalizeCandidateInput(toolInput)
  const suggestionContext = normalizeSuggestionContext(context)
  if (!candidate.sessionId) {
    return reject('terminal_memory_suggestion_session_required', 'sessionId is required.')
  }
  if (candidate.summary.length < MIN_SUMMARY_LENGTH) {
    return reject('terminal_memory_suggestion_summary_too_short', 'summary must be specific and non-trivial.')
  }
  if (candidate.reason.length < MIN_REASON_LENGTH) {
    return reject('terminal_memory_suggestion_reason_too_short', 'reason must explain why the summary is reusable.')
  }
  if (GENERIC_SUMMARY_PATTERNS.some((pattern) => pattern.test(candidate.summary))) {
    return reject('terminal_memory_suggestion_summary_too_generic', 'summary is too generic to save as durable memory.')
  }
  if (containsBlockedContent(candidate.summary, SECRET_PATTERNS) || containsBlockedContent(candidate.reason, SECRET_PATTERNS)) {
    return reject('terminal_memory_suggestion_secret_like_content', 'summary or reason appears to contain secret-like content.')
  }
  if (containsBlockedContent(candidate.summary, TRANSCRIPT_PATTERNS) || containsBlockedContent(candidate.reason, TRANSCRIPT_PATTERNS)) {
    return reject('terminal_memory_suggestion_transcript_like_content', 'summary or reason looks like terminal transcript content.')
  }
  if (
    containsBlockedContent(candidate.summary, LOW_SIGNAL_SUMMARY_PATTERNS)
    || containsBlockedContent(candidate.reason, LOW_SIGNAL_REASON_PATTERNS)
  ) {
    return reject('terminal_memory_suggestion_low_signal', 'summary or reason is too low-signal to save as durable memory.')
  }

  const archive = getTerminalSessionArchiveBySessionId(candidate.sessionId)
  if (!archive) {
    return reject('terminal_memory_suggestion_archive_not_found', `Archived terminal session "${candidate.sessionId}" was not found.`)
  }
  if (!archive.closedAt) {
    return reject('terminal_memory_suggestion_session_not_closed', 'Only closed terminal sessions can be suggested for durable memory.')
  }
  if (archive.openedBy !== 'model' && archive.closedBy !== 'model') {
    return reject('terminal_memory_suggestion_not_model_driven', 'Only model-driven terminal sessions may emit automatic memory suggestions in v1.')
  }
  if (suggestionContext.threadId && archive.threadId && suggestionContext.threadId !== archive.threadId) {
    return reject('terminal_memory_suggestion_thread_mismatch', 'Only terminal sessions belonging to the active thread may be suggested for durable memory.')
  }
  if (suggestionContext.turnId && archive.turnId && suggestionContext.turnId !== archive.turnId) {
    return reject('terminal_memory_suggestion_turn_mismatch', 'Only terminal sessions closed in this turn may be suggested for durable memory.')
  }
  if (archive.memoryCandidateStatus === 'accepted') {
    return reject('terminal_memory_suggestion_already_accepted', 'This terminal session was already saved to Memory.', {
      archive,
    })
  }
  if (archive.memoryCandidateStatus === 'dismissed') {
    return reject('terminal_memory_suggestion_already_dismissed', 'This terminal session suggestion was already dismissed.', {
      archive,
    })
  }

  if (
    archive.memoryCandidateStatus === 'pending'
    && archive.memoryCandidateSummary
    && archive.memoryCandidateReason
  ) {
    return createValidationResult(true, '', '', {
      archive,
      candidate: {
        summary: asTrimmedString(archive.memoryCandidateSummary),
        reason: asTrimmedString(archive.memoryCandidateReason),
      },
      reusedExisting: true,
      suggestion: buildSuggestionPayload(archive, {
        summary: archive.memoryCandidateSummary,
        reason: archive.memoryCandidateReason,
      }),
    })
  }

  return createValidationResult(true, '', '', {
    archive,
    candidate,
    reusedExisting: false,
    suggestion: buildSuggestionPayload(archive, candidate),
  })
}

export function persistTerminalMemorySuggestionCandidate(toolInput = {}, context = {}) {
  const validation = validateTerminalMemorySuggestionCandidate(toolInput, context)
  if (!validation.ok) return validation
  const archive = validation.detail?.archive
  const candidate = validation.detail?.candidate || normalizeCandidateInput(toolInput)
  if (validation.detail?.reusedExisting === true) {
    return {
      ...validation,
      archive,
      suggestion: validation.detail?.suggestion || buildSuggestionPayload(archive, candidate),
    }
  }
  const updatedArchive = updateTerminalSessionArchiveCandidate(candidate.sessionId, {
    status: 'pending',
    summary: candidate.summary,
    reason: candidate.reason,
  })
  return {
    ...validation,
    archive: updatedArchive,
    suggestion: buildSuggestionPayload(updatedArchive, candidate),
  }
}
