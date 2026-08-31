import net from 'node:net'

export function tokenizeCommandText(commandText) {
  const text = String(commandText ?? '')
  if (!text) return []
  const parts = text.match(/"[^"]*"|'[^']*'|`[^`]*`|\S+/g) || []
  return parts.map((part) => String(part || '').trim()).filter(Boolean)
}

export function unquoteToken(token) {
  const value = String(token ?? '')
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
    || (value.startsWith('`') && value.endsWith('`'))
  ) {
    return value.slice(1, -1)
  }
  return value
}

export function detectPackageManager(commandTextLower) {
  const lower = String(commandTextLower || '').trim()
  if (!lower) return ''
  if (/^(npm|pnpm|yarn|bun)\b/.test(lower)) return lower.split(/\s+/)[0]
  if (/^(pip|pip3)\b/.test(lower) || /^(python|python3|py)\s+-m\s+pip\b/.test(lower) || /^uv\s+pip\b/.test(lower) || /^poetry\b/.test(lower)) return 'python'
  if (/^cargo\b/.test(lower)) return 'cargo'
  if (/^go\b/.test(lower)) return 'go'
  if (/^(bundle|gem)\b/.test(lower)) return 'ruby'
  if (/^(dotnet|nuget)\b/.test(lower)) return 'dotnet'
  if (/^(apt|apt-get|yum|dnf|brew|winget|choco)\b/.test(lower)) return 'system'
  return ''
}

export function looksLikeUrlToken(token) {
  const raw = unquoteToken(token)
  return /^https?:\/\//i.test(raw)
}

function extractHostsFromCommand(commandText) {
  const tokens = tokenizeCommandText(commandText)
  const hosts = new Set()
  for (const token of tokens) {
    const raw = unquoteToken(token)
    if (!looksLikeUrlToken(raw)) continue
    try {
      const url = new URL(raw)
      if (url.hostname) hosts.add(url.hostname.toLowerCase())
    } catch {
      // best-effort only
    }
  }
  return Array.from(hosts).sort()
}

function isPrivateOrLoopbackIpv4(ipText) {
  const octets = String(ipText || '').trim().split('.').map((v) => Number(v))
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false
  if (octets[0] === 10) return true
  if (octets[0] === 127) return true
  if (octets[0] === 192 && octets[1] === 168) return true
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true
  if (octets[0] === 169 && octets[1] === 254) return true
  if (octets[0] === 0) return true
  return false
}

