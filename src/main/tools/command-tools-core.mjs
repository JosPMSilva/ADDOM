import fs from 'fs'
import path from 'path'
import { classifyPathAccess, safePath } from './path-guards.mjs'
import { isLikelyLongRunningCommand, isWindowsPythonHttpServerCommand } from './command-tools-command-classifier.mjs'
import {
  detectPackageManager,
  extractCommandInstallIntent,
  extractCommandNetworkIntent,
  isPrivateNetworkHost,
  looksLikeUrlToken,
  tokenizeCommandText,
  unquoteToken,
} from './command-tools-intent-analysis.mjs'
import { appendOutput, formatSuccessOutput, formatFailureOutput, buildBackgroundFailureHints } from './command-tools-output.mjs'
import {
  BACKGROUND_STARTUP_GRACE_MS,
  buildPermissionFailureHints,
  buildShellDialectHints,
  classifyShellDialectMistake,
  createCommandEnv,
  DEFAULT_COMMAND_TIMEOUT_MS,
  MAX_BACKGROUND_STARTUP_OUTPUT_CHARS,
  MAX_COMMAND_CHAIN_OPERATORS,
  MAX_COMMAND_LENGTH,
  MAX_COMMAND_OUTPUT_CHARS,
  MAX_COMMAND_TIMEOUT_MS,
  normalizeTimeoutMs,
  normalizeCommandPolicyText,
  shouldTryNextShellCandidate,
  validateCommandPolicy,
  appendBrowserLaunchAdvisory,
  isWindowsRelativeBrowserLaunchCommand,
} from './command-tools-policy.mjs'
import { createAbortError } from '../utils/abort-error.mjs'

export { isLikelyLongRunningCommand, isWindowsPythonHttpServerCommand, appendOutput, formatSuccessOutput, formatFailureOutput, buildBackgroundFailureHints }
export { createAbortError }
export {
  BACKGROUND_STARTUP_GRACE_MS,
  buildPermissionFailureHints,
  buildShellDialectHints,
  classifyShellDialectMistake,
  createCommandEnv,
  DEFAULT_COMMAND_TIMEOUT_MS,
  MAX_BACKGROUND_STARTUP_OUTPUT_CHARS,
  MAX_COMMAND_CHAIN_OPERATORS,
  MAX_COMMAND_LENGTH,
  MAX_COMMAND_OUTPUT_CHARS,
  MAX_COMMAND_TIMEOUT_MS,
  normalizeTimeoutMs,
  shouldTryNextShellCandidate,
  validateCommandPolicy,
  appendBrowserLaunchAdvisory,
  isWindowsRelativeBrowserLaunchCommand,
}
export {
  detectPackageManager,
  extractCommandInstallIntent,
  extractCommandNetworkIntent,
  isPrivateNetworkHost,
  looksLikeUrlToken,
  tokenizeCommandText,
  unquoteToken,
}
const PRIVILEGED_HOST_OPERATION_PATTERNS = [
  { pattern: /\b(sudo|runas)\b/i, reason: 'elevation_invocation' },
  { pattern: /\b(set-executionpolicy|bcdedit|mountvol|diskutil)\b/i, reason: 'host_configuration_change' },
  { pattern: /\b(netsh|iptables|ufw|route)\b/i, reason: 'network_stack_change' },
  { pattern: /\b(sc(\.exe)?\s+(create|config|delete|start|stop)|systemctl\s+(start|stop|restart|enable|disable)|service\s+\S+\s+(start|stop|restart))\b/i, reason: 'service_control' },
  { pattern: /\b(reg\s+(add|import|copy|save|load))\b/i, reason: 'registry_mutation' },
]

