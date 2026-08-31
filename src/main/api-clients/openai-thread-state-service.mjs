import crypto from 'node:crypto'
import { getDb } from '../memory/db.mjs'

function now() {
  return Date.now()
}

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeJson(value = {}) {
  try {
    return JSON.stringify(value && typeof value === 'object' ? value : {})
  } catch {
    return '{}'
  }
}

function parseJson(value = '{}') {
  try {
    const parsed = JSON.parse(String(value || '{}'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function normalizePendingProviderTruncationResume(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const compactionIds = Array.isArray(value.compactionIds)
    ? value.compactionIds
      .map((entry) => normalizeId(entry))
      .filter(Boolean)
      .slice(0, 12)
    : []
  const detectedAt = Number(value.detectedAt || 0) || 0
  const normalized = {
    eventType: normalizeId(value.eventType) || 'provider_truncation',
    eventPhase: normalizeId(value.eventPhase) || 'resumed_after',
    source: normalizeId(value.source) || 'provider',
    confidence: normalizeId(value.confidence) || 'explicit',
    providerId: normalizeId(value.providerId) || 'openai',
    turnId: normalizeId(value.turnId),
    responseId: normalizeId(value.responseId),
    compactionIds,
    ...(detectedAt > 0 ? { detectedAt } : {}),
  }
  return normalized
}

function normalizeLatestCodexThreadCompaction(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const compactionIds = Array.isArray(value.compactionIds)
    ? value.compactionIds
      .map((entry) => normalizeId(entry))
      .filter(Boolean)
      .slice(0, 12)
    : []
  const detectedAt = Number(value.detectedAt || 0) || 0
  const normalized = {
    eventType: normalizeId(value.eventType) || 'codex_thread_compaction',
    eventPhase: normalizeId(value.eventPhase) || 'applied',
    source: normalizeId(value.source) || 'provider',
    confidence: normalizeId(value.confidence) || 'explicit',
    providerId: normalizeId(value.providerId) || 'openai',
    turnId: normalizeId(value.turnId),
    responseId: normalizeId(value.responseId),
    compactionIds,
    ...(detectedAt > 0 ? { detectedAt } : {}),
  }
  return normalized
}

function mapThreadStateRow(row = null) {
  if (!row || typeof row !== 'object') return null
  return {
    threadId: normalizeId(row.thread_id),
    projectId: normalizeId(row.project_id),
    providerId: normalizeId(row.provider_id) || 'openai',
    model: normalizeId(row.model),
    lastResponseId: normalizeId(row.last_response_id),
    conversationId: normalizeId(row.conversation_id),
    storeEnabled: Number(row.store_enabled || 0) === 1,
    toolsetHash: normalizeId(row.toolset_hash),
    systemPromptHash: normalizeId(row.system_prompt_hash),
    continuitySignature: normalizeId(row.continuity_signature),
    lastCompactionId: normalizeId(row.last_compaction_id),
    chainValid: Number(row.chain_valid || 0) === 1,
    chainInvalidReason: normalizeId(row.chain_invalid_reason),
    continuityEpoch: Math.max(1, Number(row.continuity_epoch || 1) || 1),
    continuityReducerVersion: normalizeId(row.continuity_reducer_version),
    modeSignature: normalizeId(row.mode_signature),
    modelSignature: normalizeId(row.model_signature),
    metadata: parseJson(row.metadata_json),
    createdAt: Number(row.created_at || 0) || 0,
    updatedAt: Number(row.updated_at || 0) || 0,
    lastUsedAt: Number(row.last_used_at || 0) || 0,
  }
}

export function getOpenAIThreadState(threadId = '') {
  const normalizedThreadId = normalizeId(threadId)
  if (!normalizedThreadId) return null
  const db = getDb()
  const row = db.prepare(`
    SELECT
      thread_id,
      project_id,
      provider_id,
      model,
      last_response_id,
      conversation_id,
      store_enabled,
      toolset_hash,
      system_prompt_hash,
      continuity_signature,
      last_compaction_id,
      chain_valid,
      chain_invalid_reason,
      continuity_epoch,
      continuity_reducer_version,
      mode_signature,
      model_signature,
      metadata_json,
      created_at,
      updated_at,
      last_used_at
    FROM openai_thread_state
    WHERE thread_id = ?
  `).get(normalizedThreadId)
  return mapThreadStateRow(row)
}

export function upsertOpenAIThreadState({
  threadId = '',
  projectId = '',
  providerId = 'openai',
  model = '',
  lastResponseId = '',
  conversationId = '',
  storeEnabled = false,
  toolsetHash = '',
  systemPromptHash = '',
  continuitySignature = '',
  lastCompactionId = '',
  chainValid = true,
  chainInvalidReason = '',
  continuityEpoch = 1,
  continuityReducerVersion = '',
  modeSignature = '',
  modelSignature = '',
  metadata = {},
} = {}) {
  const normalizedThreadId = normalizeId(threadId)
  if (!normalizedThreadId) {
    throw new Error('threadId is required')
  }
  const timestamp = now()
  const db = getDb()
  const existing = getOpenAIThreadState(normalizedThreadId)
  const createdAt = existing?.createdAt || timestamp
  const effectiveToolsetHash = normalizeId(toolsetHash)
    || existing?.toolsetHash
    || crypto.createHash('sha256').update('[]').digest('hex').slice(0, 16)
  const effectiveSystemPromptHash = normalizeId(systemPromptHash)
    || existing?.systemPromptHash
    || crypto.createHash('sha256').update('').digest('hex').slice(0, 16)

  db.prepare(`
    INSERT INTO openai_thread_state (
      thread_id,
      project_id,
      provider_id,
      model,
      last_response_id,
      conversation_id,
      store_enabled,
      toolset_hash,
      system_prompt_hash,
      continuity_signature,
      last_compaction_id,
      chain_valid,
      chain_invalid_reason,
      continuity_epoch,
      continuity_reducer_version,
      mode_signature,
      model_signature,
      metadata_json,
      created_at,
      updated_at,
      last_used_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET
      project_id = excluded.project_id,
      provider_id = excluded.provider_id,
      model = excluded.model,
      last_response_id = excluded.last_response_id,
      conversation_id = excluded.conversation_id,
      store_enabled = excluded.store_enabled,
      toolset_hash = excluded.toolset_hash,
      system_prompt_hash = excluded.system_prompt_hash,
      continuity_signature = excluded.continuity_signature,
      last_compaction_id = excluded.last_compaction_id,
      chain_valid = excluded.chain_valid,
      chain_invalid_reason = excluded.chain_invalid_reason,
      continuity_epoch = excluded.continuity_epoch,
      continuity_reducer_version = excluded.continuity_reducer_version,
      mode_signature = excluded.mode_signature,
      model_signature = excluded.model_signature,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at,
      last_used_at = excluded.last_used_at
  `).run(
    normalizedThreadId,
    normalizeId(projectId),
    normalizeId(providerId) || 'openai',
    normalizeId(model),
    normalizeId(lastResponseId),
    normalizeId(conversationId),
    storeEnabled === true ? 1 : 0,
    effectiveToolsetHash,
    effectiveSystemPromptHash,
    normalizeId(continuitySignature),
    normalizeId(lastCompactionId),
    chainValid === false ? 0 : 1,
    normalizeId(chainInvalidReason),
    Math.max(1, Number(continuityEpoch || existing?.continuityEpoch || 1) || 1),
    normalizeId(continuityReducerVersion) || normalizeId(existing?.continuityReducerVersion),
    normalizeId(modeSignature) || normalizeId(existing?.modeSignature),
    normalizeId(modelSignature) || normalizeId(existing?.modelSignature),
    normalizeJson(metadata),
    createdAt,
    timestamp,
    timestamp,
  )

  return {
    ...getOpenAIThreadState(normalizedThreadId),
    metadata: parseJson(normalizeJson(metadata)),
  }
}

export function invalidateOpenAIThreadState(threadId = '', reason = 'chain_invalidated') {
  const normalizedThreadId = normalizeId(threadId)
  if (!normalizedThreadId) return null
  const db = getDb()
  db.prepare(`
    UPDATE openai_thread_state
    SET chain_valid = 0,
        chain_invalid_reason = ?,
        updated_at = ?,
        last_used_at = ?
    WHERE thread_id = ?
  `).run(normalizeId(reason), now(), now(), normalizedThreadId)
  return getOpenAIThreadState(normalizedThreadId)
}

export function clearOpenAIThreadStateForThread(threadId = '') {
  const normalizedThreadId = normalizeId(threadId)
  if (!normalizedThreadId) return false
  const db = getDb()
  const result = db.prepare('DELETE FROM openai_thread_state WHERE thread_id = ?').run(normalizedThreadId)
  return Number(result?.changes || 0) > 0
}

export function clearOpenAIThreadStateForProject(projectId = '') {
  const normalizedProjectId = normalizeId(projectId)
  if (!normalizedProjectId) return 0
  const db = getDb()
  const result = db.prepare('DELETE FROM openai_thread_state WHERE project_id = ?').run(normalizedProjectId)
  return Number(result?.changes || 0) > 0
}

export function clearAllOpenAIThreadState() {
  const db = getDb()
  const result = db.prepare('DELETE FROM openai_thread_state').run()
  return Number(result?.changes || 0) > 0
}

export function resolveOpenAIThreadContinuation({
  threadId = '',
  model = '',
  toolsetHash = '',
  systemPromptHash = '',
  continuitySignature = '',
  continuityEpoch = 1,
  continuityReducerVersion = '',
  modeSignature = '',
  modelSignature = '',
  usePreviousResponseId = true,
  useConversationState = false,
} = {}) {
  const normalizedThreadId = normalizeId(threadId)
  if (!normalizedThreadId) {
    return {
      state: null,
      chainValid: false,
      invalidReason: 'missing_thread_id',
      previousResponseId: '',
      conversationId: '',
    }
  }

  const state = getOpenAIThreadState(normalizedThreadId)
  if (!state) {
    return {
      state: null,
      chainValid: false,
      invalidReason: 'missing_state',
      previousResponseId: '',
      conversationId: '',
    }
  }

  const normalizedModel = normalizeId(model)
  const normalizedToolsetHash = normalizeId(toolsetHash)
  const normalizedSystemPromptHash = normalizeId(systemPromptHash)
  const normalizedContinuitySignature = normalizeId(continuitySignature)
  const normalizedContinuityEpoch = Math.max(1, Number(continuityEpoch || 1) || 1)
  const normalizedContinuityReducerVersion = normalizeId(continuityReducerVersion)
  const normalizedModeSignature = normalizeId(modeSignature)
  const normalizedModelSignature = normalizeId(modelSignature)
  let invalidReason = ''

  if (state.chainValid !== true) {
    invalidReason = normalizeId(state.chainInvalidReason) || 'chain_invalid'
  } else if (normalizedModel && normalizeId(state.model) && normalizeId(state.model) !== normalizedModel) {
    invalidReason = 'model_changed'
  } else if (normalizedToolsetHash && normalizeId(state.toolsetHash) && normalizeId(state.toolsetHash) !== normalizedToolsetHash) {
    invalidReason = 'toolset_changed'
  } else if (
    normalizedSystemPromptHash
    && normalizeId(state.systemPromptHash)
    && normalizeId(state.systemPromptHash) !== normalizedSystemPromptHash
  ) {
    invalidReason = 'system_prompt_changed'
  } else if (
    normalizedContinuitySignature
    && normalizeId(state.continuitySignature)
    && normalizeId(state.continuitySignature) !== normalizedContinuitySignature
  ) {
    invalidReason = 'continuity_signature_changed'
  } else if (
    normalizedContinuityEpoch
    && Math.max(1, Number(state.continuityEpoch || 1) || 1) !== normalizedContinuityEpoch
  ) {
    invalidReason = 'continuity_epoch_changed'
  } else if (
    normalizedContinuityReducerVersion
    && normalizeId(state.continuityReducerVersion)
    && normalizeId(state.continuityReducerVersion) !== normalizedContinuityReducerVersion
  ) {
    invalidReason = 'continuity_reducer_changed'
  } else if (
    normalizedModeSignature
    && normalizeId(state.modeSignature)
    && normalizeId(state.modeSignature) !== normalizedModeSignature
  ) {
    invalidReason = 'mode_signature_changed'
  } else if (
    normalizedModelSignature
    && normalizeId(state.modelSignature)
    && normalizeId(state.modelSignature) !== normalizedModelSignature
  ) {
    invalidReason = 'model_signature_changed'
  }

  if (invalidReason) {
    invalidateOpenAIThreadState(normalizedThreadId, invalidReason)
    return {
      state: getOpenAIThreadState(normalizedThreadId),
      chainValid: false,
      invalidReason,
      previousResponseId: '',
      conversationId: '',
    }
  }

  return {
    state,
    chainValid: true,
    invalidReason: '',
    previousResponseId: usePreviousResponseId === true ? normalizeId(state.lastResponseId) : '',
    conversationId: useConversationState === true ? normalizeId(state.conversationId) : '',
    manualCompactedWindow: Array.isArray(state?.metadata?.pendingManualCompactedWindow)
      ? state.metadata.pendingManualCompactedWindow
      : [],
    resetChainFromCompactedWindow: state?.metadata?.resetChainFromCompaction === true,
    pendingProviderTruncationResume: normalizePendingProviderTruncationResume(
      state?.metadata?.pendingProviderTruncationResume,
    ),
    accountBridgeThreadId: normalizeId(state?.metadata?.accountBridgeThreadId),
    accountBridgeProjectFolder: normalizeId(state?.metadata?.accountBridgeProjectFolder),
    accountDynamicToolSignature: normalizeId(state?.metadata?.accountDynamicToolSignature),
    accountDelegationBackend: normalizeId(state?.metadata?.accountDelegationBackend).toLowerCase(),
    accountCollaborationModeId: normalizeId(state?.metadata?.accountCollaborationModeId),
    accountContextCompactionGeneration: Math.max(0, Number(state?.metadata?.accountContextCompactionGeneration || 0) || 0),
    continuityEpoch: Math.max(1, Number(state?.continuityEpoch || 1) || 1),
    continuityReducerVersion: normalizeId(state?.continuityReducerVersion),
    modeSignature: normalizeId(state?.modeSignature),
    modelSignature: normalizeId(state?.modelSignature),
    latestCodexThreadCompaction: normalizeLatestCodexThreadCompaction(
      state?.metadata?.latestCodexThreadCompaction,
    ),
  }
}
