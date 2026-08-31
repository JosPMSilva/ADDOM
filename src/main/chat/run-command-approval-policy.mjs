import {
  buildRunCommandPolicySummary,
  evaluateRunCommandPolicyDecision,
} from '../tools/command-tools-core.mjs'
import {
  normalizeApplyPatchInput,
} from '../tools/apply-patch-core.mjs'
import {
  buildInstallSandboxSpec,
  detectInstallSandboxBackend,
} from '../tools/command-tools-sandbox.mjs'
import { resolveBrowserActionApprovalContext } from '../tools/browser-tool.mjs'
import {
  buildTerminalSessionPolicy,
  isTerminalSessionTool,
} from '../tools/terminal-session-policy.mjs'
import { resolveTerminalSessionForChat } from './terminal-session-events.mjs'
import { normalizeRunCommandPolicyDecisionResult } from './run-command-policy-contract.mjs'
import { normalizePermissionMode } from '../../common/chat/permission-mode.mjs'
import { classifyPathAccess } from '../tools/path-guards.mjs'
import { isManagedPlanStoragePath } from './managed-plan-storage-paths.mjs'

const FILE_TOOL_NAMES = new Set([
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
  'file_change',
])

function normalizeCommandSafetySettings(input = {}) {
  const src = input && typeof input === 'object' ? input : {}
  const normalizeNetworkEnforcementMode = (value) => {
    const v = String(value || '').trim().toLowerCase()
    return v === 'strict' ? 'strict' : 'best_effort'
  }
  return {
    installSandboxEnabled: src.installSandboxEnabled === true,
    installSandboxIgnoreScriptsFirstPass:
      src.installSandboxIgnoreScriptsFirstPass === true || src.ignoreScriptsFirstPass === true,
    preferredBackend: String(src.preferredBackend || src.installSandboxBackend || 'auto').trim() || 'auto',
    sandboxNetworkEnforcementMode: normalizeNetworkEnforcementMode(
      src.sandboxNetworkEnforcementMode ?? src.networkEnforcementMode ?? src.installSandboxNetworkEnforcement ?? 'strict',
    ),
    registryAllowlist: Array.isArray(src.registryAllowlist)
      ? src.registryAllowlist.map((v) => String(v || '').trim()).filter(Boolean)
      : [],
    cacheDirs: Array.isArray(src.cacheDirs)
      ? src.cacheDirs.map((v) => String(v || '').trim()).filter(Boolean)
      : [],
    allowGlobalSystemInstalls: src.allowGlobalSystemInstalls === true,
    allowOutsideWorkspaceMutation: src.allowOutsideWorkspaceMutation === true,
    allowPrivilegedHostOps: src.allowPrivilegedHostOps === true,
    allowPrivateNetworkTargets: src.allowPrivateNetworkTargets === true,
  }
}

function applyPermissionModeOverrides(commandSafety = {}, permissionMode = '') {
  if (normalizePermissionMode(permissionMode) !== 'full_access') return commandSafety
  return {
    ...commandSafety,
    allowHostFullAccessForThisCommand: true,
    hostFullAccessApproved: true,
    allowGlobalSystemInstalls: true,
    allowOutsideWorkspaceMutation: true,
    allowPrivilegedHostOps: true,
    allowPrivateNetworkTargets: true,
  }
}

function isRunCommandLikeTool(toolName = '') {
  const normalized = String(toolName || '').trim().toLowerCase()
  return normalized === 'run_command' || normalized === 'local_shell'
}

function isBrowserActionTool(toolName = '') {
  return String(toolName || '').trim().toLowerCase() === 'browser_action'
}

function isFileTool(toolName = '') {
  return FILE_TOOL_NAMES.has(String(toolName || '').trim().toLowerCase())
}

