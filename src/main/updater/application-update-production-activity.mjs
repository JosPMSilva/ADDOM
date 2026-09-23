import { getManagedAgentRuntimeIfActive } from '../agents/managed-agent-runtime-singleton.mjs'
import { listOpenAIBackgroundJobs } from '../api-clients/openai-background-jobs.mjs'
import { listTrackedCursorAgentPids } from '../cursor-agent/cursor-agent-process.mjs'
import { getDb } from '../memory/db.mjs'
import { listBackgroundCommands } from '../tools/command-tools-background.mjs'
import { createApplicationUpdateActivityMonitor } from './application-update-activity.mjs'

function parseProjectionRows(rows) {
  return rows.map((row) => {
    const projection = JSON.parse(String(row?.projection_json || ''))
    if (!projection || typeof projection !== 'object') {
      throw new Error('Invalid managed work projection')
    }
    return projection
  })
}

export function createProductionApplicationUpdateActivityMonitor({
  chatRunRegistry,
  terminalSessionManager,
  getManagedRuntimeIfActive = getManagedAgentRuntimeIfActive,
  getDatabase = getDb,
  listOpenAIJobs = listOpenAIBackgroundJobs,
  listCommands = listBackgroundCommands,
  listCursorPids = listTrackedCursorAgentPids,
  now = Date.now,
} = {}) {
  if (typeof chatRunRegistry?.list !== 'function') throw new TypeError('chatRunRegistry is required')
  if (typeof terminalSessionManager?.listSessions !== 'function') {
    throw new TypeError('terminalSessionManager is required')
  }

  async function listManagedProjectionRows(tableName) {
    const runtime = getManagedRuntimeIfActive()
    if (!runtime) return []
    await runtime.ready?.()
    const projectionColumn = tableName === 'agent_runs'
      ? 'contract_json AS projection_json'
      : 'projection_json'
    const rows = getDatabase().prepare(`SELECT ${projectionColumn} FROM ${tableName}`).all()
    return parseProjectionRows(rows)
  }

  return createApplicationUpdateActivityMonitor({
    listChatRuns: () => chatRunRegistry.list(),
    listManagedRuns: () => listManagedProjectionRows('agent_runs'),
    listManagedApprovals: () => listManagedProjectionRows('agent_approval_projections'),
    listOpenAIBackgroundJobs: () => listOpenAIJobs(),
    listBackgroundCommands: () => listCommands(),
    listTrackedCursorAgentPids: () => listCursorPids(),
    listTerminalSessions: () => terminalSessionManager.listSessions(),
    now,
  })
}
