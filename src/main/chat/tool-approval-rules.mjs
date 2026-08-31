import { normalizePermissionMode } from '../../common/chat/permission-mode.mjs'
import {
  buildRiskyActionSessionCandidate,
  hasApprovedRiskyActionSession,
} from './risky-action-session-state.mjs'

const RUN_COMMAND_ASK_AUTO_ALLOW_HOST = new Set([
  'project_readonly_shell',
  'project_build_test',
  'project_mutation',
  'process_control',
])

const FILE_TOOL_ASK_AUTO_ALLOW = new Set([
  'read_file',
  'list_directory',
  'search_code',
  'view_file_range',
  'grep_file',
  'find_files',
  'write_file',
  'edit_file',
  'create_directory',
  'rollback_file',
  'apply_artifact_revision',
])

const FILE_TOOL_AUTONOMY_SAFE_READS = new Set([
  'read_file',
  'list_directory',
  'search_code',
  'view_file_range',
  'grep_file',
  'find_files',
])

const WORKSPACE_SAFE_READ_AUTONOMY_AUTO_ALLOW = new Set([
  ...FILE_TOOL_AUTONOMY_SAFE_READS,
  'git_status',
  'git_diff',
  'git_log',
])

const FILE_TOOL_HOST_ACCESS_CAPABLE = new Set([
  ...FILE_TOOL_ASK_AUTO_ALLOW,
  'delete_file',
  'rename_file',
  'apply_patch',
  'file_change',
])

function isRunCommandLikeTool(toolName = '') {
  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  return normalizedToolName === 'run_command' || normalizedToolName === 'local_shell'
}

function isBrowserActionTool(toolName = '') {
  return String(toolName || '').trim().toLowerCase() === 'browser_action'
}

function isFileTool(toolName = '') {
  return FILE_TOOL_HOST_ACCESS_CAPABLE.has(String(toolName || '').trim().toLowerCase())
}

function isTerminalSessionTool(toolName = '') {
  return String(toolName || '').trim().toLowerCase().startsWith('terminal_session_')
}

export function resolveToolApprovalCanonicalErrorClass({
  action = '',
  denyReason = '',
} = {}) {
  const normalizedAction = String(action || '').trim().toLowerCase()
  const normalizedDenyReason = String(denyReason || '').trim().toLowerCase()
  if (normalizedAction === 'approve') return ''
  if (normalizedAction === 'prompt') return 'permission_prompt_required'
  if (normalizedAction !== 'deny') return ''
  if (normalizedDenyReason === 'scope_denied') return 'scope_denied'
  if (normalizedDenyReason) return 'permission_denied'
  return 'permission_denied'
}

function withCanonicalErrorClass(decision = null) {
  const source = decision && typeof decision === 'object' ? decision : {}
  return {
    ...source,
    canonicalErrorClass: resolveToolApprovalCanonicalErrorClass(source),
  }
}

