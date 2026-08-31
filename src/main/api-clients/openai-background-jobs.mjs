import {
  awaitOpenAIBackgroundResponse,
  cancelOpenAIBackgroundResponse,
  buildOpenAIBackgroundClientForResume,
  startOpenAIBackgroundResponse,
} from './openai-background-runtime.mjs'
import {
  finalizeOpenAIBackgroundJob,
  getOpenAIBackgroundJob,
  listOpenAIBackgroundJobsForUi,
  listRecoverableOpenAIBackgroundJobs,
  markOpenAIBackgroundJobCancelRequested,
  markOpenAIBackgroundJobPolled,
  pruneStaleOpenAIBackgroundJobs,
  upsertOpenAIBackgroundJob,
} from './openai-background-job-store.mjs'

const MAX_BACKGROUND_JOB_RETENTION = 200
const BACKGROUND_JOB_GRACE_MS = 120_000
const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed', 'cancelled', 'orphaned', 'stopped'])

const backgroundJobs = new Map()
let backgroundJobSeq = 1

function now() {
  return Date.now()
}

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizeStatus(value = '') {
  return normalizeId(value).toLowerCase()
}

function isTerminalStatus(value = '') {
  return TERMINAL_JOB_STATUSES.has(normalizeStatus(value))
}

function isAccountBackgroundJobRecord(record = null) {
  return normalizeId(record?.resultSummary?.runtimeAuthMethod).toLowerCase() === 'account'
    || normalizeId(record?.resultSummary?.transportMode).toLowerCase() === 'codex_app_server_chatgpt_background'
}

function buildJobView(job = null) {
  if (!job) return null
  return {
    id: job.id,
    kind: 'openai_response',
    status: normalizeStatus(job.status) || 'queued',
    providerId: 'openai',
    model: normalizeId(job.model),
    projectRoot: normalizeId(job.projectRoot),
    projectId: normalizeId(job.projectId),
    threadId: normalizeId(job.threadId),
    turnId: normalizeId(job.turnId),
    messageId: normalizeId(job.messageId),
    responseId: normalizeId(job.responseId),
    conversationId: normalizeId(job.conversationId),
    startedAt: Number(job.startedAt || 0) || 0,
    stoppedAt: Number(job.stoppedAt || 0) || null,
    promptPreview: normalizeId(job.promptPreview),
    errorMessage: normalizeId(job.errorMessage),
  }
}

function trimPromptPreview(messages = []) {
  const rows = Array.isArray(messages) ? messages : []
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const message = rows[index]
    const role = normalizeId(message?.role).toLowerCase()
    if (role !== 'user') continue
    const content = Array.isArray(message?.content)
      ? message.content
        .map((part) => String(part?.text || '').trim())
        .filter(Boolean)
        .join(' ')
      : String(message?.content || '').trim()
    if (content) return content.slice(0, 240)
  }
  return ''
}

function finalizeBackgroundJob(jobId, patch = {}) {
  const current = backgroundJobs.get(jobId)
  if (!current) return null
  const next = {
    ...current,
    ...patch,
    status: normalizeStatus(patch.status || current.status || 'completed') || 'completed',
    stoppedAt: Number(patch.stoppedAt || current.stoppedAt || now()) || now(),
  }
  backgroundJobs.set(jobId, next)
  const cleanupTimer = setTimeout(() => {
    const latest = backgroundJobs.get(jobId)
    if (!latest || !isTerminalStatus(latest.status)) return
    backgroundJobs.delete(jobId)
  }, BACKGROUND_JOB_GRACE_MS)
  cleanupTimer.unref?.()
  return next
}

function pruneRetainedJobs() {
  if (backgroundJobs.size <= MAX_BACKGROUND_JOB_RETENTION) return
  const stale = [...backgroundJobs.values()]
    .filter((job) => isTerminalStatus(job.status))
    .sort((a, b) => (Number(a.stoppedAt || a.startedAt || 0) || 0) - (Number(b.stoppedAt || b.startedAt || 0) || 0))
  const toDrop = backgroundJobs.size - MAX_BACKGROUND_JOB_RETENTION
  stale.slice(0, toDrop).forEach((job) => backgroundJobs.delete(job.id))
}

