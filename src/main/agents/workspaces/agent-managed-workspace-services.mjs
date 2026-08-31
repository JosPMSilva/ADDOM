import { createAgentMergeQueue } from './agent-merge-queue.mjs'
import { createAgentWorkspaceCleanup } from './agent-workspace-cleanup.mjs'
import { createAgentWorkspaceManager } from './agent-workspace-manager.mjs'

export function createManagedWorkspaceServices({
  db,
  eventStore,
  idFactory,
  diagnostics = null,
  now,
  storageRoot,
} = {}) {
  const workspaceManager = createAgentWorkspaceManager({
    db,
    eventStore,
    storageRoot,
    now,
    idFactory: () => idFactory('workspace'),
    artifactIdFactory: () => idFactory('artifact'),
    diagnostics,
  })
  const workspaceCleanup = createAgentWorkspaceCleanup({
    db,
    storageRoot: workspaceManager.storageRoot,
    now,
    removeWorktree: (workspace) => workspaceManager.worktreeManager.remove(workspace),
    diagnostics,
  })
  const mergeQueue = createAgentMergeQueue({
    db,
    eventStore,
    now,
    idFactory: () => idFactory('merge'),
    onTerminalDecision: (entry) => workspaceCleanup.cleanupWorkspace(entry.workspaceId),
    diagnostics,
  })
  let recovery = null
  return Object.freeze({
    ensureRecovery() {
      if (!recovery) {
        recovery = (async () => {
          await mergeQueue.recoverInterrupted()
          return workspaceCleanup.recoverInterrupted()
        })()
      }
      return recovery
    },
    mergeQueue,
    workspaceCleanup,
    workspaceManager,
  })
}
