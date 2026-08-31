import { createHash } from 'node:crypto'

import { validateAgentNode } from '../../common/agents/agent-node-contract.mjs'
import { resolveAgentPolicyProfile } from '../../common/agents/agent-policy-profile.mjs'
import { validateAgentRun } from '../../common/agents/agent-run-contract.mjs'

export const LEGACY_MOA_BACKUP_TABLE = 'moa_transactions_legacy_backup_v21'

function tableExists(db, tableName) {
  return !!db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(tableName)
}

function stableSuffix(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24)
}

function parseJson(raw, fallback) {
  try {
    const value = JSON.parse(String(raw || ''))
    return value ?? fallback
  } catch {
    return fallback
  }
}

function clip(value, maxLength = 600) {
  return String(value ?? '').trim().slice(0, maxLength)
}

function legacySummary(row) {
  const status = parseJson(row.status_summary, {})
  const tasks = parseJson(row.task_manifest, [])
  const outputs = parseJson(row.agent_outputs, [])
  const lines = [
    '## Imported legacy Agents record',
    '',
    'This root-only history entry preserves a pre-v21 delegation summary. '
      + 'The legacy record did not contain trustworthy recursive lineage, so no child agents were inferred.',
    '',
    `- Status: ${clip(status?.status || 'recorded', 80)}`,
    `- Delegation: ${clip(row.delegation_id || row.id, 160)}`,
    `- Tasks recorded: ${Array.isArray(tasks) ? tasks.length : 0}`,
    `- Agent outputs recorded: ${Array.isArray(outputs) ? outputs.length : 0}`,
  ]
  const summaries = (Array.isArray(outputs) ? outputs : [])
    .slice(0, 8)
    .map((output) => {
      const label = clip(output?.role || output?.agentRole || output?.roleId || 'Agent', 80)
      const conclusion = clip(
        output?.output || output?.summary || output?.error || output?.status,
        600,
      )
      return conclusion ? `- **${label}:** ${conclusion}` : ''
    })
    .filter(Boolean)
  if (summaries.length > 0) lines.push('', '### Preserved conclusions', '', ...summaries)
  if (Array.isArray(outputs) && outputs.length > summaries.length) {
    lines.push('', `_Additional legacy outputs preserved in ${LEGACY_MOA_BACKUP_TABLE}._`)
  }
  return lines.join('\n')
}

function opaqueCapabilities() {
  return {
    mode: 'provider_opaque',
    nativeAgents: false,
    recursiveAgents: false,
    childStreams: false,
    addressableChildren: false,
    childMessaging: false,
    childCancellation: false,
    childRetry: false,
    resumableChildren: false,
    perNodeUsage: false,
    approvalAttribution: false,
    workspaceIsolation: false,
    maxDepthHint: null,
    maxConcurrencyHint: null,
    visibilityReason: 'Imported from a legacy summary without recoverable agent lineage.',
    capabilityKey: 'provider_managed_partial_visibility',
  }
}

