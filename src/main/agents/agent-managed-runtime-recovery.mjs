import { createManagedRuntimeLifecycle } from './agent-managed-runtime-lifecycle.mjs'
import { createAgentOrphanReaper } from './agent-orphan-reaper.mjs'
import { recoverAgentRunProjections } from './agent-recovery.mjs'

export function startManagedRuntimeRecovery({
  db,
  diagnostics,
  ensureWorkspaceRecovery,
  now,
  registry,
  runService,
  scheduler,
} = {}) {
  const orphanReaper = createAgentOrphanReaper({
    scheduler,
    registry,
    runService,
    diagnostics,
    now,
  })
  const lifecycle = createManagedRuntimeLifecycle({
    scheduler,
    orphanReaper,
    ensureWorkspaceRecovery,
    recoverProjections: () => recoverAgentRunProjections(db, { diagnostics }),
  })
  void lifecycle.start().catch((error) => {
    console.warn('Managed agent runtime startup recovery failed.', error)
  })
  return lifecycle
}
