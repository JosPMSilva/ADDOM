import { executeTool } from '../tools/fs-tools.mjs'
import {
  executeApplyPatchOperation,
  resolveApplyPatchPreview,
} from '../tools/apply-patch-core.mjs'

const OPENAI_LOCAL_RUNTIME_TOOL_NAMES = new Set(['local_shell', 'apply_patch'])

function normalizeId(value = '') {
  return String(value || '').trim()
}

function quoteShellArgument(value = '') {
  const text = String(value || '')
  if (!text) return '""'
  if (/^[A-Za-z0-9_./:=+-]+$/.test(text)) return text
  return `"${text.replace(/(["`$\\])/g, '`$1')}"`
}

function buildCommandString(parts = []) {
  const command = Array.isArray(parts) ? parts : []
  if (command.length === 0) {
    throw new Error('OpenAI local shell requires at least one command token.')
  }
  return command.map((part) => quoteShellArgument(part)).join(' ')
}

export function resolveOpenAIApplyPatchPreview({
  projectRoot = '',
  toolInput = null,
  fileSystemHostFullAccess = false,
} = {}) {
  return resolveApplyPatchPreview({
    projectRoot,
    toolInput,
    fileSystemHostFullAccess,
  })
}

async function executeOpenAILocalShell({
  projectRoot = '',
  toolInput = {},
  signal = undefined,
  commandSafety = null,
  commandSafetyOverride = null,
  onOutputChunk = null,
} = {}) {
  const action = toolInput?.action && typeof toolInput.action === 'object'
    ? toolInput.action
    : null
  if (!action || String(action.type || '').trim().toLowerCase() !== 'exec') {
    throw new Error('Unsupported OpenAI local_shell action.')
  }
  const command = buildCommandString(action.command)
  const cwd = normalizeId(action.workingDirectory) || '.'
  const execResult = await executeTool(
    projectRoot,
    'run_command',
    {
      command,
      cwd,
      env: action.env && typeof action.env === 'object' && !Array.isArray(action.env)
        ? { ...action.env }
        : undefined,
      timeout_ms: Number(action.timeoutMs || 0) > 0 ? Number(action.timeoutMs) : undefined,
      background: false,
    },
    {
      signal,
      commandSafety,
      commandSafetyOverride,
      onOutputChunk,
    },
  )
  return {
    result: {
      output: String(execResult?.result || ''),
    },
    isError: false,
    writeArtifactTool: null,
  }
}

async function executeOpenAIApplyPatch({
  projectRoot = '',
  toolInput = {},
  signal = undefined,
  fileSystemHostFullAccess = false,
} = {}) {
  const execResult = await executeApplyPatchOperation({
    projectRoot,
    toolInput,
    signal,
    fileSystemHostFullAccess,
  })
  return {
    result: {
      status: 'completed',
      output: String(execResult?.message || ''),
    },
    isError: false,
    writeArtifactTool: {
      execResult,
      toolName: 'apply_patch',
      toolInput,
    },
  }
}

export function isOpenAILocalRuntimeToolName(toolName = '') {
  return OPENAI_LOCAL_RUNTIME_TOOL_NAMES.has(String(toolName || '').trim().toLowerCase())
}

export async function executeOpenAILocalRuntimeTool({
  projectRoot = '',
  toolName = '',
  toolInput = {},
  signal = undefined,
  commandSafety = null,
  commandSafetyOverride = null,
  fileSystemHostFullAccess = false,
  onOutputChunk = null,
} = {}) {
  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  if (normalizedToolName === 'local_shell') {
    return executeOpenAILocalShell({
      projectRoot,
      toolInput,
      signal,
      commandSafety,
      commandSafetyOverride,
      onOutputChunk,
    })
  }
  if (normalizedToolName === 'apply_patch') {
    return executeOpenAIApplyPatch({
      projectRoot,
      toolInput,
      signal,
      fileSystemHostFullAccess,
    })
  }
  throw new Error(`Unsupported OpenAI local runtime tool: ${normalizedToolName || 'unknown'}`)
}
