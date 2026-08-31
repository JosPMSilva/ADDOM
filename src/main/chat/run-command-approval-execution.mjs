import { createTrustedCommandSafetyOverride } from '../tools/command-tools-runner.mjs'

const FILE_TOOL_HOST_ACCESS_CAPABLE = new Set([
  'read_file',
  'write_file',
  'edit_file',
  'delete_file',
  'rename_file',
  'list_directory',
  'create_directory',
  'search_code',
  'view_file_range',
  'grep_file',
  'rollback_file',
  'find_files',
  'apply_artifact_revision',
  'apply_patch',
])

function normalizeApprovalMeta(input) {
  return input && typeof input === 'object' ? input : null
}

function normalizeApprovalPolicy(input) {
  return input && typeof input === 'object' ? input : null
}

function cloneCommandSafetySettings(input) {
  return input && typeof input === 'object' ? { ...input } : {}
}

export function resolveRunCommandApprovalExecution({
  toolName,
  approvalPolicy,
  approvalMeta,
  approvalPromptSource = '',
  approvalPromptAction = '',
  approvalPromptShown = false,
  approvalDecision = '',
  commandSafetySettings,
  permissionMode = '',
} = {}) {
  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  const isRunCommand = normalizedToolName === 'run_command' || normalizedToolName === 'local_shell'
  const isFileTool = FILE_TOOL_HOST_ACCESS_CAPABLE.has(normalizedToolName)
  const fullAccessMode = String(permissionMode || '').trim().toLowerCase() === 'full_access'
  const meta = normalizeApprovalMeta(approvalMeta)
  const policy = normalizeApprovalPolicy(approvalPolicy)
  const hostInstallFallbackApproved = isRunCommand && !!meta?.runCommand?.hostInstallFallback
  const hostFullAccessApproved = isRunCommand && !!meta?.runCommand?.hostFullAccess
  const hostFullAccessThisTurnApproved = isRunCommand && !!meta?.runCommand?.hostFullAccessThisTurn
  const hostFullAccessReusedFromTurnApproval = isRunCommand && !!meta?.runCommand?.reusedFromTurnApproval
  const wslCompatibilityApproved = isRunCommand && !!meta?.runCommand?.wslCompatibility
  const effectiveHostFullAccessApproved = hostInstallFallbackApproved || hostFullAccessApproved
  const hostApprovalKind = hostInstallFallbackApproved
    ? 'install_fallback'
    : hostFullAccessApproved
      ? (hostFullAccessThisTurnApproved ? 'host_full_access_turn' : 'host_full_access')
      : ''
  const autoApprovedBy = (
    isRunCommand
    && approvalPromptShown !== true
    && String(approvalPromptAction || '').trim().toLowerCase() === 'approve'
  )
      ? String(approvalPromptSource || '').trim().toLowerCase()
      : (hostFullAccessReusedFromTurnApproval ? 'host_full_access_turn_reuse' : '')
  const fileHostAccessPolicy = isFileTool
    && policy
    && String(policy.type || '').trim().toLowerCase() === 'file_tool_policy_v1'
    ? policy
    : null
  const fileHostAccessApproved = (
    fullAccessMode
    || (isFileTool && !!meta?.fileSystem?.hostFullAccess)
    || (
      fileHostAccessPolicy?.hostAccessRequired === true
      && String(approvalDecision || '').trim().toLowerCase() === 'approved'
    )
  )

  const runCommandPolicyActivityMeta = isRunCommand && policy
    ? {
        runCommandPolicy: {
          policyDecision: String(policy.policyDecision || ''),
          executionTarget: hostInstallFallbackApproved
            ? 'host'
            : String(policy.executionTarget || (policy.policyDecision === 'route_to_sandbox' ? 'install_sandbox' : 'host')),
          elevationRequired: !!policy.elevationRequired,
          sandbox: policy.sandbox && typeof policy.sandbox === 'object'
            ? {
                backend: String(policy.sandbox.backend || ''),
                available: !!policy.sandbox.available,
                reason: String(policy.sandbox.reason || ''),
              }
            : null,
          hostInstallFallbackApproved,
          hostFullAccessApproved: effectiveHostFullAccessApproved,
          hostFullAccessThisTurnApproved: effectiveHostFullAccessApproved && hostFullAccessThisTurnApproved,
          hostFullAccessReusedFromTurnApproval:
            effectiveHostFullAccessApproved && hostFullAccessReusedFromTurnApproval,
          wslCompatibilityApproved,
          hostApprovalKind,
          autoApprovedBy,
        },
      }
    : {}

  const effectiveCommandSafetyBase = cloneCommandSafetySettings(commandSafetySettings)
  const effectiveCommandSafety = isRunCommand
    ? {
        ...effectiveCommandSafetyBase,
        ...(hostInstallFallbackApproved ? { installSandboxEnabled: false } : {}),
        ...(fullAccessMode
          ? {
              allowGlobalSystemInstalls: true,
              allowOutsideWorkspaceMutation: true,
              allowPrivilegedHostOps: true,
              allowPrivateNetworkTargets: true,
            }
          : {}),
      }
    : commandSafetySettings

  let commandSafetyOverride = null
  if (isRunCommand && hostInstallFallbackApproved) {
    commandSafetyOverride = createTrustedCommandSafetyOverride({
      disableInstallSandboxForThisCommand: true,
      hostInstallFallbackApproved: true,
      hostFullAccessApproved: true,
      allowHostFullAccessForThisCommand: true,
    })
  } else if (isRunCommand && hostFullAccessApproved) {
    commandSafetyOverride = createTrustedCommandSafetyOverride({
      hostFullAccessApproved: true,
      allowHostFullAccessForThisCommand: true,
    })
  } else if (isRunCommand && wslCompatibilityApproved) {
    commandSafetyOverride = createTrustedCommandSafetyOverride({
      wslCompatibilityApproved: true,
    })
  }

  return {
    hostInstallFallbackApproved,
    hostFullAccessApproved: effectiveHostFullAccessApproved,
    hostFullAccessThisTurnApproved: effectiveHostFullAccessApproved && hostFullAccessThisTurnApproved,
    hostFullAccessReusedFromTurnApproval:
      effectiveHostFullAccessApproved && hostFullAccessReusedFromTurnApproval,
    wslCompatibilityApproved,
    runCommandPolicyActivityMeta,
    effectiveCommandSafety,
    commandSafetyOverride,
    fileSystemHostFullAccess: fileHostAccessApproved,
  }
}
