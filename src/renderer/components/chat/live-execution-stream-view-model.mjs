import {
  buildMoaAgentReportMarkdown,
  formatMoaRoleLabel,
} from '../../../common/moa/moa-display-formatters.mjs'
import i18n from '../../i18n/init.mjs'
import {
  normalizePathLabel,
  resolveCommandScope,
  resolveDirectoryCount,
  resolvePathTarget,
  resolveRenameTargets,
  resolveRowDetail,
  resolveRowPreview,
  resolveSearchCount,
  resolveSearchQuery,
  resolveTerminalSessionLabel,
  resolveToolCopy,
  resolveUrlLabel,
} from './live-execution-stream-tooling.mjs'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function interpolateExecutionText(template, options = {}) {
  return String(template ?? '').replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawKey) => {
    const key = String(rawKey || '').trim()
    const value = options?.[key]
    return value == null ? '' : String(value)
  })
}

function translateExecutionText(key, defaultValue, options = {}) {
  const safeOptions = options && typeof options === 'object' ? options : {}
  if (i18n?.isInitialized === true) {
    const translated = i18n.t(key, {
      defaultValue,
      ...safeOptions,
    })
    if (typeof translated === 'string' && translated && translated !== key) {
      return translated
    }
  }
  return interpolateExecutionText(defaultValue, safeOptions)
}

function resolveActivity(event = {}) {
  return event?.activity && typeof event.activity === 'object' ? event.activity : {}
}

function resolveEventKind(event = {}) {
  const activity = resolveActivity(event)
  return normalizeLower(activity?.eventKind || event?.eventKind)
}

function resolveActivityType(event = {}) {
  const activity = resolveActivity(event)
  return normalizeLower(activity?.type)
}

function resolveToolName(event = {}) {
  const activity = resolveActivity(event)
  return normalizeText(activity?.toolName || event?.toolName)
}

function resolveSummary(event = {}) {
  const activity = resolveActivity(event)
  return normalizeText(activity?.label || event?.summary)
}

function resolveActivityStatus(event = {}) {
  const activity = resolveActivity(event)
  return normalizeLower(activity?.status || event?.status)
}

function resolveCompactionMilestoneTitle(event = {}) {
  const activity = resolveActivity(event)
  return normalizeText(
    activity?.compactionMilestoneTitle
      || translateExecutionText(
        'core:executionStream.compaction.milestoneTitle',
        'Context compacted before the next turn',
      ),
  )
}

function resolveCompactionMilestoneDetail(event = {}) {
  const activity = resolveActivity(event)
  const detail = normalizeText(activity?.compactionMilestoneDetail || resolveSummary(event))
  return detail.replace(/\s*\|\s*id\s+.+$/i, '').trim()
}

function resolveToolInput(event = {}) {
  const activity = resolveActivity(event)
  return activity?.toolInput && typeof activity.toolInput === 'object' ? activity.toolInput : {}
}

function resolveMoaPayload(event = {}) {
  const activity = resolveActivity(event)
  return activity?.moa && typeof activity.moa === 'object' ? activity.moa : {}
}


function resolveMoaRoleLabelForEvent(event = {}) {
  const moa = resolveMoaPayload(event)
  const roleLabel = formatMoaRoleLabel({
    role: moa?.agentRole,
    roleId: moa?.agentRoleId,
    fallback: '',
  })
  if (roleLabel) return roleLabel

  const summary = resolveSummary(event)
  const prefixed = summary.match(/^MoA agent (?:started|done|error):\s*(.+)$/i)
  if (prefixed?.[1]) return normalizeText(prefixed[1])
  return summary
}

function resolveMoaTaskInstructionText(event = {}) {
  return normalizeText(resolveMoaPayload(event)?.taskInstruction || '')
}

function resolveMoaReportText(event = {}) {
  const moa = resolveMoaPayload(event)
  return buildMoaAgentReportMarkdown({
    reportMarkdown: moa?.reportMarkdown,
    rawOutput: moa?.rawOutput || moa?.output || '',
    outputContractType: moa?.outputContractType || '',
    structuredOutput: moa?.structuredOutput || null,
  })
}