function isPrivateOrLoopbackIpv6(ipText) {
  const value = String(ipText || '').trim().toLowerCase()
  if (!value) return false
  if (value === '::1') return true
  if (value.startsWith('fc') || value.startsWith('fd')) return true
  if (value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true
  return false
}

export function isPrivateNetworkHost(host = '') {
  const normalizedHost = String(host || '').trim().toLowerCase()
  if (!normalizedHost) return false
  if (
    normalizedHost === 'localhost'
    || normalizedHost.endsWith('.localhost')
    || normalizedHost === 'host.docker.internal'
    || normalizedHost.endsWith('.internal')
    || normalizedHost === 'metadata.google.internal'
    || normalizedHost === '169.254.169.254'
  ) {
    return true
  }
  const ipVersion = net.isIP(normalizedHost)
  if (ipVersion === 4) return isPrivateOrLoopbackIpv4(normalizedHost)
  if (ipVersion === 6) return isPrivateOrLoopbackIpv6(normalizedHost)
  return false
}

export function extractCommandInstallIntent(commandText, { shell = 'auto' } = {}) {
  void shell
  const raw = String(commandText ?? '').trim()
  const lower = raw.toLowerCase()
  if (!raw) {
    return {
      isInstallLike: false,
      isGlobalOrSystemInstall: false,
      ecosystem: '',
      packagesHint: [],
    }
  }

  const packageManager = detectPackageManager(lower)
  const tokens = tokenizeCommandText(raw).map(unquoteToken)
  let isInstallLike = false
  let isGlobalOrSystemInstall = false
  let ecosystem = ''

  if (/^(npm|pnpm|yarn|bun)\b/.test(lower)) {
    ecosystem = 'npm'
    isInstallLike = /^(npm|pnpm|yarn|bun)\s+(install|i|add|ci)\b/.test(lower)
    isGlobalOrSystemInstall = /\s(-g|--global)\b/.test(lower)
  } else if (/^(pip|pip3)\s+install\b/.test(lower) || /^(python|python3|py)\s+-m\s+pip\s+install\b/.test(lower) || /^uv\s+pip\s+install\b/.test(lower) || /^poetry\s+(add|install)\b/.test(lower)) {
    ecosystem = 'python'
    isInstallLike = true
    isGlobalOrSystemInstall = /^pip3?\s+install\b/.test(lower) && /\s--user\b/.test(lower)
  } else if (/^cargo\s+(add|install)\b/.test(lower)) {
    ecosystem = 'cargo'
    isInstallLike = true
    isGlobalOrSystemInstall = /^cargo\s+install\b/.test(lower)
  } else if (/^go\s+(get|install)\b/.test(lower)) {
    ecosystem = 'go'
    isInstallLike = true
  } else if (/^(bundle\s+install|gem\s+install)\b/.test(lower)) {
    ecosystem = 'ruby'
    isInstallLike = true
    isGlobalOrSystemInstall = /^gem\s+install\b/.test(lower)
  } else if (/^(dotnet\s+add\s+package|nuget\s+install)\b/.test(lower)) {
    ecosystem = 'dotnet'
    isInstallLike = true
  } else if (/^(apt|apt-get|yum|dnf|brew|winget|choco)\s+install\b/.test(lower)) {
    ecosystem = 'other'
    isInstallLike = true
    isGlobalOrSystemInstall = true
  } else if (packageManager === 'system') {
    ecosystem = 'other'
  }

  const packagesHint = []
  if (isInstallLike) {
    for (let i = 0; i < tokens.length; i += 1) {
      const t = String(tokens[i] || '')
      const tl = t.toLowerCase()
      if (tl === 'install' || tl === 'i' || tl === 'add' || tl === 'ci' || tl === 'get' || tl === 'package') {
        for (let j = i + 1; j < tokens.length; j += 1) {
          const candidate = String(tokens[j] || '')
          if (!candidate || candidate.startsWith('-')) continue
          if (looksLikeUrlToken(candidate)) continue
          if (/^[|&;]$/.test(candidate)) break
          packagesHint.push(candidate)
          if (packagesHint.length >= 6) break
        }
        if (packagesHint.length >= 6) break
      }
    }
  }

  return {
    isInstallLike,
    isGlobalOrSystemInstall,
    ecosystem,
    packagesHint: Array.from(new Set(packagesHint)).slice(0, 6),
  }
}

export function extractCommandNetworkIntent(commandText, { shell = 'auto' } = {}) {
  void shell
  const raw = String(commandText ?? '').trim()
  const lower = raw.toLowerCase()
  if (!raw) {
    return { networkIntent: 'none', hostHints: [], reasons: [] }
  }

  const install = extractCommandInstallIntent(raw)
  const hostHints = extractHostsFromCommand(raw)
  const reasons = []

  if (/\b(curl|wget)\b/.test(lower) || /\binvoke-webrequest\b/.test(lower) || /\binvoke-restmethod\b/.test(lower) || /\bstart-bitstransfer\b/.test(lower) || /\bgit\s+clone\b/.test(lower)) {
    reasons.push('explicit_network_fetch')
    return {
      networkIntent: hostHints.length > 0 ? 'external' : 'unknown',
      hostHints,
      reasons,
    }
  }

  if (install.isInstallLike) {
    reasons.push('dependency_install')
    return {
      networkIntent: install.isGlobalOrSystemInstall ? 'external' : 'registry_only',
      hostHints,
      reasons,
    }
  }

  if (hostHints.length > 0) {
    reasons.push('url_literal_detected')
    return { networkIntent: 'external', hostHints, reasons }
  }

  return { networkIntent: 'none', hostHints, reasons }
}
