import { spawn } from 'child_process'
import {
  classifyWslStatusProbeOutput,
  decodeProbeBuffer,
} from './command-tools-sandbox-utils.mjs'

export function normalizeBackendName(value) {
  const v = String(value || '').trim().toLowerCase()
  if (v === 'docker' || v === 'wsl' || v === 'none') return v
  return 'auto'
}

export function defaultStrictEgressImplementationMode({ backend = 'none', available = false, supportsStrict = false } = {}) {
  if (supportsStrict) return 'strict_backend'
  const name = normalizeBackendName(backend)
  if (!available || name === 'none' || name === 'auto') return 'none'
  if (name === 'docker' || name === 'wsl') return 'best_effort_only'
  return 'unknown'
}

function normalizeStrictEgressImplementationMode(value, fallback = {}) {
  const v = String(value || '').trim().toLowerCase()
  if (v === 'none') return 'none'
  if (v === 'best_effort_only') return 'best_effort_only'
  if (v === 'strict_backend') return 'strict_backend'
  if (v === 'strict_proxy_sidecar') return 'strict_proxy_sidecar'
  if (v === 'strict_runtime_firewall') return 'strict_runtime_firewall'
  if (v === 'unknown') return 'unknown'
  return defaultStrictEgressImplementationMode(fallback)
}

function normalizeInstallSandboxBackendCapabilities(capabilities, { backend = 'none', available = false } = {}) {
  const src = capabilities && typeof capabilities === 'object' ? capabilities : {}
  const strictEgressEnforcement = src.strictEgressEnforcement === true
  const strictEgressImplementationMode = normalizeStrictEgressImplementationMode(
    src.strictEgressImplementationMode,
    { backend, available, supportsStrict: strictEgressEnforcement },
  )
  return {
    strictEgressEnforcement,
    strictEgressImplementationMode,
  }
}

async function probeCommand(bin, args = [], { timeoutMs = 1500 } = {}) {
  return await new Promise((resolve) => {
    let settled = false
    let timer = null
    const child = spawn(bin, args, { stdio: 'ignore', windowsHide: true })
    const finish = (result) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(result)
    }
    child.on('error', (err) => finish({ ok: false, reason: String(err?.code || err?.message || err) }))
    child.on('close', (code) => finish({ ok: code === 0, reason: code === 0 ? '' : `exit_${code}` }))
    timer = setTimeout(() => {
      try { child.kill('SIGTERM') } catch { /* ignore kill errors on timeout */ }
      finish({ ok: true, reason: 'probe_timeout_assumed_present' })
    }, Math.max(250, timeoutMs))
  })
}

