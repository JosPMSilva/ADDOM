import crypto from 'node:crypto'
import { getDb } from '../memory/db.mjs'

const DAY_MS = 24 * 60 * 60 * 1000
const PROVIDER_BUDGET_PROFILE_STALE_AFTER_MS = 7 * DAY_MS
const PROVIDER_BUDGET_PROFILE_EXPIRE_AFTER_MS = 30 * DAY_MS
const PROVIDER_BUDGET_PROFILE_UNUSED_PRUNE_AFTER_MS = 90 * DAY_MS

function now() {
  return Date.now()
}

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeLowerId(value = '') {
  return normalizeId(value).toLowerCase()
}

function normalizePositiveInt(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.max(0, Math.round(numeric))
}

function parseJson(value = '{}') {
  try {
    const parsed = JSON.parse(String(value || '{}'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function stringifyJson(value = {}) {
  try {
    return JSON.stringify(value && typeof value === 'object' ? value : {})
  } catch {
    return '{}'
  }
}

function mapRow(row = null) {
  if (!row || typeof row !== 'object') return null
  return {
    id: normalizeId(row.id),
    providerId: normalizeLowerId(row.provider_id),
    organizationId: normalizeId(row.organization_id),
    workspaceId: normalizeId(row.workspace_id),
    credentialFingerprint: normalizeId(row.credential_fingerprint),
    profileSource: normalizeLowerId(row.profile_source) || 'fallback',
    inputTpmLimit: normalizePositiveInt(row.input_tpm_limit),
    outputTpmLimit: normalizePositiveInt(row.output_tpm_limit),
    requestsPerMinuteLimit: normalizePositiveInt(row.requests_per_minute_limit),
    retryAfterSeconds: normalizePositiveInt(row.retry_after_seconds),
    confidence: normalizeLowerId(row.confidence) || 'fallback',
    observationCount: normalizePositiveInt(row.observation_count),
    firstObservedAt: normalizePositiveInt(row.first_observed_at),
    lastObservedAt: normalizePositiveInt(row.last_observed_at),
    lastSuccessObservedAt: normalizePositiveInt(row.last_success_observed_at),
    lastRateLimitObservedAt: normalizePositiveInt(row.last_rate_limit_observed_at),
    lastObservationSource: normalizeLowerId(row.last_observation_source),
    lastModelId: normalizeId(row.last_model_id),
    lastResponseHeaders: parseJson(row.last_response_headers_json),
    manualOverride: parseJson(row.manual_override_json),
    lastResolvedAt: normalizePositiveInt(row.last_resolved_at),
    createdAt: normalizePositiveInt(row.created_at),
    updatedAt: normalizePositiveInt(row.updated_at),
  }
}

function buildProviderBudgetProfileId({
  providerId = '',
  organizationId = '',
  workspaceId = '',
  credentialFingerprint = '',
} = {}) {
  const seed = [
    normalizeLowerId(providerId),
    normalizeId(organizationId),
    normalizeId(workspaceId),
    normalizeId(credentialFingerprint),
  ].join('\n')
  const digest = crypto.createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 24)
  return `pbp_${digest}`
}

function mergeObservedLimit(existingValue = 0, incomingValue = 0) {
  const normalizedIncoming = normalizePositiveInt(incomingValue)
  if (normalizedIncoming > 0) return normalizedIncoming
  return normalizePositiveInt(existingValue)
}

function resolveConfidence(existing = null, nextObservationCount = 0) {
  if (normalizeLowerId(existing?.profileSource) === 'manual_override') return 'manual_override'
  if (nextObservationCount > 1) return 'observed_stable'
  if (nextObservationCount === 1) return 'observed_once'
  return 'fallback'
}

function hasManualOverride(record = null) {
  if (normalizeLowerId(record?.profileSource) === 'manual_override') return true
  const manualOverride = record?.manualOverride
  return !!(
    manualOverride
    && typeof manualOverride === 'object'
    && !Array.isArray(manualOverride)
    && Object.keys(manualOverride).length > 0
  )
}

function resolveObservationTimestamp(record = null) {
  return Math.max(
    normalizePositiveInt(record?.lastObservedAt),
    normalizePositiveInt(record?.lastSuccessObservedAt),
    normalizePositiveInt(record?.lastRateLimitObservedAt),
    normalizePositiveInt(record?.firstObservedAt),
    0,
  )
}

function resolveLastActivityTimestamp(record = null) {
  return Math.max(
    normalizePositiveInt(record?.lastResolvedAt),
    normalizePositiveInt(record?.updatedAt),
    normalizePositiveInt(record?.createdAt),
    resolveObservationTimestamp(record),
    0,
  )
}

function isValidProviderBudgetRecord(record = null) {
  return !!(
    normalizeLowerId(record?.providerId)
    && normalizeId(record?.credentialFingerprint)
  )
}

export function getProviderBudgetProfileLifecycle(record = null, { nowMs = now() } = {}) {
  const normalizedNowMs = normalizePositiveInt(nowMs) || now()
  const observationTimestamp = resolveObservationTimestamp(record)
  const lastActivityTimestamp = resolveLastActivityTimestamp(record)
  const manualOverridePresent = hasManualOverride(record)
  const observationAgeMs = observationTimestamp > 0
    ? Math.max(0, normalizedNowMs - observationTimestamp)
    : 0
  const lastActivityAgeMs = lastActivityTimestamp > 0
    ? Math.max(0, normalizedNowMs - lastActivityTimestamp)
    : 0
  const invalid = !isValidProviderBudgetRecord(record)
  const stale = manualOverridePresent === false
    && observationTimestamp > 0
    && observationAgeMs >= PROVIDER_BUDGET_PROFILE_STALE_AFTER_MS
  const expired = manualOverridePresent === false && (
    observationTimestamp <= 0
    || observationAgeMs >= PROVIDER_BUDGET_PROFILE_EXPIRE_AFTER_MS
  )
  return {
    observationTimestamp,
    lastActivityTimestamp,
    observationAgeMs,
    lastActivityAgeMs,
    manualOverridePresent,
    invalid,
    stale,
    expired,
    pruneEligible: invalid || (
      manualOverridePresent === false
      && expired === true
      && lastActivityAgeMs >= PROVIDER_BUDGET_PROFILE_UNUSED_PRUNE_AFTER_MS
    ),
  }
}

export function getProviderBudgetProfile({
  providerId = '',
  organizationId = '',
  workspaceId = '',
  credentialFingerprint = '',
} = {}) {
  const normalizedProviderId = normalizeLowerId(providerId)
  const normalizedOrganizationId = normalizeId(organizationId)
  const normalizedWorkspaceId = normalizeId(workspaceId)
  const normalizedCredentialFingerprint = normalizeId(credentialFingerprint)
  if (!normalizedProviderId || !normalizedCredentialFingerprint) return null

  const row = getDb().prepare(`
    SELECT *
    FROM provider_budget_profiles
    WHERE provider_id = ?
      AND organization_id = ?
      AND workspace_id = ?
      AND credential_fingerprint = ?
    LIMIT 1
  `).get(
    normalizedProviderId,
    normalizedOrganizationId,
    normalizedWorkspaceId,
    normalizedCredentialFingerprint,
  )

  return mapRow(row)
}

export function listProviderBudgetProfiles({ providerId = '' } = {}) {
  const normalizedProviderId = normalizeLowerId(providerId)
  const rows = normalizedProviderId
    ? getDb().prepare(`
      SELECT *
      FROM provider_budget_profiles
      WHERE provider_id = ?
      ORDER BY last_observed_at DESC, created_at DESC
    `).all(normalizedProviderId)
    : getDb().prepare(`
      SELECT *
      FROM provider_budget_profiles
      ORDER BY last_observed_at DESC, created_at DESC
    `).all()

  return rows.map(mapRow).filter(Boolean)
}

export function touchProviderBudgetProfileResolution(profile = null, { resolvedAt = now() } = {}) {
  const id = normalizeId(profile?.id)
  if (!id) return 0
  const normalizedResolvedAt = normalizePositiveInt(resolvedAt) || now()
  const result = getDb().prepare(`
    UPDATE provider_budget_profiles
    SET last_resolved_at = ?,
        updated_at = CASE
          WHEN updated_at > ? THEN updated_at
          ELSE ?
        END
    WHERE id = ?
  `).run(
    normalizedResolvedAt,
    normalizedResolvedAt,
    normalizedResolvedAt,
    id,
  )
  return normalizePositiveInt(result?.changes)
}

export function cleanupProviderBudgetProfiles({
  providerId = '',
  nowMs = now(),
} = {}) {
  const normalizedProviderId = normalizeLowerId(providerId)
  const profiles = listProviderBudgetProfiles({ providerId: normalizedProviderId })
  const removableIds = []
  let invalidDeletedCount = 0
  let expiredUnusedDeletedCount = 0

  for (const profile of profiles) {
    const lifecycle = getProviderBudgetProfileLifecycle(profile, { nowMs })
    if (lifecycle.pruneEligible !== true) continue
    removableIds.push(normalizeId(profile?.id))
    if (lifecycle.invalid) {
      invalidDeletedCount += 1
    } else {
      expiredUnusedDeletedCount += 1
    }
  }

  if (removableIds.length > 0) {
    const deleteStmt = getDb().prepare('DELETE FROM provider_budget_profiles WHERE id = ?')
    const tx = getDb().transaction((ids = []) => {
      for (const id of ids) {
        deleteStmt.run(id)
      }
    })
    tx(removableIds)
  }

  return {
    providerId: normalizedProviderId,
    scannedCount: profiles.length,
    deletedCount: removableIds.length,
    invalidDeletedCount,
    expiredUnusedDeletedCount,
  }
}

export function summarizeProviderBudgetProfiles({
  providerId = '',
  nowMs = now(),
} = {}) {
  const normalizedProviderId = normalizeLowerId(providerId)
  const profiles = listProviderBudgetProfiles({ providerId: normalizedProviderId })
  let activeCount = 0
  let staleCount = 0
  let expiredCount = 0
  let pruneEligibleCount = 0
  let invalidCount = 0
  let manualOverrideCount = 0
  let lastObservedAt = 0
  let lastResolvedAt = 0

  for (const profile of profiles) {
    const lifecycle = getProviderBudgetProfileLifecycle(profile, { nowMs })
    if (lifecycle.invalid) {
      invalidCount += 1
    } else if (lifecycle.expired) {
      expiredCount += 1
    } else if (lifecycle.stale) {
      staleCount += 1
    } else {
      activeCount += 1
    }
    if (lifecycle.pruneEligible) pruneEligibleCount += 1
    if (lifecycle.manualOverridePresent) manualOverrideCount += 1
    lastObservedAt = Math.max(lastObservedAt, lifecycle.observationTimestamp)
    lastResolvedAt = Math.max(lastResolvedAt, normalizePositiveInt(profile?.lastResolvedAt))
  }

  return {
    providerId: normalizedProviderId,
    totalCount: profiles.length,
    activeCount,
    staleCount,
    expiredCount,
    pruneEligibleCount,
    invalidCount,
    manualOverrideCount,
    lastObservedAt,
    lastResolvedAt,
  }
}

export function upsertProviderBudgetObservation(observation = {}) {
  const providerId = normalizeLowerId(observation.providerId)
  const organizationId = normalizeId(observation.organizationId)
  const workspaceId = normalizeId(observation.workspaceId)
  const credentialFingerprint = normalizeId(observation.credentialFingerprint)
  if (!providerId || !credentialFingerprint) {
    throw new Error('Provider budget observation requires providerId and credentialFingerprint.')
  }

  const existing = getProviderBudgetProfile({
    providerId,
    organizationId,
    workspaceId,
    credentialFingerprint,
  })
  const observedAt = normalizePositiveInt(observation.observedAt) || now()
  const nextObservationCount = normalizePositiveInt(existing?.observationCount) + 1
  const createdAt = normalizePositiveInt(existing?.firstObservedAt) || observedAt
  const id = normalizeId(existing?.id) || buildProviderBudgetProfileId({
    providerId,
    organizationId,
    workspaceId,
    credentialFingerprint,
  })
  const profileSource = normalizeLowerId(existing?.profileSource) === 'manual_override'
    ? 'manual_override'
    : 'observed_headers'
  const confidence = resolveConfidence(existing, nextObservationCount)
  const lastObservationSource = normalizeLowerId(observation.observationSource)
  const manualOverrideJson = stringifyJson(existing?.manualOverride || {})

  getDb().prepare(`
    INSERT INTO provider_budget_profiles (
      id,
      provider_id,
      organization_id,
      workspace_id,
      credential_fingerprint,
      profile_source,
      input_tpm_limit,
      output_tpm_limit,
      requests_per_minute_limit,
      retry_after_seconds,
      confidence,
      observation_count,
      first_observed_at,
      last_observed_at,
      last_success_observed_at,
      last_rate_limit_observed_at,
      last_observation_source,
      last_model_id,
      last_response_headers_json,
      manual_override_json,
      last_resolved_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      profile_source = excluded.profile_source,
      input_tpm_limit = excluded.input_tpm_limit,
      output_tpm_limit = excluded.output_tpm_limit,
      requests_per_minute_limit = excluded.requests_per_minute_limit,
      retry_after_seconds = excluded.retry_after_seconds,
      confidence = excluded.confidence,
      observation_count = excluded.observation_count,
      first_observed_at = excluded.first_observed_at,
      last_observed_at = excluded.last_observed_at,
      last_success_observed_at = excluded.last_success_observed_at,
      last_rate_limit_observed_at = excluded.last_rate_limit_observed_at,
      last_observation_source = excluded.last_observation_source,
      last_model_id = excluded.last_model_id,
      last_response_headers_json = excluded.last_response_headers_json,
      manual_override_json = excluded.manual_override_json,
      last_resolved_at = excluded.last_resolved_at,
      updated_at = excluded.updated_at
  `).run(
    id,
    providerId,
    organizationId,
    workspaceId,
    credentialFingerprint,
    profileSource,
    mergeObservedLimit(existing?.inputTpmLimit, observation.inputTpmLimit),
    mergeObservedLimit(existing?.outputTpmLimit, observation.outputTpmLimit),
    mergeObservedLimit(existing?.requestsPerMinuteLimit, observation.requestsPerMinuteLimit),
    mergeObservedLimit(existing?.retryAfterSeconds, observation.retryAfterSeconds),
    confidence,
    nextObservationCount,
    createdAt,
    Math.max(observedAt, normalizePositiveInt(existing?.lastObservedAt)),
    lastObservationSource === 'success_response'
      ? observedAt
      : normalizePositiveInt(existing?.lastSuccessObservedAt),
    lastObservationSource === 'rate_limit_error'
      ? observedAt
      : normalizePositiveInt(existing?.lastRateLimitObservedAt),
    lastObservationSource,
    normalizeId(observation.modelId),
    stringifyJson(observation.rawHeaders),
    manualOverrideJson,
    normalizePositiveInt(existing?.lastResolvedAt),
    createdAt,
    observedAt,
  )

  try {
    cleanupProviderBudgetProfiles({ providerId, nowMs: observedAt })
  } catch (cleanupError) {
    console.warn('[provider-budget-observation-cleanup]', {
      providerId,
      error: String(cleanupError?.message || cleanupError || '').trim(),
    })
  }

  return getProviderBudgetProfile({
    providerId,
    organizationId,
    workspaceId,
    credentialFingerprint,
  })
}

export function resetProviderBudgetProfiles({
  providerId = '',
  organizationId = '',
  workspaceId = '',
  credentialFingerprint = '',
} = {}) {
  const normalizedProviderId = normalizeLowerId(providerId)
  const normalizedOrganizationId = normalizeId(organizationId)
  const normalizedWorkspaceId = normalizeId(workspaceId)
  const normalizedCredentialFingerprint = normalizeId(credentialFingerprint)
  const where = []
  const values = []

  if (normalizedProviderId) {
    where.push('provider_id = ?')
    values.push(normalizedProviderId)
  }
  if (normalizedOrganizationId) {
    where.push('organization_id = ?')
    values.push(normalizedOrganizationId)
  }
  if (normalizedWorkspaceId) {
    where.push('workspace_id = ?')
    values.push(normalizedWorkspaceId)
  }
  if (normalizedCredentialFingerprint) {
    where.push('credential_fingerprint = ?')
    values.push(normalizedCredentialFingerprint)
  }

  const result = where.length > 0
    ? getDb().prepare(`DELETE FROM provider_budget_profiles WHERE ${where.join(' AND ')}`).run(...values)
    : getDb().prepare('DELETE FROM provider_budget_profiles').run()
  return normalizePositiveInt(result?.changes)
}

export function clearAllProviderBudgetProfiles() {
  return resetProviderBudgetProfiles()
}
