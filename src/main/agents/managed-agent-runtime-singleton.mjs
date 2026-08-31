import path from 'node:path'

import { getDb } from '../memory/db.mjs'
import { getUserDataPath } from '../platform/electron-app.mjs'
import { createManagedAgentRuntime } from './agent-managed-runtime.mjs'
import { createAddomManagedAgentAdapter } from './providers/addom-managed-agent-adapter.mjs'
import { createOpenAINativeAgentAdapter } from './providers/openai-native-agent-adapter.mjs'
import { createAgentProviderRegistry } from './providers/agent-provider-registry.mjs'
import { startOpenAIAccountBackgroundOperation } from '../api-clients/ai-provider-openai-account.mjs'

let singleton = null

export function getManagedAgentRuntime() {
  if (singleton) return singleton
  const adapterRegistry = createAgentProviderRegistry()
  adapterRegistry.register(createAddomManagedAgentAdapter())
  adapterRegistry.register(createOpenAINativeAgentAdapter({
    startOperation: startOpenAIAccountBackgroundOperation,
  }))
  singleton = createManagedAgentRuntime({
    db: getDb(),
    adapterRegistry,
    workspaceStorageRoot: path.join(getUserDataPath(), 'agent-workspaces'),
  })
  return singleton
}

export async function shutdownManagedAgentRuntimeIfActive(reason = 'application_quit') {
  if (!singleton) return { stoppedRunIds: [] }
  try {
    await singleton.ready?.()
  } catch {
    // Shutdown still owns timers and workspaces after a failed startup recovery.
  }
  return singleton.shutdown({ reason })
}

export function resolveManagedAgentProjectId({ projectId = '', threadId = '' } = {}) {
  const explicit = String(projectId || '').trim()
  if (explicit) return explicit
  const row = getDb().prepare(`
    SELECT project_id FROM chat_threads WHERE id = ?
  `).get(String(threadId || '').trim())
  if (!row?.project_id) {
    throw new TypeError(`Cannot resolve an agent project for thread ${threadId || '(empty)'}`)
  }
  return String(row.project_id)
}

export function resetManagedAgentRuntimeForTests() {
  singleton = null
}