function resolveMoaDelegationStatus(event = {}) {
  const moa = resolveMoaPayload(event)
  return normalizeLower(moa?.status || event?.status)
}

function isBlockingDelegationStatus(status = '') {
  return status === 'preflight_failed'
    || status === 'failed'
    || status === 'error'
    || status === 'denied'
    || status === 'cancelled'
}

function isSuccessfulDelegationEnvelope(event = {}) {
  if (resolveToolName(event) !== 'delegate_to_agents') return false
  const eventKind = resolveEventKind(event)
  if (eventKind.startsWith('moa_')) return false
  return !isBlockingDelegationStatus(resolveMoaDelegationStatus(event))
}

function isProviderToolStatus(event = {}) {
  return resolveEventKind(event) === 'provider_tool_status'
}

function isCompactionLifecycleEventKind(eventKind = '') {
  return eventKind === 'openai_compaction_event'
    || eventKind === 'anthropic_compaction_event'
    || eventKind === 'context_compacted'
    || eventKind === 'continuity_compaction_applied'
}

function isActiveCompactionLifecycle(event = {}) {
  const eventKind = resolveEventKind(event)
  if (!isCompactionLifecycleEventKind(eventKind)) return false
  const status = resolveActivityStatus(event)
  return status === 'requested' || status === 'running'
}

function isCompactionMilestone(event = {}) {
  const activity = resolveActivity(event)
  return activity?.compactionMilestone === true
}

function isLocalCompaction(event = {}) {
  const activity = resolveActivity(event)
  const eventKind = resolveEventKind(event)
  return normalizeLower(activity?.compactionMilestoneTone) === 'local'
    || eventKind === 'context_compacted'
    || eventKind === 'continuity_compaction_applied'
    || eventKind === 'compression_state'
}

function isTurnLifecycle(event = {}) {
  const eventKind = resolveEventKind(event)
  return eventKind === 'turn_started'
    || eventKind === 'turn_completed'
    || eventKind === 'turn_cancelled'
    || eventKind === 'turn_interrupted'
}

function isTurnStartLifecycle(event = {}) {
  return resolveEventKind(event) === 'turn_started'
}

function isRunbookOnlyInfo(event = {}) {
  const eventKind = resolveEventKind(event)
  const activityType = resolveActivityType(event)
  return (
    eventKind === 'reasoning_done'
    || eventKind === 'reasoning_summary'
    || activityType === 'reasoning'
    || eventKind === 'chat_cost_estimate'
    || eventKind === 'chat_usage'
    || eventKind === 'continuity_retrieval_used'
    || eventKind === 'continuity_packet_built'
    || eventKind === 'openai_continuity_status'
    || eventKind === 'openai_websocket_reconnect'
    || eventKind === 'background_response_queued'
    || eventKind === 'background_response_completed'
    || eventKind === 'background_response_failed'
    || eventKind === 'runtime_diagnostics'
    || eventKind === 'moa_delegation_done'
    || eventKind === 'file_change'
    || activityType === 'usage'
  )
}

function isGenericPendingProgress(event = {}) {
  const activityType = resolveActivityType(event)
  const summary = resolveSummary(event)
  return activityType === 'pending'
    && /^Preparing \d+ action(?:s)?\.\.\.$/i.test(summary)
}

function resolveResultVerb(event = {}) {
  const activity = resolveActivity(event)
  const status = normalizeLower(event?.status)
  const decision = normalizeLower(activity?.decision)
  if (decision === 'denied' || status === 'denied') return 'denied'
  if (activity?.isError || status === 'error') return 'failed'
  if (status === 'warning') return 'completed with warning'
  if (resolveEventKind(event) === 'provider_tool_output') return 'output ready'
  return 'done'
}

function appendBrowserActionLabel(label = '', action = '') {
  const normalizedAction = normalizeLower(action)
  return normalizedAction ? `${label} (${normalizedAction})` : label
}