function normalizeFileMutationKind(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!normalized) return ''
  if (normalized === 'create' || normalized === 'created' || normalized === 'add' || normalized === 'added') return 'create'
  if (
    normalized === 'modify'
    || normalized === 'modified'
    || normalized === 'update'
    || normalized === 'updated'
    || normalized === 'edit'
    || normalized === 'edited'
    || normalized === 'apply'
    || normalized === 'applied'
    || normalized === 'patch'
  ) return 'modify'
  if (normalized === 'delete' || normalized === 'deleted' || normalized === 'remove' || normalized === 'removed') return 'delete'
  if (normalized === 'rename' || normalized === 'renamed' || normalized === 'move' || normalized === 'moved') return 'rename'
  if (
    normalized === 'rollback'
    || normalized === 'rolled_back'
    || normalized === 'revert'
    || normalized === 'reverted'
  ) return 'rollback'
  return normalized
}

function extractApplyPatchOperationRefs(toolInput = {}) {
  try {
    const normalized = normalizeApplyPatchInput({ toolInput })
    return Array.isArray(normalized?.operations)
      ? normalized.operations.flatMap((entry) => {
          const operationType = String(entry?.type || '').trim().toLowerCase()
          const sourcePath = String(entry?.path || '').trim()
          const targetPath = String(entry?.newPath || entry?.path || '').trim()
          return [
            ...(operationType === 'move_file' && sourcePath
              ? [{ role: 'source', path: sourcePath }]
              : []),
            ...(targetPath ? [{ role: 'target', path: targetPath }] : []),
          ]
        })
      : []
  } catch {
    return []
  }
}

function extractFileChangeRefs(changes = []) {
  return (Array.isArray(changes) ? changes : [])
    .flatMap((change) => {
      const source = change && typeof change === 'object' ? change : {}
      const targetPath = String(
        source.path
        || source.filePath
        || source.targetPath
        || source.filename
        || source.file
        || '',
      ).trim()
      const oldPath = String(
        source.oldPath
        || source.renamedFrom
        || source.previousPath
        || '',
      ).trim()
      return [
        ...(oldPath ? [{ role: 'source', path: oldPath }] : []),
        ...(targetPath ? [{ role: 'target', path: targetPath }] : []),
      ]
    })
}

function extractFileToolChangeKinds(toolName, toolInput = {}) {
  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {}
  if (normalizedToolName === 'delete_file') return ['delete']
  if (normalizedToolName === 'rename_file') return ['rename']
  if (normalizedToolName === 'write_file' || normalizedToolName === 'edit_file') return ['modify']
  if (normalizedToolName === 'create_directory') return ['create']
  if (normalizedToolName === 'rollback_file' || normalizedToolName === 'apply_artifact_revision') return ['rollback']
  if (normalizedToolName === 'file_change') {
    return Array.from(new Set(
      (Array.isArray(input.changes) ? input.changes : [])
        .map((change) => normalizeFileMutationKind(
          change?.kind
          ?? change?.type
          ?? change?.action
          ?? change?.op
          ?? change?.operation
          ?? '',
        ))
        .filter(Boolean),
    ))
  }
  if (normalizedToolName === 'apply_patch') {
    try {
      const normalized = normalizeApplyPatchInput({ toolInput: input })
      return Array.from(new Set(
        (Array.isArray(normalized?.operations) ? normalized.operations : [])
          .map((entry) => {
            const operationType = String(entry?.type || '').trim().toLowerCase()
            if (operationType === 'create_file') return 'create'
            if (operationType === 'delete_file') return 'delete'
            if (operationType === 'move_file') return 'rename'
            if (operationType === 'update_file') return 'modify'
            return ''
          })
          .filter(Boolean),
      ))
    } catch {
      return ['modify']
    }
  }
  return []
}

