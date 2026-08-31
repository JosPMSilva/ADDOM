import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { resolveAvailableTerminalShells } from './terminal-session-shell.mjs'

const requireForRuntime = createRequire(import.meta.url)

const SUPPORTED_PLATFORMS = new Set(['win32', 'darwin', 'linux'])
const DISABLE_ENV_NAME = 'ADDOM_DISABLE_TERMINAL_SESSIONS'
const ROLLOUT_ENV_NAME = 'ADDOM_TERMINAL_SESSIONS_ROLLOUT'
const DEFAULT_ROLLOUT_POLICY = 'windows_only'
const SUPPORTED_ROLLOUT_POLICIES = new Set(['off', 'windows_only', 'all'])
const DEFAULT_TIMEOUT_MS = 5_000
const MARKER_PREFIX = 'ADDOM_TERMINAL_PTY_OK_'

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function normalizeTimeoutMs(value, fallback = DEFAULT_TIMEOUT_MS) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return Math.max(1_000, Math.round(numeric))
}

function createRuntimeState(status, reason, extras = {}) {
  return {
    status,
    reason: asTrimmedString(reason) || 'unknown',
    ...extras,
  }
}

function resolveProbeCwd(cwd = '') {
  const requested = asTrimmedString(cwd)
  if (requested && fs.existsSync(requested)) return requested
  const homeDir = asTrimmedString(os.homedir())
  if (homeDir && fs.existsSync(homeDir)) return homeDir
  return process.cwd()
}

function normalizeRolloutPolicy(value, fallback = DEFAULT_ROLLOUT_POLICY) {
  const normalizedFallback = SUPPORTED_ROLLOUT_POLICIES.has(String(fallback || '').trim().toLowerCase())
    ? String(fallback || '').trim().toLowerCase()
    : DEFAULT_ROLLOUT_POLICY
  const normalized = String(value || '').trim().toLowerCase()
  return SUPPORTED_ROLLOUT_POLICIES.has(normalized) ? normalized : normalizedFallback
}

function resolveRolloutAllowedPlatforms(policy = DEFAULT_ROLLOUT_POLICY) {
  if (policy === 'all') return ['win32', 'darwin', 'linux']
  if (policy === 'windows_only') return ['win32']
  return []
}

function resolveTerminalSessionRollout({
  env = process.env,
  platform = process.platform,
} = {}) {
  const policy = normalizeRolloutPolicy(env?.[ROLLOUT_ENV_NAME], DEFAULT_ROLLOUT_POLICY)
  const allowedPlatforms = resolveRolloutAllowedPlatforms(policy)
  const platformEnabled = allowedPlatforms.includes(platform)
  return {
    policy,
    controlledBy: ROLLOUT_ENV_NAME,
    allowedPlatforms,
    platformEnabled,
    status: policy === 'off'
      ? 'disabled'
      : (platformEnabled ? 'enabled' : 'gated'),
  }
}

function resolveProbeCommand({ platform = process.platform, env = process.env, marker = '' } = {}) {
  if (platform === 'win32') {
    return {
      shell: asTrimmedString(env?.ComSpec) || 'cmd.exe',
      args: ['/d', '/c', `echo ${marker}`],
      shellKind: 'cmd',
    }
  }

  const shell = asTrimmedString(env?.SHELL) || '/bin/bash'
  return {
    shell,
    args: ['-lc', `printf '%s\\n' '${marker}'`],
    shellKind: path.basename(shell) || 'shell',
  }
}

function resolveNodePtyArtifactChecks(moduleRoot = '', { platform = process.platform, arch = process.arch } = {}) {
  const prebuildRoot = path.join(moduleRoot, 'prebuilds', `${platform}-${arch}`)
  const buildReleaseRoot = path.join(moduleRoot, 'build', 'Release')

  if (platform === 'win32') {
    return [
      {
        id: 'pty_node',
        candidates: [
          path.join(buildReleaseRoot, 'pty.node'),
          path.join(prebuildRoot, 'pty.node'),
        ],
      },
      {
        id: 'conpty_node',
        candidates: [
          path.join(buildReleaseRoot, 'conpty.node'),
          path.join(prebuildRoot, 'conpty.node'),
        ],
      },
      {
        id: 'conpty_dll',
        candidates: [
          path.join(buildReleaseRoot, 'conpty', 'conpty.dll'),
          path.join(prebuildRoot, 'conpty', 'conpty.dll'),
        ],
      },
      {
        id: 'open_console',
        candidates: [
          path.join(buildReleaseRoot, 'conpty', 'OpenConsole.exe'),
          path.join(prebuildRoot, 'conpty', 'OpenConsole.exe'),
        ],
      },
    ]
  }

  if (platform === 'darwin') {
    return [{
      id: 'pty_node',
      candidates: [
        path.join(buildReleaseRoot, 'pty.node'),
        path.join(prebuildRoot, 'pty.node'),
      ],
    }]
  }

  return [{
    id: 'pty_node',
    candidates: [path.join(buildReleaseRoot, 'pty.node')],
  }]
}

