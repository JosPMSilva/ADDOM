import { spawn } from 'child_process'
import {
  DEFAULT_COMMAND_TIMEOUT_MS,
  MAX_BACKGROUND_STARTUP_OUTPUT_CHARS,
  BACKGROUND_STARTUP_GRACE_MS,
  normalizeTimeoutMs,
  createAbortError,
  createCommandEnv,
  validateCommandPolicy,
  isLikelyLongRunningCommand,
  buildPermissionFailureHints,
  isWindowsRelativeBrowserLaunchCommand,
  appendBrowserLaunchAdvisory,
  shouldTryNextShellCandidate,
  normalizeShellPreference,
  normalizeCommandCwd,
  buildShellCandidates,
  appendOutput,
  formatSuccessOutput,
  formatFailureOutput,
  buildBackgroundFailureHints,
  buildRunCommandPolicySummary,
  buildShellDialectHints,
  evaluateRunCommandPolicyDecision,
} from './command-tools-core.mjs'
import {
  killProcessTreeByPid,
  registerBackgroundJob,
  stopBackgroundCommand,
} from './command-tools-background.mjs'
import { runCommandInInstallSandbox } from './command-tools-sandbox.mjs'
import {
  recordGlobalRunCommandPolicyTelemetryEvent,
  recordGlobalRunCommandShellDialectHints,
} from '../chat/run-command-policy-telemetry.mjs'
import { normalizeRunCommandPolicyDecisionResult } from '../chat/run-command-policy-contract.mjs'

const TRUSTED_COMMAND_SAFETY_OVERRIDE = Symbol('trustedCommandSafetyOverride')
const MAX_LIVE_OUTPUT_CHUNK_CHARS = 2000

function hasPrivilegedCommandSafetyOverride(input = null) {
  if (!input || typeof input !== 'object') return false
  return input.disableInstallSandboxForThisCommand === true
    || input.hostInstallFallbackApproved === true
    || input.hostFullAccessApproved === true
    || input.allowHostFullAccessForThisCommand === true
    || input.wslCompatibilityApproved === true
}

function isTrustedCommandSafetyOverride(input = null) {
  return !!(input && typeof input === 'object' && input[TRUSTED_COMMAND_SAFETY_OVERRIDE] === true)
}

export function createTrustedCommandSafetyOverride(input = {}) {
  const normalized = input && typeof input === 'object' ? { ...input } : {}
  Object.defineProperty(normalized, TRUSTED_COMMAND_SAFETY_OVERRIDE, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  })
  return normalized
}

function appendHintsToError(err, hints = []) {
  const list = Array.isArray(hints) ? hints.map((h) => String(h || '').trim()).filter(Boolean) : []
  if (list.length === 0) return err
  const baseMessage = String(err?.message || err || '')
  const normalized = list.filter((hint) => !baseMessage.includes(hint))
  if (normalized.length === 0) return err
  const hintBlock = `\n\nShell hints:\n- ${normalized.join('\n- ')}`
  if (err instanceof Error) {
    err.message = `${baseMessage}${hintBlock}`
    return err
  }
  return new Error(`${baseMessage}${hintBlock}`)
}

function normalizeLiveOutputChunk(chunk) {
  const text = Buffer.isBuffer(chunk)
    ? chunk.toString('utf8')
    : String(chunk ?? '')
  if (!text) return { text: '', truncated: false }
  if (text.length <= MAX_LIVE_OUTPUT_CHUNK_CHARS) {
    return { text, truncated: false }
  }
  return {
    text: `${text.slice(0, MAX_LIVE_OUTPUT_CHUNK_CHARS)}...[chunk truncated]`,
    truncated: true,
  }
}

function emitLiveOutputChunk(onOutputChunk, stream, chunk) {
  if (typeof onOutputChunk !== 'function') return
  const normalizedStream = String(stream || '').trim().toLowerCase() === 'stderr' ? 'stderr' : 'stdout'
  const payload = normalizeLiveOutputChunk(chunk)
  if (!payload.text) return
  try {
    onOutputChunk({
      stream: normalizedStream,
      chunk: payload.text,
      truncated: payload.truncated,
      emittedAt: Date.now(),
    })
  } catch {
    // Live output streaming must not break command execution.
  }
}

