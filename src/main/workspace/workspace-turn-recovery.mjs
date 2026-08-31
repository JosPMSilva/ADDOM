const LIFECYCLE_KINDS = Object.freeze([
  'turn_started',
  'turn_completed',
  'turn_cancelled',
  'turn_interrupted',
])

function normalizeId(value = '') {
  return String(value || '').trim()
}

function isRestartRecoverableJob(job = null) {
  if (!job || typeof job !== 'object') return false
  const summary = job.resultSummary && typeof job.resultSummary === 'object'
    ? job.resultSummary
    : {}
  const authMethod = normalizeId(summary.runtimeAuthMethod).toLowerCase()
  const transportMode = normalizeId(summary.transportMode || job.transportMode).toLowerCase()
  return Boolean(normalizeId(job.remoteResponseId))
    && authMethod !== 'account'
    && transportMode !== 'codex_app_server_chatgpt_background'
}

function buildJobKey(projectId = '', threadId = '', turnId = '') {
  const parts = [projectId, threadId, turnId].map(normalizeId)
  return parts.every(Boolean) ? parts.join('\u0000') : ''
}

function listLatestLifecycleRows(db) {
  const placeholders = LIFECYCLE_KINDS.map(() => '?').join(', ')
  return db.prepare(`
    WITH ranked_lifecycle AS (
      SELECT
        threads.project_id,
        events.thread_id,
        events.turn_id,
        events.kind,
        ROW_NUMBER() OVER (
          PARTITION BY events.thread_id, events.turn_id
          ORDER BY events.event_id DESC
        ) AS lifecycle_rank
      FROM chat_events AS events
      INNER JOIN chat_threads AS threads ON threads.id = events.thread_id
      WHERE events.kind IN (${placeholders})
        AND TRIM(events.turn_id) <> ''
    )
    SELECT project_id, thread_id, turn_id, kind
    FROM ranked_lifecycle
    WHERE lifecycle_rank = 1
  `).all(...LIFECYCLE_KINDS)
}

export async function reconcileInterruptedWorkspaceTurns({
  db,
  appendEvent,
  listRecoverableJobs,
  now = Date.now,
} = {}) {
  if (!db?.prepare) throw new Error('A workspace database is required.')
  if (typeof appendEvent !== 'function') throw new Error('appendEvent is required.')

  const rows = listLatestLifecycleRows(db)
  const jobs = typeof listRecoverableJobs === 'function'
    ? await listRecoverableJobs()
    : []
  const recoverableKeys = new Set(
    (Array.isArray(jobs) ? jobs : [])
      .filter(isRestartRecoverableJob)
      .map((job) => buildJobKey(
        job.projectId,
        job.threadId,
        job.resultSummary?.turnId,
      ))
      .filter(Boolean),
  )
  const result = {
    inspected: 0,
    interrupted: 0,
    skippedRecoverable: 0,
    alreadyTerminal: 0,
  }

  for (const row of Array.isArray(rows) ? rows : []) {
    result.inspected += 1
    const kind = normalizeId(row?.kind).toLowerCase()
    if (kind !== 'turn_started') {
      result.alreadyTerminal += 1
      continue
    }

    const jobKey = buildJobKey(row?.project_id, row?.thread_id, row?.turn_id)
    if (jobKey && recoverableKeys.has(jobKey)) {
      result.skippedRecoverable += 1
      continue
    }

    await appendEvent(normalizeId(row?.thread_id), {
      turnId: normalizeId(row?.turn_id),
      kind: 'turn_interrupted',
      role: 'system',
      content: 'The app closed before this turn completed.',
      meta: {
        status: 'interrupted',
        reason: 'application_restart_recovery',
      },
      createdAt: Number(now()) || Date.now(),
    })
    result.interrupted += 1
  }

  return result
}
