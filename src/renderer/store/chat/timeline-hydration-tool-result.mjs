import { normalizeQuestionUserRequest } from '../../../common/chat/question-user-request.mjs'

const HIDDEN_TOOL_RESULT_NAMES = new Set([
  'terminal_memory_suggest',
])

function normalizeHydratedFileChange(fileChange = null) {
  return fileChange && typeof fileChange === 'object'
    ? {
        filePath: String(fileChange.filePath || ''),
        newRevId: String(fileChange.newRevId || ''),
        prevRevId: String(fileChange.prevRevId || ''),
        rev: Number(fileChange.rev || 0) || 0,
        contentBytes: Number(fileChange.contentBytes || 0) || 0,
        addedLines: Number(fileChange.addedLines || 0) || 0,
        removedLines: Number(fileChange.removedLines || 0) || 0,
        changeType: String(fileChange.changeType || '').trim().toLowerCase(),
        source: String(fileChange.source || '').trim().toLowerCase(),
        diffText: String(fileChange.diffText || fileChange.diff || '').trim(),
      }
    : null
}

export function applyHydratedToolResultActivity(activity, meta = {}, content = '') {
  const toolName = String(meta.toolName || '').trim()
  if (HIDDEN_TOOL_RESULT_NAMES.has(toolName)) return false
  activity.type = 'result'
  activity.toolName = toolName
  activity.toolInput = meta.toolInput || {}
  activity.result = content || String(meta.resultPreview || '')
  activity.isError = !!meta.isError || String(meta.status || '') === 'error'
  activity.errorSeverity = String(meta.errorSeverity || '').trim().toLowerCase()
  activity.decision = String(meta.decision || 'approved')
  activity.denyReason = String(meta.denyReason || '')
  activity.missingDependencySuspected = !!meta.missingDependencySuspected
  activity.exitCode = Number.isFinite(Number(meta.exitCode)) ? Number(meta.exitCode) : null
  activity.stdoutPreview = String(meta.stdoutPreview || meta.trimmed_stdout || '')
  activity.stderrPreview = String(meta.stderrPreview || meta.trimmed_stderr || '')
  activity.hintFlags = Array.isArray(meta.hintFlags)
    ? meta.hintFlags
    : (Array.isArray(meta.error_hint_flags) ? meta.error_hint_flags : [])
  activity.runCommandPolicy = meta?.runCommandPolicy && typeof meta.runCommandPolicy === 'object'
    ? meta.runCommandPolicy
    : null
  activity.browserActionPolicy = meta?.browserActionPolicy && typeof meta.browserActionPolicy === 'object'
    ? meta.browserActionPolicy
    : null
  activity.fileChange = normalizeHydratedFileChange(meta?.fileChange)
  activity.moa = meta?.moa && typeof meta.moa === 'object' ? meta.moa : null
  activity.questionUser = meta?.questionUser && typeof meta.questionUser === 'object'
    ? meta.questionUser
    : null
  return true
}

export function resolveHydratedToolResultQuestionUser(meta = {}) {
  if (String(meta.toolName || '').trim().toLowerCase() !== 'question_user') return null
  if (meta.isError) return null
  if (String(meta.decision || 'approved').trim().toLowerCase() !== 'approved') return null
  return normalizeQuestionUserRequest(meta.questionUser)
}