function shouldLogRunCommandPolicyTelemetry() {
  return process.env.ADDOM_DEBUG_RUN_COMMAND_POLICY === '1'
}

function logRunCommandPolicyTelemetry(eventName, payload = {}) {
  recordGlobalRunCommandPolicyTelemetryEvent(eventName, payload)
  if (!shouldLogRunCommandPolicyTelemetry()) return
  try {
    console.info(`[run_command policy] ${String(eventName || 'event')}`, payload)
  } catch {
    // Non-fatal diagnostics only.
  }
}

function normalizeCommandSafetyOptions(input = {}) {
  const src = input && typeof input === 'object' ? input : {}
  const normalizeNetworkEnforcementMode = (value) => {
    const v = String(value || '').trim().toLowerCase()
    return v === 'strict' ? 'strict' : 'best_effort'
  }
  return {
    installSandboxEnabled: src.installSandboxEnabled === true,
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
    installSandboxIgnoreScriptsFirstPass:
      src.installSandboxIgnoreScriptsFirstPass === true || src.ignoreScriptsFirstPass === true,
    allowHostFullAccessForThisCommand:
      src.allowHostFullAccessForThisCommand === true || src.hostFullAccessApproved === true,
    hostFullAccessApproved: src.hostFullAccessApproved === true,
    allowGlobalSystemInstalls: src.allowGlobalSystemInstalls === true,
    allowOutsideWorkspaceMutation: src.allowOutsideWorkspaceMutation === true,
    allowPrivilegedHostOps: src.allowPrivilegedHostOps === true,
    allowPrivateNetworkTargets: src.allowPrivateNetworkTargets === true,
  }
}

function mergeCommandSafetyOptions(base, override = null) {
  const normalizedBase = normalizeCommandSafetyOptions(base)
  const ov = override && typeof override === 'object' ? override : null
  if (!ov) return normalizedBase
  if (hasPrivilegedCommandSafetyOverride(ov) && !isTrustedCommandSafetyOverride(ov)) {
    throw new Error('Privileged command safety overrides can only be set by the approval flow.')
  }
  return {
    ...normalizedBase,
    ...(ov.disableInstallSandboxForThisCommand ? { installSandboxEnabled: false } : {}),
    ...(ov.allowHostFullAccessForThisCommand || ov.hostFullAccessApproved
      ? {
          allowHostFullAccessForThisCommand: true,
          hostFullAccessApproved: true,
        }
      : {}),
  }
}