export function listOpenAIBackgroundJobs({ projectRoot = '' } = {}) {
  const root = normalizeId(projectRoot)
  const persistedRows = listOpenAIBackgroundJobsForUi({ projectRoot: root })
  const mergedById = new Map()

  for (const row of persistedRows) {
    mergedById.set(row.id, {
      id: row.id,
      kind: 'openai_response',
      status: row.status,
      model: row.model,
      projectRoot: root,
      projectId: row.projectId,
      threadId: row.threadId,
      turnId: normalizeId(row.resultSummary?.turnId),
      messageId: row.assistantMessageId,
      responseId: row.remoteResponseId,
      conversationId: row.conversationId,
      startedAt: row.createdAt,
      stoppedAt: row.completedAt || null,
      promptPreview: normalizeId(row.resultSummary?.promptPreview),
      errorMessage: row.errorMessage,
    })
  }

  for (const job of backgroundJobs.values()) {
    if (root && normalizeId(job.projectRoot) !== root) continue
    mergedById.set(job.id, job)
  }

  return [...mergedById.values()]
    .sort((a, b) => {
      const updatedA = Number(a.stoppedAt || a.startedAt || 0) || 0
      const updatedB = Number(b.stoppedAt || b.startedAt || 0) || 0
      return updatedB - updatedA
    })
    .map(buildJobView)
}

async function registerRuntimeJob({
  id = '',
  client = null,
  response = null,
  providerResponseMeta = {},
  modelId = '',
  projectRoot = '',
  projectId = '',
  threadId = '',
  turnId = '',
  messageId = '',
  messages = [],
  onQueued = null,
  onCompleted = null,
  onFailed = null,
  existingRecord = null,
} = {}) {
  const normalizedMessageId = normalizeId(messageId)
  if (!normalizedMessageId) {
    throw new Error('OpenAI background job requires a messageId.')
  }
  const responseId = normalizeId(providerResponseMeta?.responseId || response?.id || existingRecord?.remoteResponseId)
  const conversationId = normalizeId(providerResponseMeta?.conversationId || existingRecord?.conversationId)
  const normalizedId = normalizeId(id) || `oaibg-${Date.now()}-${backgroundJobSeq++}`
  const abortController = new AbortController()
  const startedAt = Number(existingRecord?.createdAt || now()) || now()
  const job = {
    id: normalizedId,
    kind: 'openai_response',
    status: normalizeStatus(providerResponseMeta?.status || existingRecord?.status) || 'queued',
    client,
    responseId,
    conversationId,
    model: normalizeId(modelId || existingRecord?.model),
    projectRoot: normalizeId(projectRoot),
    projectId: normalizeId(projectId || existingRecord?.projectId),
    threadId: normalizeId(threadId || existingRecord?.threadId),
    turnId: normalizeId(turnId || existingRecord?.resultSummary?.turnId),
    messageId: normalizedMessageId,
    promptPreview: trimPromptPreview(messages) || normalizeId(existingRecord?.resultSummary?.promptPreview),
    startedAt,
    stoppedAt: null,
    errorMessage: normalizeId(existingRecord?.errorMessage),
    abortController,
    promise: null,
  }
  backgroundJobs.set(normalizedId, job)
  pruneRetainedJobs()

  const promise = (async () => {
    try {
      const payload = await awaitOpenAIBackgroundResponse({
        client,
        response,
        abortSignal: abortController.signal,
      })
      const finalized = finalizeBackgroundJob(normalizedId, {
        status: normalizeStatus(payload?.providerResponseMeta?.status) || 'completed',
        responseId: normalizeId(payload?.providerResponseMeta?.responseId || job.responseId),
        conversationId: normalizeId(payload?.providerResponseMeta?.conversationId || job.conversationId),
      })
      finalizeOpenAIBackgroundJob(normalizedId, {
        status: normalizeStatus(payload?.providerResponseMeta?.status) || 'completed',
        remoteResponseId: normalizeId(payload?.providerResponseMeta?.responseId || job.responseId),
        conversationId: normalizeId(payload?.providerResponseMeta?.conversationId || job.conversationId),
        errorCode: '',
        errorMessage: '',
        resultSummary: {
          turnId: job.turnId,
          promptPreview: job.promptPreview,
          stopReason: normalizeId(payload?.stopReason),
          usage: payload?.usage || null,
        },
      })
      if (typeof onCompleted === 'function') {
        await onCompleted({
          job: buildJobView(finalized || job),
          payload,
        })
      }
      return payload
    } catch (error) {
      const cancelled = abortController.signal.aborted
        || normalizeStatus(error?.name) === 'aborterror'
        || String(error?.code || '').toUpperCase() === 'ABORT_ERR'
      const message = String(error?.message || (cancelled
        ? 'OpenAI background response was cancelled.'
        : 'OpenAI background response failed.'))
      const finalized = finalizeBackgroundJob(normalizedId, {
        status: cancelled ? 'cancelled' : 'failed',
        errorMessage: message,
      })
      finalizeOpenAIBackgroundJob(normalizedId, {
        status: cancelled ? 'cancelled' : 'failed',
        errorCode: cancelled ? 'cancelled' : normalizeId(error?.code || 'background_failed'),
        errorMessage: message,
        resultSummary: {
          turnId: job.turnId,
          promptPreview: job.promptPreview,
        },
      })
      if (typeof onFailed === 'function') {
        await onFailed({
          job: buildJobView(finalized || job),
          error,
          cancelled,
          message,
        })
      }
      throw error
    } finally {
      pruneStaleOpenAIBackgroundJobs()
    }
  })()

  job.promise = promise
  backgroundJobs.set(normalizedId, job)

  if (typeof onQueued === 'function') {
    await onQueued({
      job: buildJobView(job),
      providerResponseMeta,
    })
  }

  return {
    job: buildJobView(job),
    providerResponseMeta,
    promise,
  }
}

