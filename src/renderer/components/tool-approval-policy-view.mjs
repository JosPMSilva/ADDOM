import { interpolateText } from '../i18n/index.mjs'

function normalizePolicyShape(policy = {}) {
  if (!policy || typeof policy !== 'object') return null
  if (String(policy.type || '').trim() !== 'run_command_policy_v1') return null
  const install = policy.install && typeof policy.install === 'object' ? policy.install : {}
  const pathRefs = policy.pathRefs && typeof policy.pathRefs === 'object' ? policy.pathRefs : {}
  const sandbox = policy.sandbox && typeof policy.sandbox === 'object' ? policy.sandbox : {}
  return {
    type: 'run_command_policy_v1',
    profileHint: String(policy.profileHint || 'unknown').trim() || 'unknown',
    commandClass: String(policy.commandClass || 'unknown_or_high_risk').trim() || 'unknown_or_high_risk',
    shellPreference: String(policy.shellPreference || 'auto').trim() || 'auto',
    resolvedCwd: String(policy.resolvedCwd || '').trim(),
    pathScope: String(policy.pathScope || 'unknown').trim() || 'unknown',
    pathRefs: {
      hasAbsolutePathRef: !!pathRefs.hasAbsolutePathRef,
      hasTraversalRef: !!pathRefs.hasTraversalRef,
      externalPathHints: Array.isArray(pathRefs.externalPathHints)
        ? pathRefs.externalPathHints.map((v) => String(v || '').trim()).filter(Boolean)
        : [],
      resolvedRootPaths: Array.isArray(pathRefs.resolvedRootPaths)
        ? pathRefs.resolvedRootPaths.map((v) => String(v || '').trim()).filter(Boolean)
        : [],
      resolvedExternalPaths: Array.isArray(pathRefs.resolvedExternalPaths)
        ? pathRefs.resolvedExternalPaths.map((v) => String(v || '').trim()).filter(Boolean)
        : [],
      unresolvedPathHints: Array.isArray(pathRefs.unresolvedPathHints)
        ? pathRefs.unresolvedPathHints.map((v) => String(v || '').trim()).filter(Boolean)
        : [],
    },
    networkIntent: String(policy.networkIntent || 'unknown').trim() || 'unknown',
    networkHosts: Array.isArray(policy.networkHosts)
      ? policy.networkHosts.map((v) => String(v || '').trim()).filter(Boolean)
      : [],
    install: {
      isInstallLike: !!install.isInstallLike,
      isGlobalOrSystemInstall: !!install.isGlobalOrSystemInstall,
      ecosystem: String(install.ecosystem || '').trim(),
      packagesHint: Array.isArray(install.packagesHint)
        ? install.packagesHint.map((v) => String(v || '').trim()).filter(Boolean)
        : [],
    },
    longRunning: !!policy.longRunning,
    policyDecision: String(policy.policyDecision || '').trim(),
    executionTarget: String(policy.executionTarget || '').trim(),
    elevationRequired: !!policy.elevationRequired,
    sandbox: {
      backend: String(sandbox.backend || '').trim(),
      available: typeof sandbox.available === 'boolean' ? sandbox.available : null,
      reason: String(sandbox.reason || '').trim(),
      fallbackHostAvailable: !!sandbox.fallbackHostAvailable,
      requiresCompatibilityApproval: sandbox.requiresCompatibilityApproval === true,
      securityBoundary: sandbox.securityBoundary === true,
      compatibilityMode: String(sandbox.compatibilityMode || '').trim(),
      networkPolicyMode: String(sandbox.networkPolicyMode || '').trim(),
      networkEnforcementMode: String(sandbox.networkEnforcementMode || '').trim(),
      strictEgressSupported: sandbox.strictEgressSupported === true,
      strictEgressImplementationMode: String(sandbox.strictEgressImplementationMode || '').trim(),
      cacheMountCount: Number.isFinite(Number(sandbox.cacheMountCount)) ? Number(sandbox.cacheMountCount) : 0,
      mountCount: Number.isFinite(Number(sandbox.mountCount)) ? Number(sandbox.mountCount) : 0,
      registryAllowlist: Array.isArray(sandbox.registryAllowlist)
        ? sandbox.registryAllowlist.map((v) => String(v || '').trim()).filter(Boolean)
        : [],
    },
    riskSignals: Array.isArray(policy.riskSignals)
      ? policy.riskSignals.map((v) => String(v || '').trim()).filter(Boolean)
      : [],
    policyReasons: Array.isArray(policy.policyReasons)
      ? policy.policyReasons.map((v) => String(v || '').trim()).filter(Boolean)
      : [],
    hints: Array.isArray(policy.hints)
      ? policy.hints.map((v) => String(v || '').trim()).filter(Boolean)
      : [],
  }
}

