import path from 'node:path'
import { normalizePermissionMode } from '../../common/chat/permission-mode.mjs'
import { classifyPathAccess } from './path-guards.mjs'
import { normalizeTerminalSize } from './terminal-session-manager.mjs'

const TERMINAL_SESSION_CREATE_TOOL_NAMES = new Set([
  'terminal_session_open',
  'terminal_session_create',
])

const TERMINAL_SESSION_REUSE_TOOL_NAMES = new Set([
  'terminal_session_list',
  'terminal_session_read_snapshot',
  'terminal_session_wait_for_output',
  'terminal_session_attach',
  'terminal_session_write',
  'terminal_session_resize',
  'terminal_session_signal',
  'terminal_session_close',
])

const ALLOWED_WINDOWS_SHELLS = new Set(['default', 'auto', 'cmd', 'powershell', 'pwsh'])
const ALLOWED_POSIX_SHELLS = new Set(['default', 'auto', 'bash', 'zsh', 'sh', 'pwsh'])

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function asStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((entry) => asTrimmedString(entry)).filter(Boolean)
}

function normalizeShellId(shell = '') {
  return asTrimmedString(shell).toLowerCase() || 'default'
}

function resolveSessionInput(toolInput = {}) {
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {}
  return {
    sessionId: asTrimmedString(input.sessionId || input.id),
    signal: asTrimmedString(input.signal).toUpperCase(),
    data: typeof input.data === 'string' ? input.data : String(input.data ?? ''),
  }
}

function resolveNormalizedSize(input = {}, defaults = {}) {
  try {
    return normalizeTerminalSize(input, defaults)
  } catch (error) {
    return {
      error: asTrimmedString(error?.message || error || 'Invalid terminal size.'),
    }
  }
}

function resolveSessionMetadata(session = null) {
  const source = session && typeof session === 'object' ? session : {}
  const sessionPolicy = source.policy && typeof source.policy === 'object' ? source.policy : null
  const resolvedCwd = asTrimmedString(sessionPolicy?.resolvedCwd || source.cwd)
  return {
    sessionId: asTrimmedString(source.id),
    sessionStatus: asTrimmedString(source.status || 'unknown').toLowerCase(),
    sessionClass: asTrimmedString(sessionPolicy?.sessionClass),
    profileHint: asTrimmedString(sessionPolicy?.profileHint),
    requestedCwd: asTrimmedString(sessionPolicy?.requestedCwd),
    resolvedCwd,
    requestedShell: asTrimmedString(sessionPolicy?.requestedShell || source.shell),
    resolvedShell: asTrimmedString(sessionPolicy?.resolvedShell || source.shell),
    cols: Number(source.cols || sessionPolicy?.cols || 0) || 0,
    rows: Number(source.rows || sessionPolicy?.rows || 0) || 0,
    controlOwner: asTrimmedString(source.controlOwner).toLowerCase(),
    hostAccessRequired: sessionPolicy?.hostAccessRequired === true,
    sessionPolicyType: asTrimmedString(sessionPolicy?.type),
    sessionBoundExplicitly: sessionPolicy?.laterWritesStayBoundToSession === true,
  }
}

function tryResolveSession(resolveSession, sessionId = '') {
  if (typeof resolveSession !== 'function') return null
  try {
    return resolveSession(sessionId) || null
  } catch {
    return null
  }
}

function isAllowedShell(shellId, platform = process.platform) {
  const allowedShells = platform === 'win32' ? ALLOWED_WINDOWS_SHELLS : ALLOWED_POSIX_SHELLS
  return allowedShells.has(shellId)
}