function resolveProgressLabel(event = {}) {
  const toolName = resolveToolName(event)
  const toolInput = resolveToolInput(event)
  const summary = resolveSummary(event)
  const terminalLabel = resolveTerminalSessionLabel(event)
  if (toolName === 'git_status' || toolName === 'git_diff' || toolName === 'git_log') return resolveToolCopy(toolName, 'start')
  if (toolName === 'browser_action') {
    const action = normalizeLower(toolInput?.action || '')
    if (action === 'navigate') return translateExecutionText('core:executionStream.progress.navigate', 'Navigating')
    if (action === 'click') return translateExecutionText('core:executionStream.progress.click', 'Clicking element')
    if (action === 'type') return translateExecutionText('core:executionStream.progress.type', 'Typing text')
    if (action === 'select_option') return translateExecutionText('core:executionStream.progress.select', 'Selecting option')
    if (action === 'screenshot') return translateExecutionText('core:executionStream.progress.screenshot', 'Capturing screenshot')
    return appendBrowserActionLabel(resolveToolCopy(toolName, 'start'), action)
  }
  if (toolName === 'terminal_session_open') return terminalLabel
    ? translateExecutionText('core:executionStream.progress.terminalOpenNamed', 'Opening {{terminalLabel}}', { terminalLabel })
    : translateExecutionText('core:executionStream.progress.terminalOpen', 'Opening terminal')
  if (toolName === 'terminal_session_read_snapshot') return terminalLabel
    ? translateExecutionText('core:executionStream.progress.terminalReadNamed', 'Reading output from {{terminalLabel}}', { terminalLabel })
    : translateExecutionText('core:executionStream.progress.terminalRead', 'Reading terminal output')
  if (toolName === 'terminal_session_attach') return translateExecutionText('core:executionStream.progress.terminalAttach', 'Reusing terminal session')
  if (toolName === 'terminal_session_write') return terminalLabel
    ? translateExecutionText('core:executionStream.progress.terminalWriteNamed', 'Writing to {{terminalLabel}}', { terminalLabel })
    : translateExecutionText('core:executionStream.progress.terminalWrite', 'Writing to terminal')
  if (toolName === 'terminal_session_wait_for_output') return terminalLabel
    ? translateExecutionText('core:executionStream.progress.terminalWaitNamed', 'Waiting for output from {{terminalLabel}}', { terminalLabel })
    : translateExecutionText('core:executionStream.progress.terminalWait', 'Waiting for terminal output')
  if (toolName === 'terminal_session_resize') return terminalLabel
    ? translateExecutionText('core:executionStream.progress.terminalResizeNamed', 'Resizing {{terminalLabel}}', { terminalLabel })
    : translateExecutionText('core:executionStream.progress.terminalResize', 'Resizing terminal session')
  if (toolName === 'terminal_session_signal') return terminalLabel
    ? translateExecutionText('core:executionStream.progress.terminalSignalNamed', 'Signaling {{terminalLabel}}', { terminalLabel })
    : translateExecutionText('core:executionStream.progress.terminalSignal', 'Signaling terminal session')
  if (toolName === 'terminal_session_close') return terminalLabel
    ? translateExecutionText('core:executionStream.progress.terminalCloseNamed', 'Closing {{terminalLabel}}', { terminalLabel })
    : translateExecutionText('core:executionStream.progress.terminalClose', 'Closing terminal session')
  if (toolName) return resolveToolCopy(toolName, 'start') || summary || translateExecutionText('core:executionStream.progress.runningTool', 'Running {{toolName}}', { toolName })
  return summary || translateExecutionText('core:executionStream.progress.working', 'Working')
}