function normalizeRunCommandLikeToolInput(toolName, toolInput = {}) {
  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {}
  const requestedCwd = String(input.cwd || input.workdir || '.')
  if (normalizedToolName === 'local_shell') {
    const action = input.action && typeof input.action === 'object'
      ? input.action
      : null
    const actionType = String(action?.type || '').trim().toLowerCase()
    if (actionType !== 'exec') {
      throw new Error('OpenAI local_shell approval requires an exec action.')
    }
    const commandParts = Array.isArray(action?.command)
      ? action.command.map((part) => String(part || '').trim()).filter(Boolean)
      : []
    if (commandParts.length === 0) {
      throw new Error('OpenAI local_shell approval requires command tokens.')
    }
    return {
      command: commandParts.join(' '),
      cwd: String(action?.workingDirectory || '.'),
      shell: 'auto',
      env: action?.env && typeof action.env === 'object' && !Array.isArray(action.env)
        ? { ...action.env }
        : null,
      background: false,
    }
  }
  return {
    command: String(input.command || ''),
    cwd: requestedCwd,
    shell: String(input.shell || 'auto'),
    env: input.env && typeof input.env === 'object' && !Array.isArray(input.env)
      ? { ...input.env }
      : null,
    background: !!input.background,
  }
}

function extractFileToolPathRefs(toolName, toolInput = {}) {
  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {}

  if (normalizedToolName === 'rename_file') {
    return [
      { role: 'source', path: String(input.old_path || '').trim() },
      { role: 'destination', path: String(input.new_path || '').trim() },
    ].filter((entry) => entry.path)
  }

  if (normalizedToolName === 'apply_patch') {
    return extractApplyPatchOperationRefs(input)
      .map((entry) => ({ ...entry }))
      .filter((entry) => entry.path)
  }

  if (normalizedToolName === 'file_change') {
    return extractFileChangeRefs(input.changes)
      .map((entry) => ({ ...entry }))
      .filter((entry) => entry.path)
  }

  const directPath = (
    normalizedToolName === 'list_directory'
    || normalizedToolName === 'search_code'
    || normalizedToolName === 'find_files'
  )
    ? String(input.path || '.').trim() || '.'
    : String(input.path || '').trim()

  return directPath ? [{ role: 'path', path: directPath }] : []
}

function buildFileToolPolicy({
  toolName,
  toolInput,
  projectFolder,
} = {}) {
  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  const referencedPaths = extractFileToolPathRefs(normalizedToolName, toolInput, projectFolder)
  const changeKinds = extractFileToolChangeKinds(normalizedToolName, toolInput)
  const requestedGrantRoot = (
    normalizedToolName === 'file_change'
      ? String(toolInput?.grantRoot || '').trim()
      : ''
  )
  const pathRefs = []
  const externalPaths = []
  const hints = []

  for (const ref of referencedPaths) {
    try {
      const access = classifyPathAccess(projectFolder, ref.path)
      const absolutePath = String(access.absolutePath || '').trim()
      const outsideWorkspace = access.escapesProjectRoot || access.escapesProjectRootViaSymlink
      pathRefs.push({
        role: String(ref.role || 'path'),
        requestedPath: String(ref.path || ''),
        absolutePath,
        outsideWorkspace,
      })
      if (outsideWorkspace && absolutePath) externalPaths.push(absolutePath)
    } catch (error) {
      hints.push(String(error?.message || 'Unable to analyze file path access.'))
    }
  }

  const hostAccessRequired = externalPaths.length > 0 || !!requestedGrantRoot
  const managedPlanStorageTargeted = changeKinds.length > 0
    && pathRefs.some((ref) => isManagedPlanStoragePath(ref.absolutePath))
  if (hostAccessRequired) {
    if (externalPaths.length > 0) {
      hints.push('This file action references path(s) outside the project root; ask/autonomy require explicit approval and full_access runs directly.')
    } else if (requestedGrantRoot) {
      hints.push('This file action is scoped by a granted host root; ask/autonomy require explicit approval and full_access runs directly.')
    }
  }

  return {
    type: 'file_tool_policy_v1',
    toolName: normalizedToolName,
    hostAccessRequired,
    policyDecision: managedPlanStorageTargeted ? 'deny' : (hostAccessRequired ? 'prompt' : 'allow'),
    denyReason: managedPlanStorageTargeted ? 'managed_plan_storage_reserved' : '',
    pathScope: externalPaths.length > 0
      ? 'external_requested'
      : requestedGrantRoot
        ? 'granted_root'
        : 'root_only',
    changeKinds,
    pathRefs,
    externalPaths: Array.from(new Set(externalPaths)),
    hints: Array.from(new Set(hints)),
  }
}

