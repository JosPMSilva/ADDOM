import { canonicalizeRegistryModelSelection, getRegistryProvider } from './model-registry.mjs'

const RESET_CACHE_TARGETS = Object.freeze([
  'provider_manifest',
  'dynamic_remote_models',
  'model_capabilities',
])

const RESET_STATE_TARGETS = Object.freeze([
  'chat_model_selection',
  'project_model_selection',
  'session_model_selection',
  'memory_model_selection',
])

const PRE_RELEASE_MODEL_CATALOG_RESET_RULES = Object.freeze([
  {
    id: 'canonicalize_known_alias_or_replacement',
    when: 'selected provider/model resolves to a curated alias or replacement',
    action: 'replace_selection',
    invalidate: [...RESET_CACHE_TARGETS],
    notes: 'Pre-release canonicalization is allowed for known aliases and explicit replacements.',
  },
  {
    id: 'clear_unknown_or_removed_selection',
    when: 'selected provider is missing or the model no longer resolves in the curated catalog',
    action: 'clear_selection',
    invalidate: [...RESET_CACHE_TARGETS, ...RESET_STATE_TARGETS],
    notes: 'Do not migrate unknown pre-release selections; clear them.',
  },
  {
    id: 'keep_exact_curated_selection',
    when: 'selected provider/model already matches the curated catalog',
    action: 'keep_selection',
    invalidate: [],
    notes: 'No reset work is needed when the current selection is already canonical.',
  },
])

function trimString(value = '') {
  return String(value || '').trim()
}

export function listPreReleaseModelCatalogResetRules() {
  return PRE_RELEASE_MODEL_CATALOG_RESET_RULES.map((rule) => ({
    ...rule,
    invalidate: [...rule.invalidate],
  }))
}

export function resolvePreReleaseModelCatalogReset({
  providerId = '',
  modelId = '',
} = {}) {
  const requestedProviderId = trimString(providerId).toLowerCase()
  const requestedModelId = trimString(modelId)
  const canonical = canonicalizeRegistryModelSelection(requestedProviderId, requestedModelId)
  const providerExists = !!getRegistryProvider(requestedProviderId)

  if (!requestedProviderId || !requestedModelId || !providerExists || canonical.reason === 'unknown') {
    return {
      action: 'clear_selection',
      reason: !providerExists ? 'unknown_provider' : 'unknown_model',
      requestedProviderId,
      requestedModelId,
      nextProviderId: '',
      nextModelId: '',
      invalidate: [...RESET_CACHE_TARGETS, ...RESET_STATE_TARGETS],
    }
  }

  if (canonical.changed === true) {
    return {
      action: 'replace_selection',
      reason: canonical.reason,
      requestedProviderId,
      requestedModelId,
      nextProviderId: trimString(canonical.providerId).toLowerCase(),
      nextModelId: trimString(canonical.modelId),
      invalidate: [...RESET_CACHE_TARGETS],
    }
  }

  return {
    action: 'keep_selection',
    reason: canonical.reason || 'exact',
    requestedProviderId,
    requestedModelId,
    nextProviderId: trimString(canonical.providerId).toLowerCase(),
    nextModelId: trimString(canonical.modelId),
    invalidate: [],
  }
}
