import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawn } from 'child_process'
import {
  defaultStrictEgressImplementationMode,
  detectInstallSandboxBackend,
  normalizeBackendName,
} from './command-tools-sandbox-backend-detect.mjs'
import {
  appendOutput,
  createAbortError,
  createCommandEnv,
  extractCommandPathRefs,
  formatFailureOutput,
  formatSuccessOutput,
  normalizeTimeoutMs,
} from './command-tools-core.mjs'
import {
  classifyWslStatusProbeOutput,
  defaultDockerImageForEcosystem,
  shellForBackend,
} from './command-tools-sandbox-utils.mjs'

export { classifyWslStatusProbeOutput, detectInstallSandboxBackend }

function normalizeSandboxNetworkEnforcementMode(value) {
  const v = String(value || '').trim().toLowerCase()
  return v === 'strict' ? 'strict' : 'best_effort'
}

function defaultCacheMountsForEcosystem(ecosystem = '') {
  const home = os.homedir()
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
  const cargoHome = process.env.CARGO_HOME || path.join(home, '.cargo')
  const npmCache = process.env.npm_config_cache || path.join(localAppData, 'npm-cache')
  const pipCache = process.env.PIP_CACHE_DIR || path.join(localAppData, 'pip', 'Cache')
  const uvCache = process.env.UV_CACHE_DIR || path.join(localAppData, 'uv', 'cache')
  const pnpmStore = process.env.PNPM_HOME || path.join(localAppData, 'pnpm')

  switch (String(ecosystem || '').trim().toLowerCase()) {
    case 'npm':
      return [
        npmCache,
        pnpmStore,
        path.join(localAppData, 'Yarn'),
        path.join(localAppData, 'bun'),
      ]
    case 'python':
      return [pipCache, uvCache]
    case 'cargo':
      return [path.join(cargoHome, 'registry'), path.join(cargoHome, 'git')]
    case 'go':
      return [
        process.env.GOMODCACHE || path.join(home, 'go', 'pkg', 'mod'),
        process.env.GOCACHE || path.join(localAppData, 'go-build'),
      ]
    case 'ruby':
      return [path.join(home, '.bundle'), path.join(home, '.gem')]
    case 'dotnet':
      return [path.join(home, '.nuget', 'packages')]
    default:
      return []
  }
}

function defaultRegistryAllowlistForEcosystem(ecosystem = '') {
  switch (String(ecosystem || '').trim().toLowerCase()) {
    case 'npm':
      return ['registry.npmjs.org']
    case 'python':
      return ['pypi.org', 'files.pythonhosted.org']
    case 'cargo':
      return ['crates.io', 'index.crates.io', 'static.crates.io', 'github.com']
    case 'go':
      return ['proxy.golang.org', 'sum.golang.org', 'github.com']
    case 'ruby':
      return ['rubygems.org']
    case 'dotnet':
      return ['api.nuget.org', 'globalcdn.nuget.org']
    default:
      return []
  }
}

export function buildRegistryPreferenceEnvOverrides(policySummary = {}, networkPolicy = {}) {
  const install = policySummary?.install && typeof policySummary.install === 'object' ? policySummary.install : {}
  const ecosystem = String(install.ecosystem || '').trim().toLowerCase()
  const mode = String(networkPolicy?.mode || '').trim().toLowerCase()
  const allowHosts = Array.isArray(networkPolicy?.allowHosts)
    ? networkPolicy.allowHosts.map((h) => String(h || '').trim()).filter(Boolean)
    : []
  const primaryHost = allowHosts[0] || ''
  if (mode !== 'registry_allowlist' || !primaryHost) {
    return { env: {}, applied: false, note: '' }
  }

  if (ecosystem === 'npm') {
    const registryUrl = `https://${primaryHost}/`
    return {
      applied: true,
      note: `Pinned npm-family registry settings to ${primaryHost} (best-effort, not strict egress firewall).`,
      env: {
        npm_config_registry: registryUrl,
        NPM_CONFIG_REGISTRY: registryUrl,
        pnpm_config_registry: registryUrl,
        YARN_NPM_REGISTRY_SERVER: registryUrl,
      },
    }
  }

  if (ecosystem === 'python') {
    const simpleIndex = `https://${primaryHost}/simple`
    return {
      applied: true,
      note: `Pinned Python package index settings to ${primaryHost} (best-effort, not strict egress firewall).`,
      env: {
        PIP_INDEX_URL: simpleIndex,
        UV_INDEX_URL: simpleIndex,
        PIP_EXTRA_INDEX_URL: '',
      },
    }
  }

  return { env: {}, applied: false, note: '' }
}

