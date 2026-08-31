import { normalizeMoaPolicy } from './moa-policy.mjs'
import { buildAgentTools } from './agent-runtime-helpers.mjs'
import { executeTool } from '../tools/fs-tools.mjs'
import { stageAgentPatch, stageAgentWrite, toStageError } from './staged-write-pipeline.mjs'
import { executeProviderNativeToolCall } from '../api-clients/provider-native-tool-runtime.mjs'
import {
  buildAgentCollaborationTools,
} from '../agents/tools/agent-collaboration-tools.mjs'
import {
  executeAgentCollaborationTool,
  isAgentCollaborationTool,
} from '../agents/tools/agent-collaboration-tool-executor.mjs'

export function resolveAgentRuntimeTooling(role = {}, runtime = {}) {
  const policy = normalizeMoaPolicy(runtime.policy)
  const workspaceMode = String(runtime.agentWorkspace?.mode || '').trim()
  const localWorkspaceWritable = !workspaceMode
    || ['local_overlay', 'local_worktree'].includes(workspaceMode)
  const roleCanWriteFiles = !!(
    policy.agentWriteAccessEnabled
    && policy.agentWriteMode === 'staged'
    && role?.canWriteFiles
    && runtime.agentWriteAccessRequested !== false
    && localWorkspaceWritable
  )
  const collaborationTools = runtime.agentCollaborationContext
    ? buildAgentCollaborationTools(runtime.agentCollaborationContext)
    : {}
  const agentTools = buildAgentTools(roleCanWriteFiles, collaborationTools)
  return {
    policy,
    roleCanWriteFiles,
    agentTools,
  }
}

export function filterAccountRuntimeAgentTools(resolvedTools = {}, addomTools = {}) {
  const allowedToolNames = new Set(
    Object.keys(addomTools || {})
      .map((toolName) => String(toolName || '').trim())
      .filter(Boolean),
  )
  const nextTools = {}
  for (const [toolName, definition] of Object.entries(resolvedTools || {})) {
    const normalizedToolName = String(toolName || '').trim()
    if (!normalizedToolName || !allowedToolNames.has(normalizedToolName)) continue
    nextTools[normalizedToolName] = definition
  }
  return nextTools
}

export async function executeAgentToolCall({
  toolCall = {},
  roleCanWriteFiles = false,
  projectFolder = '',
  taskId = '',
  agentRoleId = '',
  agentRole = '',
  runtime = {},
  policy = {},
  emit = () => {},
  abortSignal = null,
  todoScopeKey = '',
  activeProviderId = '',
  resolvedApiKey = '',
  runtimeToolSurface = null,
  toolExecutionMap = {},
  agentStagedChanges = [],
} = {}) {
  let result = ''
  let isToolError = false
  let errorMessage = ''
  try {
    if (isAgentCollaborationTool(toolCall.name)) {
      const collaborationResult = await executeAgentCollaborationTool({
        toolCall,
        context: runtime.agentCollaborationContext,
        managedRuntime: runtime.managedAgentRuntime,
      })
      result = JSON.stringify(collaborationResult)
    } else if (toolCall.name === 'write_file') {
      if (!roleCanWriteFiles) {
        throw toStageError('agent_write_disabled', 'write_file is disabled for this agent role or MoA policy.')
      }
      const stagedChange = stageAgentWrite({
        projectFolder,
        taskId,
        roleId: agentRoleId,
        role: agentRole,
        delegationId: runtime.delegationId,
        turnId: runtime.turnId,
        threadId: runtime.threadId,
        stepId: runtime.stepId,
        toolInput: toolCall.input ?? toolCall.args ?? {},
        policy,
        runtime,
        emit,
      })
      agentStagedChanges.push(stagedChange)
      result = `Staged write_file for "${stagedChange.filePath}" as revision ${stagedChange.revisionId}.`
    } else if (toolCall.name === 'apply_patch') {
      if (!roleCanWriteFiles) {
        throw toStageError('agent_write_disabled', 'apply_patch is disabled for this agent role or MoA policy.')
      }
      const stagedChange = stageAgentPatch({
        projectFolder,
        taskId,
        roleId: agentRoleId,
        role: agentRole,
        delegationId: runtime.delegationId,
        turnId: runtime.turnId,
        threadId: runtime.threadId,
        stepId: runtime.stepId,
        toolInput: toolCall.input ?? toolCall.args ?? {},
        policy,
        runtime,
        emit,
      })
      agentStagedChanges.push(stagedChange)
      result = `Staged apply_patch ${String(stagedChange.changeType || 'change')} for "${stagedChange.filePath}" as revision ${stagedChange.revisionId}.`
    } else if (toolCall.name === 'question_user') {
      throw new Error(
        'question_user is not available during background agent execution. '
        + 'Return the clarification request to the parent in normal output or with send_message instead.',
      )
    } else {
      const providerNativeResult = await executeProviderNativeToolCall({
        providerId: activeProviderId,
        apiKey: resolvedApiKey,
        toolName: String(toolExecutionMap?.[toolCall.name] || toolCall.name || '').trim(),
        toolInput: toolCall.input ?? toolCall.args ?? {},
        toolRuntimeContext: runtimeToolSurface?.providerToolExecutionContext,
        abortSignal,
      })
      if (providerNativeResult) {
        result = providerNativeResult.result
        isToolError = providerNativeResult.ok !== true
      } else {
        const execResult = await executeTool(
          projectFolder,
          toolCall.name,
          toolCall.input ?? toolCall.args ?? {},
          {
            signal: abortSignal,
            threadId: runtime.threadId,
            turnId: runtime.turnId,
            todoScopeKey,
          },
        )
        result = execResult.result
      }
    }
  } catch (error) {
    errorMessage = String(error?.message || 'Tool execution failed.')
    result = `Tool error: ${errorMessage}`
    isToolError = true
  }

  return {
    result,
    isToolError,
    errorMessage,
  }
}