function buildPolicyFailure(toolName, toolInput, error) {
  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {}
  return {
    type: 'run_command_policy_v1',
    profileHint: 'unknown',
    commandClass: 'unknown_or_high_risk',
    shellPreference: String(input?.shell || 'auto'),
    resolvedCwd: '',
    pathScope: 'unknown',
    pathRefs: {
      hasAbsolutePathRef: false,
      hasTraversalRef: false,
      externalPathHints: [],
    },
    networkIntent: 'unknown',
    networkHosts: [],
    install: {
      isInstallLike: false,
      isGlobalOrSystemInstall: false,
      ecosystem: '',
      packagesHint: [],
    },
    longRunning: false,
    riskSignals: ['policy_summary_failed'],
    hints: [
      `Failed to analyze ${normalizedToolName || 'command'} policy. ADDOM blocked this step instead of falling back to a weaker path.`,
      String(error?.message || 'Failed to build run_command approval policy.'),
    ],
    policyReasons: ['policy_summary_failed'],
    policyDecision: 'deny',
    executionTarget: 'host',
    elevationRequired: true,
  }
}

function buildBrowserPolicyFailure(toolInput, error) {
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {}
  return {
    type: 'browser_action_policy_v1',
    action: String(input.action || '').trim().toLowerCase(),
    targetClass: 'blocked',
    targetOrigin: '',
    targetHost: '',
    resolvedAddresses: [],
    approvalClass: '',
    policyDecision: 'deny',
    riskSignals: ['browser_policy_summary_failed'],
    hints: [
      'Failed to analyze browser_action policy. ADDOM blocked this step instead of falling back to a weaker path.',
      String(error?.message || 'Failed to build browser_action approval policy.'),
    ],
    reason: 'browser_policy_summary_failed',
    elevated: false,
  }
}

async function buildBrowserActionPolicy({
  toolInput,
  projectFolder,
  threadId = '',
  turnId = '',
} = {}) {
  const context = await resolveBrowserActionApprovalContext(toolInput, {
    projectRoot: projectFolder,
    threadId,
    turnId,
  })
  const approvalClass = String(context?.approvalClass || '').trim()
  return {
    type: 'browser_action_policy_v1',
    action: String(context?.action || toolInput?.action || '').trim().toLowerCase(),
    targetClass: String(context?.targetClass || 'blocked').trim() || 'blocked',
    targetOrigin: String(context?.targetOrigin || '').trim(),
    targetHost: String(context?.targetHost || '').trim(),
    resolvedAddresses: Array.isArray(context?.resolvedAddresses)
      ? context.resolvedAddresses.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    approvalClass,
    policyDecision: String(context?.policyDecision || (approvalClass ? 'prompt' : 'approve')).trim() || 'approve',
    riskSignals: [
      ...(String(context?.targetClass || '') === 'private_network' ? ['private_network_target'] : []),
      ...(String(context?.policyDecision || '') === 'deny' ? ['browser_policy_denied'] : []),
      ...(approvalClass.includes('execute_js') ? ['browser_execute_js'] : []),
      ...(approvalClass === 'browser_recording' ? ['browser_recording'] : []),
    ],
    hints: Array.isArray(context?.hints)
      ? context.hints.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    reason: String(context?.reason || '').trim(),
    elevated: approvalClass.includes('execute_js') || approvalClass === 'browser_recording',
  }
}