function convertRow(db, row) {
  const owner = db.prepare(`
    SELECT threads.project_id
    FROM chat_threads AS threads
    JOIN workspace_projects AS projects ON projects.id = threads.project_id
    WHERE threads.id = ?
  `).get(String(row.thread_id || ''))
  if (!owner?.project_id) return false

  const suffix = stableSuffix(row.id)
  const runId = `legacy_run_${suffix}`
  const rootNodeId = `legacy_agent_${suffix}`
  const eventId = `legacy_final_${suffix}`
  const createdAt = Math.max(0, Number(row.started_at || row.timestamp || 0))
  const finishedAt = Math.max(createdAt, Number(row.finished_at || row.timestamp || createdAt))
  const turnId = clip(row.turn_id, 256) || `legacy_turn_${suffix}`
  const summary = legacySummary(row)
  const policy = resolveAgentPolicyProfile('balanced')
  const run = validateAgentRun({
    schemaVersion: 1,
    id: runId,
    projectId: String(owner.project_id),
    threadId: String(row.thread_id),
    turnId,
    rootNodeId,
    status: 'completed',
    policyProfileId: 'balanced',
    createdAt,
    startedAt: createdAt,
    finishedAt,
    providerMix: ['legacy-import'],
    providerCapabilitySnapshots: [],
    activeNodeCount: 0,
    queuedNodeCount: 0,
    terminalNodeCount: 1,
    exclusiveUsage: null,
    inclusiveUsage: null,
    budgetSnapshot: policy.effectiveLimits,
    finalAuthorityNodeId: rootNodeId,
    completionReason: 'legacy_summary_imported',
    reconciliationStatus: 'matched',
  })
  const node = validateAgentNode({
    schemaVersion: 1,
    id: rootNodeId,
    runId,
    parentNodeId: null,
    rootNodeId,
    providerId: 'legacy-import',
    modelId: 'moa-transaction',
    providerAgentId: null,
    providerThreadId: null,
    roleId: 'root',
    roleLabel: 'Primary agent',
    taskId: `legacy_task_${suffix}`,
    taskSummary: 'Imported legacy delegation summary',
    depth: 0,
    branchPath: [rootNodeId],
    generation: 0,
    spawnedByEventId: null,
    spawnRequestId: null,
    status: 'completed',
    attemptId: null,
    capabilitySnapshot: opaqueCapabilities(),
    providerCapabilitySnapshot: null,
    permissionSnapshot: { level: 'read_only', toolClasses: ['read'] },
    workspaceId: null,
    workspaceMode: 'opaque_no_write_surface',
    createdAt,
    startedAt: createdAt,
    finishedAt,
    exclusiveUsage: null,
    inclusiveUsage: null,
    childCount: 0,
    resultSummary: clip(summary, 4_000),
    errorSummary: null,
  })
  const segment = {
    eventId,
    runId,
    nodeId: rootNodeId,
    attemptId: null,
    kind: 'agent_final_message',
    payload: { text: summary },
    runSequence: 1,
    nodeSequence: 1,
    createdAt: finishedAt,
  }
  const segmentJson = JSON.stringify(segment)
  const contentHash = createHash('sha256').update(segmentJson).digest('hex')

  db.prepare(`
    INSERT OR IGNORE INTO agent_runs (
      id, project_id, thread_id, turn_id, root_node_id, status, contract_json,
      last_run_sequence, recovery_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, '{}', ?, ?)
  `).run(
    run.id, run.projectId, run.threadId, run.turnId, run.rootNodeId, run.status,
    JSON.stringify(run), run.createdAt, run.finishedAt,
  )
  db.prepare(`
    INSERT OR IGNORE INTO agent_nodes (
      id, run_id, parent_node_id, status, provider_id, model_id, depth,
      contract_json, last_node_sequence, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, ?, 0, ?, 1, ?, ?)
  `).run(
    node.id, node.runId, node.status, node.providerId, node.modelId,
    JSON.stringify(node), node.createdAt, node.finishedAt,
  )
  db.prepare(`
    INSERT OR IGNORE INTO agent_transcript_segments (
      event_id, run_id, node_id, attempt_id, kind, run_sequence, node_sequence,
      segment_json, content_hash, source_sequence_start, source_sequence_end, created_at
    ) VALUES (?, ?, ?, NULL, 'agent_final_message', 1, 1, ?, ?, 1, 1, ?)
  `).run(eventId, runId, rootNodeId, segmentJson, contentHash, finishedAt)
  return true
}

export function migrateLegacyMoaTransactions(db) {
  if (!tableExists(db, 'moa_transactions')) return { backedUp: 0, converted: 0 }
  return db.transaction(() => {
    if (!tableExists(db, LEGACY_MOA_BACKUP_TABLE)) {
      db.exec(`
        CREATE TABLE ${LEGACY_MOA_BACKUP_TABLE} AS
        SELECT * FROM moa_transactions
      `)
    }
    const rows = db.prepare(`SELECT * FROM ${LEGACY_MOA_BACKUP_TABLE} ORDER BY timestamp ASC, id ASC`).all()
    let converted = 0
    for (const row of rows) {
      if (convertRow(db, row)) converted += 1
    }
    db.exec('DROP TABLE moa_transactions')
    return { backedUp: rows.length, converted }
  })()
}