function badgeToneForProfile(profileHint) {
  if (profileHint === 'workspace_safe') return 'good'
  if (profileHint === 'install_sandbox') return 'info'
  if (profileHint === 'host_full_access') return 'warn'
  return 'muted'
}

function badgeToneForCommandClass(commandClass) {
  if (commandClass === 'project_readonly_shell' || commandClass === 'project_build_test') return 'good'
  if (commandClass === 'dependency_install_project' || commandClass === 'process_control') return 'info'
  if (commandClass === 'dependency_install_global_or_system' || commandClass === 'network_fetch_non_install') return 'warn'
  return 'muted'
}

function humanizeValue(value = '') {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function translateRendererText(t, key, defaultValue, values = {}) {
  if (typeof t === 'function') {
    return t(key, { defaultValue, ...values })
  }
  return interpolateText(defaultValue, values)
}

export function getRunCommandPolicyView(pending, t = null) {
  const toolName = String(pending?.toolName || '').trim().toLowerCase()
  if (toolName !== 'run_command' && toolName !== 'local_shell') return null
  const policy = normalizePolicyShape(pending?.policy)
  if (!policy) return null

  const badges = [
    {
      key: 'profile',
      label: `profile: ${policy.profileHint}`,
      tone: badgeToneForProfile(policy.profileHint),
    },
    {
      key: 'class',
      label: humanizeValue(policy.commandClass),
      tone: badgeToneForCommandClass(policy.commandClass),
    },
    {
      key: 'shell',
      label: `shell: ${policy.shellPreference}`,
      tone: 'muted',
    },
  ]

  if (policy.install.isInstallLike) {
    badges.push({
      key: 'install',
      label: policy.install.isGlobalOrSystemInstall
        ? `install: ${policy.install.ecosystem || 'host'} (global/system)`
        : `install: ${policy.install.ecosystem || 'project'}`,
      tone: policy.install.isGlobalOrSystemInstall ? 'warn' : 'info',
    })
  }

  if (policy.longRunning) {
    badges.push({ key: 'long_running', label: 'long-running', tone: 'info' })
  }
  if (policy.executionTarget) {
    badges.push({
      key: 'target',
      label: `target: ${policy.executionTarget}`,
      tone: policy.executionTarget === 'install_sandbox' ? 'info' : 'muted',
    })
  }
  if (policy.sandbox.backend) {
    badges.push({
      key: 'sandbox_backend',
      label: translateRendererText(t, 'core:toolApprovalPolicy.runCommand.badges.sandboxBackend', '[[canon:sandbox]]: {{backend}}{{suffix}}', {
        backend: policy.sandbox.backend,
        suffix: policy.sandbox.available === false
          ? translateRendererText(t, 'core:toolApprovalPolicy.runCommand.badges.sandboxBackendUnavailable', ' (unavailable)')
          : '',
      }),
      tone: policy.sandbox.available === false ? 'warn' : 'info',
    })
  }

  const rows = [
    { key: 'commandClass', label: translateRendererText(t, 'core:toolApprovalPolicy.runCommand.rows.commandClass', 'Command Class'), value: policy.commandClass, mono: true },
    { key: 'shellPreference', label: translateRendererText(t, 'core:toolApprovalPolicy.runCommand.rows.shell', 'Shell'), value: policy.shellPreference, mono: true },
    { key: 'resolvedCwd', label: translateRendererText(t, 'core:toolApprovalPolicy.runCommand.rows.resolvedCwd', 'Resolved cwd'), value: policy.resolvedCwd || translateRendererText(t, 'core:toolApprovalPolicy.common.unresolved', '(unresolved)'), mono: true },
    { key: 'pathScope', label: translateRendererText(t, 'core:toolApprovalPolicy.runCommand.rows.pathScope', 'Path Scope'), value: policy.pathScope, mono: true },
    { key: 'networkIntent', label: translateRendererText(t, 'core:toolApprovalPolicy.runCommand.rows.networkIntent', 'Network Intent'), value: policy.networkIntent, mono: true },
  ]
  if (policy.policyDecision) {
    rows.push({ key: 'policyDecision', label: translateRendererText(t, 'core:toolApprovalPolicy.common.rows.policyDecision', 'Policy Decision'), value: policy.policyDecision, mono: true })
  }
  if (policy.policyReasons.length > 0) {
    rows.push({
      key: 'policyReasons',
      label: translateRendererText(t, 'core:toolApprovalPolicy.runCommand.rows.policyReasons', 'Decision Reasons'),
      value: policy.policyReasons.join(', '),
      mono: true,
    })
  }
  if (policy.executionTarget) {
    rows.push({ key: 'executionTarget', label: translateRendererText(t, 'core:toolApprovalPolicy.runCommand.rows.executionTarget', 'Execution Target'), value: policy.executionTarget, mono: true })
  }
  if (policy.sandbox.backend) {
    rows.push({ key: 'sandboxBackend', label: translateRendererText(t, 'core:toolApprovalPolicy.runCommand.rows.sandboxBackend', '[[canon:sandbox]] [[canon:backend]]'), value: policy.sandbox.backend, mono: true })
  }
  if (policy.sandbox.compatibilityMode) {
    rows.push({
      key: 'sandboxCompatibilityMode',
      label: translateRendererText(t, 'core:toolApprovalPolicy.runCommand.rows.sandboxMode', '[[canon:sandbox]] Mode'),
      value: policy.sandbox.compatibilityMode,
      mono: true,
    })
  }
  if (policy.sandbox.compatibilityMode || policy.sandbox.securityBoundary === false) {
    rows.push({
      key: 'sandboxSecurityBoundary',
      label: translateRendererText(t, 'core:toolApprovalPolicy.runCommand.rows.securityBoundary', 'Security Boundary'),
      value: policy.sandbox.securityBoundary ? 'yes' : 'no',
      mono: true,
    })
  }
  if (policy.sandbox.networkPolicyMode) {
    rows.push({ key: 'sandboxNetworkMode', label: translateRendererText(t, 'core:toolApprovalPolicy.runCommand.rows.sandboxNetwork', '[[canon:sandbox]] Network'), value: policy.sandbox.networkPolicyMode, mono: true })
  }
  if (policy.sandbox.networkEnforcementMode) {
    rows.push({
      key: 'sandboxNetworkEnforcement',
      label: translateRendererText(t, 'core:toolApprovalPolicy.runCommand.rows.sandboxEgress', '[[canon:sandbox]] Egress'),
      value: policy.sandbox.networkEnforcementMode,
      mono: true,
    })
  }
  if (policy.sandbox.strictEgressImplementationMode) {
    rows.push({
      key: 'sandboxStrictEgressImpl',
      label: 'Strict Egress Impl',
      value: policy.sandbox.strictEgressImplementationMode,
      mono: true,
    })
  }
  if (policy.sandbox.mountCount > 0 || policy.sandbox.cacheMountCount > 0) {
    rows.push({
      key: 'sandboxMounts',
      label: translateRendererText(t, 'core:toolApprovalPolicy.runCommand.rows.sandboxMounts', '[[canon:sandbox]] Mounts'),
      value: `mounts=${policy.sandbox.mountCount || 0}, caches=${policy.sandbox.cacheMountCount || 0}`,
      mono: true,
    })
  }
  if (policy.sandbox.registryAllowlist.length > 0) {
    rows.push({
      key: 'sandboxRegistryAllowlist',
      label: 'Registry Allowlist',
      value: policy.sandbox.registryAllowlist.join(', '),
      mono: true,
    })
  }

  if (policy.networkHosts.length > 0) {
    rows.push({
      key: 'networkHosts',
      label: 'Network Hosts',
      value: policy.networkHosts.join(', '),
      mono: true,
    })
  }

  if (policy.install.isInstallLike && policy.install.packagesHint.length > 0) {
    rows.push({
      key: 'installPackages',
      label: 'Install Targets',
      value: policy.install.packagesHint.join(', '),
      mono: true,
    })
  }

  if (policy.pathRefs.externalPathHints.length > 0) {
    rows.push({
      key: 'externalPathHints',
      label: 'External Path Hints',
      value: policy.pathRefs.externalPathHints.join(', '),
      mono: true,
    })
  }
  if (policy.pathRefs.resolvedExternalPaths.length > 0) {
    rows.push({
      key: 'resolvedExternalPaths',
      label: 'Resolved External Paths',
      value: policy.pathRefs.resolvedExternalPaths.join(', '),
      mono: true,
    })
  }

  const warnings = []
  if (policy.pathRefs.hasAbsolutePathRef) warnings.push(translateRendererText(t, 'core:toolApprovalPolicy.runCommand.warnings.absolutePathRef', 'Absolute path reference detected in command arguments.'))
  if (policy.pathRefs.hasTraversalRef) warnings.push(translateRendererText(t, 'core:toolApprovalPolicy.runCommand.warnings.pathTraversal', 'Path traversal (`..`) detected in command arguments.'))
  if (Array.isArray(policy.pathRefs.resolvedExternalPaths) && policy.pathRefs.resolvedExternalPaths.length > 0) {
    warnings.push(translateRendererText(t, 'core:toolApprovalPolicy.runCommand.warnings.externalPaths', 'Command references resolved path(s) outside the project root.'))
  }
  if (policy.install.isGlobalOrSystemInstall) warnings.push(translateRendererText(t, 'core:toolApprovalPolicy.runCommand.warnings.globalInstall', 'Global/system install detected. This should require explicit elevated host approval.'))
  if (policy.networkIntent === 'external') warnings.push(translateRendererText(t, 'core:toolApprovalPolicy.runCommand.warnings.externalNetwork', 'External network access appears likely for this command.'))
  if (policy.commandClass === 'unknown_or_high_risk') warnings.push(translateRendererText(t, 'core:toolApprovalPolicy.runCommand.warnings.lowConfidence', 'Command classifier confidence is low. Review carefully before allowing.'))
  if (policy.elevationRequired) warnings.push(translateRendererText(t, 'core:toolApprovalPolicy.runCommand.warnings.hostFullAccess', 'This command exceeds workspace_safe policy and needs explicit one-shot host_full_access approval.'))
  if (policy.sandbox.available === false && policy.executionTarget === 'install_sandbox') {
    warnings.push(translateRendererText(t, 'core:toolApprovalPolicy.runCommand.warnings.sandboxUnavailable', 'Install [[canon:sandbox]] is unavailable for this dependency install. Running on host should require an explicit fallback action.'))
  }
  if (policy.sandbox.networkEnforcementMode === 'strict' && policy.sandbox.strictEgressSupported !== true) {
    warnings.push(
      translateRendererText(t, 'core:toolApprovalPolicy.runCommand.warnings.strictEgressUnsupported', 'Strict [[canon:sandbox]] egress mode is requested, but the current [[canon:backend]] preview does not advertise strict runtime enforcement support{{suffix}}.', {
        suffix: policy.sandbox.strictEgressImplementationMode
          ? interpolateText(' ([[canon:backend]] mode: {{mode}})', { mode: policy.sandbox.strictEgressImplementationMode })
          : '',
      }),
    )
  }
  if (policy.sandbox.requiresCompatibilityApproval && policy.sandbox.compatibilityMode === 'wsl') {
    warnings.push(translateRendererText(t, 'core:toolApprovalPolicy.runCommand.warnings.wslCompatibility', '[[canon:wsl]] is not a security boundary. This [[canon:sandbox]]-routed install still needs explicit [[canon:wsl]] compatibility approval.'))
  }

  const hintCallouts = [...policy.hints]
  if (policy.sandbox.reason) hintCallouts.push(policy.sandbox.reason)

  const actionsVariant = {
    showHostInstallFallback:
      policy.executionTarget === 'install_sandbox'
      && policy.sandbox.available === false
      && policy.sandbox.fallbackHostAvailable
      && policy.install.isInstallLike
      && !policy.install.isGlobalOrSystemInstall,
    showHostFullAccessApproval:
      policy.executionTarget === 'host'
      && policy.elevationRequired === true,
    showHostFullAccessTurnApproval:
      policy.executionTarget === 'host'
      && policy.elevationRequired === true,
    showWslCompatibilityApproval:
      policy.executionTarget === 'install_sandbox'
      && policy.sandbox.available === true
      && policy.sandbox.requiresCompatibilityApproval === true
      && policy.sandbox.compatibilityMode === 'wsl',
    requireExplicitHostFullAccess:
      policy.executionTarget === 'host'
      && policy.elevationRequired === true,
    requireExplicitWslCompatibilityApproval:
      policy.executionTarget === 'install_sandbox'
      && policy.sandbox.available === true
      && policy.sandbox.requiresCompatibilityApproval === true
      && policy.sandbox.compatibilityMode === 'wsl',
    disableDefaultAllow: (
      policy.executionTarget === 'host'
      && policy.elevationRequired === true
    ) || (
      policy.executionTarget === 'install_sandbox'
      && policy.sandbox.available === true
      && policy.sandbox.requiresCompatibilityApproval === true
      && policy.sandbox.compatibilityMode === 'wsl'
    ),
  }

  return {
    policy,
    badges,
    rows,
    warnings: Array.from(new Set(warnings)),
    hintCallouts: Array.from(new Set(hintCallouts)),
    actionsVariant,
  }
}

function normalizeTerminalPolicyShape(policy = {}) {
  if (!policy || typeof policy !== 'object') return null
  if (String(policy.type || '').trim() !== 'terminal_session_policy_v1') return null
  return {
    type: 'terminal_session_policy_v1',
    action: String(policy.action || '').trim().toLowerCase(),
    sessionId: String(policy.sessionId || '').trim(),
    sessionClass: String(policy.sessionClass || '').trim().toLowerCase(),
    sessionScope: String(policy.sessionScope || '').trim().toLowerCase(),
    profileHint: String(policy.profileHint || '').trim().toLowerCase(),
    requestedCwd: String(policy.requestedCwd || '').trim(),
    resolvedCwd: String(policy.resolvedCwd || '').trim(),
    requestedShell: String(policy.requestedShell || '').trim(),
    resolvedShell: String(policy.resolvedShell || '').trim(),
    cols: Number(policy.cols || 0) || 0,
    rows: Number(policy.rows || 0) || 0,
    cwdOutsideWorkspace: policy.cwdOutsideWorkspace === true,
    hostAccessRequired: policy.hostAccessRequired === true,
    envOverridesRequested: policy.envOverridesRequested === true,
    envOverrideKeys: Array.isArray(policy.envOverrideKeys)
      ? policy.envOverrideKeys.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    policyDecision: String(policy.policyDecision || '').trim().toLowerCase(),
    reasons: Array.isArray(policy.reasons)
      ? policy.reasons.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    hints: Array.isArray(policy.hints)
      ? policy.hints.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    riskSignals: Array.isArray(policy.riskSignals)
      ? policy.riskSignals.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
  }
}

function badgeToneForTerminalDecision(policyDecision = '') {
  if (policyDecision === 'allow') return 'good'
  if (policyDecision === 'require_elevation') return 'warn'
  if (policyDecision === 'deny') return 'warn'
  return 'muted'
}

export function getTerminalSessionPolicyView(pending) {
  const toolName = String(pending?.toolName || '').trim().toLowerCase()
  if (!toolName.startsWith('terminal_session_')) return null
  const policy = normalizeTerminalPolicyShape(pending?.policy)
  if (!policy) return null

  const badges = [
    {
      key: 'action',
      label: `action: ${policy.action || 'unknown'}`,
      tone: 'info',
    },
    {
      key: 'decision',
      label: `decision: ${policy.policyDecision || 'unknown'}`,
      tone: badgeToneForTerminalDecision(policy.policyDecision),
    },
  ]
  if (policy.profileHint) {
    badges.push({
      key: 'profile',
      label: `profile: ${policy.profileHint}`,
      tone: policy.hostAccessRequired ? 'warn' : 'muted',
    })
  }
  if (policy.requestedShell || policy.resolvedShell) {
    badges.push({
      key: 'shell',
      label: `shell: ${policy.resolvedShell || policy.requestedShell}`,
      tone: 'muted',
    })
  }

  const rows = [
    { key: 'action', label: 'Action', value: policy.action || '(unknown)', mono: true },
    ...(policy.sessionId ? [{ key: 'sessionId', label: 'Session Id', value: policy.sessionId, mono: true }] : []),
    ...(policy.sessionClass ? [{ key: 'sessionClass', label: 'Session Class', value: policy.sessionClass, mono: true }] : []),
    ...(policy.sessionScope ? [{ key: 'sessionScope', label: 'Session Scope', value: policy.sessionScope, mono: true }] : []),
    ...(policy.requestedCwd ? [{ key: 'requestedCwd', label: 'Requested cwd', value: policy.requestedCwd, mono: true }] : []),
    ...(policy.resolvedCwd ? [{ key: 'resolvedCwd', label: 'Resolved cwd', value: policy.resolvedCwd, mono: true }] : []),
    ...(policy.requestedShell || policy.resolvedShell
      ? [{ key: 'shell', label: 'Shell', value: policy.resolvedShell || policy.requestedShell, mono: true }]
      : []),
    ...(policy.cols > 0 && policy.rows > 0
      ? [{ key: 'size', label: 'Size', value: `${policy.cols}x${policy.rows}`, mono: true }]
      : []),
    ...(policy.policyDecision ? [{ key: 'policyDecision', label: 'Policy Decision', value: policy.policyDecision, mono: true }] : []),
    ...(policy.reasons.length > 0 ? [{ key: 'reasons', label: 'Reasons', value: policy.reasons.join(', '), mono: true }] : []),
  ]

  const warnings = []
  if (policy.cwdOutsideWorkspace || policy.hostAccessRequired) {
    warnings.push('This terminal session targets a path outside the active workspace and needs explicit approval.')
  }
  if (policy.envOverridesRequested) {
    warnings.push('Environment overrides are blocked for terminal sessions.')
  }
  if (policy.policyDecision === 'deny') {
    warnings.push('This terminal session request is blocked by policy.')
  }

  return {
    policy,
    badges,
    rows,
    warnings: Array.from(new Set(warnings)),
    hintCallouts: Array.from(new Set(policy.hints)),
    actionsVariant: {
      showHostInstallFallback: false,
      showHostFullAccessApproval: false,
      showHostFullAccessTurnApproval: false,
      showWslCompatibilityApproval: false,
      requireExplicitHostFullAccess: false,
      requireExplicitWslCompatibilityApproval: false,
      disableDefaultAllow: false,
    },
  }
}

function normalizeBrowserPolicyShape(policy = {}) {
  if (!policy || typeof policy !== 'object') return null
  if (String(policy.type || '').trim() !== 'browser_action_policy_v1') return null
  return {
    type: 'browser_action_policy_v1',
    action: String(policy.action || '').trim().toLowerCase(),
    targetClass: String(policy.targetClass || 'blocked').trim().toLowerCase(),
    targetOrigin: String(policy.targetOrigin || '').trim(),
    targetHost: String(policy.targetHost || '').trim(),
    resolvedAddresses: Array.isArray(policy.resolvedAddresses)
      ? policy.resolvedAddresses.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    approvalClass: String(policy.approvalClass || '').trim().toLowerCase(),
    policyDecision: String(policy.policyDecision || '').trim().toLowerCase(),
    riskSignals: Array.isArray(policy.riskSignals)
      ? policy.riskSignals.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    hints: Array.isArray(policy.hints)
      ? policy.hints.map((value) => String(value || '').trim()).filter(Boolean)
      : [],
    elevated: policy.elevated === true,
  }
}

function badgeToneForBrowserTarget(targetClass = '') {
  if (targetClass === 'public_network') return 'good'
  if (targetClass === 'private_network') return 'warn'
  if (targetClass === 'none') return 'muted'
  return 'warn'
}

function badgeToneForBrowserApprovalClass(approvalClass = '') {
  if (approvalClass.includes('execute_js') || approvalClass === 'browser_recording') return 'warn'
  if (approvalClass.includes('network')) return 'info'
  return 'muted'
}

export function getBrowserActionPolicyView(pending, t = null) {
  const toolName = String(pending?.toolName || '').trim().toLowerCase()
  if (toolName !== 'browser_action') return null
  const policy = normalizeBrowserPolicyShape(pending?.policy)
  if (!policy) return null

  const badges = [
    {
      key: 'action',
      label: translateRendererText(t, 'core:toolApprovalPolicy.browser.badges.action', 'action: {{value}}', { value: policy.action || 'unknown' }),
      tone: policy.elevated ? 'warn' : 'info',
    },
    {
      key: 'target',
      label: translateRendererText(t, 'core:toolApprovalPolicy.browser.badges.target', 'target: {{value}}', { value: policy.targetClass || 'blocked' }),
      tone: badgeToneForBrowserTarget(policy.targetClass),
    },
  ]
  if (policy.approvalClass) {
    badges.push({
      key: 'approval',
      label: humanizeValue(policy.approvalClass),
      tone: badgeToneForBrowserApprovalClass(policy.approvalClass),
    })
  }
  if (policy.elevated) {
    badges.push({ key: 'elevated', label: translateRendererText(t, 'core:toolApprovalPolicy.browser.badges.elevated', 'elevated'), tone: 'warn' })
  }

  const rows = [
    { key: 'action', label: translateRendererText(t, 'core:toolApprovalPolicy.browser.rows.action', 'Action'), value: policy.action || translateRendererText(t, 'core:toolApprovalPolicy.common.unknown', '(unknown)'), mono: true },
    { key: 'targetClass', label: translateRendererText(t, 'core:toolApprovalPolicy.browser.rows.targetClass', 'Target Class'), value: policy.targetClass || translateRendererText(t, 'core:toolApprovalPolicy.common.unknown', '(unknown)'), mono: true },
    { key: 'policyDecision', label: translateRendererText(t, 'core:toolApprovalPolicy.common.rows.policyDecision', 'Policy Decision'), value: policy.policyDecision || translateRendererText(t, 'core:toolApprovalPolicy.common.unknown', '(unknown)'), mono: true },
    ...(policy.targetOrigin ? [{ key: 'targetOrigin', label: translateRendererText(t, 'core:toolApprovalPolicy.browser.rows.origin', 'Origin'), value: policy.targetOrigin, mono: true }] : []),
    ...(policy.targetHost ? [{ key: 'targetHost', label: translateRendererText(t, 'core:toolApprovalPolicy.browser.rows.host', 'Host'), value: policy.targetHost, mono: true }] : []),
    ...(policy.approvalClass ? [{ key: 'approvalClass', label: translateRendererText(t, 'core:toolApprovalPolicy.browser.rows.approvalScope', 'Approval Scope'), value: policy.approvalClass, mono: true }] : []),
    ...(policy.resolvedAddresses.length > 0
      ? [{ key: 'resolvedAddresses', label: translateRendererText(t, 'core:toolApprovalPolicy.browser.rows.resolvedAddresses', 'Resolved Addresses'), value: policy.resolvedAddresses.join(', '), mono: true }]
      : []),
  ]

  const warnings = []
  if (policy.targetClass === 'private_network') {
    warnings.push(translateRendererText(t, 'core:toolApprovalPolicy.browser.warnings.privateNetwork', 'This target is on localhost or a private network and uses a separate project-session approval scope.'))
  }
  if (policy.targetClass === 'blocked') {
    warnings.push(translateRendererText(t, 'core:toolApprovalPolicy.browser.warnings.blocked', 'This target is blocked because it resolves to an unsafe non-public address class.'))
  }
  if (policy.elevated) {
    warnings.push(translateRendererText(t, 'core:toolApprovalPolicy.browser.warnings.elevated', 'This browser action is elevated and should require a dedicated one-time approval scope.'))
  }

  return {
    policy,
    badges,
    rows,
    warnings: Array.from(new Set(warnings)),
    hintCallouts: Array.from(new Set(policy.hints)),
    actionsVariant: {
      showHostInstallFallback: false,
      showHostFullAccessApproval: false,
      showHostFullAccessTurnApproval: false,
      showWslCompatibilityApproval: false,
      requireExplicitHostFullAccess: false,
      requireExplicitWslCompatibilityApproval: false,
      disableDefaultAllow: false,
    },
  }
}
