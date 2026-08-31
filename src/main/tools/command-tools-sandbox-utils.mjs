export function decodeProbeBuffer(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '')
  if (buf.length === 0) return ''
  let nulCount = 0
  for (let i = 0; i < buf.length; i += 1) {
    if (buf[i] === 0) nulCount += 1
  }
  const nulRatio = nulCount / Math.max(1, buf.length)
  if (nulRatio >= 0.15) {
    try {
      return buf.toString('utf16le')
    } catch {
      // Fall back to utf8 decode if utf16le fails.
    }
  }
  return buf.toString('utf8')
}

export function normalizeProbeText(text = '') {
  return String(text || '')
    .split('\0').join('')
    .replace(/\r\n/g, '\n')
    .trim()
}

export function classifyWslStatusProbeOutput(outputText = '') {
  const normalized = normalizeProbeText(outputText)
  const lower = normalized.toLowerCase()
  if (!normalized) {
    return { usable: true, reasonCode: 'empty_status_output', message: '' }
  }

  const hasNotSupported = /not supported|n(?:a|\u00e3)o\s+(?:e|\u00e9)\s+suportado/.test(lower)
  const hasVirtualizationHint = /virtual machine platform|plataforma de m(?:a|\u00e1)quinas virtuais|enablevirtualization|virtualiza(?:c|\u00e7)(?:a|\u00e3)o/.test(lower)
  const hasAccessDenied = /e_accessdenied|access denied|acesso negado/.test(lower)

  if (hasAccessDenied) {
    return {
      usable: false,
      reasonCode: 'wsl_access_denied',
      message: 'WSL is installed but access to `wsl.exe --status` was denied from the current execution context.',
    }
  }
  if ((/wsl1/.test(lower) || /wsl2/.test(lower)) && hasNotSupported) {
    return {
      usable: false,
      reasonCode: 'wsl_not_supported_on_host_config',
      message: 'WSL reports the current machine configuration does not support the requested WSL runtime (missing Windows features or virtualization).',
    }
  }
  if (hasVirtualizationHint && hasNotSupported) {
    return {
      usable: false,
      reasonCode: 'wsl_virtualization_not_enabled',
      message: 'WSL reports missing virtualization/Virtual Machine Platform prerequisites on this host.',
    }
  }
  return { usable: true, reasonCode: 'wsl_status_ok', message: '' }
}

export function defaultDockerImageForEcosystem(ecosystem = '') {
  switch (String(ecosystem || '').trim().toLowerCase()) {
    case 'npm': return 'node:20-bookworm'
    case 'python': return 'python:3.12-slim'
    case 'cargo': return 'rust:1-bookworm'
    case 'go': return 'golang:1.22'
    case 'ruby': return 'ruby:3.3'
    case 'dotnet': return 'mcr.microsoft.com/dotnet/sdk:8.0'
    default: return 'ubuntu:24.04'
  }
}

export function shellForBackend(backend) {
  return backend === 'docker'
    ? { bin: 'sh', args: (command) => ['-lc', command] }
    : { bin: 'bash', args: (command) => ['-lc', command] }
}


