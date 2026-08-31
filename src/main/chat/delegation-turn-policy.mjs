import { normalizeMoaBudgetPolicy } from '../moa/moa-budget-policy.mjs'
import { normalizeMoaPolicy } from '../moa/moa-policy.mjs'

function resolveDelegationCapability(registryEntry) {
  if (registryEntry.supportsAnyToolSurface !== true) {
    return { supported: false, reason: 'missing_tool_surface' }
  }
  return { supported: true, reason: 'runtime_tool_capability' }
}

export function resolveDelegationTurnPolicy({
  mode = 'execute',
  requestedDelegation = false,
  registryEntry = null,
  agentsEnabled = true,
} = {}) {
  // ADDOM's normalized runtime tool-capability pipeline is authoritative.
  // Unknown and dynamically discovered models must be allowed to reach it.
  const capability = registryEntry && typeof registryEntry === 'object'
    ? resolveDelegationCapability(registryEntry)
    : { supported: true, reason: 'runtime_tool_capability' }
  const executeMode = String(mode || '').trim().toLowerCase() === 'execute'
  const supported = capability.supported === true
  const enabled = agentsEnabled !== false
  return {
    supported,
    exposeTools: executeMode && supported && enabled,
    rejectExplicitRequest: executeMode && requestedDelegation === true && (!supported || !enabled),
    reason: !enabled && supported
      ? 'agents_disabled'
      : String(capability.reason || 'unknown_model'),
  }
}

export function resolveDelegationRuntimeSettings(settings = {}) {
  const agentSettings = settings?.agentSettings && typeof settings.agentSettings === 'object'
    ? settings.agentSettings
    : null
  return {
    moaRoles: Array.isArray(settings?.moaRoles) ? settings.moaRoles : [],
    moaPolicy: normalizeMoaPolicy({
      ...settings?.moaPolicy,
      maxTasksPerDelegation: agentSettings?.limits?.maxDescendants,
    }),
    moaBudgetPolicy: normalizeMoaBudgetPolicy(settings?.moaBudgetPolicy),
    agentSettings,
  }
}