export function truncateInline(value, max = 300) {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max)}...` : s
}

export function normalizeShellPreference(shell) {
  const value = String(shell || 'auto').trim().toLowerCase()
  const allowed = new Set(['auto', 'powershell', 'cmd', 'bash', 'wsl', 'sh'])
  return allowed.has(value) ? value : 'auto'
}

export function normalizeCommandCwd(projectRoot, cwd, options = {}) {
  const rel = String(cwd ?? '.').trim()
  if (rel.includes('\0')) throw new Error('Working directory contains unsupported null bytes.')
  if (!rel || rel === '.') return projectRoot
  const abs = safePath(projectRoot, rel, {
    allowOutsideProjectRoot: options?.allowOutsideProjectRoot === true,
  })
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new Error(`Working directory not found: ${rel}`)
  return abs
}

export function buildShellCandidates(shellPreference, { commandText = '', background = false } = {}) {
  const isWin = process.platform === 'win32'
  const pwsh = { label: 'pwsh', bin: 'pwsh.exe', args: (command) => ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command] }
  const powershell = { label: 'powershell', bin: 'powershell.exe', args: (command) => ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command] }
  const cmd = { label: 'cmd', bin: 'cmd.exe', args: (command) => ['/d', '/s', '/c', command] }
  const bash = { label: 'bash', bin: 'bash', args: (command) => ['-lc', command] }
  const sh = { label: 'sh', bin: 'sh', args: (command) => ['-lc', command] }
  const wsl = { label: 'wsl', bin: 'wsl.exe', args: (command) => ['bash', '-lc', command] }
  if (isWin) {
    switch (shellPreference) {
      case 'powershell': return [pwsh, powershell]
      case 'cmd': return [cmd]
      case 'bash': return [bash, wsl]
      case 'wsl': return [wsl]
      case 'sh': return [bash]
      case 'auto':
      default:
        if (background && isWindowsPythonHttpServerCommand(commandText)) return [cmd, pwsh, powershell]
        return [pwsh, powershell, cmd]
    }
  }
  switch (shellPreference) {
    case 'powershell': return [{ ...pwsh, bin: 'pwsh' }]
    case 'cmd': return [sh]
    case 'bash': return [bash]
    case 'wsl': return [wsl]
    case 'sh': return [sh]
    case 'auto':
    default:
      return [bash, sh]
  }
}

function detectPrivilegedHostOperation(commandText = '') {
  const normalizedCommandText = normalizeCommandPolicyText(commandText)
  const reasons = []
  for (const rule of PRIVILEGED_HOST_OPERATION_PATTERNS) {
    if (rule.pattern.test(normalizedCommandText)) reasons.push(rule.reason)
  }
  return {
    detected: reasons.length > 0,
    reasons: Array.from(new Set(reasons)),
  }
}

function looksLikePathToken(token) {
  const value = String(token || '')
  if (!value) return false
  if (value.startsWith('-')) return false
  if (looksLikeUrlToken(value)) return false
  if (value === '.' || value === '..') return true
  if (/^[a-zA-Z]:[\\/]/.test(value)) return true
  if (/^\\\\[^\\]/.test(value)) return true
  if (/^[.]{1,2}[\\/]/.test(value)) return true
  if (/[\\/]/.test(value)) return true
  if (/\.[A-Za-z0-9]{1,8}$/.test(value)) return true
  return false
}

function isLikelyCmdSwitchInPowershellAlias(commandText, token, shell) {
  const selectedShell = String(shell || '').trim().toLowerCase()
  const cmd = String(commandText || '').trim().toLowerCase()
  const t = String(token || '').trim().toLowerCase()
  if (!(selectedShell === 'powershell' || selectedShell === 'pwsh' || selectedShell === 'auto')) return false
  if (!/^dir\b/.test(cmd)) return false
  return /^\/[a-z]+$/i.test(t)
}

function isPathWithinRootPath(targetPath, rootPath) {
  try {
    const target = path.resolve(String(targetPath || '.'))
    const root = path.resolve(String(rootPath || '.'))
    const rel = path.relative(root, target)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  } catch {
    return false
  }
}

function resolvePathRefForPolicy(rawToken, { projectRoot = '', resolvedCwd = '' } = {}) {
  const token = String(rawToken || '').trim()
  if (!token) return ''
  if (/%userprofile%|\$userprofile|\$home|\$\{home\}/i.test(token)) return ''
  if (/^[a-zA-Z]:[\\/]/.test(token) || /^\\\\[^\\]/.test(token)) return path.resolve(token)
  if (/^\//.test(token) && process.platform !== 'win32') return path.resolve(token)
  const base = resolvedCwd || projectRoot
  if (!base) return ''
  return path.resolve(base, token)
}

export function extractCommandPathRefs(commandText, { shell = 'auto' } = {}) {
  const raw = String(commandText ?? '').trim()
  if (!raw) {
    return {
      rawRefs: [],
      hasAbsolutePathRef: false,
      hasTraversalRef: false,
      externalPathHints: [],
    }
  }

  const rawRefs = []
  const externalPathHints = new Set()
  let hasAbsolutePathRef = false
  let hasTraversalRef = false

  for (const part of tokenizeCommandText(raw)) {
    const token = unquoteToken(part)
    if (!token) continue
    if (isLikelyCmdSwitchInPowershellAlias(raw, token, shell)) continue
    if (!looksLikePathToken(token)) continue
    rawRefs.push(token)

    if (/^[a-zA-Z]:[\\/]/.test(token) || /^\\\\[^\\]/.test(token) || (/^\//.test(token) && !/^\/[a-z0-9]+$/i.test(token))) {
      hasAbsolutePathRef = true
    }
    if (token === '..' || token.includes('..\\') || token.includes('../')) {
      hasTraversalRef = true
    }
    if (/%userprofile%|\$userprofile|\$home|\$\{home\}|^[a-zA-Z]:\\users\\|^\/(users|home|etc|usr|var)\b/i.test(token)) {
      externalPathHints.add(token)
    }
  }

  return {
    rawRefs: Array.from(new Set(rawRefs)).slice(0, 20),
    hasAbsolutePathRef,
    hasTraversalRef,
    externalPathHints: Array.from(externalPathHints).slice(0, 10),
  }
}

export function classifyCommandIntent(commandText, { shell = 'auto', background = false } = {}) {
  void shell
  const raw = String(commandText ?? '').trim()
  const lower = raw.toLowerCase()
  const reasons = []
  const longRunning = !!background || isLikelyLongRunningCommand(raw)
  const packageManager = detectPackageManager(lower)

  if (!raw) {
    return {
      commandClass: 'unknown_or_high_risk',
      packageManager,
      longRunning: false,
      confidence: 'low',
      reasons: ['empty_command'],
    }
  }

  const install = extractCommandInstallIntent(raw)
  if (install.isInstallLike) {
    reasons.push('install_command_detected')
    return {
      commandClass: install.isGlobalOrSystemInstall
        ? 'dependency_install_global_or_system'
        : 'dependency_install_project',
      packageManager,
      longRunning,
      confidence: 'high',
      reasons,
    }
  }

  if (/\b(curl|wget)\b/.test(lower) || /\binvoke-webrequest\b/.test(lower) || /\binvoke-restmethod\b/.test(lower) || /\bgit\s+clone\b/.test(lower)) {
    reasons.push('network_fetch_detected')
    return {
      commandClass: 'network_fetch_non_install',
      packageManager,
      longRunning,
      confidence: 'high',
      reasons,
    }
  }

  if (longRunning) {
    reasons.push('long_running_command')
    return {
      commandClass: 'process_control',
      packageManager,
      longRunning: true,
      confidence: 'medium',
      reasons,
    }
  }

  if (/^(npm|pnpm|yarn|bun)\s+(run\s+)?(test|build|lint|typecheck)\b/.test(lower)
      || /^(pytest|python\s+-m\s+pytest|py\s+-m\s+pytest)\b/.test(lower)
      || /^cargo\s+(test|check|build|clippy)\b/.test(lower)
      || /^go\s+test\b/.test(lower)
      || /^(dotnet|msbuild)\s+(test|build)\b/.test(lower)) {
    reasons.push('build_test_lint_pattern')
    return {
      commandClass: 'project_build_test',
      packageManager,
      longRunning,
      confidence: 'high',
      reasons,
    }
  }

  if (/^(dir|ls|pwd|get-location|gci|get-childitem|get-content|gc|cat|type|more|rg|findstr|where|which)\b/.test(lower)
      || /^git\s+(status|diff|log|show|branch)\b/.test(lower)) {
    reasons.push('read_only_shell_pattern')
    return {
      commandClass: 'project_readonly_shell',
      packageManager,
      longRunning,
      confidence: 'medium',
      reasons,
    }
  }

  if (/^(mkdir|md|copy|cp|move|mv|rename|ren|touch)\b/.test(lower)
      || /\b(prettier|eslint)\b[^\n\r]*\s(--write|--fix)\b/.test(lower)
      || /^git\s+(apply|checkout|restore)\b/.test(lower)) {
    reasons.push('project_mutation_pattern')
    return {
      commandClass: 'project_mutation',
      packageManager,
      longRunning,
      confidence: 'medium',
      reasons,
    }
  }

  return {
    commandClass: 'unknown_or_high_risk',
    packageManager,
    longRunning,
    confidence: 'low',
    reasons: reasons.length > 0 ? reasons : ['no_classifier_match'],
  }
}

export function buildRunCommandPolicySummary(projectRoot, {
  command,
  cwd = '.',
  shell = 'auto',
  background = false,
  env = null,
} = {}) {
  const commandText = String(command || '').trim()
  const requestedCwd = String(cwd ?? '.').trim() || '.'
  const shellPreference = normalizeShellPreference(shell)
  const commandClass = classifyCommandIntent(commandText, { shell: shellPreference, background })
  const pathRefs = extractCommandPathRefs(commandText, { shell: shellPreference })
  const network = extractCommandNetworkIntent(commandText, { shell: shellPreference })
  const install = extractCommandInstallIntent(commandText, { shell: shellPreference })
  const envOverrideKeys = env && typeof env === 'object' && !Array.isArray(env)
    ? Object.keys(env).map((key) => String(key || '').trim()).filter(Boolean)
    : []
  const privilegedHostOperation = detectPrivilegedHostOperation(commandText)
  const privateNetworkHosts = Array.isArray(network.hostHints)
    ? network.hostHints.filter((host) => isPrivateNetworkHost(host))
    : []
  const riskSignals = []
  const hints = []
  let resolvedCwd = ''
  let requestedCwdAbsolute = ''
  let cwdOutsideWorkspace = false
  const resolvedRootPathRefs = []
  const resolvedExternalPathRefs = []
  const unresolvedPathRefHints = []

  try {
    if (projectRoot) {
      const cwdAccess = classifyPathAccess(projectRoot, requestedCwd)
      requestedCwdAbsolute = String(cwdAccess?.absolutePath || '').trim()
      cwdOutsideWorkspace = !!(
        cwdAccess?.escapesProjectRoot
        || cwdAccess?.escapesProjectRootViaSymlink
      )
      resolvedCwd = normalizeCommandCwd(projectRoot, requestedCwd, {
        allowOutsideProjectRoot: cwdOutsideWorkspace,
      })
    }
  } catch (error) {
    hints.push(String(error?.message || 'Unable to resolve working directory.'))
    riskSignals.push('cwd_resolution_failed')
  }

  if (projectRoot && Array.isArray(pathRefs.rawRefs) && pathRefs.rawRefs.length > 0) {
    for (const ref of pathRefs.rawRefs) {
      const token = String(ref || '').trim()
      if (!token) continue
      const resolved = resolvePathRefForPolicy(token, {
        projectRoot: String(projectRoot || ''),
        resolvedCwd,
      })
      if (!resolved) {
        if (
          /%userprofile%|\$userprofile|\$home|\$\{home\}|^~([\\/]|$)|^\/(users|home|etc|usr|var)\b/i.test(token)
          || /^[a-zA-Z]:\\users\\|^[a-zA-Z]:\\windows\\|^[a-zA-Z]:\\program files/i.test(token)
        ) {
          unresolvedPathRefHints.push(token)
        }
        continue
      }
      if (isPathWithinRootPath(resolved, projectRoot)) {
        resolvedRootPathRefs.push(resolved)
      } else {
        resolvedExternalPathRefs.push(resolved)
      }
    }
  }

  if (pathRefs.hasAbsolutePathRef) riskSignals.push('absolute_path_ref')
  if (pathRefs.hasTraversalRef) riskSignals.push('path_traversal_ref')
  if (Array.isArray(pathRefs.externalPathHints) && pathRefs.externalPathHints.length > 0) riskSignals.push('external_path_hint')
  if (envOverrideKeys.length > 0) riskSignals.push('env_override_requested')
  if (cwdOutsideWorkspace) riskSignals.push('cwd_outside_workspace')
  if (network.networkIntent === 'external') riskSignals.push('external_network_intent')
  if (network.networkIntent === 'unknown') riskSignals.push('unknown_network_intent')
  if (privateNetworkHosts.length > 0) riskSignals.push('private_network_target')
  if (install.isGlobalOrSystemInstall) riskSignals.push('global_or_system_install')
  if (privilegedHostOperation.detected) riskSignals.push('privileged_host_operation')
  if (commandClass.commandClass === 'unknown_or_high_risk') riskSignals.push('unknown_command_class')

  if (envOverrideKeys.length > 0) {
    hints.push('Environment overrides are blocked by shared shell policy.')
  }
  if (cwdOutsideWorkspace) {
    hints.push('Working directory is outside the project root; explicit host_full_access approval is required.')
  }
  if (install.isInstallLike && !install.isGlobalOrSystemInstall) {
    hints.push('Dependency install detected; preferred execution target is an install sandbox (Phase 2) rather than host shell.')
  }
  if (install.isGlobalOrSystemInstall) {
    hints.push('Global/system install detected; require explicit elevated host approval.')
  }
  if (privateNetworkHosts.length > 0) {
    hints.push(`Private/loopback network target detected: ${privateNetworkHosts.join(', ')}.`)
  }
  if (privilegedHostOperation.detected) {
    hints.push(`Privileged host operation pattern detected: ${privilegedHostOperation.reasons.join(', ')}.`)
  }

  let profileHint = 'workspace_safe'
  if (install.isInstallLike && !install.isGlobalOrSystemInstall) profileHint = 'install_sandbox'
  if (
    install.isGlobalOrSystemInstall
    || cwdOutsideWorkspace
    || resolvedExternalPathRefs.length > 0
    || unresolvedPathRefHints.length > 0
    || (pathRefs.hasTraversalRef && !resolvedCwd)
    || network.networkIntent === 'external'
  ) {
    profileHint = 'host_full_access'
  }
  if (commandClass.commandClass === 'unknown_or_high_risk' && profileHint === 'workspace_safe') {
    profileHint = 'unknown'
  }

  const pathScope = (
    cwdOutsideWorkspace
    ||
    resolvedExternalPathRefs.length > 0
    || unresolvedPathRefHints.length > 0
    || (pathRefs.hasTraversalRef && resolvedRootPathRefs.length === 0)
    || (Array.isArray(pathRefs.externalPathHints) && pathRefs.externalPathHints.length > 0)
  ) ? 'external_requested' : (resolvedCwd ? 'root_only' : 'unknown')

  return {
    type: 'run_command_policy_v1',
    profileHint,
    commandClass: commandClass.commandClass,
    shellPreference,
    requestedCwd,
    requestedCwdAbsolute,
    cwdOutsideWorkspace,
    resolvedCwd,
    pathScope,
    envOverridesRequested: envOverrideKeys.length > 0,
    envOverrideKeys,
    pathRefs: {
      hasAbsolutePathRef: !!pathRefs.hasAbsolutePathRef,
      hasTraversalRef: !!pathRefs.hasTraversalRef,
      externalPathHints: Array.isArray(pathRefs.externalPathHints) ? pathRefs.externalPathHints : [],
      resolvedRootPaths: Array.from(new Set(resolvedRootPathRefs)).slice(0, 10),
      resolvedExternalPaths: Array.from(new Set(resolvedExternalPathRefs)).slice(0, 10),
      unresolvedPathHints: Array.from(new Set(unresolvedPathRefHints)).slice(0, 10),
    },
    networkIntent: network.networkIntent,
    networkHosts: Array.isArray(network.hostHints) ? network.hostHints : [],
    privateNetworkHosts,
    privilegedHostOperation,
    install: {
      isInstallLike: !!install.isInstallLike,
      isGlobalOrSystemInstall: !!install.isGlobalOrSystemInstall,
      ecosystem: String(install.ecosystem || ''),
      packagesHint: Array.isArray(install.packagesHint) ? install.packagesHint : [],
    },
    longRunning: !!commandClass.longRunning,
    riskSignals: Array.from(new Set(riskSignals)),
    hints: Array.from(new Set(hints)),
  }
}

export function evaluateRunCommandPolicyDecision(policySummary, settings = {}) {
  const policy = policySummary && typeof policySummary === 'object' ? policySummary : {}
  const commandClass = String(policy.commandClass || 'unknown_or_high_risk').trim() || 'unknown_or_high_risk'
  const normalizedSettings = settings && typeof settings === 'object' ? settings : {}
  const installSandboxEnabled = normalizedSettings.installSandboxEnabled === true
  const allowGlobalSystemInstalls = normalizedSettings.allowGlobalSystemInstalls === true
  const allowPrivilegedHostOps = normalizedSettings.allowPrivilegedHostOps === true
  const allowPrivateNetworkTargets = normalizedSettings.allowPrivateNetworkTargets === true
  const hostFullAccessApproved = normalizedSettings.allowHostFullAccessForThisCommand === true
    || normalizedSettings.hostFullAccessApproved === true
  const pathRefs = policy.pathRefs && typeof policy.pathRefs === 'object' ? policy.pathRefs : {}
  const resolvedExternalPaths = Array.isArray(pathRefs.resolvedExternalPaths)
    ? pathRefs.resolvedExternalPaths.map((v) => String(v || '').trim()).filter(Boolean)
    : []
  const unresolvedPathHints = Array.isArray(pathRefs.unresolvedPathHints)
    ? pathRefs.unresolvedPathHints.map((v) => String(v || '').trim()).filter(Boolean)
    : []
  const externalPathHints = Array.isArray(pathRefs.externalPathHints)
    ? pathRefs.externalPathHints.map((v) => String(v || '').trim()).filter(Boolean)
    : []
  const hasTraversalRef = pathRefs.hasTraversalRef === true
  const hasExternalPathRisk = (
    resolvedExternalPaths.length > 0
    || unresolvedPathHints.length > 0
    || externalPathHints.length > 0
    || (hasTraversalRef && String(policy.pathScope || '') === 'external_requested')
  )
  const privateNetworkHosts = Array.isArray(policy.privateNetworkHosts)
    ? policy.privateNetworkHosts.map((v) => String(v || '').trim()).filter(Boolean)
    : []
  const hasPrivateNetworkTargets = privateNetworkHosts.length > 0
  const privilegedHostOperation = policy.privilegedHostOperation && typeof policy.privilegedHostOperation === 'object'
    ? policy.privilegedHostOperation
    : { detected: false, reasons: [] }
  const privilegedReasons = Array.isArray(privilegedHostOperation.reasons)
    ? privilegedHostOperation.reasons.map((v) => String(v || '').trim()).filter(Boolean)
    : []
  const privilegedHostOpDetected = privilegedHostOperation.detected === true || privilegedReasons.length > 0
  const envOverridesRequested = policy.envOverridesRequested === true
    || (Array.isArray(policy.envOverrideKeys) && policy.envOverrideKeys.length > 0)
  const cwdOutsideWorkspace = policy.cwdOutsideWorkspace === true
  const outsideWorkspaceMutationAttempt = hasExternalPathRisk && (
    commandClass === 'project_mutation'
    || commandClass === 'dependency_install_global_or_system'
  )

  const reasons = []
  const hints = []
  let decision = 'allow'

  if (envOverridesRequested) {
    return {
      decision: 'deny',
      reasons: ['env_override_not_allowed'],
      hints: ['Environment overrides are blocked by shared shell policy.'],
      executionTarget: 'host',
      elevationRequired: true,
      denied: true,
    }
  }
  if (commandClass === 'dependency_install_global_or_system' && !allowGlobalSystemInstalls) {
    return {
      decision: 'deny',
      reasons: ['global_or_system_install_hard_denied'],
      hints: ['Global/system installs are blocked by policy unless explicitly allowed in advanced command-safety settings.'],
      executionTarget: 'host',
      elevationRequired: false,
      denied: true,
    }
  }
  if (privilegedHostOpDetected && !allowPrivilegedHostOps) {
    return {
      decision: 'deny',
      reasons: ['privileged_host_operation_hard_denied', ...privilegedReasons],
      hints: ['Privileged host operations are blocked by policy unless explicitly allowed in advanced command-safety settings.'],
      executionTarget: 'host',
      elevationRequired: false,
      denied: true,
    }
  }
  if (hasPrivateNetworkTargets && !allowPrivateNetworkTargets) {
    return {
      decision: 'deny',
      reasons: ['private_network_target_hard_denied'],
      hints: [`Private/loopback network targets are blocked by policy unless explicitly allowed in advanced command-safety settings: ${privateNetworkHosts.join(', ')}.`],
      executionTarget: 'host',
      elevationRequired: false,
      denied: true,
    }
  }

  if (hostFullAccessApproved) {
    reasons.push('host_full_access_override')
    hints.push('One-shot host_full_access approval override applied for this command.')
  }

  if (commandClass === 'dependency_install_project') {
    if (hostFullAccessApproved) {
      decision = 'allow'
      reasons.push('project_dependency_install_host_full_access')
      hints.push('Project dependency install will run on the host shell because one-shot host_full_access approval bypasses install sandbox routing.')
    } else if (installSandboxEnabled) {
      decision = 'route_to_sandbox'
      reasons.push('project_dependency_install')
      hints.push('Project dependency install should run in install sandbox when enabled.')
    } else {
      decision = 'allow_with_warning'
      reasons.push('install_sandbox_disabled')
      hints.push('Install sandbox is disabled; project dependency install will run on the host shell only after explicit approval.')
    }
  } else if (commandClass === 'dependency_install_global_or_system') {
    if (hostFullAccessApproved) {
      decision = 'allow'
      reasons.push('global_or_system_install_host_full_access')
      hints.push('Global/system install allowed because one-shot host_full_access approval was granted.')
    } else {
      decision = 'require_elevation'
      reasons.push('global_or_system_install_elevation_required')
      hints.push('Global/system installs require explicit host_full_access approval.')
    }
  } else if (commandClass === 'network_fetch_non_install') {
    if (hostFullAccessApproved) {
      decision = 'allow'
      reasons.push('external_network_fetch_host_full_access')
      hints.push('External network access allowed because one-shot host_full_access approval was granted.')
    } else {
      decision = 'require_elevation'
      reasons.push('external_network_fetch')
      hints.push('External network fetch detected. Explicit host_full_access approval is required.')
    }
  } else if (commandClass === 'unknown_or_high_risk') {
    const confinedUnknownCommand = !hasExternalPathRisk
      && String(policy.networkIntent || '') !== 'external'
      && !hasPrivateNetworkTargets
      && !privilegedHostOpDetected
    if (confinedUnknownCommand) {
      decision = 'allow_with_warning'
      reasons.push('unknown_command_class')
      hints.push('Classifier confidence is low. Review command intent before allowing.')
    } else if (hostFullAccessApproved) {
      decision = 'allow_with_warning'
      reasons.push('unknown_command_class_host_full_access')
      hints.push('Unknown/high-risk command allowed because host_full_access approval was granted.')
    } else {
      decision = 'deny'
      reasons.push('unknown_command_class_unconfined')
      hints.push('Unknown/high-risk command is not confined to workspace-safe scope and is blocked by policy.')
    }
  }

  if (decision !== 'deny' && cwdOutsideWorkspace) {
    if (hostFullAccessApproved) {
      reasons.push('outside_workspace_cwd_host_full_access')
      hints.push('Outside-workspace working directory allowed because one-shot host_full_access approval was granted.')
    } else {
      decision = 'require_elevation'
      reasons.push('outside_workspace_cwd')
      hints.push('Working directory is outside the project root. Explicit host_full_access approval is required.')
    }
  }
  if (decision !== 'route_to_sandbox' && decision !== 'deny' && hasExternalPathRisk) {
    if (outsideWorkspaceMutationAttempt) {
      if (hostFullAccessApproved) {
        reasons.push('outside_workspace_mutation_host_full_access')
        hints.push('Outside-workspace mutation allowed because one-shot host_full_access approval was granted.')
      } else {
        decision = 'require_elevation'
        reasons.push('outside_workspace_mutation')
        hints.push('Outside-workspace mutation detected. Explicit host_full_access approval is required.')
      }
    } else if (hostFullAccessApproved) {
      reasons.push('external_path_host_full_access')
      hints.push('External path access allowed because one-shot host_full_access approval was granted.')
    } else {
      decision = 'require_elevation'
      reasons.push('external_path_access')
      hints.push('Command references path(s) outside the project root; explicit host_full_access approval is required.')
    }
  }
  if (decision !== 'deny' && hasPrivateNetworkTargets) {
    if (hostFullAccessApproved) {
      reasons.push('private_network_target_host_full_access')
      hints.push('Private/loopback network target allowed because one-shot host_full_access approval was granted.')
    } else {
      decision = 'require_elevation'
      reasons.push('private_network_target')
      hints.push(`Private/loopback network target detected. Explicit host_full_access approval is required: ${privateNetworkHosts.join(', ')}.`)
    }
  }
  if (decision !== 'deny' && privilegedHostOpDetected) {
    if (hostFullAccessApproved) {
      reasons.push('privileged_host_operation_host_full_access')
      hints.push('Privileged host operation allowed because one-shot host_full_access approval was granted.')
    } else {
      decision = 'require_elevation'
      reasons.push('privileged_host_operation')
      hints.push('Privileged host operation detected. Explicit host_full_access approval is required.')
    }
  }

  return {
    decision,
    reasons: Array.from(new Set(reasons)),
    hints: Array.from(new Set(hints)),
    executionTarget: decision === 'route_to_sandbox' ? 'install_sandbox' : 'host',
    elevationRequired: decision === 'require_elevation',
    denied: decision === 'deny',
  }
}
