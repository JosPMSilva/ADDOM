import React from 'react'
import { stripAnsiControlSequences } from './ansi-output.mjs'
import {
  formatToolExecutionLabel,
  formatToolExecutionDetail,
  formatToolResultLabel,
  formatToolResultDetail,
  hasMissingDependencyHint,
} from './chat-utils.js'
import { buildDelegationBadges } from './moa-delegation-badges.mjs'
import { buildMoaPreflightErrorView } from '../moa/moa-preflight-errors-view.mjs'
import { summarizeMoaRoleLabels } from '../../../common/moa/moa-display-formatters.mjs'

function buildDetailPreview(detailText = '', { maxChars = 180, maxLines = 2 } = {}) {
  const lines = stripAnsiControlSequences(detailText || '')
    .split('\n')
    .map((line) => String(line || '').trim())
    .filter(Boolean)
  if (lines.length === 0) return ''
  const merged = lines.slice(0, maxLines).join(' | ')
  if (merged.length <= maxChars && lines.length <= maxLines) return merged
  return `${merged.slice(0, maxChars).trim()}...`
}

function isProviderCompactionActivity(activity = {}) {
  const eventKind = String(activity?.eventKind || '').trim().toLowerCase()
  return (
    eventKind === 'openai_compaction_event'
    || eventKind === 'openai_manual_compaction_requested'
    || eventKind === 'openai_manual_compaction_applied'
    || eventKind === 'openai_manual_compaction_failed'
    || eventKind === 'anthropic_compaction_event'
  )
}