export async function createOpenAIBackgroundJob({
  apiKey = '',
  modelId = '',
  messages = [],
  runtimeSettings = null,
  openaiOptions = {},
  projectRoot = '',
  projectId = '',
  threadId = '',
  turnId = '',
  messageId = '',
  requestContextUsed = null,
  onQueued = null,
  onCompleted = null,
  onFailed = null,
} = {}) {
  const normalizedMessageId = normalizeId(messageId)
  if (!normalizedMessageId) {
    throw new Error('OpenAI background job requires a messageId.')
  }

  const { client, response, providerResponseMeta } = await startOpenAIBackgroundResponse({
    apiKey,
    modelId,
    messages,
    runtimeSettings,
    openaiOptions,
    requestContext: {
      projectId,
      threadId,
    },
  })
  const id = `oaibg-${Date.now()}-${backgroundJobSeq++}`
  upsertOpenAIBackgroundJob({
    id,
    providerId: 'openai',
    projectId,
    threadId,
    assistantMessageId: normalizedMessageId,
    model: modelId,
    status: normalizeStatus(providerResponseMeta?.status) || 'queued',
    remoteResponseId: normalizeId(providerResponseMeta?.responseId || response?.id),
    conversationId: normalizeId(providerResponseMeta?.conversationId),
    toolsetHash: normalizeId(openaiOptions?.toolsetHash),
    systemPromptHash: normalizeId(openaiOptions?.systemPromptHash),
    continuitySignature: normalizeId(openaiOptions?.continuitySignature),
    storeEnabled: openaiOptions?.store === true,
    backgroundModeEnabled: true,
    resultSummary: {
      turnId: normalizeId(turnId),
      promptPreview: trimPromptPreview(messages),
      runtimeAuthMethod: normalizeId(providerResponseMeta?.authMethod) || 'api_key',
      transportMode: normalizeId(providerResponseMeta?.transportMode),
      ...(requestContextUsed && typeof requestContextUsed === 'object'
        ? { requestContextUsed }
        : {}),
    },
  })

  return registerRuntimeJob({
    id,
    client,
    response,
    providerResponseMeta,
    modelId,
    projectRoot,
    projectId,
    threadId,
    turnId,
    messageId: normalizedMessageId,
    messages,
    onQueued,
    onCompleted,
    onFailed,
    existingRecord: getOpenAIBackgroundJob(id),
  })
}

