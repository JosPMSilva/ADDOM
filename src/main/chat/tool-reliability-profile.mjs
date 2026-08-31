function normalizeLower(value = '') {
  return String(value || '').trim().toLowerCase()
}

function uniqueStrings(values = []) {
  const seen = new Set()
  const out = []
  for (const rawValue of Array.isArray(values) ? values : []) {
    const value = String(rawValue || '').trim()
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
  }
  return out
}

export function resolveToolReliabilityProfile({
  providerId = '',
  modelId = '',
  adapterProfile = null,
  toolSurfaceKind = '',
} = {}) {
  const provider = normalizeLower(providerId)
  const model = String(modelId || '').trim()
  const surfaceKind = normalizeLower(toolSurfaceKind)
  const adapterSelection = normalizeLower(adapterProfile?.adapterSelection)
  const adapterId = String(adapterProfile?.adapterId || '').trim()
  const providerNativeMode = normalizeLower(adapterProfile?.providerNativeRuntime?.mode)
  const toolFamily = normalizeLower(adapterProfile?.toolFamily)

  let profileId = 'balanced_general'
  let reliabilityTier = 'standard'
  let patchExposure = 'normal'
  let preferredWritePath = 'edit_file_or_write_file'
  let shellExposure = 'normal'
  let notes = []

  if (surfaceKind === 'openai_codex_local') {
    profileId = 'codex_local_agentic'
    reliabilityTier = 'high'
    patchExposure = 'normal'
    preferredWritePath = 'apply_patch_or_edit_file'
    shellExposure = 'normal'
    notes = ['local_agentic_runtime']
  } else if (surfaceKind === 'openai_hosted') {
    profileId = 'openai_hosted_general'
    reliabilityTier = 'standard'
    patchExposure = 'normal'
    preferredWritePath = 'edit_file_or_write_file'
    shellExposure = 'provider_hosted'
    notes = ['hosted_provider_surface']
  } else if (providerNativeMode === 'remote_tool_bundle') {
    profileId = 'provider_native_remote_bundle'
    reliabilityTier = 'standard'
    patchExposure = 'normal'
    preferredWritePath = 'edit_file_or_write_file'
    shellExposure = 'normal'
    notes = ['provider_native_bundle']
  } else if (providerNativeMode === 'provider_owned_runtime' || surfaceKind === 'perplexity_search') {
    profileId = 'provider_owned_runtime'
    reliabilityTier = 'constrained'
    patchExposure = 'restricted'
    preferredWritePath = 'edit_file_or_write_file'
    shellExposure = 'not_available'
    notes = ['provider_owned_runtime']
  } else if (toolFamily === 'addom_native_curated') {
    profileId = 'curated_addom_native'
    reliabilityTier = 'standard'
    patchExposure = 'restricted'
    preferredWritePath = 'edit_file_or_write_file'
    shellExposure = 'normal'
    notes = ['curated_addom_native']
  } else if (toolFamily === 'generic_addom_native' || surfaceKind === 'addom_native') {
    profileId = 'generic_addom_native'
    reliabilityTier = adapterSelection === 'curated' ? 'standard' : 'guarded'
    patchExposure = 'restricted'
    preferredWritePath = 'edit_file_or_write_file'
    shellExposure = 'normal'
    notes = adapterSelection === 'curated' ? ['curated_addom_native'] : ['generic_model_surface']
  }

  return {
    profileId,
    providerId: provider,
    modelId: model,
    adapterId,
    reliabilityTier,
    patchExposure,
    preferredWritePath,
    shellExposure,
    notes: uniqueStrings(notes),
  }
}
