import crypto from 'node:crypto'

import { resolveMoaRoleKey } from '../../common/moa/moa-role-keys.mjs'
import { resolveProviderAgentReadiness } from './provider-credential-readiness.mjs'

function clean(value) {
  return String(value ?? '').trim()
}

function cleanList(value) {
  const rows = Array.isArray(value) ? value : [value]
  return [...new Set(rows.map((entry) => clean(entry)).filter(Boolean))].slice(0, 12)
}

function resolveSpecialties(role = {}) {
  return cleanList([
    ...(Array.isArray(role?.specialties) ? role.specialties : []),
    role?.specialty,
    role?.templateLabel,
    role?.templateId,
  ])
}

function resolveEffectiveAccess(role = {}, policy = {}) {
  return (
    role?.canWriteFiles === true
    && policy?.agentWriteAccessEnabled === true
    && clean(policy?.agentWriteMode).toLowerCase() === 'staged'
  ) ? 'staged_write' : 'read_only'
}

function capabilityClass(readiness = {}) {
  const mode = clean(readiness?.toolSupportMode).toLowerCase()
  if (readiness?.supportsTools === false) return 'unavailable'
  if (mode === 'provider_owned_runtime_only') return 'provider_owned_runtime'
  if (mode) return mode
  return readiness?.ready === true ? 'runtime_negotiated' : 'unavailable'
}

function readinessReason(readiness = {}) {
  return clean(
    readiness?.code
    || readiness?.blockedReason
    || readiness?.canonicalErrorClass
    || (readiness?.ready === true ? '' : 'provider_not_ready'),
  )
}

function defaultReadinessResolver(role = {}, options = {}) {
  return resolveProviderAgentReadiness(role?.providerId, {
    model: role?.model,
    requireConfiguredApiKey: options.requireConfiguredApiKey !== false,
    getApiKey: options.getApiKey,
    getCachedCapabilities: options.getCachedCapabilities,
    allowOpenAIAccountRuntime: options.allowOpenAIAccountRuntime !== false,
  })
}

function buildCatalogRole(role = {}, policy = {}, readiness = {}) {
  const ready = readiness?.ready === true
  return {
    key: resolveMoaRoleKey(role),
    name: clean(role?.name) || '(unnamed)',
    status: ready ? 'ready' : 'unavailable',
    readiness_reason: readinessReason(readiness),
    provider_id: clean(role?.providerId).toLowerCase(),
    model: clean(role?.model),
    specialties: resolveSpecialties(role),
    effective_access: resolveEffectiveAccess(role, policy),
    capability_class: capabilityClass(readiness),
  }
}

function catalogHash(roles = []) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({ version: 1, roles }))
    .digest('hex')
    .slice(0, 16)
}

export function buildAgentCatalogSnapshot({
  moaRoles = [],
  moaPolicy = {},
  requireConfiguredApiKey = moaPolicy?.requireConfiguredApiKey !== false,
  getApiKey = null,
  getCachedCapabilities = null,
  allowOpenAIAccountRuntime = true,
  resolveReadiness = null,
} = {}) {
  const roles = (Array.isArray(moaRoles) ? moaRoles : [])
    .map((role) => {
      const readinessOptions = {
        requireConfiguredApiKey,
        getApiKey,
        getCachedCapabilities,
        allowOpenAIAccountRuntime,
      }
      const readiness = typeof resolveReadiness === 'function'
        ? resolveReadiness(role, readinessOptions)
        : defaultReadinessResolver(role, readinessOptions)
      return buildCatalogRole(role, moaPolicy, readiness)
    })
    .filter((role) => role.key)
    .sort((left, right) => left.key.localeCompare(right.key))
  const readyRoleCount = roles.filter((role) => role.status === 'ready').length

  return {
    version: 1,
    hash: catalogHash(roles),
    role_count: roles.length,
    ready_role_count: readyRoleCount,
    unavailable_role_count: Math.max(0, roles.length - readyRoleCount),
    roles,
  }
}