async function probeCommandDetailed(bin, args = [], { timeoutMs = 1500 } = {}) {
  return await new Promise((resolve) => {
    let settled = false
    let timer = null
    const stdoutChunks = []
    const stderrChunks = []
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    const finish = (result) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      const stdoutBuffer = Buffer.concat(stdoutChunks)
      const stderrBuffer = Buffer.concat(stderrChunks)
      resolve({
        stdout: decodeProbeBuffer(stdoutBuffer),
        stderr: decodeProbeBuffer(stderrBuffer),
        ...result,
      })
    }
    child.stdout?.on('data', (chunk) => stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    child.stderr?.on('data', (chunk) => stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    child.on('error', (err) => finish({ ok: false, reason: String(err?.code || err?.message || err) }))
    child.on('close', (code) => finish({ ok: code === 0, reason: code === 0 ? '' : `exit_${code}` }))
    timer = setTimeout(() => {
      try { child.kill('SIGTERM') } catch { /* ignore kill errors on timeout */ }
      finish({ ok: true, reason: 'probe_timeout_assumed_present' })
    }, Math.max(250, timeoutMs))
  })
}

async function probeExplicitBackend(backendName = '') {
  const explicit = normalizeBackendName(backendName)
  if (explicit !== 'docker' && explicit !== 'wsl') {
    return {
      available: false,
      backend: 'none',
      reason: `Unsupported backend probe target: ${String(backendName || 'none')}.`,
      capabilities: normalizeInstallSandboxBackendCapabilities({}, { backend: 'none', available: false }),
    }
  }

  const probe = explicit === 'docker'
    ? await probeCommand('docker', ['version', '--format', '{{.Server.Version}}'])
    : await probeCommandDetailed('wsl.exe', ['--status'])
  if (explicit === 'wsl' && probe.ok) {
    const combinedOutput = [probe.stdout, probe.stderr].filter(Boolean).join('\n')
    const classified = classifyWslStatusProbeOutput(combinedOutput)
    if (!classified.usable) {
      return {
        available: false,
        backend: 'none',
        reason: `wsl backend probe indicates WSL is installed but not currently usable (${classified.reasonCode}). ${classified.message}`.trim(),
        capabilities: normalizeInstallSandboxBackendCapabilities({}, { backend: 'none', available: false }),
      }
    }
  }

  return probe.ok
    ? {
        available: true,
        backend: explicit,
        capabilities: normalizeInstallSandboxBackendCapabilities({}, { backend: explicit, available: true }),
      }
    : {
        available: false,
        backend: 'none',
        reason: `${explicit} backend requested but probe failed (${probe.reason || 'unavailable'}).`,
        capabilities: normalizeInstallSandboxBackendCapabilities({}, { backend: 'none', available: false }),
      }
}

export async function detectInstallSandboxBackend(config = {}) {
  const cfg = config && typeof config === 'object' ? config : {}
  const explicit = normalizeBackendName(cfg.backend || cfg.preferredBackend || process.env.ADDOM_INSTALL_SANDBOX_BACKEND)
  if (explicit === 'docker' || explicit === 'wsl') {
    const skipProbe = cfg.skipProbe === true
    if (skipProbe) {
      return {
        available: true,
        backend: explicit,
        capabilities: normalizeInstallSandboxBackendCapabilities({}, { backend: explicit, available: true }),
      }
    }
    return probeExplicitBackend(explicit)
  }
  if (explicit === 'none') {
    return {
      available: false,
      backend: 'none',
      reason: 'Sandbox backend explicitly disabled.',
      capabilities: normalizeInstallSandboxBackendCapabilities({}, { backend: 'none', available: false }),
    }
  }

  if (typeof cfg.detectBackend === 'function') {
    try {
      const detected = await cfg.detectBackend()
      if (detected && typeof detected === 'object') {
        const backend = normalizeBackendName(detected.backend)
        if (backend === 'docker' || backend === 'wsl') {
          return {
            available: !!detected.available,
            backend,
            ...(detected.reason ? { reason: String(detected.reason) } : {}),
            capabilities: normalizeInstallSandboxBackendCapabilities(detected.capabilities, {
              backend,
              available: !!detected.available,
            }),
          }
        }
      }
    } catch (error) {
      return {
        available: false,
        backend: 'none',
        reason: `Sandbox backend probe failed: ${String(error?.message || error)}`,
        capabilities: normalizeInstallSandboxBackendCapabilities({}, { backend: 'none', available: false }),
      }
    }
  }

  const dockerAutoProbe = await probeExplicitBackend('docker')
  if (dockerAutoProbe.available) return dockerAutoProbe

  const wslAutoProbe = await probeExplicitBackend('wsl')
  if (wslAutoProbe.available) return wslAutoProbe

  return {
    available: false,
    backend: 'none',
    reason: [
      'Install sandbox auto-detection did not find an available backend.',
      String(dockerAutoProbe.reason || '').trim(),
      String(wslAutoProbe.reason || '').trim(),
    ].filter(Boolean).join(' '),
    capabilities: normalizeInstallSandboxBackendCapabilities({}, { backend: 'none', available: false }),
  }
}