export function resolveToolApprovalPromptDecision({
  toolName,
  projectFolder,
  approvalPolicy,
  permissionMode,
} = {}) {
  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  const mode = normalizePermissionMode(permissionMode)
  const riskyActionSessionCandidate = buildRiskyActionSessionCandidate({
    toolName: normalizedToolName,
    projectFolder,
    approvalPolicy,
  })

  if (hasApprovedRiskyActionSession(riskyActionSessionCandidate)) {
    const approvalMeta = {
      riskyActionSession: {
        autoApprovedBy: 'project_session',
        sessionKey: String(riskyActionSessionCandidate?.sessionKey || ''),
        candidateKey: String(riskyActionSessionCandidate?.key || ''),
      },
    }
    return withCanonicalErrorClass({
      action: 'approve',
      source: 'risky_action_session',
      permissionMode: mode,
      approvalMeta,
      riskyActionSessionCandidate,
    })
  }

  const browserPolicy = approvalPolicy && typeof approvalPolicy === 'object' ? approvalPolicy : null
  const browserPolicyDecision = String(browserPolicy?.policyDecision || '').trim().toLowerCase()
  const terminalPolicy = approvalPolicy && typeof approvalPolicy === 'object' && String(approvalPolicy?.type || '').trim() === 'terminal_session_policy_v1'
    ? approvalPolicy
    : null
  const terminalPolicyDecision = String(terminalPolicy?.policyDecision || '').trim().toLowerCase()
  const terminalAction = String(terminalPolicy?.action || '').trim().toLowerCase()
  if (isTerminalSessionTool(normalizedToolName) && terminalPolicyDecision === 'deny') {
    return withCanonicalErrorClass({
      action: 'deny',
      source: 'policy',
      permissionMode: mode,
      approvalMeta: null,
      denyReason: 'policy_denied',
      riskyActionSessionCandidate,
    })
  }

  if (isTerminalSessionTool(normalizedToolName) && mode !== 'full_access') {
    if (terminalPolicyDecision === 'require_elevation') {
      return withCanonicalErrorClass({
        action: 'prompt',
        source: 'prompt',
        permissionMode: mode,
        approvalMeta: null,
        riskyActionSessionCandidate,
      })
    }
    if (terminalAction && terminalAction !== 'open') {
      return withCanonicalErrorClass({
        action: 'approve',
        source: `terminal_session_${mode}`,
        permissionMode: mode,
        approvalMeta: null,
        riskyActionSessionCandidate,
      })
    }
    return withCanonicalErrorClass({
      action: 'prompt',
      source: 'prompt',
      permissionMode: mode,
      approvalMeta: null,
      riskyActionSessionCandidate,
    })
  }

  if (isBrowserActionTool(normalizedToolName) && browserPolicyDecision === 'deny') {
    return withCanonicalErrorClass({
      action: 'deny',
      source: 'policy',
      permissionMode: mode,
      approvalMeta: null,
      denyReason: 'policy_denied',
      riskyActionSessionCandidate,
    })
  }

  if (isBrowserActionTool(normalizedToolName) && browserPolicyDecision === 'approve') {
    return withCanonicalErrorClass({
      action: 'approve',
      source: `browser_policy_${mode}`,
      permissionMode: mode,
      approvalMeta: null,
      riskyActionSessionCandidate,
    })
  }

  if (
    isRunCommandLikeTool(normalizedToolName)
    && approvalPolicy?.type === 'run_command_policy_v1'
    && String(approvalPolicy?.policyDecision || '').trim().toLowerCase() === 'deny'
  ) {
    return withCanonicalErrorClass({
      action: 'deny',
      source: 'policy',
      permissionMode: mode,
      approvalMeta: null,
      denyReason: 'policy_denied',
      riskyActionSessionCandidate,
    })
  }

  if (mode === 'ask' && FILE_TOOL_ASK_AUTO_ALLOW.has(normalizedToolName)) {
    if (approvalPolicy?.type === 'file_tool_policy_v1' && approvalPolicy?.hostAccessRequired === true) {
      return withCanonicalErrorClass({
        action: 'prompt',
        source: 'prompt',
        permissionMode: mode,
        approvalMeta: null,
        riskyActionSessionCandidate,
      })
    }
    return withCanonicalErrorClass({
      action: 'approve',
      source: 'permission_mode_ask',
      permissionMode: mode,
      approvalMeta: null,
      riskyActionSessionCandidate,
    })
  }

  const runCommandClass = String(approvalPolicy?.commandClass || '').trim().toLowerCase()
  const runCommandExecutionTarget = String(approvalPolicy?.executionTarget || 'host').trim().toLowerCase()
  const runCommandIsSafeHostClass = (
    isRunCommandLikeTool(normalizedToolName)
    && approvalPolicy?.elevationRequired !== true
    && runCommandExecutionTarget === 'host'
    && RUN_COMMAND_ASK_AUTO_ALLOW_HOST.has(runCommandClass)
  )
  if (mode === 'ask' && runCommandIsSafeHostClass) {
    return withCanonicalErrorClass({
      action: 'approve',
      source: 'permission_mode_ask',
      permissionMode: mode,
      approvalMeta: null,
      riskyActionSessionCandidate,
    })
  }

  if (mode === 'autonomy') {
    const isWorkspaceFileTool = (
      WORKSPACE_SAFE_READ_AUTONOMY_AUTO_ALLOW.has(normalizedToolName)
      && !(approvalPolicy?.type === 'file_tool_policy_v1' && approvalPolicy?.hostAccessRequired === true)
    )
    const isSafeHostRunCommand = (
      isRunCommandLikeTool(normalizedToolName)
      && approvalPolicy?.elevationRequired !== true
      && runCommandExecutionTarget === 'host'
      && runCommandClass !== 'dependency_install_global_or_system'
      && !riskyActionSessionCandidate
    )
    if (isWorkspaceFileTool || isSafeHostRunCommand) {
      return withCanonicalErrorClass({
        action: 'approve',
        source: 'permission_mode_autonomy',
        permissionMode: mode,
        approvalMeta: null,
        riskyActionSessionCandidate,
      })
    }
  }

  if (mode === 'full_access') {
    let approvalMeta = null
    if (isRunCommandLikeTool(normalizedToolName)) {
      approvalMeta = {
        runCommand: {
          hostFullAccess: true,
          hostFullAccessThisTurn: true,
        },
      }
    } else if (isFileTool(normalizedToolName)) {
      approvalMeta = {
        fileSystem: {
          hostFullAccess: true,
        },
      }
    } else if (isTerminalSessionTool(normalizedToolName)) {
      approvalMeta = {
        terminalSession: {
          hostFullAccess: terminalPolicy?.hostAccessRequired === true,
        },
      }
    }
    return withCanonicalErrorClass({
      action: 'approve',
      source: 'permission_mode_full_access',
      permissionMode: mode,
      approvalMeta,
      riskyActionSessionCandidate,
    })
  }

  return withCanonicalErrorClass({
    action: 'prompt',
    source: 'prompt',
    permissionMode: mode,
    approvalMeta: null,
    riskyActionSessionCandidate,
  })
}