export async function buildApprovalPolicyForTool({
  toolName,
  toolInput,
  projectFolder,
  commandSafetySettings,
  permissionMode = '',
  threadId = '',
  turnId = '',
} = {}) {
  if (isTerminalSessionTool(toolName)) {
    return buildTerminalSessionPolicy({
      toolName,
      toolInput,
      projectFolder,
      permissionMode,
      resolveSession: resolveTerminalSessionForChat,
    })
  }
  if (isBrowserActionTool(toolName)) {
    try {
      return await buildBrowserActionPolicy({
        toolInput,
        projectFolder,
        threadId,
        turnId,
      })
    } catch (error) {
      return buildBrowserPolicyFailure(toolInput, error)
    }
  }
  if (isFileTool(toolName)) {
    return buildFileToolPolicy({
      toolName,
      toolInput,
      projectFolder,
    })
  }
  if (!isRunCommandLikeTool(toolName)) return null
  try {
    const input = normalizeRunCommandLikeToolInput(toolName, toolInput)
    const policy = buildRunCommandPolicySummary(projectFolder, {
      command: input.command,
      cwd: input.cwd,
      shell: input.shell,
      env: input.env,
      background: !!input.background,
    })
    const commandSafety = applyPermissionModeOverrides(
      normalizeCommandSafetySettings(commandSafetySettings),
      permissionMode,
    )
    const decision = normalizeRunCommandPolicyDecisionResult(
      evaluateRunCommandPolicyDecision(policy, commandSafety),
    )
    const enriched = {
      ...policy,
      policyReasons: decision.reasons,
      policyDecision: decision.decision,
      executionTarget: decision.executionTarget,
      elevationRequired: decision.elevationRequired,
    }
    if (Array.isArray(decision.hints) && decision.hints.length > 0) {
      enriched.hints = Array.from(new Set([...(Array.isArray(enriched.hints) ? enriched.hints : []), ...decision.hints]))
    }

    if (
      commandSafety.installSandboxEnabled
      && enriched.policyDecision === 'route_to_sandbox'
      && !enriched.install?.isGlobalOrSystemInstall
    ) {
      const backendStatus = await detectInstallSandboxBackend(commandSafety)
      const sandbox = {
        backend: String(backendStatus?.backend || 'none'),
        available: !!backendStatus?.available,
        reason: String(backendStatus?.reason || ''),
        fallbackHostAvailable: true,
        registryAllowlist: commandSafety.registryAllowlist,
        networkEnforcementMode: String(commandSafety.sandboxNetworkEnforcementMode || 'strict'),
        strictEgressSupported: backendStatus?.capabilities?.strictEgressEnforcement === true,
        strictEgressImplementationMode: String(backendStatus?.capabilities?.strictEgressImplementationMode || ''),
        requiresCompatibilityApproval: false,
        securityBoundary: !!backendStatus?.available,
        compatibilityMode: '',
      }
      if (backendStatus?.available) {
        const spec = buildInstallSandboxSpec(projectFolder, enriched, {
          backend: backendStatus.backend,
          cacheDirs: commandSafety.cacheDirs,
          registryAllowlist: commandSafety.registryAllowlist,
          sandboxNetworkEnforcementMode: commandSafety.sandboxNetworkEnforcementMode,
        })
        sandbox.cacheMountCount = Number(spec?.diagnostics?.cacheMountCount || 0) || 0
        sandbox.mountCount = Number(spec?.diagnostics?.mountCount || 0) || 0
        sandbox.registryAllowlist = Array.isArray(spec?.networkPolicy?.allowHosts)
          ? spec.networkPolicy.allowHosts
          : sandbox.registryAllowlist
        sandbox.networkPolicyMode = String(spec?.networkPolicy?.mode || 'registry_allowlist')
        sandbox.networkEnforcementMode = String(spec?.networkPolicy?.enforcementMode || sandbox.networkEnforcementMode || 'strict')
        if (sandbox.backend === 'wsl') {
          sandbox.requiresCompatibilityApproval = true
          sandbox.securityBoundary = false
          sandbox.compatibilityMode = 'wsl'
          enriched.hints = Array.from(new Set([
            ...(Array.isArray(enriched.hints) ? enriched.hints : []),
            'WSL is a compatibility backend with host filesystem reachability via /mnt. Explicit WSL compatibility approval is required for this sandbox-routed install.',
          ]))
        }
      } else {
        enriched.hints = Array.from(new Set([
          ...(Array.isArray(enriched.hints) ? enriched.hints : []),
          'Install sandbox is unavailable. You can deny, or explicitly allow a one-shot host fallback from the approval dialog.',
        ]))
      }
      if (sandbox.networkEnforcementMode === 'strict' && !sandbox.strictEgressSupported) {
        enriched.hints = Array.from(new Set([
          ...(Array.isArray(enriched.hints) ? enriched.hints : []),
          `Strict sandbox egress enforcement is requested, but the selected backend/adapter does not advertise strict enforcement support yet${sandbox.strictEgressImplementationMode ? ` (backend mode: ${sandbox.strictEgressImplementationMode})` : ''}. Sandbox installs will fail safe until a strict backend is configured.`,
        ]))
      }
      enriched.sandbox = sandbox
    }

    return enriched
  } catch (error) {
    return buildPolicyFailure(toolName, toolInput, error)
  }
}

