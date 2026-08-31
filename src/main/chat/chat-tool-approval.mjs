import crypto from 'node:crypto'
import { requestApproval, getApprovalTimeoutMs } from './approval-flow.mjs'
import { prepareToolApprovalInput } from './chat-tool-step.mjs'
import {
  buildApprovalPolicyForTool,
  shouldShortCircuitToolByPolicy,
} from './run-command-approval-policy.mjs'
import { resolveRunCommandApprovalExecution } from './run-command-approval-execution.mjs'
import { resolveToolApprovalPromptDecision } from './tool-approval-rules.mjs'
import { recordApprovedRiskyActionSession } from './risky-action-session-state.mjs'
import {
  hasExactFileAccessGrantForTurn,
  recordExactFileAccessGrantForTurn,
} from './file-access-turn-state.mjs'
import { commitProjectedTimelineEvent } from './canonical-root-event-writer.mjs'
import {
  recordGlobalRunCommandApprovalTelemetryShown,
  recordGlobalRunCommandApprovalTelemetryDecision,
  recordGlobalRunCommandPolicyTelemetryEvent,
  recordGlobalToolApprovalPromptDecisionTelemetry,
} from './run-command-policy-telemetry.mjs'

const APPROVAL_WAIT_TIMEOUT_MS = getApprovalTimeoutMs()

function isRunCommandLikeTool(toolName = '') {
  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  return normalizedToolName === 'run_command' || normalizedToolName === 'local_shell'
}

function buildBrowserActionPolicyActivityMeta({
  toolName,
  approvalPolicy,
  approvalPromptSource = '',
  approvalPromptAction = '',
  approvalPromptShown = false,
} = {}) {
  if (String(toolName || '').trim().toLowerCase() !== 'browser_action') return {}
  const policy = approvalPolicy && typeof approvalPolicy === 'object' ? approvalPolicy : null
  if (!policy || String(policy.type || '').trim() !== 'browser_action_policy_v1') return {}
  const autoApprovedBy = (
    approvalPromptShown !== true
    && String(approvalPromptAction || '').trim().toLowerCase() === 'approve'
  )
    ? String(approvalPromptSource || '').trim().toLowerCase()
    : ''
  return {
    browserActionPolicy: {
      action: String(policy.action || '').trim(),
      targetClass: String(policy.targetClass || '').trim(),
      targetOrigin: String(policy.targetOrigin || '').trim(),
      targetHost: String(policy.targetHost || '').trim(),
      resolvedAddresses: Array.isArray(policy.resolvedAddresses)
        ? policy.resolvedAddresses.map((value) => String(value || '').trim()).filter(Boolean)
        : [],
      approvalClass: String(policy.approvalClass || '').trim(),
      policyDecision: String(policy.policyDecision || '').trim(),
      elevated: policy.elevated === true,
      autoApprovedBy,
    },
  }
}