function buildDecision({
  policyDecision = 'allow',
  reasons = [],
  hints = [],
} = {}) {
  const normalizedPolicyDecision = String(policyDecision || '').trim().toLowerCase()
  const normalizedDecision = (
    normalizedPolicyDecision === 'allow'
    || normalizedPolicyDecision === 'require_elevation'
    || normalizedPolicyDecision === 'deny'
  ) ? normalizedPolicyDecision : 'deny'
  return {
    policyDecision: normalizedDecision,
    executionTarget: 'terminal_session',
    elevationRequired: normalizedDecision === 'require_elevation',
    reasons: Array.from(new Set(asStringArray(reasons))),
    hints: Array.from(new Set(asStringArray(hints))),
  }
}

function normalizeCreateInput(toolInput = {}) {
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {}
  const envOverrides = input.env && typeof input.env === 'object' && !Array.isArray(input.env)
    ? Object.keys(input.env).map((key) => asTrimmedString(key)).filter(Boolean)
    : []
  const normalizedSize = resolveNormalizedSize(
    { cols: input.cols, rows: input.rows },
    { cols: 80, rows: 24 },
  )
  return {
    cwd: asTrimmedString(input.cwd || input.workdir || '.') || '.',
    shell: normalizeShellId(input.shell),
    cols: Number(normalizedSize?.cols || 0) || 80,
    rows: Number(normalizedSize?.rows || 0) || 24,
    sizeError: asTrimmedString(normalizedSize?.error),
    envOverrideKeys: envOverrides,
  }
}

export function isTerminalSessionTool(toolName = '') {
  const normalizedToolName = asTrimmedString(toolName).toLowerCase()
  return TERMINAL_SESSION_CREATE_TOOL_NAMES.has(normalizedToolName)
    || TERMINAL_SESSION_REUSE_TOOL_NAMES.has(normalizedToolName)
}

