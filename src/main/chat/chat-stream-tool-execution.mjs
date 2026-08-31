import {
  buildLintBlockedResult,
  lintToolCall,
  TOOL_CALL_LINT_DECISIONS,
} from './tool-call-linter.mjs'
import { resolveApplyPatchTargetPaths } from '../tools/apply-patch-core.mjs'
import {
  executeTerminalSessionToolStep,
  isTerminalSessionTool,
} from './terminal-session-events.mjs'
import { resolveModeCapability } from './turn-mode.mjs'
import { buildAgentCatalogSnapshot } from '../moa/agent-catalog-service.mjs'

function serializeAgentCatalog({ input = {}, roles = [], policy = {}, getApiKey, getCachedCapabilities } = {}) {
  const snapshot = buildAgentCatalogSnapshot({
    moaRoles: roles,
    moaPolicy: policy,
    getApiKey,
    getCachedCapabilities,
    allowOpenAIAccountRuntime: true,
  })
  if (input?.include_unavailable !== false) return JSON.stringify(snapshot)
  const readyRoles = snapshot.roles.filter((role) => role.status === 'ready')
  return JSON.stringify({
    ...snapshot,
    role_count: readyRoles.length,
    unavailable_role_count: 0,
    roles: readyRoles,
  })
}

async function resolveApplyPatchArtifactChanges({
  tc = {},
  projectFolder = '',
  toolInput = {},
  execResult = {},
  applyPreviewContent = '',
  sendArtifactsUpdated = () => {},
  expectedBaseRevId = '',
  threadId = '',
  turnId = '',
  resolveToolWriteArtifactMeta = async () => null,
} = {}) {
  const rawChanges = Array.isArray(execResult?.applyPatchChanges)
    ? execResult.applyPatchChanges.filter((entry) => entry && typeof entry === 'object')
    : []
  if (rawChanges.length === 0) {
    const single = await resolveToolWriteArtifactMeta({
      tc,
      projectFolder,
      toolInput,
      execResult,
      applyPreviewContent,
      sendArtifactsUpdated,
      expectedBaseRevId,
      threadId,
      turnId,
    })
    return {
      writeArtifactMeta: single,
      writeArtifactChanges: single ? [single] : [],
    }
  }

  const resolved = []
  for (const patchMeta of rawChanges) {
    const artifactMeta = await resolveToolWriteArtifactMeta({
      tc,
      projectFolder,
      toolInput,
      execResult: {
        prevContent: patchMeta.prevContent,
        applyPatchMeta: patchMeta,
      },
      applyPreviewContent: String(patchMeta.newContent ?? ''),
      sendArtifactsUpdated,
      expectedBaseRevId,
      threadId,
      turnId,
    })
    if (artifactMeta) resolved.push(artifactMeta)
  }
  return {
    writeArtifactMeta: resolved[0] || null,
    writeArtifactChanges: resolved,
  }
}

