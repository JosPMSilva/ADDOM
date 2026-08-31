import { validateEnum } from './agent-contract-utils.mjs'

export const AGENT_WORKSPACE_MODES = Object.freeze([
  'local_shared_read',
  'local_overlay',
  'local_worktree',
  'remote_provider_workspace',
  'opaque_no_write_surface',
])

export function validateAgentWorkspaceMode(value, field = 'workspaceMode') {
  return validateEnum(value, field, AGENT_WORKSPACE_MODES)
}