function collectNodePtyArtifacts(moduleRoot = '', options = {}) {
  return resolveNodePtyArtifactChecks(moduleRoot, options).map(({ id, candidates }) => {
    const existingPath = candidates.find((candidate) => fs.existsSync(candidate)) || ''
    return {
      id,
      present: Boolean(existingPath),
      path: existingPath,
      candidates,
    }
  })
}

function defaultLoadNodePty({ requireImpl = requireForRuntime, platform = process.platform, arch = process.arch } = {}) {
  const packageJsonPath = requireImpl.resolve('node-pty/package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const moduleRoot = path.dirname(packageJsonPath)
  const nodePty = requireImpl('node-pty')
  return {
    nodePty,
    moduleRoot,
    packageVersion: asTrimmedString(packageJson?.version),
    artifacts: collectNodePtyArtifacts(moduleRoot, { platform, arch }),
  }
}

function createProbeError(code, message) {
  const error = new Error(asTrimmedString(message) || code)
  error.code = code
  return error
}

function attachTerminalDataListener(terminal, handler) {
  if (typeof terminal?.onData === 'function') {
    const disposable = terminal.onData(handler)
    return () => {
      disposable?.dispose?.()
    }
  }
  terminal?.on?.('data', handler)
  return () => {
    terminal?.removeListener?.('data', handler)
  }
}

function attachTerminalExitListener(terminal, handler) {
  if (typeof terminal?.onExit === 'function') {
    const disposable = terminal.onExit(handler)
    return () => {
      disposable?.dispose?.()
    }
  }
  const legacyHandler = (exitCode, signal) => handler({ exitCode, signal })
  terminal?.on?.('exit', legacyHandler)
  return () => {
    terminal?.removeListener?.('exit', legacyHandler)
  }
}

function attachTerminalErrorListener(terminal, handler) {
  terminal?.on?.('error', handler)
  return () => {
    terminal?.removeListener?.('error', handler)
  }
}

function disposeTerminalProcess(terminal, signal = '') {
  try {
    if (signal) terminal?.kill?.(signal)
    else terminal?.kill?.()
  } catch {
    // Best-effort probe cleanup.
  }
  for (const socket of [
    terminal?._socket,
    terminal?._agent?._inSocket,
    terminal?._agent?._outSocket,
  ]) {
    try { socket?.destroy?.() } catch { /* best-effort socket cleanup */ }
    try { socket?.unref?.() } catch { /* best-effort socket cleanup */ }
  }
  try { terminal?._agent?._conoutSocketWorker?.dispose?.() } catch { /* best-effort ConPTY cleanup */ }
  try { terminal?._agent?._conoutSocketWorker?._worker?.terminate?.() } catch { /* best-effort ConPTY cleanup */ }
}

export async function runNodePtyHealthCheck(
  nodePty,
  {
    platform = process.platform,
    env = process.env,
    cwd = process.cwd(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    marker = `${MARKER_PREFIX}${Date.now()}`,
  } = {},
) {
  if (!nodePty || typeof nodePty.spawn !== 'function') {
    throw createProbeError('node_pty_spawn_unavailable', 'node-pty did not expose a spawn function.')
  }

  const effectiveTimeoutMs = normalizeTimeoutMs(timeoutMs)
  const command = resolveProbeCommand({ platform, env, marker })
  const probeCwd = resolveProbeCwd(cwd)
  const startedAt = Date.now()

  return await new Promise((resolve, reject) => {
    let settled = false
    let settleTimer = null
    let output = ''
    let exitCode = null
    let exitSignal = null
    let terminal = null
    const cleanupFns = []

    const finalize = (callback) => {
      if (settled) return
      settled = true
      if (settleTimer) clearTimeout(settleTimer)
      for (const cleanup of cleanupFns.splice(0)) {
        try { cleanup() } catch { /* best-effort listener cleanup */ }
      }
      callback()
    }

    const scheduleSuccess = () => {
      if (settled) return
      if (!output.includes(marker)) return
      if (settleTimer) return
      settleTimer = setTimeout(() => {
        disposeTerminalProcess(terminal)
        finalize(() => resolve({
          ok: true,
          shell: command.shell,
          shellKind: command.shellKind,
          cwd: probeCwd,
          marker,
          output,
          exitCode,
          exitSignal,
          durationMs: Date.now() - startedAt,
        }))
      }, 150)
    }

    const timeoutHandle = setTimeout(() => {
      disposeTerminalProcess(terminal)
      finalize(() => reject(createProbeError(
        'terminal_probe_timeout',
        `Timed out waiting for node-pty probe output after ${effectiveTimeoutMs}ms.`,
      )))
    }, effectiveTimeoutMs)
    cleanupFns.push(() => clearTimeout(timeoutHandle))

    try {
      terminal = nodePty.spawn(command.shell, command.args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: probeCwd,
        env: { ...env },
        ...(platform === 'win32' ? { useConpty: true, useConptyDll: true } : {}),
      })
    } catch (error) {
      clearTimeout(timeoutHandle)
      reject(error)
      return
    }

    cleanupFns.push(attachTerminalDataListener(terminal, (chunk) => {
      output += String(chunk || '')
      scheduleSuccess()
    }))
    cleanupFns.push(attachTerminalExitListener(terminal, ({ exitCode: code, signal } = {}) => {
      exitCode = Number.isFinite(Number(code)) ? Number(code) : code ?? null
      exitSignal = signal ?? null
      if (!output.includes(marker)) {
        finalize(() => reject(createProbeError(
          'terminal_probe_marker_missing',
          'node-pty exited before the probe marker was observed.',
        )))
        return
      }
      scheduleSuccess()
    }))
    cleanupFns.push(attachTerminalErrorListener(terminal, (error) => {
      finalize(() => reject(error))
    }))
  })
}

function normalizeFailureReason(error) {
  const code = asTrimmedString(error?.code).toLowerCase()
  if (code === 'module_not_found' || code === 'err_module_not_found') return 'node_pty_not_installed'
  if (code === 'err_dlopen_failed') return 'node_pty_native_load_failed'
  if (code === 'terminal_probe_timeout') return 'pty_probe_timeout'
  if (code === 'terminal_probe_marker_missing') return 'pty_probe_marker_missing'
  if (code === 'node_pty_spawn_unavailable') return 'node_pty_spawn_unavailable'
  return 'pty_probe_failed'
}

export async function probeTerminalSessionRuntimeHealth({
  env = process.env,
  platform = process.platform,
  arch = process.arch,
  cwd = process.cwd(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  loadNodePty = defaultLoadNodePty,
  runHealthCheck = runNodePtyHealthCheck,
} = {}) {
  const rollout = resolveTerminalSessionRollout({ env, platform })
  const availableShells = resolveAvailableTerminalShells({ env, platform })

  if (String(env?.[DISABLE_ENV_NAME] || '').trim() === '1') {
    return createRuntimeState('disabled', 'disabled_by_env', {
      platform,
      arch,
      disabledBy: DISABLE_ENV_NAME,
      rollout,
      availableShells,
    })
  }

  if (!SUPPORTED_PLATFORMS.has(platform)) {
    return createRuntimeState('disabled', 'platform_not_supported', {
      platform,
      arch,
      rollout,
      availableShells,
    })
  }

  if (rollout.policy === 'off') {
    return createRuntimeState('disabled', 'disabled_by_rollout_policy', {
      platform,
      arch,
      rollout,
      availableShells,
    })
  }

  if (rollout.platformEnabled !== true) {
    return createRuntimeState('disabled', 'rollout_platform_not_enabled', {
      platform,
      arch,
      rollout,
      availableShells,
    })
  }

  let dependency = {
    name: 'node-pty',
    version: '',
    artifacts: [],
  }

  try {
    const loaded = loadNodePty({ platform, arch })
    dependency = {
      name: 'node-pty',
      version: asTrimmedString(loaded?.packageVersion),
      artifacts: Array.isArray(loaded?.artifacts) ? loaded.artifacts : [],
    }
    const probe = await runHealthCheck(loaded?.nodePty, {
      platform,
      env,
      cwd,
      timeoutMs,
    })
    return createRuntimeState('supported', 'pty_spawn_ok', {
      platform,
      arch,
      rollout,
      dependency,
      probe,
      availableShells,
    })
  } catch (error) {
    return createRuntimeState('failed', normalizeFailureReason(error), {
      platform,
      arch,
      rollout,
      dependency,
      availableShells,
      error: asTrimmedString(error?.message || error || 'terminal_runtime_probe_failed'),
    })
  }
}

export {
  DEFAULT_ROLLOUT_POLICY as TERMINAL_SESSION_DEFAULT_ROLLOUT_POLICY,
  DEFAULT_TIMEOUT_MS as TERMINAL_RUNTIME_HEALTH_TIMEOUT_MS,
  DISABLE_ENV_NAME as TERMINAL_SESSION_DISABLE_ENV_NAME,
  ROLLOUT_ENV_NAME as TERMINAL_SESSION_ROLLOUT_ENV_NAME,
}
