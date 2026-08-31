const COLLABORATION_TOOL_NAMES = new Set([
  'spawn_agent',
  'send_message',
  'followup_agent',
  'wait_agent',
  'list_agents',
  'interrupt_agent',
])

function inputOf(toolCall) {
  return toolCall?.input ?? toolCall?.args ?? {}
}

function targetInput(owner, input) {
  return {
    owner,
    targetNodeId: String(input.agent_id || '').trim(),
  }
}

export function isAgentCollaborationTool(toolName) {
  return COLLABORATION_TOOL_NAMES.has(String(toolName || '').trim())
}

export async function executeAgentCollaborationTool({
  toolCall,
  context: owner,
  managedRuntime,
} = {}) {
  const toolName = String(toolCall?.name || '').trim()
  if (!isAgentCollaborationTool(toolName)) {
    throw new TypeError(`Unsupported collaboration tool: ${toolName || '(empty)'}`)
  }
  if (!managedRuntime) throw new TypeError('managedRuntime is required')
  const input = inputOf(toolCall)
  if (toolName === 'spawn_agent') {
    return managedRuntime.spawnAgent({
      owner,
      task: String(input.task || '').trim(),
      role: String(input.role || '').trim(),
      providerId: String(input.provider_id || '').trim(),
      modelId: String(input.model_id || '').trim(),
      background: input.background === true,
    })
  }
  if (toolName === 'send_message') {
    return managedRuntime.sendMessage({
      ...targetInput(owner, input),
      text: typeof input.message === 'string' ? input.message.trim() : '',
    })
  }
  if (toolName === 'followup_agent') {
    return managedRuntime.followupAgent({
      ...targetInput(owner, input),
      text: typeof input.message === 'string' ? input.message.trim() : '',
    })
  }
  if (toolName === 'wait_agent') {
    return managedRuntime.waitAgent(targetInput(owner, input))
  }
  if (toolName === 'list_agents') {
    return managedRuntime.listAgents({
      owner,
      scope: String(input.scope || 'children').trim(),
    })
  }
  return managedRuntime.interruptAgent({
    ...targetInput(owner, input),
    reason: String(input.reason || 'parent_interrupted').trim(),
  })
}