function resolveResultLabel(event = {}) {
  const toolName = resolveToolName(event)
  const summary = resolveSummary(event)
  const verb = resolveResultVerb(event)
  const pathLabel = resolvePathTarget(event)
  const terminalLabel = resolveTerminalSessionLabel(event)
  if (toolName === 'plan_update' && verb === 'done') {
    const changeCount = Math.max(1, Number(resolveActivity(event)?.coalescedCount) || 1)
    return changeCount > 1
      ? translateExecutionText('core:executionStream.result.planUpdatedBatch', 'Plan updated ({{count}} changes)', { count: changeCount })
      : translateExecutionText('core:executionStream.result.planUpdated', 'Plan updated')
  }
  if (toolName === 'list_directory') {
    const count = resolveDirectoryCount(event)
    if (pathLabel) {
      const countPrefix = Number.isFinite(count) ? `${count} item${count === 1 ? '' : 's'} ` : ''
      return translateExecutionText('core:executionStream.result.listDirectory', 'Listed {{countPrefix}}in {{pathLabel}}', {
        countPrefix,
        pathLabel,
      }).trim()
    }
  }
  if (toolName === 'create_directory' && pathLabel) return translateExecutionText('core:executionStream.result.createDirectory', 'Created folder {{pathLabel}}', { pathLabel })
  if (toolName === 'write_file' && pathLabel) return translateExecutionText('core:executionStream.result.writeFile', 'Wrote {{pathLabel}}', { pathLabel })
  if (toolName === 'edit_file' && pathLabel) return translateExecutionText('core:executionStream.result.editFile', 'Updated {{pathLabel}}', { pathLabel })
  if ((toolName === 'read_file' || toolName === 'view_file_range') && pathLabel) return translateExecutionText('core:executionStream.result.readFile', 'Read {{pathLabel}}', { pathLabel })
  if (toolName === 'delete_file' && pathLabel) return translateExecutionText('core:executionStream.result.deleteFile', 'Deleted {{pathLabel}}', { pathLabel })
  if (toolName === 'rollback_file' && pathLabel) return translateExecutionText('core:executionStream.result.rollbackFile', 'Rolled back {{pathLabel}}', { pathLabel })
  if (toolName === 'rename_file') {
    const { oldPath, newPath } = resolveRenameTargets(event)
    if (oldPath && newPath) return translateExecutionText('core:executionStream.result.renameFile', 'Renamed {{oldPath}} to {{newPath}}', { oldPath, newPath })
  }
  if (toolName === 'search_code') {
    const searchPath = normalizePathLabel(resolveToolInput(event)?.path || '.')
    const query = resolveSearchQuery(event)
    const count = resolveSearchCount(event)
    const countPrefix = Number.isFinite(count) ? `${count} match${count === 1 ? '' : 'es'} ` : 'matches '
    if (query) return translateExecutionText('core:executionStream.result.searchCode', 'Found {{countPrefix}}for "{{query}}" in {{searchPath}}', {
      countPrefix,
      query,
      searchPath,
    })
  }
  if (toolName === 'grep_file') {
    const pattern = normalizeText(resolveToolInput(event)?.pattern || '')
    if (pattern && pathLabel) return translateExecutionText('core:executionStream.result.grepFile', 'Found matches for "{{pattern}}" in {{pathLabel}}', { pattern, pathLabel })
  }
  if (toolName === 'find_files') {
    const pattern = normalizeText(resolveToolInput(event)?.pattern || '')
    if (pattern) return translateExecutionText('core:executionStream.result.findFiles', 'Found matches for "{{pattern}}"', { pattern })
  }
  if (toolName === 'fetch_page') {
    const hostLabel = resolveUrlLabel(resolveToolInput(event)?.url || '')
    if (hostLabel) return translateExecutionText('core:executionStream.result.fetchPage', 'Fetched {{hostLabel}}', { hostLabel })
  }
  if (toolName === 'browser_action') {
    const action = normalizeLower(resolveToolInput(event)?.action || '')
    if (action === 'navigate') return translateExecutionText('core:executionStream.result.navigate', 'Navigation complete')
    if (action === 'click') return translateExecutionText('core:executionStream.result.click', 'Click completed')
    if (action === 'type') return translateExecutionText('core:executionStream.result.type', 'Typing complete')
    if (action === 'select_option') return translateExecutionText('core:executionStream.result.select', 'Selection complete')
    if (action === 'screenshot') return translateExecutionText('core:executionStream.result.screenshot', 'Screenshot captured')
    return appendBrowserActionLabel(
      translateExecutionText('core:executionStream.result.browserAction', 'Browser action complete'),
      action,
    )
  }
  if (toolName === 'terminal_session_open') return terminalLabel
    ? translateExecutionText('core:executionStream.result.terminalOpenNamed', 'Opened {{terminalLabel}}', { terminalLabel })
    : translateExecutionText('core:executionStream.result.terminalOpen', 'Opened terminal')
  if (toolName === 'terminal_session_read_snapshot') return terminalLabel
    ? translateExecutionText('core:executionStream.result.terminalReadNamed', 'Read output from {{terminalLabel}}', { terminalLabel })
    : translateExecutionText('core:executionStream.result.terminalRead', 'Read terminal output')
  if (toolName === 'terminal_session_attach') return terminalLabel
    ? translateExecutionText('core:executionStream.result.terminalAttachNamed', 'Reused {{terminalLabel}} in chat terminal dock', { terminalLabel })
    : translateExecutionText('core:executionStream.result.terminalAttach', 'Reused terminal session in chat terminal dock')
  if (toolName === 'terminal_session_write') return terminalLabel
    ? translateExecutionText('core:executionStream.result.terminalWriteNamed', 'Wrote to {{terminalLabel}}', { terminalLabel })
    : translateExecutionText('core:executionStream.result.terminalWrite', 'Wrote to terminal')
  if (toolName === 'terminal_session_wait_for_output') {
    const terminalSession = resolveActivity(event)?.terminalSession && typeof resolveActivity(event)?.terminalSession === 'object'
      ? resolveActivity(event).terminalSession
      : {}
    if (terminalSession?.matched === true) {
      return terminalLabel
        ? translateExecutionText('core:executionStream.result.terminalWaitMatchedNamed', 'Matched expected output in {{terminalLabel}}', { terminalLabel })
        : translateExecutionText('core:executionStream.result.terminalWaitMatched', 'Matched expected terminal output')
    }
    if (terminalSession?.timedOut === true) {
      return terminalLabel
        ? translateExecutionText('core:executionStream.result.terminalWaitTimedOutNamed', 'Timed out waiting for {{terminalLabel}}', { terminalLabel })
        : translateExecutionText('core:executionStream.result.terminalWaitTimedOut', 'Timed out waiting for terminal output')
    }
    return terminalLabel
      ? translateExecutionText('core:executionStream.result.terminalWaitNamed', 'Waited for output in {{terminalLabel}}', { terminalLabel })
      : translateExecutionText('core:executionStream.result.terminalWait', 'Waited for terminal output')
  }
  if (toolName === 'terminal_session_resize') return terminalLabel
    ? translateExecutionText('core:executionStream.result.terminalResizeNamed', 'Resized {{terminalLabel}}', { terminalLabel })
    : translateExecutionText('core:executionStream.result.terminalResize', 'Terminal session resized')
  if (toolName === 'terminal_session_signal') return terminalLabel
    ? translateExecutionText('core:executionStream.result.terminalSignalNamed', 'Signaled {{terminalLabel}}', { terminalLabel })
    : translateExecutionText('core:executionStream.result.terminalSignal', 'Terminal session signaled')
  if (toolName === 'terminal_session_close') return terminalLabel
    ? translateExecutionText('core:executionStream.result.terminalCloseNamed', 'Closed {{terminalLabel}}', { terminalLabel })
    : translateExecutionText('core:executionStream.result.terminalClose', 'Closed terminal')
  if (toolName === 'git_status') return verb === 'failed'
    ? translateExecutionText('core:executionStream.result.gitStatusFailed', 'Git status failed')
    : translateExecutionText('core:executionStream.result.gitStatusDone', 'Git status done')
  if (toolName === 'git_diff') return verb === 'failed'
    ? translateExecutionText('core:executionStream.result.gitDiffFailed', 'Git diff failed')
    : translateExecutionText('core:executionStream.result.gitDiffReady', 'Git diff ready')
  if (toolName === 'git_log') return verb === 'failed'
    ? translateExecutionText('core:executionStream.result.gitLogFailed', 'Git log failed')
    : translateExecutionText('core:executionStream.result.gitLogReady', 'Git history loaded')
  if (toolName === 'git_commit') return verb === 'failed'
    ? translateExecutionText('core:executionStream.result.gitCommitFailed', 'Commit failed')
    : translateExecutionText('core:executionStream.result.gitCommitCreated', 'Commit created')
  if (toolName === 'git_checkout_file') {
    const refValue = normalizeText(resolveToolInput(event)?.ref || 'HEAD') || 'HEAD'
    if (pathLabel) return translateExecutionText('core:executionStream.result.restoreFile', 'Restored {{pathLabel}} from {{refValue}}', { pathLabel, refValue })
  }
  if (toolName === 'run_command' || toolName === 'local_shell') {
    const commandScope = resolveCommandScope(event)
    if (verb === 'done') return translateExecutionText('core:executionStream.result.commandDone', 'Command finished in {{commandScope}}', { commandScope })
    if (verb === 'failed') return translateExecutionText('core:executionStream.result.commandFailed', 'Command failed in {{commandScope}}', { commandScope })
    if (verb === 'denied') return translateExecutionText('core:executionStream.result.commandDenied', 'Command denied in {{commandScope}}', { commandScope })
  }
  if (toolName === 'apply_artifact_revision') return verb === 'failed'
    ? translateExecutionText('core:executionStream.result.revisionApplyFailed', 'Revision apply failed')
    : translateExecutionText('core:executionStream.result.revisionApplied', 'Revision applied')
  if (toolName) return resolveToolCopy(toolName, resolveResultVerb(event)) || translateExecutionText('core:executionStream.result.genericToolResult', '{{toolName}} {{verb}}', { toolName, verb: resolveResultVerb(event) })
  return summary || translateExecutionText('core:executionStream.result.actionFinished', 'Action finished')
}