async function runWithCandidate(candidate, {
  command,
  cwd,
  timeoutMs,
  signal,
  projectRoot,
  shellPreference,
  background = false,
  expectedPersistent = false,
  onOutputChunk = null,
}) {
  const killChild = (child, force = false) => {
    if (!child || child.exitCode !== null || child.killed) return
    const pid = Number(child.pid || 0)
    if (pid > 0) {
      killProcessTreeByPid(pid, force).catch(() => {})
    } else {
      try { child.kill(force ? 'SIGKILL' : 'SIGTERM') } catch { /* best-effort child termination */ }
    }
  }

  if (background) {
    return await new Promise((resolve, reject) => {
      let settled = false
      let startupHandle = null
      const startupStdout = { text: '', truncated: false }
      const startupStderr = { text: '', truncated: false }
      const child = spawn(candidate.bin, candidate.args(command), {
        cwd,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: createCommandEnv(),
      })
      const job = registerBackgroundJob({ child, projectRoot, command, cwd, shell: shellPreference })
      const finish = (handler) => {
        if (settled) return
        settled = true
        if (startupHandle) clearTimeout(startupHandle)
        if (signal) signal.removeEventListener('abort', onAbort)
        handler()
      }
      const onAbort = () => {
        stopBackgroundCommand(job.id, { reason: 'Cancelled before background startup completed.', force: true }).catch(() => {})
        finish(() => reject(createAbortError(`Background command cancelled (${candidate.label}).`)))
      }
      if (signal?.aborted) return onAbort()
      if (signal) signal.addEventListener('abort', onAbort, { once: true })
      const onStartupStdout = (chunk) => {
        appendOutput(startupStdout, chunk, MAX_BACKGROUND_STARTUP_OUTPUT_CHARS)
        emitLiveOutputChunk(onOutputChunk, 'stdout', chunk)
      }
      const onStartupStderr = (chunk) => {
        appendOutput(startupStderr, chunk, MAX_BACKGROUND_STARTUP_OUTPUT_CHARS)
        emitLiveOutputChunk(onOutputChunk, 'stderr', chunk)
      }
      child.stdout?.on('data', onStartupStdout)
      child.stderr?.on('data', onStartupStderr)
      child.on('error', (err) => finish(() => reject(err)))
      child.on('close', (code, closeSignal) => {
        if (settled) return
        const output = formatFailureOutput(startupStdout, startupStderr)
        const outputBlock = output && output !== 'No output captured.' ? `\n\n${output}` : ''
        const permissionHints = buildPermissionFailureHints({ command, output })
        const hints = buildBackgroundFailureHints({ command, candidateLabel: candidate.label })
        const mergedHints = [...hints, ...permissionHints]
        const hintBlock = mergedHints.length > 0 ? `\n\nHints:\n- ${mergedHints.join('\n- ')}` : ''
        if (code === 0) {
          if (expectedPersistent) {
            return finish(() => reject(new Error(
              `Background command exited before startup completed (${candidate.label}). It did not stay running.${outputBlock}${hintBlock}`,
            )))
          }
          return finish(() => resolve(`Background command completed quickly (${candidate.label}).`))
        }
        const sig = closeSignal ? `, signal ${closeSignal}` : ''
        finish(() => reject(new Error(`Background command exited with code ${code}${sig} (${candidate.label}).${outputBlock}${hintBlock}`)))
      })
      startupHandle = setTimeout(() => {
        if (settled) return
        try {
          child.stdout?.removeListener('data', onStartupStdout)
          child.stderr?.removeListener('data', onStartupStderr)
          child.stdout?.resume()
          child.stderr?.resume()
        } catch {
          /* best-effort transition to detached background streaming */
        }
        try { child.unref() } catch { /* best-effort detach from parent event loop */ }
        finish(() => resolve(`Background command started [job ${job.id}] (${candidate.label}, pid ${child.pid ?? 'unknown'}).`))
      }, BACKGROUND_STARTUP_GRACE_MS)
    })
  }

  return await new Promise((resolve, reject) => {
    const stdoutState = { text: '', truncated: false }
    const stderrState = { text: '', truncated: false }
    let timedOut = false
    let aborted = false
    let settled = false
    let timeoutHandle = null
    const child = spawn(candidate.bin, candidate.args(command), {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: createCommandEnv(),
    })
    const finish = (handler) => {
      if (settled) return
      settled = true
      if (timeoutHandle) clearTimeout(timeoutHandle)
      if (signal) signal.removeEventListener('abort', onAbort)
      handler()
    }
    const onAbort = () => {
      aborted = true
      killChild(child, true)
    }
    if (signal?.aborted) {
      onAbort()
      return finish(() => reject(createAbortError(`Command cancelled (${candidate.label}).`)))
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
    timeoutHandle = setTimeout(() => {
      timedOut = true
      killChild(child, false)
      setTimeout(() => killChild(child, true), 1500)
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      appendOutput(stdoutState, chunk)
      emitLiveOutputChunk(onOutputChunk, 'stdout', chunk)
    })
    child.stderr.on('data', (chunk) => {
      appendOutput(stderrState, chunk)
      emitLiveOutputChunk(onOutputChunk, 'stderr', chunk)
    })
    child.on('error', (err) => finish(() => reject(err)))
    child.on('close', (code, signalName) => {
      finish(() => {
        if (aborted) return reject(createAbortError(`Command cancelled (${candidate.label}).`))
        if (timedOut) {
          const output = formatFailureOutput(stdoutState, stderrState)
          return reject(new Error(`Command timed out after ${timeoutMs} ms (${candidate.label}).\n\n${output}`))
        }
        if (code === 0) return resolve(formatSuccessOutput(stdoutState, stderrState))
        const output = formatFailureOutput(stdoutState, stderrState)
        const permissionHints = buildPermissionFailureHints({ command, output })
        const hintBlock = permissionHints.length > 0 ? `\n\nHints:\n- ${permissionHints.join('\n- ')}` : ''
        const signalInfo = signalName ? `, signal ${signalName}` : ''
        reject(new Error(`Command failed with exit code ${code}${signalInfo} (${candidate.label}).\n\n${output}${hintBlock}`))
      })
    })
  })
}

export async function runCommand(projectRoot, {
  command,
  timeout_ms = DEFAULT_COMMAND_TIMEOUT_MS,
  shell = 'auto',
  cwd,
  workdir,
  env,
  background = false,
} = {}, { signal, commandSafety, commandSafetyOverride, installSandboxAdapter, runWithCandidateImpl, onOutputChunk = null } = {}) {
  const commandText = String(command || '').trim()
  const requestedCwd = String(cwd || workdir || '.')
  const commandSafetyOptions = mergeCommandSafetyOptions(commandSafety, commandSafetyOverride)
  const hostInstallFallbackApproved = !!commandSafetyOverride?.hostInstallFallbackApproved
  const hostFullAccessApproved = !!commandSafetyOverride?.hostFullAccessApproved
    || !!commandSafetyOverride?.allowHostFullAccessForThisCommand
  const wslCompatibilityApproved = !!commandSafetyOverride?.wslCompatibilityApproved
  validateCommandPolicy(commandText, commandSafetyOptions)
  if (isWindowsRelativeBrowserLaunchCommand(commandText)) {
    throw new Error(
      'Relative browser file launch is blocked on Windows to avoid false-success opens. ' +
      'Resolve to an absolute path first, e.g. ' +
      '`$file = (Resolve-Path .\\index.html).Path; Start-Process chrome -ArgumentList $file` ' +
      'or `Start-Process -FilePath (Resolve-Path .\\index.html).Path`.',
    )
  }
  const timeoutMs = normalizeTimeoutMs(timeout_ms)
  const shellPreference = normalizeShellPreference(shell)
  const policySummary = buildRunCommandPolicySummary(projectRoot, {
    command: commandText,
    cwd: requestedCwd,
    shell: shellPreference,
    env,
    background,
  })
  const policyDecision = normalizeRunCommandPolicyDecisionResult(
    evaluateRunCommandPolicyDecision(policySummary, commandSafetyOptions),
  )
  const phase2InstallRoutingActive = commandSafetyOptions.installSandboxEnabled === true
  const runInBackground = !!background
  const expectedPersistent = runInBackground && isLikelyLongRunningCommand(commandText)
  const runWithCandidateFn = typeof runWithCandidateImpl === 'function' ? runWithCandidateImpl : runWithCandidate
  let commandCwd = ''
  const resolveCommandCwd = () => {
    if (commandCwd) return commandCwd
    commandCwd = normalizeCommandCwd(projectRoot, requestedCwd, {
      allowOutsideProjectRoot: hostInstallFallbackApproved || hostFullAccessApproved,
    })
    return commandCwd
  }
  const runHostCommand = async ({
    fallbackReason = '',
    fallbackBackend = '',
    fallbackBackendReason = '',
  } = {}) => {
    const candidates = buildShellCandidates(shellPreference, { commandText, background: runInBackground })
    if (!runInBackground && isLikelyLongRunningCommand(commandText)) {
      throw new Error('Command appears to be long-running (server/watch). Re-run with background=true so ADDOM can continue to the next step.')
    }
    let missingShellCount = 0
    let lastError = null
    for (const candidate of candidates) {
      try {
        const output = await runWithCandidateFn(candidate, {
          command: commandText,
          cwd: resolveCommandCwd(),
          timeoutMs,
          signal,
          projectRoot,
          shellPreference,
          background: runInBackground,
          expectedPersistent,
          onOutputChunk,
        })
        const normalizedOutput = appendBrowserLaunchAdvisory(commandText, output)
        if (!fallbackReason) return normalizedOutput
        const fallbackHeader = [
          'Execution target: host (sandbox fallback)',
          `sandbox_fallback_reason: ${fallbackReason}`,
          fallbackBackend ? `sandbox_backend: ${fallbackBackend}` : '',
          fallbackBackendReason ? `sandbox_backend_reason: ${fallbackBackendReason}` : '',
          '',
        ].filter(Boolean).join('\n')
        return `${fallbackHeader}${normalizedOutput ? `\n${normalizedOutput}` : ''}`.trim()
      } catch (err) {
        lastError = err
        const shellHints = buildShellDialectHints(commandText, {
          shell: candidate.label || shellPreference || policySummary?.shellPreference || 'auto',
          stderr: String(err?.message || ''),
        })
        let resolvedError = lastError
        if (shellHints.length > 0) {
          recordGlobalRunCommandShellDialectHints({
            command: commandText,
            shell: candidate.label || shellPreference || policySummary?.shellPreference || 'auto',
            stderr: String(err?.message || ''),
            hints: shellHints,
          })
          resolvedError = appendHintsToError(lastError, shellHints)
          lastError = resolvedError
        }
        if (resolvedError?.code === 'ENOENT' || /ENOENT/.test(String(resolvedError?.message || ''))) {
          missingShellCount += 1
          continue
        }
        if (shouldTryNextShellCandidate({ shellPreference, runInBackground, commandText, err: resolvedError })) continue
        throw resolvedError
      }
    }
    if (missingShellCount === candidates.length && candidates.length > 0) {
      const tried = candidates.map((candidate) => candidate.label).join(', ')
      throw new Error(`No usable shell found for "${shellPreference}". Tried: ${tried}`)
    }
    if (lastError) throw lastError
    throw new Error(`Unable to execute command with shell preference "${shellPreference}".`)
  }

  if (hostInstallFallbackApproved && policySummary?.install?.isInstallLike) {
    logRunCommandPolicyTelemetry('user_escalated_to_host', {
      commandClass: policySummary.commandClass,
      installEcosystem: policySummary?.install?.ecosystem || '',
      executionTarget: 'host',
      reason: 'approval_host_install_fallback',
    })
  }
  if (hostFullAccessApproved && !hostInstallFallbackApproved) {
    logRunCommandPolicyTelemetry('user_elevated_to_host_full_access', {
      commandClass: policySummary.commandClass,
      executionTarget: 'host',
      reason: 'approval_host_full_access',
      networkIntent: String(policySummary?.networkIntent || ''),
      pathScope: String(policySummary?.pathScope || ''),
    })
  }
  if (policyDecision.decision === 'deny') {
    logRunCommandPolicyTelemetry('host_policy_blocked', {
      commandClass: policySummary.commandClass,
      decision: policyDecision.decision,
      reasons: Array.isArray(policyDecision.reasons) ? policyDecision.reasons : [],
    })
    const hints = Array.isArray(policyDecision.hints) ? policyDecision.hints : []
    throw appendHintsToError(new Error('Command blocked by command safety policy.'), hints)
  }
  if (policyDecision.decision === 'require_elevation' && !hostFullAccessApproved) {
    logRunCommandPolicyTelemetry('host_policy_elevation_required', {
      commandClass: policySummary.commandClass,
      decision: policyDecision.decision,
      reasons: Array.isArray(policyDecision.reasons) ? policyDecision.reasons : [],
      networkIntent: String(policySummary?.networkIntent || ''),
      pathScope: String(policySummary?.pathScope || ''),
    })
    const hints = [
      'This command exceeds workspace_safe policy and requires an explicit one-shot host_full_access approval.',
      ...(Array.isArray(policyDecision.hints) ? policyDecision.hints : []),
    ]
    throw appendHintsToError(new Error('Command requires explicit host_full_access approval before execution.'), hints)
  }
  if (phase2InstallRoutingActive && policyDecision.decision === 'route_to_sandbox') {
    logRunCommandPolicyTelemetry('routed_to_sandbox', {
      commandClass: policySummary.commandClass,
      installEcosystem: policySummary?.install?.ecosystem || '',
      executionTarget: policyDecision.executionTarget,
      preferredBackend: commandSafetyOptions.preferredBackend,
    })
    try {
      return await runCommandInInstallSandbox(projectRoot, {
        command,
        timeout_ms,
        shell,
        cwd,
        background,
      }, {
        signal,
        commandSafety: commandSafetyOptions,
        policySummary,
        policyDecision,
        installSandboxAdapter,
        wslCompatibilityApproved,
      })
    } catch (err) {
      if (err?.code === 'INSTALL_SANDBOX_UNAVAILABLE') {
        logRunCommandPolicyTelemetry('sandbox_backend_unavailable', {
          commandClass: policySummary.commandClass,
          installEcosystem: policySummary?.install?.ecosystem || '',
          backend: String(err?.backend || err?.sandboxDiagnostics?.backendStatus?.backend || 'none'),
          reason: String(err?.backendReason || err?.sandboxDiagnostics?.backendStatus?.reason || ''),
        })
        if (hostFullAccessApproved) {
          const fallbackBackend = String(err?.backend || err?.sandboxDiagnostics?.backendStatus?.backend || 'none')
          const fallbackBackendReason = String(err?.backendReason || err?.sandboxDiagnostics?.backendStatus?.reason || '')
          logRunCommandPolicyTelemetry('sandbox_auto_fallback_to_host', {
            commandClass: policySummary.commandClass,
            installEcosystem: policySummary?.install?.ecosystem || '',
            executionTarget: 'host',
            reason: hostInstallFallbackApproved ? 'approval_host_install_fallback' : 'host_full_access_auto',
            backend: fallbackBackend,
            backendReason: fallbackBackendReason,
          })
          return await runHostCommand({
            fallbackReason: 'sandbox_backend_unavailable',
            fallbackBackend,
            fallbackBackendReason,
          })
        }
      } else if (
        err?.code === 'INSTALL_SANDBOX_NETWORK_BLOCKED'
        || err?.code === 'INSTALL_SANDBOX_PATH_BLOCKED'
        || err?.code === 'INSTALL_SANDBOX_STRICT_EGRESS_UNAVAILABLE'
        || err?.code === 'INSTALL_SANDBOX_WSL_APPROVAL_REQUIRED'
      ) {
        logRunCommandPolicyTelemetry('sandbox_policy_blocked_host', {
          commandClass: policySummary.commandClass,
          installEcosystem: policySummary?.install?.ecosystem || '',
          blockedHosts: Array.isArray(err?.sandboxDiagnostics?.blockedHosts) ? err.sandboxDiagnostics.blockedHosts : [],
          blockedPathRefs: Array.isArray(err?.sandboxDiagnostics?.blockedPathRefs)
            ? err.sandboxDiagnostics.blockedPathRefs
            : [],
          code: String(err?.code || ''),
          strictEgressRequested: err?.sandboxDiagnostics?.strictEgressRequested === true,
          wslCompatibilityApproved,
        })
      }
      const hints = [
        ...(Array.isArray(policyDecision.hints) ? policyDecision.hints : []),
        ...(Array.isArray(policySummary?.hints) ? policySummary.hints : []),
      ]
      throw appendHintsToError(err, hints)
    }
  }
  return await runHostCommand()
}
