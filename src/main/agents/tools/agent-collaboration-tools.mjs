import { jsonSchema } from 'ai'

import { sealObjectSchema } from '../../tools/tool-definition-schema-utils.mjs'

const TARGET_SCHEMA = {
  type: 'object',
  properties: {
    agent_id: {
      type: 'string',
      description: 'Stable agent node identifier from spawn_agent or list_agents.',
    },
  },
  required: ['agent_id'],
}

function tool(description, schema) {
  return {
    description,
    inputSchema: jsonSchema(sealObjectSchema(schema)),
  }
}

function canAddressChildren(context) {
  return context?.capabilitySnapshot?.addressableChildren === true
}

export function buildAgentCollaborationTools(context = {}) {
  const capabilities = context.capabilitySnapshot || {}
  if (!canAddressChildren(context)) return {}
  const tools = {
    list_agents: tool(
      'List agents in this run that the current agent is allowed to inspect.',
      {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['children', 'descendants'],
            description: 'Whether to list direct children or the full descendant subtree.',
          },
        },
      },
    ),
    wait_agent: tool(
      'Wait for an owned child agent and receive its terminal result.',
      TARGET_SCHEMA,
    ),
  }
  if (
    capabilities.recursiveAgents === true
    && Number(context.depth) < Number(context.policyLimits?.maxDepth ?? -1)
  ) {
    tools.spawn_agent = tool(
      'Spawn one child agent for a bounded task. Permissions may only narrow from the current agent.',
      {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Concrete task for the child agent.' },
          role: { type: 'string', description: 'Short role label for the child.' },
          provider_id: { type: 'string', description: 'Optional configured provider route.' },
          model_id: { type: 'string', description: 'Optional configured model route.' },
          background: { type: 'boolean', description: 'Run without blocking the parent.' },
        },
        required: ['task'],
      },
    )
  }
  if (capabilities.childMessaging === true) {
    const messageSchema = {
      ...TARGET_SCHEMA,
      properties: {
        ...TARGET_SCHEMA.properties,
        message: { type: 'string', description: 'Message to deliver to the target agent.' },
      },
      required: ['agent_id', 'message'],
    }
    tools.send_message = tool('Send a durable message to an addressable agent.', messageSchema)
    tools.followup_agent = tool(
      'Send follow-up instructions to an existing child agent.',
      messageSchema,
    )
  }
  if (capabilities.childCancellation === true) {
    tools.interrupt_agent = tool(
      'Interrupt an owned child agent and its foreground descendants.',
      {
        ...TARGET_SCHEMA,
        properties: {
          ...TARGET_SCHEMA.properties,
          reason: { type: 'string', description: 'Short interruption reason.' },
        },
      },
    )
  }
  return tools
}