export async function stopOpenAIBackgroundJob(jobId, { reason = 'Stopped by user.' } = {}) {
  const id = normalizeId(jobId)
  if (!id) throw new Error('OpenAI background job id is required.')
  let job = backgroundJobs.get(id)
  if (!job) {
    const persisted = getOpenAIBackgroundJob(id)
    if (!persisted) throw new Error(`OpenAI background job not found: ${id}`)
    if (isTerminalStatus(persisted.status)) {
      return { stopped: false, alreadyStopped: true, job: buildJobView({
        id: persisted.id,
        kind: 'openai_response',
        status: persisted.status,
        model: persisted.model,
        projectId: persisted.projectId,
        threadId: persisted.threadId,
        messageId: persisted.assistantMessageId,
        responseId: persisted.remoteResponseId,
        conversationId: persisted.conversationId,
        startedAt: persisted.createdAt,
        stoppedAt: persisted.completedAt || null,
        promptPreview: normalizeId(persisted.resultSummary?.promptPreview),
        errorMessage: persisted.errorMessage,
      }) }
    }
    job = {
      id: persisted.id,
      kind: 'openai_response',
      status: persisted.status,
      client: buildOpenAIBackgroundClientForResume(),
      responseId: persisted.remoteResponseId,
      conversationId: persisted.conversationId,
      model: persisted.model,
      projectRoot: '',
      projectId: persisted.projectId,
      threadId: persisted.threadId,
      turnId: normalizeId(persisted.resultSummary?.turnId),
      messageId: persisted.assistantMessageId,
      promptPreview: normalizeId(persisted.resultSummary?.promptPreview),
      startedAt: persisted.createdAt,
      stoppedAt: persisted.completedAt || null,
      errorMessage: persisted.errorMessage,
      abortController: new AbortController(),
      promise: null,
    }
    backgroundJobs.set(id, job)
  }
  if (isTerminalStatus(job.status)) {
    return { stopped: false, alreadyStopped: true, job: buildJobView(job) }
  }

  job.status = 'cancel_requested'
  job.errorMessage = normalizeId(reason) || 'Stopped by user.'
  backgroundJobs.set(id, job)
  markOpenAIBackgroundJobCancelRequested(id)
  try {
    await cancelOpenAIBackgroundResponse(job.client, job.responseId)
  } catch {
    // Best-effort only.
  }
  try {
    job.abortController.abort()
  } catch {
    // Best-effort only.
  }

  return {
    stopped: true,
    alreadyStopped: false,
    job: buildJobView(backgroundJobs.get(id) || job),
  }
}

export async function resumePersistedOpenAIBackgroundJob(persistedJob = null, callbacks = {}) {
  const row = persistedJob && typeof persistedJob === 'object' ? persistedJob : null
  if (!row?.id || !row?.remoteResponseId) return null
  if (isAccountBackgroundJobRecord(row)) {
    finalizeOpenAIBackgroundJob(row.id, {
      status: 'failed',
      errorCode: 'account_background_recovery_unsupported',
      errorMessage: 'OpenAI account background jobs cannot be resumed after app restart yet.',
    })
    return null
  }
  if (backgroundJobs.has(row.id)) {
    const existing = backgroundJobs.get(row.id)
    return {
      job: buildJobView(existing),
      promise: existing?.promise || Promise.resolve(null),
      recovered: true,
    }
  }

  const client = buildOpenAIBackgroundClientForResume()
  const response = {
    id: row.remoteResponseId,
  }
  markOpenAIBackgroundJobPolled(row.id)
  return registerRuntimeJob({
    id: row.id,
    client,
    response,
    providerResponseMeta: {
      responseId: row.remoteResponseId,
      conversationId: row.conversationId,
      status: row.status,
    },
    modelId: row.model,
    projectId: row.projectId,
    threadId: row.threadId,
    turnId: normalizeId(row.resultSummary?.turnId),
    messageId: row.assistantMessageId,
    messages: [],
    onQueued: null,
    onCompleted: callbacks?.onCompleted || null,
    onFailed: callbacks?.onFailed || null,
    existingRecord: row,
  })
}

export async function recoverPersistedOpenAIBackgroundJobs(callbacks = {}) {
  const recovered = []
  for (const row of listRecoverableOpenAIBackgroundJobs()) {
    try {
      const result = await resumePersistedOpenAIBackgroundJob(row, callbacks)
      if (result) recovered.push(result)
    } catch {
      finalizeOpenAIBackgroundJob(row.id, {
        status: 'failed',
        errorCode: 'recovery_failed',
        errorMessage: 'Failed to resume OpenAI background job.',
      })
    }
  }
  return recovered
}

export async function stopAllOpenAIBackgroundJobs({ projectRoot = '', reason = 'Stopped by user.' } = {}) {
  const jobs = listOpenAIBackgroundJobs({ projectRoot })
  let stopped = 0
  for (const job of jobs) {
    try {
      const result = await stopOpenAIBackgroundJob(job.id, { reason })
      if (result?.stopped) stopped += 1
    } catch {
      // Best-effort across remaining jobs.
    }
  }
  return {
    requested: jobs.length,
    stopped,
  }
}

export function __resetOpenAIBackgroundJobsForTests() {
  for (const job of backgroundJobs.values()) {
    try {
      job?.abortController?.abort?.()
    } catch {
      // Best-effort only.
    }
  }
  backgroundJobs.clear()
  backgroundJobSeq = 1
}
