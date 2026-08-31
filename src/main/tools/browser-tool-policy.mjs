import {
  classifyHttpUrlTarget,
  parseAndValidateHttpUrl,
} from '../utils/ssrf-guard.mjs'

function normalizeOrigin(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw === 'about:blank') return 'about:blank'
  try {
    return new URL(raw).origin.toLowerCase()
  } catch {
    return raw.toLowerCase()
  }
}

export async function classifyUrl(rawUrl = '') {
  const value = String(rawUrl || '').trim()
  if (!value) {
    return {
      url: '',
      targetClass: 'none',
      targetHost: '',
      targetOrigin: '',
      resolvedAddresses: [],
      reason: 'no_url',
    }
  }

  if (value === 'about:blank') {
    return {
      url: 'about:blank',
      targetClass: 'none',
      targetHost: '',
      targetOrigin: 'about:blank',
      resolvedAddresses: [],
      reason: 'about_blank',
    }
  }

  const parsed = parseAndValidateHttpUrl(value)
  const classified = await classifyHttpUrlTarget(parsed.toString())
  return {
    url: parsed.toString(),
    targetClass: String(classified.targetClass || '').trim() || 'blocked',
    targetHost: String(classified.targetHost || parsed.hostname || '').trim(),
    targetOrigin: parsed.origin,
    resolvedAddresses: Array.isArray(classified.resolvedAddresses) ? classified.resolvedAddresses : [],
    reason: String(classified.reason || '').trim(),
  }
}

export async function refreshSessionTarget(session) {
  const currentUrl = String(session?.page?.url?.() || '').trim()
  const classified = await classifyUrl(currentUrl || 'about:blank')
  session.currentPageUrl = classified.url
  session.targetClass = classified.targetClass
  session.targetOrigin = classified.targetOrigin
  session.targetHost = classified.targetHost
  session.resolvedAddresses = classified.resolvedAddresses
  session.targetReason = classified.reason
  return session
}

export function buildBrowserNavigationPolicy(context = {}) {
  return {
    targetClass: String(context?.targetClass || '').trim().toLowerCase() || 'none',
    targetOrigin: String(context?.targetOrigin || '').trim(),
    normalizedTargetOrigin: normalizeOrigin(context?.targetOrigin),
    enforceOrigin: String(context?.targetClass || '').trim().toLowerCase() === 'private_network',
  }
}

export async function evaluateBrowserNavigationRequestPolicy(policy = {}, requestUrl = '') {
  const normalizedPolicy = policy && typeof policy === 'object' ? policy : {}
  const approvedTargetClass = String(normalizedPolicy.targetClass || '').trim().toLowerCase() || 'none'
  if (approvedTargetClass === 'none') {
    return { allowed: true, reason: 'no_policy', classified: null }
  }

  let classified = null
  try {
    classified = await classifyUrl(requestUrl)
  } catch (error) {
    return {
      allowed: false,
      reason: 'invalid_navigation_target',
      classified: null,
      message: `Blocked browser navigation request to ${String(requestUrl || '').trim() || '(unknown url)'} because the target could not be revalidated: ${String(error?.message || error || 'unknown target validation error')}`,
    }
  }

  const requestTargetClass = String(classified?.targetClass || '').trim().toLowerCase() || 'blocked'
  if (requestTargetClass === 'blocked') {
    return {
      allowed: false,
      reason: 'blocked_navigation_target',
      classified,
      message: `Blocked browser navigation request to ${classified.url} because it resolves to a blocked target.`,
    }
  }

  if (approvedTargetClass === 'public_network') {
    if (requestTargetClass !== 'public_network') {
      return {
        allowed: false,
        reason: 'navigation_target_class_changed',
        classified,
        message: `Blocked browser navigation request to ${classified.url} because it changed target class from public_network to ${requestTargetClass}.`,
      }
    }
    return { allowed: true, reason: 'public_navigation_allowed', classified }
  }

  if (approvedTargetClass === 'private_network') {
    if (requestTargetClass !== 'private_network') {
      return {
        allowed: false,
        reason: 'navigation_target_class_changed',
        classified,
        message: `Blocked browser navigation request to ${classified.url} because it changed target class from private_network to ${requestTargetClass}.`,
      }
    }
    if (normalizedPolicy.enforceOrigin) {
      const approvedOrigin = String(normalizedPolicy.normalizedTargetOrigin || '').trim()
      const requestOrigin = normalizeOrigin(classified?.targetOrigin)
      if (approvedOrigin && requestOrigin && approvedOrigin !== requestOrigin) {
        return {
          allowed: false,
          reason: 'private_navigation_origin_changed',
          classified,
          message: `Blocked browser navigation request to ${classified.url} because private-network navigation drifted from the approved origin ${approvedOrigin} to ${requestOrigin}.`,
        }
      }
    }
    return { allowed: true, reason: 'private_navigation_allowed', classified }
  }

  return { allowed: true, reason: 'default_allow', classified }
}

function isGuardedMainFrameNavigationRequest(session, request) {
  if (!request?.isNavigationRequest?.()) return false
  if (String(request?.resourceType?.() || '').trim().toLowerCase() !== 'document') return false
  const frame = request?.frame?.()
  const mainFrame = session?.page?.mainFrame?.()
  return !mainFrame || frame === mainFrame
}

export async function handleBrowserRoute(session, route) {
  const request = route?.request?.()
  if (!request || !isGuardedMainFrameNavigationRequest(session, request)) {
    await route.continue()
    return
  }

  const policy = session?.navigationPolicy
  if (!policy) {
    await route.continue()
    return
  }

  const decision = await evaluateBrowserNavigationRequestPolicy(policy, request.url())
  if (decision.allowed) {
    await route.continue()
    return
  }

  session.lastNavigationBlock = {
    url: String(request.url() || '').trim(),
    reason: String(decision.reason || 'navigation_blocked'),
    message: String(decision.message || 'Blocked browser navigation request.'),
  }
  try {
    await route.abort('blockedbyclient')
  } catch {
    await route.abort().catch(() => {})
  }
}

export async function withSessionNavigationPolicy(session, policy, operation) {
  const previousPolicy = session?.navigationPolicy || null
  const previousBlock = session?.lastNavigationBlock || null
  session.navigationPolicy = policy && typeof policy === 'object' ? { ...policy } : null
  session.lastNavigationBlock = null
  try {
    return await operation()
  } finally {
    session.navigationPolicy = previousPolicy
    session.lastNavigationBlock = previousBlock
  }
}
