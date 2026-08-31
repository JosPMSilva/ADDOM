import { createProviderCredentialFingerprint } from '../api-clients/provider-credential-fingerprint.mjs'
import {
  cleanupProviderBudgetProfiles,
  getProviderBudgetProfileLifecycle,
  listProviderBudgetProfiles,
} from '../api-clients/provider-budget-store.mjs'
import { resolveLearnedProviderBudgetProfile } from '../chat/provider-prompt-budget-profile.mjs'

function normalizeBudgetScopeId(value = '') {
  return String(value || '').trim()
}

function withScopedBudgetKey({
  organizationId = '',
  workspaceId = '',
} = {}) {
  return `${normalizeBudgetScopeId(organizationId)}\n${normalizeBudgetScopeId(workspaceId)}`
}

function filterScopedBudgetRows(rows = [], {
  organizationId = '',
  workspaceId = '',
} = {}) {
  const candidates = Array.isArray(rows) ? rows.filter(Boolean) : []
  const requestedOrganizationId = normalizeBudgetScopeId(organizationId)
  const requestedWorkspaceId = normalizeBudgetScopeId(workspaceId)
  if (!requestedOrganizationId && !requestedWorkspaceId) {
    const uniqueScopeKeys = new Set(
      candidates.map((row) => withScopedBudgetKey({
        organizationId: row?.organizationId,
        workspaceId: row?.workspaceId,
      })),
    )
    if (uniqueScopeKeys.size <= 1) return candidates
    return candidates.filter((row) => (
      normalizeBudgetScopeId(row?.organizationId) === ''
      && normalizeBudgetScopeId(row?.workspaceId) === ''
    ))
  }
  return candidates.filter((row) => (
    normalizeBudgetScopeId(row?.organizationId) === requestedOrganizationId
    && normalizeBudgetScopeId(row?.workspaceId) === requestedWorkspaceId
  ))
}

export function withOpenAIAccountNativeCollaborationMode(providerRuntimeSettings = null, nativeCollaborationModeId = '') {
  const normalizedModeId = String(nativeCollaborationModeId || '').trim()
  const source = providerRuntimeSettings && typeof providerRuntimeSettings === 'object'
    ? providerRuntimeSettings
    : null
  if (!source) {
    return normalizedModeId
      ? { openai: { nativeCollaborationModeId: normalizedModeId } }
      : null
  }
  const openaiSettings = source.openai && typeof source.openai === 'object'
    ? source.openai
    : {}
  if (String(openaiSettings.nativeCollaborationModeId || '').trim() === normalizedModeId) {
    return source
  }
  return {
    ...source,
    openai: {
      ...openaiSettings,
      nativeCollaborationModeId: normalizedModeId,
    },
  }
}

export async function resolveLearnedBudgetProfileWithRuntimeDiagnostics({
  providerId = '',
  apiKey = '',
  organizationId = '',
  workspaceId = '',
} = {}) {
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  const normalizedApiKey = String(apiKey || '').trim()
  const runtimeDiagnostics = {
    adaptiveBudgetResolutionReasonOverride: '',
    adaptiveBudgetCleanupDeletedCount: 0,
  }
  if (normalizedProviderId !== 'anthropic' || !normalizedApiKey) {
    return {
      learnedBudgetProfile: null,
      runtimeDiagnostics,
    }
  }

  try {
    const credentialFingerprint = createProviderCredentialFingerprint(normalizedProviderId, normalizedApiKey)
    if (!credentialFingerprint) {
      return {
        learnedBudgetProfile: null,
        runtimeDiagnostics,
      }
    }

    const matchingRowsBeforeCleanup = listProviderBudgetProfiles({ providerId: normalizedProviderId })
      .filter((row) => String(row?.credentialFingerprint || '').trim() === credentialFingerprint)
    const scopedRowsBeforeCleanup = filterScopedBudgetRows(matchingRowsBeforeCleanup, {
      organizationId,
      workspaceId,
    })
    const scopedLifecycles = scopedRowsBeforeCleanup.map((row) => ({
      lifecycle: getProviderBudgetProfileLifecycle(row),
    }))

    cleanupProviderBudgetProfiles({ providerId: normalizedProviderId })

    const remainingScopedIds = new Set(
      filterScopedBudgetRows(
        listProviderBudgetProfiles({ providerId: normalizedProviderId })
          .filter((row) => String(row?.credentialFingerprint || '').trim() === credentialFingerprint),
        { organizationId, workspaceId },
      ).map((row) => normalizeBudgetScopeId(row?.id)),
    )
    runtimeDiagnostics.adaptiveBudgetCleanupDeletedCount = scopedRowsBeforeCleanup
      .filter((row) => !remainingScopedIds.has(normalizeBudgetScopeId(row?.id)))
      .length

    const learnedBudgetProfile = await resolveLearnedProviderBudgetProfile({
      providerId: normalizedProviderId,
      organizationId,
      workspaceId,
      credentialFingerprint,
    })

    if (!learnedBudgetProfile) {
      if (scopedLifecycles.some(({ lifecycle }) => lifecycle.invalid === true)) {
        runtimeDiagnostics.adaptiveBudgetResolutionReasonOverride = 'invalid_observation'
      } else if (
        scopedLifecycles.some(({ lifecycle }) => lifecycle.expired === true)
        || runtimeDiagnostics.adaptiveBudgetCleanupDeletedCount > 0
      ) {
        runtimeDiagnostics.adaptiveBudgetResolutionReasonOverride = 'expired_observation'
      }
    }

    return {
      learnedBudgetProfile,
      runtimeDiagnostics,
    }
  } catch {
    return {
      learnedBudgetProfile: await resolveLearnedProviderBudgetProfile({
        providerId: normalizedProviderId,
        apiKey: normalizedApiKey,
        organizationId,
        workspaceId,
      }),
      runtimeDiagnostics,
    }
  }
}
