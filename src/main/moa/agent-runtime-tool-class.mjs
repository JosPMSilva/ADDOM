const WRITE_TOOL_NAMES = new Set(['write_file', 'apply_patch', 'create_directory'])
const EXECUTE_TOOL_NAMES = new Set([
  'run_command',
  'shell',
  'local_shell',
  'spawn_agent',
  'send_message',
  'followup_agent',
  'interrupt_agent',
])

export function resolveAgentToolClass(toolName) {
  if (WRITE_TOOL_NAMES.has(toolName)) return 'write'
  return EXECUTE_TOOL_NAMES.has(toolName) ? 'execute' : 'read'
}