function isSuccessfulPlanUpdate(event = {}) {
  return normalizeLower(event?.kind) === 'tool_result'
    && normalizeLower(resolveToolName(event)) === 'plan_update'
    && resolveResultVerb(event) === 'done'
}

export function coalesceExecutionStreamEvents(events = []) {
  const source = Array.isArray(events) ? events : []
  const coalesced = []
  let planUpdateBatch = []

  const flushPlanUpdateBatch = () => {
    if (planUpdateBatch.length <= 0) return
    const last = planUpdateBatch[planUpdateBatch.length - 1]
    coalesced.push(planUpdateBatch.length === 1
      ? last
      : {
          ...last,
          activity: {
            ...(last?.activity && typeof last.activity === 'object' ? last.activity : {}),
            coalescedCount: planUpdateBatch.length,
          },
        })
    planUpdateBatch = []
  }

  for (const event of source) {
    if (isSuccessfulPlanUpdate(event)) {
      planUpdateBatch.push(event)
      continue
    }
    flushPlanUpdateBatch()
    coalesced.push(event)
  }
  flushPlanUpdateBatch()
  return coalesced
}

function resolveWarningLabel(event = {}) {
  const eventKind = resolveEventKind(event)
  if (eventKind === 'openai_manual_compaction_failed' || eventKind === 'openai_compaction_event') {
    return translateExecutionText('core:executionStream.warning.compactionFailed', 'Context compaction failed')
  }
  return resolveSummary(event) || translateExecutionText('core:executionStream.warning.generic', 'Warning')
}

