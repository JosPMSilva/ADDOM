function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(String(value || ''))
  } catch {
    return fallback
  }
}

function normalize(row) {
  if (!row) return null
  return {
    mergeId: row.merge_id,
    runId: row.run_id,
    artifactId: row.artifact_id,
    phase: row.phase,
    plan: parseJson(row.plan_json),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  }
}

export function createAgentMergeOperationJournal({ db, now = Date.now } = {}) {
  if (!db) throw new TypeError('Agent merge operation journal requires db')

  const prepareTransaction = db.transaction(({ entry, artifact, plan }) => {
    const timestamp = now()
    db.prepare(`
      INSERT INTO agent_merge_operations (
        merge_id, run_id, artifact_id, phase, plan_json, created_at, updated_at
      ) VALUES (?, ?, ?, 'prepared', ?, ?, ?)
    `).run(
      entry.id,
      entry.runId,
      artifact.id,
      JSON.stringify(plan),
      timestamp,
      timestamp,
    )
    db.prepare(`
      UPDATE agent_merge_queue
      SET status = 'applying', decision_json = '{}', updated_at = ?
      WHERE id = ?
    `).run(timestamp, entry.id)
  })

  function get(mergeId) {
    return normalize(db.prepare(`
      SELECT * FROM agent_merge_operations WHERE merge_id = ?
    `).get(String(mergeId || '').trim()))
  }

  function prepare({ entry, artifact, plan }) {
    const existing = get(entry.id)
    if (existing) return existing
    prepareTransaction({ entry, artifact, plan })
    return get(entry.id)
  }

  function setPhase(mergeId, phase) {
    db.prepare(`
      UPDATE agent_merge_operations
      SET phase = ?, updated_at = ?
      WHERE merge_id = ?
    `).run(String(phase || '').trim(), now(), String(mergeId || '').trim())
    return get(mergeId)
  }

  function listIncomplete() {
    return db.prepare(`
      SELECT * FROM agent_merge_operations
      WHERE phase != 'completed'
      ORDER BY created_at ASC, merge_id ASC
    `).all().map(normalize)
  }

  return Object.freeze({
    get,
    listIncomplete,
    prepare,
    setPhase,
  })
}