export async function resolveToolApprovalForStep({
  sender,
  wid,
  tc,
  toolInput,
  toolEventInput,
  stepId,
  stepSequence,
  stepStartedAt,
  activeThreadId,
  activeTurnId,
  projectFolder,
  loop,
  settings,
  hostFullAccessApprovedForTurn = false,
  send,
  sendTurnState = () => {},
  persistTimelineEvent,
} = {}) {
  const {
    previewPrevContent,
    approvalToolInput,
    applyPreviewContent,
  } = await prepareToolApprovalInput({
    tc,
    toolInput,
    projectFolder,
    fileSystemHostFullAccess: String(settings?.permissionMode || '').trim().toLowerCase() === 'full_access',
  })

  const approvalId = `${wid}-${Date.now()}-${crypto.randomUUID().slice(0, 12)}`
  const approvalPolicy = await buildApprovalPolicyForTool({
    toolName: tc.name,
    toolInput: approvalToolInput,
    projectFolder,
    commandSafetySettings: settings.commandSafety,
    permissionMode: settings?.permissionMode,
    threadId: activeThreadId,
    turnId: activeTurnId,
  })
  const ruleDecision = resolveToolApprovalPromptDecision({
    toolName: tc.name,
    projectFolder,
    approvalPolicy,
    permissionMode: settings?.permissionMode,
  })
  const approvalPromptDecision = hasExactFileAccessGrantForTurn({
    threadId: activeThreadId,
    turnId: activeTurnId,
    approvalPolicy,
  })
    ? {
      action: 'approve',
      source: 'exact_file_turn_reuse',
      permissionMode: settings?.permissionMode,
      approvalMeta: {
        fileSystem: { hostFullAccess: true, exactPathThisTurn: true, reusedFromTurnApproval: true },
      },
    }
    : ruleDecision
  const riskyActionSessionCandidate = (
    approvalPromptDecision?.riskyActionSessionCandidate
    && typeof approvalPromptDecision.riskyActionSessionCandidate === 'object'
  )
    ? approvalPromptDecision.riskyActionSessionCandidate
    : null
  const autoApproveHostFullAccessForTurn = (
    isRunCommandLikeTool(tc.name)
    && hostFullAccessApprovedForTurn
    && approvalPolicy
    && typeof approvalPolicy === 'object'
    && String(approvalPolicy.type || '') === 'run_command_policy_v1'
    && approvalPolicy.elevationRequired === true
    && String(approvalPolicy.executionTarget || 'host') === 'host'
    && String(approvalPolicy.policyDecision || '').trim().toLowerCase() === 'require_elevation'
  )
  const shortCircuit = shouldShortCircuitToolByPolicy({
    toolName: tc.name,
    approvalPolicy,
  })
  const autoApproveByRuleOrAccess = (
    !shortCircuit
    && !autoApproveHostFullAccessForTurn
    && approvalPromptDecision
    && approvalPromptDecision.action === 'approve'
  )
  const accessModeShortCircuit = (
    !shortCircuit
    && !autoApproveHostFullAccessForTurn
    && approvalPromptDecision
    && approvalPromptDecision.action === 'deny'
  )
  const approvalPromptShown = (
    !shortCircuit
    && !autoApproveByRuleOrAccess
    && !accessModeShortCircuit
    && !autoApproveHostFullAccessForTurn
  )
  if (
    !shortCircuit
    && !autoApproveHostFullAccessForTurn
    && approvalPromptDecision
    && approvalPromptDecision.action !== 'prompt'
  ) {
    recordGlobalToolApprovalPromptDecisionTelemetry({
      source: approvalPromptDecision.source,
      action: approvalPromptDecision.action,
      toolName: tc.name,
      commandClass: String(approvalPolicy?.commandClass || ''),
      permissionMode: String(approvalPromptDecision.permissionMode || settings?.permissionMode || 'ask'),
    })
  }
  if (
    approvalPromptShown
    && isRunCommandLikeTool(tc.name)
    && approvalPolicy
    && typeof approvalPolicy === 'object'
  ) {
    recordGlobalRunCommandApprovalTelemetryShown(approvalPolicy)
  }

  const approval = shortCircuit?.action === 'deny'
    ? {
      decision: 'denied',
      denyReason: String(shortCircuit.denyReason || 'policy_denied'),
    }
    : accessModeShortCircuit
      ? {
        decision: 'denied',
        denyReason: String(approvalPromptDecision?.denyReason || 'policy_denied'),
      }
      : autoApproveByRuleOrAccess
        ? {
          decision: 'approved',
          approvalMeta: approvalPromptDecision.approvalMeta && typeof approvalPromptDecision.approvalMeta === 'object'
            ? approvalPromptDecision.approvalMeta
            : null,
        }
        : autoApproveHostFullAccessForTurn
          ? {
            decision: 'approved',
            approvalMeta: {
              runCommand: {
                hostFullAccess: true,
                hostFullAccessThisTurn: true,
                reusedFromTurnApproval: true,
              },
            },
          }
          : await requestApproval(
            sender,
            approvalId,
            tc.name,
            approvalToolInput,
            projectFolder,
            previewPrevContent,
            loop,
            (phase, payload = {}) => {
              const basePayload = {
                threadId: activeThreadId,
                turnId: activeTurnId,
                stepId,
                sequence: stepSequence,
                startedAt: stepStartedAt,
                toolName: tc.name,
                toolInput: toolEventInput,
                ...payload,
              }

              if (phase === 'timeout') {
                commitProjectedTimelineEvent({
                  persistTimelineEvent, send, kind: 'approval_timeout',
                  options: {
                    role: 'system',
                    content: `Approval expired for ${tc.name} (timeout).`,
                    meta: basePayload,
                  },
                  channel: 'chat:approval-timeout', payload: basePayload,
                })
                return
              }

              const countdownPayload = { ...basePayload, phase }
              if (phase === 'start') {
                commitProjectedTimelineEvent({
                  persistTimelineEvent, send, kind: 'approval_countdown',
                  options: {
                    role: 'system',
                    content: `Approval countdown started for ${tc.name} (${Math.round((Number(basePayload.timeoutMs || APPROVAL_WAIT_TIMEOUT_MS)) / 1000)}s).`,
                    meta: countdownPayload,
                    lifecycle: 'active',
                    progressiveKey: `approval_countdown:${approvalId}`,
                  },
                  channel: 'chat:approval-countdown', payload: countdownPayload,
                })
                sendTurnState('waiting_for_approval', {
                  status: 'waiting_for_approval',
                  label: 'waiting for approval',
                  stepId,
                  sequence: stepSequence,
                  startedAt: stepStartedAt,
                  toolName: tc.name,
                  approvalId,
                  timeoutMs: basePayload.timeoutMs,
                })
                return
              }
              if (phase === 'warning') {
                commitProjectedTimelineEvent({
                  persistTimelineEvent, send, kind: 'approval_countdown',
                  options: {
                    role: 'system',
                    content: `Approval for ${tc.name} is about to expire (${Math.round((Number(basePayload.remainingMs || 0)) / 1000)}s left).`,
                    meta: countdownPayload,
                    lifecycle: 'active',
                    progressiveKey: `approval_countdown:${approvalId}`,
                  },
                  channel: 'chat:approval-countdown', payload: countdownPayload,
                })
              } else {
                send('chat:approval-countdown', countdownPayload)
              }
            },
            {
              threadId: activeThreadId,
              turnId: activeTurnId,
              ...(approvalPolicy
                ? {
                  policy: approvalPolicy,
                  policyDecision: approvalPolicy.policyDecision,
                  executionTarget: approvalPolicy.executionTarget,
                  elevationRequired: !!approvalPolicy.elevationRequired,
                }
                : {}),
              originSurface: 'chat',
              originLabel: 'chat composer',
            },
          )

  if (loop?.cancelled) {
    return {
      cancelled: true,
      applyPreviewContent,
      approvalId,
      approvalPolicy,
      approvalPromptSource: String(approvalPromptDecision?.source || ''),
      approvalPromptAction: String(approvalPromptDecision?.action || (approvalPromptShown ? 'prompt' : '')),
      approvalPromptShown,
      hostFullAccessApprovedForTurn,
      decision: 'denied',
      denyReason: 'cancelled',
      runCommandPolicyActivityMeta: {},
      browserActionPolicyActivityMeta: {},
      approvalEffectiveCommandSafety: settings.commandSafety,
      approvalCommandSafetyOverride: null,
      fileSystemHostFullAccess: String(settings?.permissionMode || '').trim().toLowerCase() === 'full_access',
    }
  }

  const decision = approval?.decision === 'approved' ? 'approved' : 'denied'
  const approvalPromptSource = String(approvalPromptDecision?.source || '')
  const approvalPromptAction = String(approvalPromptDecision?.action || (approvalPromptShown ? 'prompt' : ''))
  if (
    approvalPromptShown
    && isRunCommandLikeTool(tc.name)
    && approvalPolicy
    && typeof approvalPolicy === 'object'
  ) {
    recordGlobalRunCommandApprovalTelemetryDecision({ policy: approvalPolicy, decision })
  }
  const denyReason = decision === 'approved'
    ? ''
    : String(approval?.denyReason || 'user_denied')
  const approvalMeta = approval?.approvalMeta && typeof approval.approvalMeta === 'object'
    ? approval.approvalMeta
    : null
  const {
    runCommandPolicyActivityMeta,
    effectiveCommandSafety: approvalEffectiveCommandSafety,
    commandSafetyOverride: approvalCommandSafetyOverride,
    hostFullAccessThisTurnApproved,
    fileSystemHostFullAccess,
  } = resolveRunCommandApprovalExecution({
    toolName: tc.name,
    approvalPolicy,
    approvalMeta,
    approvalPromptSource,
    approvalPromptAction,
    approvalPromptShown,
    approvalDecision: decision,
    commandSafetySettings: settings.commandSafety,
    permissionMode: settings?.permissionMode,
  })
  const browserActionPolicyActivityMeta = buildBrowserActionPolicyActivityMeta({
    toolName: tc.name,
    approvalPolicy,
    approvalPromptSource,
    approvalPromptAction,
    approvalPromptShown,
  })
  if (decision === 'approved' && hostFullAccessThisTurnApproved) {
    hostFullAccessApprovedForTurn = true
  }
  if (
    decision === 'approved'
    && approvalPromptShown
    && approvalPolicy?.type === 'file_tool_policy_v1'
    && approvalPolicy?.hostAccessRequired === true
  ) {
    recordExactFileAccessGrantForTurn({
      threadId: activeThreadId,
      turnId: activeTurnId,
      approvalPolicy,
    })
  }
  if (decision === 'approved' && riskyActionSessionCandidate) {
    const usedOneShotHostFallback = approvalMeta?.runCommand?.hostInstallFallback === true
    const usedOneShotHostElevation = approvalMeta?.runCommand?.hostFullAccessThisTurn === true
    if (!usedOneShotHostFallback && !usedOneShotHostElevation) {
      recordApprovedRiskyActionSession(riskyActionSessionCandidate)
    }
  }
  if (autoApproveHostFullAccessForTurn && decision === 'approved') {
    recordGlobalRunCommandPolicyTelemetryEvent('host_full_access_turn_reused', {
      commandClass: String(approvalPolicy?.commandClass || ''),
      policyDecision: String(approvalPolicy?.policyDecision || ''),
      executionTarget: String(approvalPolicy?.executionTarget || 'host'),
    })
  }

  return {
    cancelled: false,
    applyPreviewContent,
    approvalId,
    approvalPolicy,
    approvalPromptSource: String(approvalPromptDecision?.source || ''),
    approvalPromptAction: String(approvalPromptDecision?.action || (approvalPromptShown ? 'prompt' : '')),
    approvalPromptShown,
    decision,
    denyReason,
    runCommandPolicyActivityMeta,
    browserActionPolicyActivityMeta,
    approvalEffectiveCommandSafety,
    approvalCommandSafetyOverride,
    fileSystemHostFullAccess,
    hostFullAccessApprovedForTurn,
  }
}