export async function executeApprovedToolStep({
  tc,
  toolInput,
  toolExecutionMap = {},
  mode = 'execute',
  providerId = '',
  apiKey = '',
  providerRuntimeSettings = null,
  providerToolExecutionContext = null,
  projectFolder = '',
  permissionMode = 'ask',
  activeThreadId = '',
  activeTurnId = '',
  loop,
  approvalEffectiveCommandSafety,
  approvalCommandSafetyOverride,
  fileSystemHostFullAccess = false,
  applyPreviewContent = null,
  moaRoles = [],
  moaPolicy = {},
  getApiKey = null,
  getCachedCapabilities = null,
  send = () => {},
  stepId = '',
  stepSequence = 0,
  stepStartedAt = 0,
  helpers = {},
} = {}) {
  const {
    takeShellWriteSnapshot,
    detectShellWriteArtifactChanges,
    executeOpenAILocalRuntimeTool,
    isOpenAILocalRuntimeToolName,
    executeTool,
    executeProviderNativeToolCall,
    resolveToolWriteArtifactMeta,
    buildMissingDependencyInstallHint,
    isAbortError,
    getBaseRevisionId: getBaseRevisionIdHelper,
  } = helpers

  const lintResult = lintToolCall({
    toolName: tc?.name,
    toolInput,
  })
  const modeCapability = resolveModeCapability(tc?.name, mode, {
    backendToolName: toolExecutionMap?.[tc?.name],
    providerToolExecutionContext,
  })
  if (!modeCapability.allowed) {
    return {
      result: `Tool error: ${String(tc?.name || 'tool')} is not allowed in ${String(mode || 'execute')} mode.`,
      isError: true,
      missingDependencySuspected: false,
      writeArtifactMeta: null,
      writeArtifactChanges: [],
      modeCapability,
    }
  }
  if (lintResult.decision === TOOL_CALL_LINT_DECISIONS.REJECT) {
    return {
      result: buildLintBlockedResult({
        toolName: tc?.name,
        lintResult,
      }),
      isError: true,
      missingDependencySuspected: false,
      writeArtifactMeta: null,
      writeArtifactChanges: [],
      lintResult,
    }
  }

  let result = ''
  let isError = false
  let missingDependencySuspected = false
  let writeArtifactMeta = null
  let writeArtifactChanges = []
  let shellWriteDiagnostics = null
  let terminalSessionActivityMeta = null
  const executionToolName = String(toolExecutionMap?.[tc?.name] || tc?.name || '').trim()
  const emitToolOutputChunk = ({ stream = 'stdout', chunk = '', emittedAt = 0 } = {}) => {
    const text = String(chunk ?? '')
    if (!text) return
    send('chat:tool-output', {
      threadId: activeThreadId,
      turnId: activeTurnId,
      stepId,
      sequence: stepSequence,
      startedAt: stepStartedAt,
      toolName: tc.name,
      stream,
      chunk: text,
      emittedAt: Number(emittedAt || 0) || Date.now(),
    })
  }
  const sendArtifactsUpdated = (filePath) => {
    send('artifacts:updated', { filePath })
  }
  const shouldTrackShellFileEffects = (
    (executionToolName === 'run_command' || executionToolName === 'local_shell')
    && String(projectFolder || '').trim().length > 0
  )
  // Capture base revision for the target file before execution so that
  // conflict detection can compare after the write lands.
  let expectedBaseRevId = ''
  if (typeof getBaseRevisionIdHelper === 'function' && projectFolder) {
    const patchTargets = String(tc?.name || '').trim().toLowerCase() === 'apply_patch'
      ? resolveApplyPatchTargetPaths({
        toolInput,
        projectRoot: projectFolder,
        fileSystemHostFullAccess,
      })
      : []
    const targetPath = String(
      toolInput?.path
      || toolInput?.old_path
      || patchTargets[0]
      || ''
    ).trim()
    if (targetPath) {
      try { expectedBaseRevId = getBaseRevisionIdHelper(projectFolder, targetPath) } catch { /* non-fatal */ }
    }
  }

  let shellWriteSnapshotBefore = null
  if (shouldTrackShellFileEffects) {
    shellWriteSnapshotBefore = await takeShellWriteSnapshot(projectFolder, {
      commandText: String(toolInput?.command || ''),
    })
  }
  try {
    const agentCatalogResult = executionToolName === 'agent_catalog'
      ? serializeAgentCatalog({
          input: toolInput,
          roles: moaRoles,
          policy: moaPolicy,
          getApiKey,
          getCachedCapabilities,
        })
      : null
    const terminalSessionResult = agentCatalogResult === null && isTerminalSessionTool(tc?.name)
      ? await executeTerminalSessionToolStep({
        tc,
        toolInput,
        projectFolder,
        permissionMode,
        activeThreadId,
        activeTurnId,
        emitToolOutputChunk,
      })
      : null
    if (agentCatalogResult !== null) {
      result = agentCatalogResult
    } else if (terminalSessionResult) {
      result = terminalSessionResult.result
      isError = terminalSessionResult.isError === true
      terminalSessionActivityMeta = terminalSessionResult.terminalSessionActivityMeta || null
    } else {
      const providerNativeResult = typeof executeProviderNativeToolCall === 'function'
      ? await executeProviderNativeToolCall({
        providerId,
        apiKey,
        toolName: executionToolName || tc.name,
        toolInput,
        toolRuntimeContext: providerToolExecutionContext,
        abortSignal: loop.abortController.signal,
      })
      : null
      if (providerNativeResult) {
        result = providerNativeResult.result
        isError = providerNativeResult.ok !== true
      } else {
        if (
          String(providerId || '').trim().toLowerCase() === 'openai'
          && isOpenAILocalRuntimeToolName(tc.name)
        ) {
          const execResult = await executeOpenAILocalRuntimeTool({
            projectRoot: projectFolder,
            toolName: executionToolName || tc.name,
            toolInput,
            threadId: activeThreadId,
            turnId: activeTurnId,
            runtimeSettings: providerRuntimeSettings?.openai,
            signal: loop.abortController.signal,
            commandSafety: approvalEffectiveCommandSafety,
            commandSafetyOverride: approvalCommandSafetyOverride,
            fileSystemHostFullAccess,
            onOutputChunk: emitToolOutputChunk,
          })
          result = execResult.result
          if (execResult.writeArtifactTool) {
            const resolvedArtifacts = await resolveApplyPatchArtifactChanges({
              tc: { name: execResult.writeArtifactTool.toolName },
              projectFolder,
              toolInput: execResult.writeArtifactTool.toolInput,
              execResult: execResult.writeArtifactTool.execResult,
              applyPreviewContent,
              sendArtifactsUpdated,
              expectedBaseRevId,
              threadId: activeThreadId,
              turnId: activeTurnId,
              resolveToolWriteArtifactMeta,
            })
            writeArtifactMeta = resolvedArtifacts.writeArtifactMeta
            writeArtifactChanges = resolvedArtifacts.writeArtifactChanges
          }
        } else {
          const execResult = await executeTool(
            projectFolder,
            executionToolName || tc.name,
            toolInput,
            {
              signal: loop.abortController.signal,
              commandSafety: approvalEffectiveCommandSafety,
              commandSafetyOverride: approvalCommandSafetyOverride,
              fileSystemHostFullAccess,
              threadId: activeThreadId,
              turnId: activeTurnId,
              mode,
              onOutputChunk: emitToolOutputChunk,
              errorDiagnostics: loop?.errorDiagnostics,
            },
          )
          result = execResult.result
          if (String(tc?.name || '').trim().toLowerCase() === 'apply_patch') {
            const resolvedArtifacts = await resolveApplyPatchArtifactChanges({
              tc,
              projectFolder,
              toolInput,
              execResult,
              applyPreviewContent,
              sendArtifactsUpdated,
              expectedBaseRevId,
              threadId: activeThreadId,
              turnId: activeTurnId,
              resolveToolWriteArtifactMeta,
            })
            writeArtifactMeta = resolvedArtifacts.writeArtifactMeta
            writeArtifactChanges = resolvedArtifacts.writeArtifactChanges
          } else {
            writeArtifactMeta = await resolveToolWriteArtifactMeta({
              tc,
              projectFolder,
              toolInput,
              execResult,
              applyPreviewContent,
              sendArtifactsUpdated,
              expectedBaseRevId,
              threadId: activeThreadId,
              turnId: activeTurnId,
            })
          }
        }
      }
    }
  } catch (err) {
    if (loop.cancelled || isAbortError(err)) throw err
    const installHint = executionToolName === 'run_command' || executionToolName === 'local_shell'
      ? buildMissingDependencyInstallHint(toolInput, err)
      : ''
    missingDependencySuspected = !!installHint
    result = installHint
      ? `Tool error: ${err.message}\n\n${installHint}`
      : `Tool error: ${err.message}`
    isError = true
  }

  if (shouldTrackShellFileEffects && shellWriteSnapshotBefore) {
    const shellWriteOutcome = await detectShellWriteArtifactChanges({
      projectFolder,
      beforeSnapshot: shellWriteSnapshotBefore,
      commandText: String(toolInput?.command || ''),
      source: executionToolName === 'local_shell' ? 'local_shell' : 'run_command',
      threadId: activeThreadId,
      turnId: activeTurnId,
    })
    writeArtifactChanges = Array.isArray(shellWriteOutcome?.changes) ? shellWriteOutcome.changes : []
    shellWriteDiagnostics = shellWriteOutcome?.diagnostics && typeof shellWriteOutcome.diagnostics === 'object'
      ? shellWriteOutcome.diagnostics
      : null
    for (const fileChange of writeArtifactChanges) {
      const filePath = String(fileChange?.filePath || '').trim()
      if (filePath) sendArtifactsUpdated(filePath)
      const renamedFrom = String(fileChange?.renamedFrom || '').trim()
      if (renamedFrom) sendArtifactsUpdated(renamedFrom)
    }
    if (!writeArtifactMeta && Array.isArray(writeArtifactChanges) && writeArtifactChanges.length > 0) {
      writeArtifactMeta = writeArtifactChanges[0]
    }
  }

  return {
    result,
    isError,
    missingDependencySuspected,
    writeArtifactMeta,
    writeArtifactChanges,
    shellWriteDiagnostics,
    terminalSessionActivityMeta,
    lintResult,
  }
}
