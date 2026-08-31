/**
 * tool-definitions.mjs - tool schemas for the Vercel AI SDK.
 *
 * AI SDK v6 expects inputSchema on each tool definition.
 * Using parameters as the top-level tool key creates invalid schemas.
 *
 * Format: { [toolName]: { description: string, inputSchema: jsonSchema({...}) } }
 */

import { jsonSchema } from 'ai'
import { TOOL_LABELS } from './tool-definition-meta.mjs'
import { sealObjectSchema } from './tool-definition-schema-utils.mjs'
import { getToolMetaFromIdentity } from './tool-identity-registry.mjs'
import { BASE_TOOLS } from './tool-definitions-base.mjs'
import { TERMINAL_SESSION_TOOLS } from './tool-definitions-terminal.mjs'

/**
 * Return tools in AI SDK format:
 *   { [toolName]: { description, inputSchema } }
 */
export function toAISDKTools(_permissionMode = 'ask', delegationAvailable = false, options = {}) {
  void _permissionMode
  const includeTerminalSessionTools = options?.includeTerminalSessionTools !== false
  const result = {}
  const toolList = includeTerminalSessionTools
    ? [...BASE_TOOLS, ...TERMINAL_SESSION_TOOLS]
    : BASE_TOOLS
  for (const t of toolList) {
    if (t.name === 'delegate_tasks' && !delegationAvailable) continue
    if (t.name === 'agent_catalog' && !delegationAvailable) continue
    if (t.name === 'apply_artifact_revision' && !delegationAvailable) continue
    const inputSchema = t.name === 'apply_patch'
      ? t.parameters
      : sealObjectSchema(t.parameters)
    result[t.name] = {
      description: t.description,
      inputSchema: jsonSchema(inputSchema),
    }
  }
  return result
}

export function getToolMeta(toolName) {
  return TOOL_LABELS[toolName] ?? getToolMetaFromIdentity(toolName)
}
