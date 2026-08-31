import dns from 'node:dns/promises'
import net from 'node:net'
import { Agent } from 'undici'

export const DEFAULT_MAX_REDIRECT_HOPS = 5
export const DEFAULT_FETCH_TIMEOUT_MS = 15_000
export const DEFAULT_MAX_RESPONSE_BODY_BYTES = 5 * 1024 * 1024
export const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

function parseIpv4Parts(addr) {
  const parts = String(addr || '').trim().split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((part) => Number(part))
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  return nums
}

function isBlockedIpv4(addr) {
  const parts = parseIpv4Parts(addr)
  if (!parts) return false
  const [a, b] = parts

  if (a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if ((a === 169 && b === 254 && parts[2] === 169 && parts[3] === 254) || (a === 100 && b === 100 && parts[2] === 100 && parts[3] === 200)) {
    return true
  }

  return false
}

function isPrivateIpv4(addr) {
  const parts = parseIpv4Parts(addr)
  if (!parts) return false
  const [a, b] = parts

  if (a === 127) return true
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true

  return false
}

function hexWord(word) {
  const value = Number.parseInt(String(word || '0'), 16)
  return Number.isFinite(value) ? value : 0
}

function parseIpv6Words(addr) {
  const source = String(addr || '').trim().split('%')[0].toLowerCase()
  if (!source || !source.includes(':')) return null
  if ((source.match(/::/g) || []).length > 1) return null

  const convertPart = (part) => {
    const value = String(part || '').trim()
    if (!value) return []
    if (value.includes('.')) {
      const ipv4 = parseIpv4Parts(value)
      if (!ipv4) return null
      return [
        (ipv4[0] << 8) | ipv4[1],
        (ipv4[2] << 8) | ipv4[3],
      ]
    }
    if (!/^[0-9a-f]{1,4}$/i.test(value)) return null
    return [hexWord(value)]
  }

  const [leftRaw, rightRaw] = source.split('::')
  const leftParts = leftRaw ? leftRaw.split(':').filter(Boolean) : []
  const rightParts = rightRaw !== undefined ? rightRaw.split(':').filter(Boolean) : []
  const leftWords = []
  for (const part of leftParts) {
    const converted = convertPart(part)
    if (!converted) return null
    leftWords.push(...converted)
  }
  const rightWords = []
  for (const part of rightParts) {
    const converted = convertPart(part)
    if (!converted) return null
    rightWords.push(...converted)
  }

  if (rightRaw === undefined) {
    const words = [...leftWords]
    return words.length === 8 ? words : null
  }

  const zeroFill = 8 - leftWords.length - rightWords.length
  if (zeroFill < 0) return null
  return [...leftWords, ...Array(zeroFill).fill(0), ...rightWords]
}

function isBlockedIpv6(addr) {
  const clean = String(addr || '').trim().split('%')[0].toLowerCase()
  if (!clean) return false

  if (clean === '::') return true
  const words = parseIpv6Words(clean)
  if (words && words.length === 8) {
    const allZero = words.every((word) => word === 0)
    if (allZero) return true

    const mappedIpv4WordOffset = (
      words[0] === 0
      && words[1] === 0
      && words[2] === 0
      && words[3] === 0
      && words[4] === 0
      && words[5] === 0xffff
    )
      ? 6
      : (
          words[0] === 0
          && words[1] === 0
          && words[2] === 0
          && words[3] === 0
          && words[4] === 0xffff
          && words[5] === 0
        )
        ? 6
        : -1
    if (mappedIpv4WordOffset === 6) {
      const mappedIpv4 = [
        words[6] >> 8,
        words[6] & 0xff,
        words[7] >> 8,
        words[7] & 0xff,
      ].join('.')
      if (isBlockedIpv4(mappedIpv4)) return true
    }

    const first = words[0]
    const second = words[1]
    if ((first & 0xffc0) === 0xfe80) return true
    if (first === 0x2001 && second === 0x0db8) return true
  }

  return false
}

function isPrivateIpv6(addr) {
  const clean = String(addr || '').trim().split('%')[0].toLowerCase()
  if (!clean) return false
  if (clean === '::1') return true
  const words = parseIpv6Words(clean)
  if (!words || words.length !== 8) return false
  const first = words[0]
  const mappedIpv4WordOffset = (
    words[0] === 0
    && words[1] === 0
    && words[2] === 0
    && words[3] === 0
    && words[4] === 0
    && words[5] === 0xffff
  )
    ? 6
    : (
        words[0] === 0
        && words[1] === 0
        && words[2] === 0
        && words[3] === 0
        && words[4] === 0xffff
        && words[5] === 0
      )
      ? 6
      : -1
  if (mappedIpv4WordOffset === 6) {
    const mappedIpv4 = [
      words[6] >> 8,
      words[6] & 0xff,
      words[7] >> 8,
      words[7] & 0xff,
    ].join('.')
    return isPrivateIpv4(mappedIpv4)
  }
  return (first & 0xfe00) === 0xfc00
}

export function classifyIpAccess(addr) {
  const ip = String(addr || '').trim().split('%')[0]
  const family = net.isIP(ip)
  if (family === 4) {
    if (isBlockedIpv4(ip)) return { family: 4, class: 'blocked', reason: 'blocked_ipv4_range' }
    if (isPrivateIpv4(ip)) return { family: 4, class: 'private', reason: 'private_ipv4_range' }
    return { family: 4, class: 'public', reason: 'public_ipv4' }
  }
  if (family === 6) {
    if (isBlockedIpv6(ip)) return { family: 6, class: 'blocked', reason: 'blocked_ipv6_range' }
    if (isPrivateIpv6(ip)) return { family: 6, class: 'private', reason: 'private_ipv6_range' }
    return { family: 6, class: 'public', reason: 'public_ipv6' }
  }
  return { family: 0, class: 'invalid', reason: 'not_an_ip_literal' }
}

export function isBlockedIp(addr) {
  const classification = classifyIpAccess(addr)
  return classification.class === 'blocked' || classification.class === 'private'
}

function normalizeHostLiteral(hostname = '') {
  const host = String(hostname || '').trim()
  if (host.startsWith('[') && host.endsWith(']')) {
    return host.slice(1, -1).trim()
  }
  return host
}

export function isLocalHostname(hostname = '') {
  const host = normalizeHostLiteral(hostname).toLowerCase()
  return host === 'localhost' || host.endsWith('.localhost')
}

export async function resolveAndClassifyHostAddresses(hostname) {
  const originalHost = String(hostname || '').trim()
  const host = normalizeHostLiteral(originalHost)
  if (!host) throw new Error('URL hostname is required.')

  if (isLocalHostname(host)) {
    return {
      hostname: originalHost || host,
      addresses: [host],
      targetClass: 'private_network',
      reason: 'localhost_name',
    }
  }

  const hostIpFamily = net.isIP(host)
  if (hostIpFamily) {
    const classification = classifyIpAccess(host)
    if (classification.class === 'blocked') {
      return {
        hostname: originalHost || host,
        addresses: [host],
        targetClass: 'blocked',
        reason: classification.reason,
      }
    }
    if (classification.class === 'private') {
      return {
        hostname: originalHost || host,
        addresses: [host],
        targetClass: 'private_network',
        reason: classification.reason,
      }
    }
    return {
      hostname: originalHost || host,
      addresses: [host],
      targetClass: 'public_network',
      reason: classification.reason,
    }
  }

  let records
  try {
    records = await dns.lookup(host, { all: true, verbatim: true })
  } catch {
    throw new Error(`DNS resolution failed for ${originalHost || host}`)
  }

  const addresses = Array.isArray(records)
    ? records.map((row) => String(row?.address || '').trim()).filter(Boolean)
    : []

  if (addresses.length === 0) {
    throw new Error(`DNS resolution returned no addresses for ${originalHost || host}`)
  }

  let sawPrivate = false
  for (const addr of addresses) {
    const classification = classifyIpAccess(addr)
    if (classification.class === 'blocked') {
      return {
        hostname: originalHost || host,
        addresses,
        targetClass: 'blocked',
        reason: classification.reason,
      }
    }
    if (classification.class === 'private') {
      sawPrivate = true
    }
  }

  return {
    hostname: originalHost || host,
    addresses,
    targetClass: sawPrivate ? 'private_network' : 'public_network',
    reason: sawPrivate ? 'private_network_resolution' : 'public_network_resolution',
  }
}

export async function resolveAndValidateHostAddresses(hostname) {
  const result = await resolveAndClassifyHostAddresses(hostname)
  if (result.targetClass !== 'public_network') {
    throw new Error(`Blocked: ${String(result.hostname || hostname || '').trim()} is not a public network target (${result.reason})`)
  }
  return result.addresses
}

export function parseAndValidateHttpUrl(rawUrl) {
  let parsed
  try {
    parsed = new URL(String(rawUrl || '').trim())
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Only http/https URLs are supported (got ${parsed.protocol})`)
  }

  if (!parsed.hostname) {
    throw new Error('URL hostname is required.')
  }

  return parsed
}

export async function classifyHttpUrlTarget(rawUrl) {
  const parsedUrl = parseAndValidateHttpUrl(rawUrl)
  const resolved = await resolveAndClassifyHostAddresses(parsedUrl.hostname)
  return {
    parsedUrl,
    targetClass: resolved.targetClass,
    targetHost: String(parsedUrl.hostname || '').trim(),
    resolvedAddresses: resolved.addresses,
    reason: resolved.reason,
  }
}

function buildPinnedUrl(current, pinnedIp) {
  const pinned = new URL(current.toString())
  pinned.hostname = String(pinnedIp || '').trim()
  return pinned
}

async function fetchPinnedUrl(current, pinnedIp, {
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  userAgent = 'ADDOM/1.0',
  accept = '',
  acceptLanguage = '',
} = {}) {
  const pinnedUrl = buildPinnedUrl(current, pinnedIp)
  const dispatcher = current.protocol === 'https:'
    ? new Agent({ connect: { servername: current.hostname } })
    : null
  const headers = {
    Host: current.host,
    'User-Agent': String(userAgent || 'ADDOM/1.0'),
    ...(accept ? { Accept: String(accept) } : {}),
    ...(acceptLanguage ? { 'Accept-Language': String(acceptLanguage) } : {}),
  }

  try {
    const response = await globalThis.fetch(pinnedUrl.toString(), {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
      headers,
      ...(dispatcher ? { dispatcher } : {}),
    })
    return { response, pinnedUrl: pinnedUrl.toString(), dispatcher }
  } catch (error) {
    if (dispatcher) {
      try { await dispatcher.close() } catch { /* Best-effort cleanup; dispatcher close failure is non-fatal. */ }
    }
    throw error
  }
}

async function readResponseTextWithLimit(response, {
  maxBodyBytes = DEFAULT_MAX_RESPONSE_BODY_BYTES,
} = {}) {
  const byteLimit = Math.max(1, Number(maxBodyBytes) || DEFAULT_MAX_RESPONSE_BODY_BYTES)
  const reader = response?.body?.getReader?.()
  if (!reader) {
    const text = await response.text()
    const buffer = Buffer.from(text)
    if (buffer.length <= byteLimit) {
      return { bodyText: text, bodyBytes: buffer.length, bodyTruncated: false }
    }
    return {
      bodyText: buffer.subarray(0, byteLimit).toString('utf8'),
      bodyBytes: byteLimit,
      bodyTruncated: true,
    }
  }

  const chunks = []
  let bodyBytes = 0
  let bodyTruncated = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      if (bodyBytes + chunk.length > byteLimit) {
        const remaining = byteLimit - bodyBytes
        if (remaining > 0) {
          chunks.push(chunk.subarray(0, remaining))
          bodyBytes += remaining
        }
        bodyTruncated = true
        try { await reader.cancel() } catch { /* Best-effort cleanup; body-stream cancellation failure is non-fatal. */ }
        break
      }
      chunks.push(chunk)
      bodyBytes += chunk.length
    }
  } finally {
    try { reader.releaseLock?.() } catch { /* Best-effort cleanup; reader lock release failure is non-fatal. */ }
  }

  return {
    bodyText: Buffer.concat(chunks).toString('utf8'),
    bodyBytes,
    bodyTruncated,
  }
}

export async function fetchTextWithSafeRedirects(startUrl, options = {}) {
  const {
    maxRedirectHops = DEFAULT_MAX_REDIRECT_HOPS,
    maxBodyBytes = DEFAULT_MAX_RESPONSE_BODY_BYTES,
  } = options
  let current = parseAndValidateHttpUrl(startUrl)
  let redirectCount = 0

  while (redirectCount <= maxRedirectHops) {
    const resolvedAddresses = await resolveAndValidateHostAddresses(current.hostname)
    const pinnedIp = resolvedAddresses[0]
    const { response, dispatcher } = await fetchPinnedUrl(current, pinnedIp, options)

    try {
      if (!REDIRECT_STATUSES.has(Number(response.status || 0))) {
        const { bodyText, bodyBytes, bodyTruncated } = await readResponseTextWithLimit(response, { maxBodyBytes })
        return {
          status: Number(response.status || 0),
          statusText: String(response.statusText || ''),
          headers: response.headers,
          bodyText,
          bodyBytes,
          bodyTruncated,
          finalUrl: current.toString(),
          redirectCount,
          pinnedIp,
        }
      }

      if (redirectCount >= maxRedirectHops) {
        throw new Error(`Too many redirects (max ${maxRedirectHops})`)
      }

      const location = String(response.headers.get('location') || '').trim()
      if (!location) {
        throw new Error(`Redirect (${response.status}) missing location header`)
      }

      try { await response.body?.cancel?.() } catch { /* Best-effort cleanup; redirect body cancellation failure is non-fatal. */ }

      current = parseAndValidateHttpUrl(new URL(location, current).toString())
      redirectCount += 1
    } finally {
      if (dispatcher) {
        try { await dispatcher.close() } catch { /* Best-effort cleanup; dispatcher close failure is non-fatal. */ }
      }
    }
  }

  throw new Error(`Too many redirects (max ${maxRedirectHops})`)
}