export function buildTerminalSessionPolicy({
  toolName = '',
  toolInput = {},
  projectFolder = '',
  permissionMode = '',
  resolveSession = null,
  actor = 'model',
} = {}) {
  const normalizedToolName = asTrimmedString(toolName).toLowerCase()
  if (!isTerminalSessionTool(normalizedToolName)) return null
  const mode = normalizePermissionMode(permissionMode)
  const normalizedActor = asTrimmedString(actor).toLowerCase() === 'user' ? 'user' : 'model'

  if (TERMINAL_SESSION_REUSE_TOOL_NAMES.has(normalizedToolName)) {
    const action = normalizedToolName.replace(/^terminal_session_/, '')
    if (action === 'list') {
      return {
        type: 'terminal_session_policy_v1',
        action,
        sessionId: '',
        sessionScope: 'thread_workspace_visible',
        sessionClass: 'interactive_workspace_shell',
        profileHint: 'workspace_terminal',
        requestedCwd: '',
        resolvedCwd: '',
        requestedShell: '',
        resolvedShell: '',
        cols: 0,
        rows: 0,
        sessionStatus: '',
        actor: normalizedActor,
        hostAccessRequired: false,
        pathScope: 'root_only',
        laterWritesStayBoundToSession: false,
        ...buildDecision({
          policyDecision: 'allow',
          reasons: ['visible_terminal_session_listing'],
          hints: ['Listing visible terminal sessions stays scoped to the current thread/workspace terminal view.'],
        }),
      }
    }

    const reuseInput = resolveSessionInput(toolInput)
    const sessionId = reuseInput.sessionId
    const missingSessionId = !sessionId
    const session = missingSessionId ? null : tryResolveSession(resolveSession, sessionId)
    const sessionMeta = resolveSessionMetadata(session)
    const size = action === 'resize'
      ? resolveNormalizedSize(
        { cols: toolInput?.cols, rows: toolInput?.rows },
        { cols: sessionMeta.cols || 80, rows: sessionMeta.rows || 24 },
      )
      : null
    const sessionResolvedCwd = sessionMeta.resolvedCwd
    const sessionAccess = projectFolder && sessionResolvedCwd
      ? classifyPathAccess(projectFolder, sessionResolvedCwd)
      : null
    const sessionOutsideWorkspace = !!(
      sessionAccess
      && (sessionAccess.escapesProjectRoot === true || sessionAccess.escapesProjectRootViaSymlink === true)
    )
    const hostAccessRequired = sessionMeta.hostAccessRequired === true || sessionOutsideWorkspace === true
    const isRunningAction = action === 'wait_for_output' || action === 'write' || action === 'resize' || action === 'signal'
    let policyDecision = 'allow'
    const reasons = []
    const hints = []

    if (missingSessionId) {
      policyDecision = 'deny'
      reasons.push('session_id_required')
      hints.push('Terminal session reuse actions require a concrete session id.')
    } else if (!session) {
      policyDecision = 'deny'
      reasons.push('session_not_found')
      hints.push('The requested terminal session no longer exists or is not reachable from this runtime.')
    } else if (sessionMeta.sessionPolicyType !== 'terminal_session_policy_v1' || sessionMeta.sessionBoundExplicitly !== true) {
      policyDecision = 'deny'
      reasons.push('session_policy_missing')
      hints.push('Only terminal sessions opened through the explicit ADDOM terminal policy can be reused.')
    } else if (sessionMeta.controlOwner === 'user' && normalizedActor === 'model') {
      policyDecision = 'deny'
      reasons.push('session_locked_by_user_takeover')
      hints.push('This terminal session is currently under user control. The model can see that it exists, but it cannot read or interact with it until it is handed back to AI.')
    } else if (sessionOutsideWorkspace && mode !== 'full_access') {
      policyDecision = 'deny'
      reasons.push('session_outside_workspace')
      hints.push('Reusing a terminal session outside the active workspace is blocked unless full_access is active for the current turn.')
    } else if (isRunningAction && sessionMeta.sessionStatus !== 'running') {
      policyDecision = 'deny'
      reasons.push('session_not_running')
      hints.push('This terminal action requires a running terminal session.')
    }

    if (action === 'write' && !reuseInput.data) {
      policyDecision = 'deny'
      reasons.push('terminal_write_data_required')
      hints.push('Terminal writes require non-empty input data.')
    }

    if (action === 'signal' && !reuseInput.signal) {
      reasons.push('default_signal_applied')
      hints.push('No signal was specified, so the runtime will use the default terminal close signal.')
    }

    if (action === 'resize' && size?.error) {
      policyDecision = 'deny'
      reasons.push('invalid_terminal_size')
      hints.push(size.error)
    }

    if (policyDecision === 'allow') {
      reasons.push(hostAccessRequired ? 'existing_host_scoped_session' : 'existing_workspace_scoped_session')
      hints.push(hostAccessRequired
        ? 'This terminal action targets an existing host-scoped session opened through ADDOM.'
        : 'This terminal action is scoped to an existing workspace-bound terminal session opened through ADDOM.')
    }

    const decision = buildDecision({
      policyDecision,
      reasons,
      hints,
    })
    return {
      type: 'terminal_session_policy_v1',
      action,
      sessionId,
      sessionScope: missingSessionId
        ? 'missing'
        : hostAccessRequired
          ? 'host_scoped_existing_session'
          : 'workspace_bound_existing_session',
      sessionClass: sessionMeta.sessionClass || (hostAccessRequired ? 'interactive_host_shell' : 'interactive_workspace_shell'),
      profileHint: sessionMeta.profileHint || (hostAccessRequired ? 'host_full_access' : 'workspace_terminal'),
      requestedCwd: sessionMeta.requestedCwd,
      resolvedCwd: sessionMeta.resolvedCwd,
      requestedShell: sessionMeta.requestedShell,
      resolvedShell: sessionMeta.resolvedShell,
      cols: action === 'resize' ? Number(size?.cols || sessionMeta.cols || 0) || 0 : sessionMeta.cols,
      rows: action === 'resize' ? Number(size?.rows || sessionMeta.rows || 0) || 0 : sessionMeta.rows,
      sessionStatus: sessionMeta.sessionStatus,
      actor: normalizedActor,
      hostAccessRequired,
      pathScope: hostAccessRequired ? 'external_requested' : 'root_only',
      laterWritesStayBoundToSession: true,
      ...decision,
    }
  }

  const input = normalizeCreateInput(toolInput)
  const projectRoot = asTrimmedString(projectFolder)
  const access = projectRoot
    ? classifyPathAccess(projectRoot, input.cwd)
    : {
      absolutePath: path.resolve(input.cwd),
      escapesProjectRoot: false,
      escapesProjectRootViaSymlink: false,
    }
  const cwdOutsideWorkspace = access.escapesProjectRoot === true || access.escapesProjectRootViaSymlink === true
  const envOverridesRequested = input.envOverrideKeys.length > 0
  const shellAllowed = isAllowedShell(input.shell)

  let policyDecision = 'allow'
  const reasons = []
  const hints = []
  const riskSignals = []

  if (!shellAllowed) {
    policyDecision = 'deny'
    reasons.push('unsupported_terminal_shell')
    hints.push(`Shell "${input.shell}" is not supported for terminal sessions on this platform.`)
  }

  if (input.sizeError) {
    policyDecision = 'deny'
    reasons.push('invalid_terminal_size')
    hints.push(input.sizeError)
  }

  if (envOverridesRequested) {
    policyDecision = 'deny'
    reasons.push('terminal_env_override_not_allowed')
    hints.push('Terminal session env overrides are blocked so later writes cannot inherit hidden process mutations.')
  }

  if (cwdOutsideWorkspace) {
    riskSignals.push('cwd_outside_workspace')
    if (mode === 'full_access') {
      reasons.push('outside_workspace_cwd_host_full_access')
      hints.push('Outside-workspace terminal creation is allowed because full_access is active.')
    } else if (policyDecision !== 'deny') {
      policyDecision = 'require_elevation'
      reasons.push('outside_workspace_cwd')
      hints.push('Terminal sessions outside the active workspace require explicit host_full_access approval.')
    }
  }

  if (!cwdOutsideWorkspace) {
    reasons.push('interactive_workspace_shell')
    hints.push('Terminal session creation remains explicit and separate from run_command/local_shell approval.')
  }

  if (mode === 'full_access' && policyDecision === 'allow') {
    reasons.push('full_access_mode')
  }

  const decision = buildDecision({ policyDecision, reasons, hints })
  return {
    type: 'terminal_session_policy_v1',
    action: 'open',
    sessionClass: cwdOutsideWorkspace ? 'interactive_host_shell' : 'interactive_workspace_shell',
    profileHint: cwdOutsideWorkspace ? 'host_full_access' : 'workspace_terminal',
    requestedCwd: input.cwd,
    resolvedCwd: asTrimmedString(access.absolutePath) || path.resolve(input.cwd),
    cwdOutsideWorkspace,
    requestedShell: input.shell,
    resolvedShell: shellAllowed ? input.shell : '',
    cols: input.cols,
    rows: input.rows,
    envOverridesRequested,
    envOverrideKeys: input.envOverrideKeys,
    hostAccessRequired: cwdOutsideWorkspace,
    pathScope: cwdOutsideWorkspace ? 'external_requested' : 'root_only',
    riskSignals: Array.from(new Set(riskSignals)),
    laterWritesStayBoundToSession: true,
    ...decision,
  }
}

export function normalizeTerminalCreatePolicyResult(policy = {}) {
  const src = policy && typeof policy === 'object' ? policy : {}
  return {
    policyDecision: asTrimmedString(src.policyDecision).toLowerCase() || 'deny',
    executionTarget: 'terminal_session',
    elevationRequired: src.elevationRequired === true || asTrimmedString(src.policyDecision).toLowerCase() === 'require_elevation',
    reasons: asStringArray(src.reasons || src.policyReasons),
    hints: asStringArray(src.hints),
  }
}