function ToolActivityLine({ activity }) {
  const providerCompactionActivity = isProviderCompactionActivity(activity)
  const {
    type,
    toolName,
    toolInput,
    result,
    label,
    detail,
    isError,
    errorSeverity,
    decision,
    missingDependencySuspected,
    fileChange,
    turnState,
    runCommandPolicy,
    browserActionPolicy,
    moa,
    eventKind,
  } = activity
  const [detailExpanded, setDetailExpanded] = React.useState(false)
  if (providerCompactionActivity) return null
  const normalizedEventKind = String(eventKind || '').trim().toLowerCase()
  const nonFatalContinuityWarning = (
    normalizedEventKind === 'continuity_drift_detected'
    || normalizedEventKind === 'continuity_invariant_violated'
  )
  const warningResult = (
    type === 'result'
    && isError
    && String(errorSeverity || '').trim().toLowerCase() === 'warning'
  )

  const moaMeta = moa && typeof moa === 'object' ? moa : null
  const isDelegationTool = toolName === 'delegate_to_agents' || toolName === 'delegate_to_agents'

  const moaSummary = moaMeta?.summary && typeof moaMeta.summary === 'object' ? moaMeta.summary : {}
  const moaUsage = moaMeta?.usage && typeof moaMeta.usage === 'object' ? moaMeta.usage : {}
  const moaStatus = String(moaMeta?.status || '').trim()
  const moaTaskCount = Number(moaMeta?.taskCount || toolInput?.taskCount || 0) || 0
  const moaRequestedTaskCount = Number(moaMeta?.requestedTaskCount || toolInput?.taskCount || 0) || 0
  const moaPlannedTaskCount = Number(moaMeta?.plannedTaskCount || moaTaskCount || 0) || 0
  const moaExecutedTaskCount = Number(moaMeta?.executedTaskCount || 0) || 0
  const moaSkippedTaskCount = Number(moaMeta?.skippedTaskCount || 0) || 0
  const moaCompleted = Number(moaSummary?.completed || 0) || 0
  const moaFailed = (Number(moaSummary?.failed || 0) || 0)
    + (Number(moaSummary?.timeout || 0) || 0)
    + (Number(moaSummary?.stale || 0) || 0)
    + (Number(moaSummary?.aborted || 0) || 0)
    + (Number(moaSummary?.budgetExceeded || 0) || 0)
    + (Number(moaSummary?.rateLimited || 0) || 0)
    + (Number(moaSummary?.notFound || 0) || 0)
    + (Number(moaSummary?.missingApiKey || 0) || 0)
  const moaStaged = Number(moaSummary?.stagedWrites || moaMeta?.stagedSummary?.count || 0) || 0
  const moaTokens = Number(moaUsage?.totalTokens || 0) || 0
  const moaEstimatedTokens = Number(moaMeta?.estimatedTokens || 0) || 0
  const moaActualTokens = Number(moaMeta?.actualTokens || moaTokens || 0) || 0
  const moaEstimatedUsd = Number.isFinite(Number(moaMeta?.estimatedUsd)) ? Number(moaMeta.estimatedUsd) : null
  const moaActualUsd = Number.isFinite(Number(moaMeta?.actualUsd)) ? Number(moaMeta.actualUsd) : null
  const moaEstimateConfidence = String(moaMeta?.estimateConfidence || '').trim()
  const moaPricingWarning = String(moaMeta?.pricingWarning || '').trim()
  const moaDurationMs = Number(moaMeta?.durationMs || activity?.durationMs || 0) || 0
  const moaRiskTier = String(moaMeta?.riskTier || '').trim()
  const moaStrategy = String(moaMeta?.strategy || '').trim()
  const moaPattern = String(moaMeta?.pattern || '').trim()
  const moaParsedOk = typeof moaMeta?.parsedOk === 'boolean' ? moaMeta.parsedOk : null
  const moaDedupeCount = Number(moaMeta?.dedupeCount || 0) || 0
  const moaDroppedFindings = Number(moaMeta?.droppedFindings || 0) || 0
  const moaSynthesisPayload = moaMeta?.synthesisPayload && typeof moaMeta.synthesisPayload === 'object'
    ? moaMeta.synthesisPayload
    : {}
  const moaPreflightErrorView = buildMoaPreflightErrorView(moaMeta?.errors, {
    maxVisible: 4,
    maxCodeSummary: 5,
    maxTaskSummary: 5,
  })
  const moaRoute = String(moaMeta?.route || '').trim()
  const moaInitiator = String(moaMeta?.initiator || '').trim()

  const isFetchPageTool = toolName === 'fetch_page'

  const computedLabel = label || (
    isDelegationTool && type === 'executing'
      ? `Delegating ${moaTaskCount} task${moaTaskCount === 1 ? '' : 's'} to agents`
      : isDelegationTool && type === 'result'
        ? `Delegation ${moaStatus ? `(${moaStatus})` : ''}`.trim()
        : isFetchPageTool && type === 'executing'
          ? `Fetching: ${String(toolInput?.url || '').slice(0, 80)}`
          : isFetchPageTool && type === 'result'
            ? (warningResult ? 'Fetch warning' : isError ? 'Fetch failed' : decision === 'denied' ? 'Fetch denied' : 'Fetched page')
            : type === 'executing'
              ? formatToolExecutionLabel(toolName, toolInput)
              : type === 'result'
                ? formatToolResultLabel(toolName, decision, isError)
                : type === 'usage'
                  ? 'Context usage update'
                  : type === 'turn'
                    ? `Turn ${turnState || 'update'}`
                    : type === 'file_change'
                      ? 'File changed'
                        : type === 'reasoning'
                          ? 'Reasoning summary captured'
                          : type === 'warning'
                            ? 'Warning'
                          : type === 'info'
                            ? 'Info'
                          : `${toolName} ${type === 'result' ? (decision === 'denied' ? '- denied' : isError ? '- error' : '- done') : ''}`
  )

  const computedDetail = detail || (
    isDelegationTool && type === 'executing'
      ? [
          Array.isArray(toolInput?.roles) && toolInput.roles.length > 0
            ? `agents: ${summarizeMoaRoleLabels(toolInput.roles, { maxVisible: 3 })}`
            : '',
          moaRequestedTaskCount > 0 ? `requested: ${moaRequestedTaskCount}` : '',
          moaPlannedTaskCount > 0 ? `planned: ${moaPlannedTaskCount}` : '',
        ].filter(Boolean).join('\n')
      : isDelegationTool && type === 'result'
        ? [
            moaStatus ? `status: ${moaStatus}` : '',
            moaRequestedTaskCount > 0 ? `requested_task_count: ${moaRequestedTaskCount}` : '',
            moaPlannedTaskCount > 0 ? `planned_task_count: ${moaPlannedTaskCount}` : '',
            moaExecutedTaskCount > 0 ? `executed_task_count: ${moaExecutedTaskCount}` : '',
            moaSkippedTaskCount > 0 ? `skipped_task_count: ${moaSkippedTaskCount}` : '',
            `completed: ${moaCompleted}`,
            `failed: ${moaFailed}`,
            Number(moaSummary?.timeout || 0) > 0 ? `timeout: ${Number(moaSummary.timeout)}` : '',
            Number(moaSummary?.stale || 0) > 0 ? `stale: ${Number(moaSummary.stale)}` : '',
            Number(moaSummary?.aborted || 0) > 0 ? `aborted: ${Number(moaSummary.aborted)}` : '',
            Number(moaSummary?.budgetExceeded || 0) > 0 ? `budget_exceeded: ${Number(moaSummary.budgetExceeded)}` : '',
            moaStaged > 0 ? `staged: ${moaStaged}` : '',
            moaEstimatedTokens > 0 ? `estimated_tokens: ${moaEstimatedTokens}` : '',
            moaActualTokens > 0 ? `actual_tokens: ${moaActualTokens}` : moaTokens > 0 ? `tokens: ${moaTokens}` : '',
            moaEstimatedUsd != null ? `estimated_usd: ${moaEstimatedUsd.toFixed(4)}` : '',
            moaActualUsd != null ? `actual_usd: ${moaActualUsd.toFixed(4)}` : '',
            moaEstimateConfidence ? `estimate_confidence: ${moaEstimateConfidence}` : '',
            moaPricingWarning ? `pricing_warning: ${moaPricingWarning}` : '',
            moaRiskTier ? `risk: ${moaRiskTier}` : '',
            moaStrategy ? `strategy: ${moaStrategy}` : '',
            moaPattern ? `pattern: ${moaPattern}` : '',
            moaParsedOk != null ? `parsed_ok: ${moaParsedOk}` : '',
            moaDedupeCount > 0 ? `dedupe_count: ${moaDedupeCount}` : '',
            moaDroppedFindings > 0 ? `dropped_findings: ${moaDroppedFindings}` : '',
            moaSynthesisPayload?.agentOutputMode ? `synthesis_agent_output_mode: ${String(moaSynthesisPayload.agentOutputMode)}` : '',
            Number(moaSynthesisPayload?.agentOutputsIncluded || 0) > 0 ? `synthesis_agent_outputs_included: ${Number(moaSynthesisPayload.agentOutputsIncluded)}` : '',
            Number(moaSynthesisPayload?.agentOutputsChars || 0) > 0 ? `synthesis_agent_outputs_chars: ${Number(moaSynthesisPayload.agentOutputsChars)}` : '',
            moaSynthesisPayload?.agentOutputsTruncated ? 'synthesis_agent_outputs_truncated: true' : '',
            moaDurationMs > 0 ? `duration_ms: ${moaDurationMs}` : '',
            ...(moaPreflightErrorView.totalCount > 0
              ? [
                  '',
                  ...moaPreflightErrorView.summaryLines,
                  ...moaPreflightErrorView.visibleErrors.map((err) => (
                    `${err.taskId ? `${err.taskId}: ` : ''}${err.message || err.code || 'Unknown delegation error'}${err.code ? ` (${err.code})` : ''}`
                  )),
                  moaPreflightErrorView.hiddenCount > 0 ? `preflight_errors_more: +${moaPreflightErrorView.hiddenCount}` : '',
                ]
              : []),
            '',
            formatToolResultDetail(toolName, toolInput, result, isError, decision),
          ].filter((line, idx, arr) => {
            if (line) return true
            return idx > 0 && idx < arr.length - 1 && !!arr[idx - 1] && !!arr[idx + 1]
          }).join('\n')
        : type === 'executing'
          ? formatToolExecutionDetail(toolName, toolInput)
          : type === 'result'
            ? formatToolResultDetail(toolName, toolInput, result, isError, decision)
            : type === 'file_change'
              ? [
                  fileChange?.newRevId ? `newRevId: ${fileChange.newRevId}` : '',
                  fileChange?.prevRevId ? `prevRevId: ${fileChange.prevRevId}` : '',
                  Number(fileChange?.rev || 0) > 0 ? `rev: ${Number(fileChange.rev)}` : '',
                  Number(fileChange?.contentBytes || 0) > 0 ? `bytes: ${Number(fileChange.contentBytes)}` : '',
                  `added: ${Number(fileChange?.addedLines || 0) || 0}`,
                  `removed: ${Number(fileChange?.removedLines || 0) || 0}`,
                ].filter(Boolean).join('\n')
              : ''
  )
  const runCommandPolicyMeta = runCommandPolicy && typeof runCommandPolicy === 'object' ? runCommandPolicy : null
  const runCommandExecutionTarget = String(runCommandPolicyMeta?.executionTarget || '').trim()
  const runCommandPolicyDecision = String(runCommandPolicyMeta?.policyDecision || '').trim()
  const runCommandSandboxBackend = String(runCommandPolicyMeta?.sandbox?.backend || '').trim()
  const runCommandSandboxAvailable = typeof runCommandPolicyMeta?.sandbox?.available === 'boolean'
    ? runCommandPolicyMeta.sandbox.available
    : null
  const runCommandAutoApprovedBy = String(runCommandPolicyMeta?.autoApprovedBy || '').trim()
  const runCommandSandboxFallbackReason = String(runCommandPolicyMeta?.sandboxFallbackReason || '').trim()
  const runCommandHostFallback = (
    !!runCommandPolicyMeta?.hostInstallFallbackApproved
    || !!runCommandSandboxFallbackReason
  )
  const runCommandWslCompatibilityApproved = !!runCommandPolicyMeta?.wslCompatibilityApproved
  const runCommandPolicyDetail = toolName === 'run_command' ? [
    runCommandPolicyDecision ? `policy_decision: ${runCommandPolicyDecision}` : '',
    runCommandExecutionTarget ? `execution_target: ${runCommandExecutionTarget}` : '',
    runCommandAutoApprovedBy ? `auto_approved_by: ${runCommandAutoApprovedBy}` : '',
    runCommandSandboxBackend ? `sandbox_backend: ${runCommandSandboxBackend}` : '',
    runCommandSandboxAvailable != null ? `sandbox_available: ${runCommandSandboxAvailable}` : '',
    runCommandSandboxFallbackReason ? `sandbox_fallback_reason: ${runCommandSandboxFallbackReason}` : '',
    runCommandHostFallback ? 'host_install_fallback: true' : '',
    runCommandWslCompatibilityApproved ? 'wsl_compatibility_approved: true' : '',
  ].filter(Boolean).join('\n') : ''
  const computedDetailWithRunCommandPolicy = (
    computedDetail && runCommandPolicyDetail
      ? `${computedDetail}\n${runCommandPolicyDetail}`
      : (computedDetail || runCommandPolicyDetail)
  )
  const browserActionPolicyMeta = browserActionPolicy && typeof browserActionPolicy === 'object'
    ? browserActionPolicy
    : null
  const browserActionPolicyDetail = toolName === 'browser_action' ? [
    browserActionPolicyMeta?.targetClass ? `target_class: ${String(browserActionPolicyMeta.targetClass)}` : '',
    browserActionPolicyMeta?.targetOrigin ? `origin: ${String(browserActionPolicyMeta.targetOrigin)}` : '',
    browserActionPolicyMeta?.approvalClass ? `approval_scope: ${String(browserActionPolicyMeta.approvalClass)}` : '',
    browserActionPolicyMeta?.autoApprovedBy ? `auto_approved_by: ${String(browserActionPolicyMeta.autoApprovedBy)}` : '',
    browserActionPolicyMeta?.elevated ? 'elevated: true' : '',
  ].filter(Boolean).join('\n') : ''
  const computedDetailWithPolicy = (
    computedDetailWithRunCommandPolicy && browserActionPolicyDetail
      ? `${computedDetailWithRunCommandPolicy}\n${browserActionPolicyDetail}`
      : (computedDetailWithRunCommandPolicy || browserActionPolicyDetail)
  )

  const delegationBadges = buildDelegationBadges({
    isDelegationTool,
    type,
    taskCount: moaTaskCount,
    requestedTaskCount: moaRequestedTaskCount,
    plannedTaskCount: moaPlannedTaskCount,
    executedTaskCount: moaExecutedTaskCount,
    skippedTaskCount: moaSkippedTaskCount,
    completed: moaCompleted,
    failed: moaFailed,
    staged: moaStaged,
    estimatedTokens: moaEstimatedTokens,
    actualTokens: moaActualTokens,
    totalTokens: moaTokens,
    estimatedUsd: moaEstimatedUsd,
    actualUsd: moaActualUsd,
    estimateConfidence: moaEstimateConfidence,
    riskTier: moaRiskTier,
    strategy: moaStrategy,
    pattern: moaPattern,
    parsedOk: moaParsedOk,
    synthesisPayload: moaSynthesisPayload,
    route: moaRoute,
    initiator: moaInitiator,
    durationMs: moaDurationMs,
    status: moaStatus,
  })

  const isCollapsibleDetail = isDelegationTool && computedDetailWithPolicy && computedDetailWithPolicy.length > 700
  const compactDetailSource = stripAnsiControlSequences(computedDetailWithPolicy || '').trim()
  const compactDetailLineCount = compactDetailSource ? compactDetailSource.split('\n').filter(Boolean).length : 0
  const shouldCollapseDetail = !!compactDetailSource && (
    isCollapsibleDetail
    || compactDetailSource.length > (isDelegationTool ? 320 : 220)
    || compactDetailLineCount > 2
  )
  const shownDetail = shouldCollapseDetail && !detailExpanded
    ? buildDetailPreview(compactDetailSource, {
      maxChars: isDelegationTool ? 240 : 180,
      maxLines: 2,
    })
    : compactDetailSource

  const showMissingDependencyHint = hasMissingDependencyHint(
    toolName,
    isError,
    decision,
    result,
    missingDependencySuspected,
    fileChange,
    turnState,
  )

  const icon = nonFatalContinuityWarning
    ? '[warn]'
    : isFetchPageTool
    ? (type === 'executing' ? '[web]' : decision === 'denied' ? '[deny]' : warningResult ? '[warn]' : isError ? '[err]' : '[web]')
    : ({
      pending: '[wait]',
      executing: '[run]',
      info: '[info]',
      warning: '[warn]',
      usage: '[ctx]',
      turn: '[turn]',
      file_change: '[file]',
      reasoning: '[think]',
      result: decision === 'denied' ? '[deny]' : warningResult ? '[warn]' : isError ? '[err]' : '[ok]',
    }[type] || '[info]')

  const color = nonFatalContinuityWarning
    ? 'text-warning'
    : isFetchPageTool
    ? (type === 'result' && (decision === 'denied' || isError)
        ? (decision === 'denied' ? 'text-text-muted' : warningResult ? 'text-warning' : 'text-danger')
        : 'text-accent-soft')
    : ({
      pending: 'text-text-secondary',
      executing: 'text-accent',
      info: 'text-accent-soft',
      warning: 'text-warning',
      usage: 'text-text-secondary',
      turn: 'text-accent-soft',
      file_change: 'text-success',
      reasoning: 'text-accent-soft',
      result: decision === 'denied' ? 'text-text-muted' : warningResult ? 'text-warning' : isError ? 'text-danger' : 'text-success',
    }[type] || 'text-text-secondary')

  return (
    <div className={`chat-typo-tool-activity-body group/tool flex items-start gap-2 select-text ${color}`}>
      <span className="shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0 select-text">
        <div className="flex flex-wrap items-center gap-2">
          <span>
            {computedLabel}
          </span>
          {delegationBadges.map((badge) => (
            <span
              key={badge}
              className="chat-typo-tool-activity-badge inline-flex items-center rounded-md border border-surface-border/70 bg-surface-panel/45 px-2 py-0.5 uppercase tracking-wide text-text-subtle"
            >
              {badge}
            </span>
          ))}
          {showMissingDependencyHint && (
            <span className="chat-typo-tool-activity-badge inline-flex items-center rounded-md border border-warning-border/70 bg-surface-panel/45 px-2 py-0.5 font-semibold uppercase tracking-wide text-warning-soft">
              Missing dependency suspected
            </span>
          )}
          {toolName === 'run_command' && runCommandExecutionTarget && (
            <span className="chat-typo-tool-activity-badge inline-flex items-center rounded-md border border-surface-border/70 bg-surface-panel/45 px-2 py-0.5 uppercase tracking-wide text-text-secondary">
              {runCommandExecutionTarget === 'install_sandbox' ? 'sandbox' : 'host'}
              {runCommandSandboxBackend ? `:${runCommandSandboxBackend}` : ''}
            </span>
          )}
          {toolName === 'run_command' && runCommandHostFallback && (
            <span className="chat-typo-tool-activity-badge inline-flex items-center rounded-md border border-warning-border/70 bg-surface-panel/45 px-2 py-0.5 uppercase tracking-wide text-warning-soft">
              host fallback
            </span>
          )}
          {toolName === 'browser_action' && browserActionPolicyMeta?.targetClass && (
            <span className="chat-typo-tool-activity-badge inline-flex items-center rounded-md border border-surface-border/70 bg-surface-panel/45 px-2 py-0.5 uppercase tracking-wide text-text-secondary">
              {String(browserActionPolicyMeta.targetClass).replace(/_/g, ' ')}
            </span>
          )}
          {toolName === 'browser_action' && browserActionPolicyMeta?.elevated && (
            <span className="chat-typo-tool-activity-badge inline-flex items-center rounded-md border border-warning-border/70 bg-surface-panel/45 px-2 py-0.5 uppercase tracking-wide text-warning-soft">
              elevated
            </span>
          )}
        </div>
        {shownDetail && (
          shouldCollapseDetail && !detailExpanded ? (
            <p className="chat-typo-tool-activity-detail mt-1 text-text-secondary">
              {shownDetail}
            </p>
          ) : (
            <pre className="chat-typo-tool-activity-detail mt-1 max-h-48 overflow-y-auto cursor-text whitespace-pre-wrap break-words rounded-md border border-surface-border bg-surface-panel-alt px-2 py-1 text-text-secondary select-text">
              {shownDetail}
            </pre>
          )
        )}
        {shouldCollapseDetail && (
          <button
            onClick={() => setDetailExpanded((v) => !v)}
            className="chat-typo-tool-activity-toggle mt-1 text-accent transition-colors hover:text-accent-hover focus-visible:opacity-100 md:opacity-0 md:group-hover/tool:opacity-100 md:group-focus-within/tool:opacity-100"
          >
            {detailExpanded ? 'Hide details' : 'Details'}
          </button>
        )}
      </div>
    </div>
  )
}

const MemoToolActivityLine = React.memo(
  ToolActivityLine,
  (prev, next) => prev.activity === next.activity,
)

export { ToolActivityLine, MemoToolActivityLine }