function resolveErrorLabel(event = {}) {
  const toolName = resolveToolName(event)
  if (toolName) return resolveToolCopy(toolName, 'failed') || translateExecutionText('core:executionStream.error.toolFailed', '{{toolName}} failed', { toolName })
  return resolveSummary(event) || translateExecutionText('core:executionStream.error.actionFailed', 'Action failed')
}

function hasVisibleToolOutputForSession(sessionMeta = null) {
  if (!sessionMeta || typeof sessionMeta !== 'object') return false
  const stdout = normalizeText(sessionMeta?.outputByStream?.stdout || '')
  const stderr = normalizeText(sessionMeta?.outputByStream?.stderr || '')
  return Boolean(stdout || stderr)
}

export function isExecutionStreamEventVisible(event = {}) {
  const liveKind = normalizeLower(event?.kind)
  if (!liveKind) return false

  if (liveKind === 'reasoning') {
    const detail = normalizeText(event?.detail || event?.activity?.detail || '')
    if (/^reasoning tokens:\s*\d+$/i.test(detail)) return false
  }

  // Keep the execution stream limited to the live narrative:
  // reasoning milestones, tool actions, outputs/previews, blocking alerts,
  // and provider/user-driven compaction phases that materially affect turn latency.
  if (liveKind === 'reasoning' || liveKind === 'tool_output') return true
  if (isActiveCompactionLifecycle(event) || isCompactionMilestone(event)) return true
  if (
    isSuccessfulDelegationEnvelope(event)
    || isTurnStartLifecycle(event)
    || isTurnLifecycle(event)
    || isRunbookOnlyInfo(event)
    || isLocalCompaction(event)
    || isProviderToolStatus(event)
    || isGenericPendingProgress(event)
  ) {
    return false
  }
  if (liveKind === 'tool_start' || liveKind === 'tool_progress' || liveKind === 'tool_result') return true
  if (liveKind === 'error') return true
  if (liveKind === 'warning') return false
  return false
}