function sanitizeMountList(paths = []) {
  const seen = new Set()
  const mounts = []
  for (const raw of paths) {
    const p = String(raw || '').trim()
    if (!p) continue
    const norm = path.normalize(p)
    const key = process.platform === 'win32' ? norm.toLowerCase() : norm
    if (seen.has(key)) continue
    seen.add(key)
    mounts.push(norm)
  }
  return mounts
}

function normalizeHostPathKey(value) {
  const resolved = path.resolve(String(value || '.'))
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function uniqueHostPaths(paths = []) {
  const seen = new Set()
  const out = []
  for (const raw of paths) {
    const p = String(raw || '').trim()
    if (!p) continue
    const key = normalizeHostPathKey(p)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(path.resolve(p))
  }
  return out
}

function isPathWithinRoot(targetPath, rootPath) {
  try {
    const target = path.resolve(String(targetPath || '.'))
    const root = path.resolve(String(rootPath || '.'))
    const rel = path.relative(root, target)
    if (rel === '') return true
    return !rel.startsWith('..') && !path.isAbsolute(rel)
  } catch {
    return false
  }
}

function isPathWithinAllowedRoots(targetPath, allowedRoots = []) {
  return allowedRoots.some((root) => isPathWithinRoot(targetPath, root))
}

function shouldResolvePathRefToken(token) {
  const t = String(token || '').trim()
  if (!t) return false
  if (/^[A-Za-z]:[\\/]/.test(t)) return true
  if (/^\\\\[^\\]/.test(t)) return true
  if (/^[.]{1,2}([\\/]|$)/.test(t)) return true
  if (/[\\/]/.test(t)) return true
  return false
}

function resolveCommandPathToken(token, cwdAbs) {
  const t = String(token || '').trim()
  if (!t) return ''
  if (/^[A-Za-z]:[\\/]/.test(t) || /^\\\\[^\\]/.test(t)) return path.resolve(t)
  if (/^\//.test(t) && process.platform !== 'win32') return path.resolve(t)
  if (!shouldResolvePathRefToken(t)) return ''
  return path.resolve(String(cwdAbs || '.'), t)
}

export function mapHostPathToSandboxPath(hostPath, { backend = 'docker' } = {}) {
  const normalized = path.resolve(String(hostPath || '.'))
  if (backend === 'docker') {
    if (process.platform === 'win32') {
      const m = normalized.match(/^([A-Za-z]):[\\/](.*)$/)
      if (m) {
        const drive = m[1].toLowerCase()
        const rest = String(m[2] || '').replace(/\\/g, '/')
        return `/mnt/${drive}/${rest}`
      }
    }
    return normalized.replace(/\\/g, '/')
  }
  if (backend === 'wsl') {
    if (process.platform === 'win32') {
      const m = normalized.match(/^([A-Za-z]):[\\/](.*)$/)
      if (m) {
        const drive = m[1].toLowerCase()
        const rest = String(m[2] || '').replace(/\\/g, '/')
        return `/mnt/${drive}/${rest}`
      }
    }
    return normalized.replace(/\\/g, '/')
  }
  return normalized
}

function toSandboxMountTarget(hostPath, options = {}) {
  return mapHostPathToSandboxPath(hostPath, options)
}

export function isHostAllowedByRegistryPolicy(host, networkPolicy = {}) {
  const h = String(host || '').trim().toLowerCase()
  if (!h) return false
  const mode = String(networkPolicy?.mode || '').trim().toLowerCase()
  const allowHosts = Array.isArray(networkPolicy?.allowHosts)
    ? networkPolicy.allowHosts.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean)
    : []
  if (mode !== 'registry_allowlist') return true
  return allowHosts.includes(h)
}

export function rewriteInstallCommandForSandbox(commandText, policySummary = {}, commandSafety = {}) {
  const raw = String(commandText || '')
  const trimmed = raw.trim()
  const enabled = commandSafety?.installSandboxIgnoreScriptsFirstPass === true
    || commandSafety?.ignoreScriptsFirstPass === true
  if (!enabled || !trimmed) {
    return { command: raw, applied: false, reason: '' }
  }
  const install = policySummary?.install && typeof policySummary.install === 'object' ? policySummary.install : {}
  if (!install.isInstallLike || install.isGlobalOrSystemInstall) {
    return { command: raw, applied: false, reason: '' }
  }
  const ecosystem = String(install.ecosystem || '').trim().toLowerCase()
  if (ecosystem !== 'npm') {
    return { command: raw, applied: false, reason: '' }
  }
  if (/\s--ignore-scripts\b/i.test(trimmed) || /\s--ignoreScripts\b/i.test(trimmed)) {
    return { command: raw, applied: false, reason: '' }
  }
  if (!/^(npm|pnpm|yarn|bun)\s+(install|i|add|ci)\b/i.test(trimmed)) {
    return { command: raw, applied: false, reason: '' }
  }
  if (/[;&|]/.test(trimmed)) {
    return { command: raw, applied: false, reason: '' }
  }
  return {
    command: `${raw}${/\s$/.test(raw) ? '' : ' '}--ignore-scripts`,
    applied: true,
    reason: 'ignore_scripts_first_pass',
  }
}

export function evaluateInstallSandboxPreflight(projectRoot, options = {}, execOptions = {}) {
  const opts = options && typeof options === 'object' ? options : {}
  const ex = execOptions && typeof execOptions === 'object' ? execOptions : {}
  const policySummary = ex.policySummary && typeof ex.policySummary === 'object' ? ex.policySummary : {}
  const sandboxSpec = ex.sandboxSpec && typeof ex.sandboxSpec === 'object' ? ex.sandboxSpec : {}
  const commandSafety = ex.commandSafety && typeof ex.commandSafety === 'object' ? ex.commandSafety : {}
  const rootAbs = path.resolve(String(projectRoot || '.'))
  const cwdAbs = path.resolve(rootAbs, String(opts.cwd || '.'))
  const commandRewrite = rewriteInstallCommandForSandbox(opts.command, policySummary, commandSafety)
  const effectiveCommand = String(commandRewrite.command || opts.command || '')
  const pathRefs = extractCommandPathRefs(effectiveCommand, { shell: opts.shell || 'auto' })

  const allowedRoots = uniqueHostPaths([
    rootAbs,
    ...(Array.isArray(sandboxSpec.mounts) ? sandboxSpec.mounts.map((m) => m?.hostPath) : []),
  ])
  const blockedPathRefs = []

  for (const token of Array.isArray(pathRefs.rawRefs) ? pathRefs.rawRefs : []) {
    if (!shouldResolvePathRefToken(token)) continue
    const resolvedPath = resolveCommandPathToken(token, cwdAbs)
    if (!resolvedPath) continue
    if (!isPathWithinAllowedRoots(resolvedPath, allowedRoots)) {
      blockedPathRefs.push({
        ref: String(token),
        resolvedPath,
        reason: 'outside_allowed_mounts',
      })
    }
  }
  for (const hint of Array.isArray(pathRefs.externalPathHints) ? pathRefs.externalPathHints : []) {
    const raw = String(hint || '').trim()
    if (!raw) continue
    const resolvedPath = resolveCommandPathToken(raw, cwdAbs)
    if (resolvedPath && isPathWithinAllowedRoots(resolvedPath, allowedRoots)) continue
    blockedPathRefs.push({
      ref: raw,
      ...(resolvedPath ? { resolvedPath } : {}),
      reason: 'external_path_hint',
    })
  }

  const blockedHosts = []
  const explicitHosts = Array.isArray(policySummary.networkHosts)
    ? policySummary.networkHosts.map((h) => String(h || '').trim()).filter(Boolean)
    : []
  const networkPolicy = sandboxSpec.networkPolicy && typeof sandboxSpec.networkPolicy === 'object'
    ? sandboxSpec.networkPolicy
    : {}
  if (String(networkPolicy.mode || '').trim().toLowerCase() === 'registry_allowlist') {
    for (const host of explicitHosts) {
      if (!isHostAllowedByRegistryPolicy(host, networkPolicy)) blockedHosts.push(host)
    }
  }

  const warnings = []
  if (commandRewrite.applied) {
    warnings.push('Install command rewritten with --ignore-scripts for a safer first pass.')
  }

  return {
    command: effectiveCommand,
    rewrite: commandRewrite,
    blockedHosts: Array.from(new Set(blockedHosts)),
    blockedPathRefs,
    warnings,
    allowedRoots,
  }
}

export function buildDockerRunArgs({ command, sandboxSpec, backendStatus, projectRoot, cwd, policySummary, commandSafety }) {
  const spec = sandboxSpec || {}
  const backend = String(backendStatus?.backend || 'docker')
  const rootAbs = path.resolve(String(projectRoot || '.'))
  const resolvedCwdHost = path.resolve(rootAbs, String(cwd || '.'))
  const projectMount = (Array.isArray(spec.mounts) ? spec.mounts : []).find((m) => m.purpose === 'project_root')
  const workingDir = projectMount?.targetPath || mapHostPathToSandboxPath(rootAbs, { backend })
  const cwdTarget = mapHostPathToSandboxPath(resolvedCwdHost, { backend })
  const image = String(
    commandSafety?.images?.[String(policySummary?.install?.ecosystem || '').trim().toLowerCase()]
    || commandSafety?.image
    || defaultDockerImageForEcosystem(policySummary?.install?.ecosystem),
  )
  const shell = shellForBackend('docker')
  const registryEnvOverrides = buildRegistryPreferenceEnvOverrides(policySummary, spec.networkPolicy)
  const networkEnforcementMode = String(spec?.networkPolicy?.enforcementMode || 'strict').trim().toLowerCase()
  const networkMode = networkEnforcementMode === 'strict' ? 'none' : 'bridge'

  const args = ['run', '--rm', '--init', '--cap-drop=ALL', '--security-opt=no-new-privileges']
  for (const mount of Array.isArray(spec.mounts) ? spec.mounts : []) {
    if (!mount?.hostPath || !mount?.targetPath) continue
    const mode = mount.readOnly ? ':ro' : ''
    args.push('-v', `${mount.hostPath}:${mount.targetPath}${mode}`)
  }
  for (const [key, value] of Object.entries(spec.env && typeof spec.env === 'object' ? spec.env : {})) {
    args.push('-e', `${key}=${String(value ?? '')}`)
  }
  for (const [key, value] of Object.entries(registryEnvOverrides.env || {})) {
    args.push('-e', `${key}=${String(value ?? '')}`)
  }
  args.push('-w', cwdTarget || workingDir)
  args.push('--network', networkMode)
  args.push(image)
  args.push(shell.bin, ...shell.args(String(command || '')))
  return {
    bin: 'docker',
    args,
    diagnostics: {
      image,
      cwdTarget,
      workingDir,
      networkMode,
      registryEnvOverrideApplied: !!registryEnvOverrides.applied,
      ...(registryEnvOverrides.note ? { registryEnvOverrideNote: registryEnvOverrides.note } : {}),
    },
  }
}

function buildWslRunArgs({ command, projectRoot, cwd }) {
  const rootAbs = path.resolve(String(projectRoot || '.'))
  const resolvedCwdHost = path.resolve(rootAbs, String(cwd || '.'))
  const cwdTarget = mapHostPathToSandboxPath(resolvedCwdHost, { backend: 'wsl' })
  return {
    bin: 'wsl.exe',
    args: ['bash', '-lc', `cd '${String(cwdTarget).replace(/'/g, `'\\''`)}' && ${String(command || '')}`],
    diagnostics: { cwdTarget },
  }
}

export function buildInstallSandboxWarnings({
  backend = '',
  sandboxSpec = null,
  backendStatus = null,
  sandboxPreflight = null,
  invocationDiagnostics = null,
} = {}) {
  const warnings = []
  const backendName = String(backend || '').trim().toLowerCase()
  if (backendName === 'wsl') {
    warnings.push('WSL is a compatibility runner, not a security sandbox. Commands still have host filesystem access via /mnt and should be treated like host execution.')
  }
  if (sandboxSpec?.networkPolicy?.mode === 'registry_allowlist') {
    const enforcementMode = String(sandboxSpec?.networkPolicy?.enforcementMode || 'best_effort')
    const strictMode = String(backendStatus?.capabilities?.strictEgressImplementationMode || 'none')
    if (enforcementMode === 'strict') {
      warnings.push(`Strict egress mode was requested, but the default sandbox adapter does not implement strict runtime allowlist enforcement yet (backend mode: ${strictMode}).`)
    } else {
      warnings.push('Registry allowlist enforcement is partial in the default sandbox adapter (explicit URL hosts are preflight-checked; full egress allowlisting is not yet implemented).')
    }
  }
  if (sandboxPreflight?.rewrite?.applied) {
    warnings.push('Safety preflight applied --ignore-scripts first-pass for this install command.')
  }
  if (invocationDiagnostics?.registryEnvOverrideApplied && invocationDiagnostics?.registryEnvOverrideNote) {
    warnings.push(String(invocationDiagnostics.registryEnvOverrideNote))
  }
  return warnings
}

async function runSpawnedCommand({ bin, args, cwd, timeoutMs, signal, env }) {
  return await new Promise((resolve, reject) => {
    const stdoutState = { text: '', truncated: false }
    const stderrState = { text: '', truncated: false }
    let settled = false
    let timedOut = false
    let aborted = false
    let timer = null
    const child = spawn(bin, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    })
    const finish = (fn) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
      fn()
    }
    const onAbort = () => {
      aborted = true
      try { child.kill('SIGTERM') } catch { /* ignore kill errors */ }
      setTimeout(() => { try { child.kill('SIGKILL') } catch { /* ignore kill errors */ } }, 750)
    }
    if (signal?.aborted) {
      onAbort()
      return finish(() => reject(createAbortError('Install sandbox command cancelled.')))
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => {
      timedOut = true
      try { child.kill('SIGTERM') } catch { /* ignore kill errors */ }
      setTimeout(() => { try { child.kill('SIGKILL') } catch { /* ignore kill errors */ } }, 1000)
    }, timeoutMs)
    child.stdout?.on('data', (chunk) => appendOutput(stdoutState, chunk))
    child.stderr?.on('data', (chunk) => appendOutput(stderrState, chunk))
    child.on('error', (err) => finish(() => reject(err)))
    child.on('close', (code, signalName) => finish(() => {
      if (aborted) return reject(createAbortError('Install sandbox command cancelled.'))
      if (timedOut) return reject(new Error(`Install sandbox command timed out after ${timeoutMs} ms.\n\n${formatFailureOutput(stdoutState, stderrState)}`))
      if (code === 0) return resolve(formatSuccessOutput(stdoutState, stderrState))
      return reject(new Error(`Install sandbox command failed with exit code ${code}${signalName ? `, signal ${signalName}` : ''}.\n\n${formatFailureOutput(stdoutState, stderrState)}`))
    }))
  })
}

function buildDefaultInstallSandboxAdapter() {
  return {
    detectBackend: async ({ execOptions } = {}) => detectInstallSandboxBackend(execOptions?.commandSafety || {}),
    run: async ({ projectRoot, options, execOptions, backendStatus, sandboxSpec }) => {
      const backend = String(backendStatus?.backend || '')
      const timeoutMs = normalizeTimeoutMs(options?.timeout_ms)
      if (options?.background) {
        throw new Error('Install sandbox runner does not support background commands in Phase 2.')
      }
      let invocation
      if (backend === 'docker') {
        invocation = buildDockerRunArgs({
          command: options?.command,
          sandboxSpec,
          backendStatus,
          projectRoot,
          cwd: options?.cwd,
          policySummary: execOptions?.policySummary,
          commandSafety: execOptions?.commandSafety,
        })
      } else if (backend === 'wsl') {
        invocation = buildWslRunArgs({
          command: options?.command,
          projectRoot,
          cwd: options?.cwd,
        })
      } else {
        throw new Error(`Unsupported install sandbox backend: ${backend || 'none'}`)
      }
      const output = await runSpawnedCommand({
        bin: invocation.bin,
        args: invocation.args,
        cwd: projectRoot,
        timeoutMs,
        signal: execOptions?.signal,
        env: createCommandEnv(),
      })
      const warnings = buildInstallSandboxWarnings({
        backend,
        sandboxSpec,
        backendStatus,
        sandboxPreflight: execOptions?.sandboxPreflight,
        invocationDiagnostics: invocation?.diagnostics,
      })
      const prefix = [
        `Execution target: install_sandbox (${backend})`,
        ...(warnings.length > 0 ? ['', 'Sandbox notes:', ...warnings.map((w) => `- ${w}`), ''] : []),
      ].join('\n')
      return `${prefix}${output ? `\n${output}` : ''}`.trim()
    },
  }
}

export function buildInstallSandboxSpec(projectRoot, policySummary, config = {}) {
  const cfg = config && typeof config === 'object' ? config : {}
  const backend = normalizeBackendName(cfg.backend || cfg.preferredBackend || 'docker')
  const effectiveBackend = backend === 'auto' ? 'docker' : backend
  const rootAbs = path.resolve(String(projectRoot || '.'))
  const ecosystem = String(policySummary?.install?.ecosystem || '').trim()
  const cacheRoots = sanitizeMountList([
    ...(Array.isArray(cfg.cacheDirs) ? cfg.cacheDirs : []),
    ...defaultCacheMountsForEcosystem(ecosystem),
  ]).filter((p) => fs.existsSync(p))
  const tempDir = path.resolve(String(cfg.tempDir || os.tmpdir()))

  const mounts = [
    {
      type: 'bind',
      hostPath: rootAbs,
      targetPath: toSandboxMountTarget(rootAbs, { backend: effectiveBackend }),
      readOnly: false,
      purpose: 'project_root',
    },
    {
      type: 'bind',
      hostPath: tempDir,
      targetPath: toSandboxMountTarget(tempDir, { backend: effectiveBackend }),
      readOnly: false,
      purpose: 'temp',
    },
    ...cacheRoots.map((cachePath) => ({
      type: 'bind',
      hostPath: cachePath,
      targetPath: toSandboxMountTarget(cachePath, { backend: effectiveBackend }),
      readOnly: true,
      purpose: 'package_cache',
    })),
  ]

  const allowlist = Array.isArray(cfg.registryAllowlist) && cfg.registryAllowlist.length > 0
    ? cfg.registryAllowlist
    : defaultRegistryAllowlistForEcosystem(ecosystem)
  const enforcementMode = normalizeSandboxNetworkEnforcementMode(
    cfg.sandboxNetworkEnforcementMode ?? cfg.networkEnforcementMode ?? 'strict',
  )
  const networkPolicy = {
    mode: 'registry_allowlist',
    allowHosts: allowlist.map((h) => String(h || '').trim()).filter(Boolean),
    denyByDefault: true,
    enforcementMode,
  }

  return {
    mounts,
    env: {
      CI: '1',
      PIP_DISABLE_PIP_VERSION_CHECK: '1',
    },
    networkPolicy,
    backendArgs: [],
    diagnostics: {
      backend: effectiveBackend,
      ecosystem,
      cacheMountCount: mounts.filter((m) => m.purpose === 'package_cache').length,
      mountCount: mounts.length,
      networkEnforcementMode: enforcementMode,
    },
  }
}

function buildSandboxUnavailableErrorMessage(backendStatus, policySummary) {
  const reason = String(backendStatus?.reason || 'Install sandbox backend is unavailable.')
  const ecosystem = String(policySummary?.install?.ecosystem || '').trim()
  const installHint = ecosystem ? ` (${ecosystem})` : ''
  return [
    `Install sandbox unavailable for dependency install${installHint}.`,
    reason,
    'Safe default: command was not executed on the host shell.',
    'Configure a sandbox backend (Docker/WSL) or explicitly disable install sandbox / escalate host execution in a future policy-aware approval flow.',
  ].join(' ')
}

export async function runCommandInInstallSandbox(projectRoot, options = {}, execOptions = {}) {
  const opts = options && typeof options === 'object' ? options : {}
  const ex = execOptions && typeof execOptions === 'object' ? execOptions : {}
  const adapter = ex.installSandboxAdapter && typeof ex.installSandboxAdapter === 'object'
    ? ex.installSandboxAdapter
    : buildDefaultInstallSandboxAdapter()

  const backendStatus = typeof adapter.detectBackend === 'function'
    ? await adapter.detectBackend({ projectRoot, options: opts, execOptions: ex })
    : await detectInstallSandboxBackend(ex.commandSafety || {})

  if (!backendStatus?.available) {
    const err = new Error(buildSandboxUnavailableErrorMessage(backendStatus, ex.policySummary))
    err.code = 'INSTALL_SANDBOX_UNAVAILABLE'
    err.backend = String(backendStatus?.backend || 'none')
    err.backendReason = String(backendStatus?.reason || '')
    err.sandboxDiagnostics = {
      backendStatus,
      policySummary: ex.policySummary || null,
    }
    throw err
  }

  const sandboxSpec = buildInstallSandboxSpec(projectRoot, ex.policySummary || {}, {
    backend: backendStatus.backend,
    cacheDirs: ex.commandSafety?.cacheDirs,
    registryAllowlist: ex.commandSafety?.registryAllowlist,
    sandboxNetworkEnforcementMode: ex.commandSafety?.sandboxNetworkEnforcementMode,
  })
  if (String(backendStatus?.backend || '').trim().toLowerCase() === 'wsl' && ex.wslCompatibilityApproved !== true) {
    const err = new Error(
      'Explicit WSL compatibility approval is required because WSL is not a security sandbox and still has host filesystem reachability.',
    )
    err.code = 'INSTALL_SANDBOX_WSL_APPROVAL_REQUIRED'
    err.backend = 'wsl'
    err.sandboxDiagnostics = {
      backendStatus,
      policySummary: ex.policySummary || null,
      sandboxSpec,
      wslCompatibilityApproved: false,
    }
    throw err
  }
  const strictEgressRequested = normalizeSandboxNetworkEnforcementMode(ex.commandSafety?.sandboxNetworkEnforcementMode) === 'strict'
  const strictEgressSupported = backendStatus?.capabilities?.strictEgressEnforcement === true
  const strictEgressImplementationMode = String(
    backendStatus?.capabilities?.strictEgressImplementationMode
    || defaultStrictEgressImplementationMode({
      backend: backendStatus?.backend,
      available: backendStatus?.available === true,
      supportsStrict: strictEgressSupported,
    }),
  )
  if (strictEgressRequested && !strictEgressSupported) {
    const err = new Error(
      'Strict install-sandbox egress enforcement was requested, but the selected backend/adapter does not support strict runtime allowlist enforcement. Safe default: command was not executed.',
    )
    err.code = 'INSTALL_SANDBOX_STRICT_EGRESS_UNAVAILABLE'
    err.backend = String(backendStatus?.backend || 'none')
    err.sandboxDiagnostics = {
      backendStatus,
      policySummary: ex.policySummary || null,
      sandboxSpec,
      strictEgressRequested: true,
      strictEgressSupported: false,
      strictEgressImplementationMode,
    }
    throw err
  }
  const preflight = evaluateInstallSandboxPreflight(projectRoot, opts, {
    policySummary: ex.policySummary || {},
    sandboxSpec,
    commandSafety: ex.commandSafety || {},
  })

  if (Array.isArray(preflight.blockedPathRefs) && preflight.blockedPathRefs.length > 0) {
    const err = new Error(
      `Install sandbox blocked command path references outside allowed mounts: ${preflight.blockedPathRefs.map((p) => p.ref).join(', ')}`,
    )
    err.code = 'INSTALL_SANDBOX_PATH_BLOCKED'
    err.sandboxDiagnostics = {
      backendStatus,
      policySummary: ex.policySummary || null,
      sandboxSpec,
      blockedPathRefs: preflight.blockedPathRefs,
      allowedRoots: preflight.allowedRoots,
    }
    throw err
  }
  if (Array.isArray(preflight.blockedHosts) && preflight.blockedHosts.length > 0) {
    const err = new Error(
      `Install sandbox blocked explicit network host(s) outside registry allowlist: ${preflight.blockedHosts.join(', ')}`,
    )
    err.code = 'INSTALL_SANDBOX_NETWORK_BLOCKED'
    err.sandboxDiagnostics = {
      backendStatus,
      policySummary: ex.policySummary || null,
      sandboxSpec,
      blockedHosts: preflight.blockedHosts,
      registryAllowlist: Array.isArray(sandboxSpec?.networkPolicy?.allowHosts)
        ? sandboxSpec.networkPolicy.allowHosts
        : [],
    }
    throw err
  }

  const sandboxOptions = preflight.rewrite?.applied
    ? { ...opts, command: preflight.command }
    : opts
  const sandboxExecOptions = {
    ...ex,
    sandboxPreflight: preflight,
  }

  if (typeof adapter.run === 'function') {
    return adapter.run({
      projectRoot,
      options: sandboxOptions,
      execOptions: sandboxExecOptions,
      backendStatus,
      sandboxSpec,
    })
  }

  const err = new Error(
    `Install sandbox backend "${String(backendStatus.backend)}" detected, but runtime adapter execution is not implemented yet.`,
  )
  err.code = 'INSTALL_SANDBOX_NOT_IMPLEMENTED'
  err.backend = String(backendStatus.backend)
  err.sandboxDiagnostics = {
    backendStatus,
    sandboxSpec,
  }
  throw err
}