export function shouldShortCircuitToolByPolicy({
  toolName,
  approvalPolicy,
} = {}) {
  if (
    approvalPolicy?.type === 'file_tool_policy_v1'
    && String(approvalPolicy?.policyDecision || '').trim().toLowerCase() === 'deny'
  ) {
    return {
      action: 'deny',
      denyReason: String(approvalPolicy?.denyReason || 'policy_denied'),
      policyDecision: 'deny',
      reasons: ['reserved_managed_plan_storage'],
      hints: Array.isArray(approvalPolicy?.hints) ? approvalPolicy.hints : [],
    }
  }
  if (isTerminalSessionTool(toolName)) {
    const policy = approvalPolicy && typeof approvalPolicy === 'object' ? approvalPolicy : null
    if (!policy || String(policy.type || '') !== 'terminal_session_policy_v1') return null
    if (String(policy.policyDecision || '').trim().toLowerCase() !== 'deny') return null
    return {
      action: 'deny',
      denyReason: 'policy_denied',
      policyDecision: 'deny',
      reasons: Array.isArray(policy.reasons) ? policy.reasons : [],
      hints: Array.isArray(policy.hints) ? policy.hints.map((v) => String(v || '').trim()).filter(Boolean) : [],
    }
  }
  if (isBrowserActionTool(toolName)) {
    const policy = approvalPolicy && typeof approvalPolicy === 'object' ? approvalPolicy : null
    if (!policy || String(policy.type || '') !== 'browser_action_policy_v1') return null
    if (String(policy.policyDecision || '').trim().toLowerCase() !== 'deny') return null
    return {
      action: 'deny',
      denyReason: 'policy_denied',
      policyDecision: 'deny',
      reasons: Array.isArray(policy.riskSignals) ? policy.riskSignals : [],
      hints: Array.isArray(policy.hints) ? policy.hints.map((v) => String(v || '').trim()).filter(Boolean) : [],
    }
  }
  if (!isRunCommandLikeTool(toolName)) return null
  const policy = approvalPolicy && typeof approvalPolicy === 'object' ? approvalPolicy : null
  if (!policy || String(policy.type || '') !== 'run_command_policy_v1') return null
  const policyDecision = String(policy.policyDecision || '').trim().toLowerCase()
  if (policyDecision !== 'deny') return null
  return {
    action: 'deny',
    denyReason: 'policy_denied',
    policyDecision,
    reasons: Array.isArray(policy.riskSignals) ? policy.riskSignals : [],
    hints: Array.isArray(policy.hints) ? policy.hints.map((v) => String(v || '').trim()).filter(Boolean) : [],
  }
}