export function buildExecutionStreamActivityRow(event = {}, sessionMeta = null) {
  if (!isExecutionStreamEventVisible(event)) return null

  const liveKind = normalizeLower(event?.kind)
  const eventKind = resolveEventKind(event)
  if (liveKind === 'reasoning' || liveKind === 'tool_output') return null
  if (isTurnStartLifecycle(event)) {
    return {
      type: 'transport',
      id: normalizeText(event?.id),
      label: translateExecutionText('core:executionStream.transport.startingTurn', 'Starting turn'),
      toneClass: 'text-text-primary',
      showDots: true,
      detail: '',
      preview: [],
      previewExpanded: [],
      previewCollapsible: false,
    }
  }
  if (isActiveCompactionLifecycle(event)) {
    const status = resolveActivityStatus(event)
    const requested = status === 'requested'
    return {
      type: 'compaction',
      id: normalizeText(event?.id),
      label: requested
        ? translateExecutionText('core:executionStream.compaction.requested', 'Compacting context')
        : translateExecutionText('core:executionStream.compaction.running', 'Compacting context'),
      toneClass: 'text-text-primary',
      showDots: true,
      detail: '',
      preview: [],
      previewExpanded: [],
      previewCollapsible: false,
    }
  }
  if (isCompactionMilestone(event)) {
    return {
      type: 'compaction_milestone',
      id: normalizeText(event?.id),
      label: resolveCompactionMilestoneTitle(event),
      toneClass: 'text-text-primary',
      showDots: false,
      detail: resolveCompactionMilestoneDetail(event),
      milestoneTone: normalizeLower(resolveActivity(event)?.compactionMilestoneTone || 'provider'),
      preview: [],
      previewExpanded: [],
      previewCollapsible: false,
    }
  }
  if (liveKind === 'tool_start') {
    return {
      type: 'tool_start',
      id: normalizeText(event?.id),
      label: resolveProgressLabel(event),
      toneClass: 'text-accent-soft',
      showDots: false,
      detail: resolveRowDetail(event, 'tool_start', sessionMeta),
      preview: [],
      previewExpanded: [],
      previewCollapsible: false,
    }
  }
  if (resolveEventKind(event) === 'provider_tool_output') {
    const previewPayload = resolveRowPreview(event, 'tool_result', sessionMeta)
    return {
      type: 'tool_result',
      id: normalizeText(event?.id),
      label: resolveResultLabel({
        ...event,
        status: 'done',
      }),
      toneClass: 'text-text-primary',
      showDots: false,
      detail: resolveRowDetail(event, 'tool_result', sessionMeta),
      ...previewPayload,
    }
  }
  if (liveKind === 'tool_progress') {
    const previewPayload = resolveRowPreview(event, 'tool_progress', sessionMeta)
    const isMoaAgentStart = eventKind === 'moa_agent_start'
    const isMoaAgentDone = eventKind === 'moa_agent_done'
    const taskInstructionText = isMoaAgentStart || isMoaAgentDone
      ? resolveMoaTaskInstructionText(event)
      : ''
    const richContentText = isMoaAgentDone ? resolveMoaReportText(event) : ''
    return {
      type: 'tool_progress',
      id: normalizeText(event?.id),
      label: isMoaAgentStart || isMoaAgentDone ? resolveMoaRoleLabelForEvent(event) : resolveProgressLabel(event),
      toneClass: 'text-text-primary',
      isChild: isMoaAgentStart || isMoaAgentDone,
      iconKind: isMoaAgentDone ? 'success' : '',
      showDots: isMoaAgentStart,
      detail: resolveRowDetail(event, 'tool_progress', sessionMeta),
      taskInstructionText,
      richContentText,
      ...previewPayload,
    }
  }
  if (liveKind === 'tool_result') {
    const toolName = resolveToolName(event)
    if (
      (toolName === 'run_command' || toolName === 'local_shell')
      && hasVisibleToolOutputForSession(sessionMeta)
    ) {
      return null
    }
    const previewPayload = resolveRowPreview(event, 'tool_result', sessionMeta)
    const isMoaAgentDone = eventKind === 'moa_agent_done'
    const taskInstructionText = isMoaAgentDone ? resolveMoaTaskInstructionText(event) : ''
    const moaOutput = isMoaAgentDone ? resolveMoaReportText(event) : ''
    return {
      type: 'tool_result',
      id: normalizeText(event?.id),
      label: isMoaAgentDone ? resolveMoaRoleLabelForEvent(event) : resolveResultLabel(event),
      toneClass: isMoaAgentDone
        ? 'text-text-primary'
        : (normalizeLower(event?.status) === 'warning' ? 'text-warning-soft' : 'text-text-primary'),
      isChild: isMoaAgentDone,
      iconKind: isMoaAgentDone ? 'success' : '',
      showDots: false,
      detail: resolveRowDetail(event, 'tool_result', sessionMeta),
      taskInstructionText,
      richContentText: moaOutput,
      ...previewPayload,
    }
  }
  if (liveKind === 'warning') {
    const previewPayload = resolveRowPreview(event, 'warning', sessionMeta)
    return {
      type: 'warning',
      id: normalizeText(event?.id),
      label: resolveWarningLabel(event),
      toneClass: 'text-warning-soft',
      showDots: false,
      detail: resolveRowDetail(event, 'warning', sessionMeta),
      ...previewPayload,
    }
  }
  if (liveKind === 'error') {
    const toolName = normalizeLower(resolveToolName(event))
    const isShellToolError = toolName === 'run_command' || toolName === 'local_shell'
    const previewPayload = isShellToolError
      ? {
          preview: [],
          previewExpanded: [],
          previewCollapsible: false,
        }
      : resolveRowPreview(event, 'error', sessionMeta)
    const isMoaAgentError = eventKind === 'moa_agent_error'
    const taskInstructionText = isMoaAgentError ? resolveMoaTaskInstructionText(event) : ''
    return {
      type: 'error',
      id: normalizeText(event?.id),
      label: isMoaAgentError ? resolveMoaRoleLabelForEvent(event) : resolveErrorLabel(event),
      toneClass: isMoaAgentError ? 'text-text-primary' : 'text-warning-soft',
      isChild: isMoaAgentError,
      iconKind: isMoaAgentError ? 'error' : '',
      showDots: false,
      detail: resolveRowDetail(event, isShellToolError ? 'tool_result' : 'error', sessionMeta),
      taskInstructionText,
      ...previewPayload,
    }
  }
  return null
}
