import { createOpenAIAccountSandboxPolicy } from './ai-provider-openai-account-bridge-session.mjs'
import {
  createOpenAIAccountRuntimeError,
  normalizeId,
} from './ai-provider-openai-account-shared.mjs'
import { resolveModeCapability } from '../chat/turn-mode.mjs'

const NON_EXECUTABLE_ITEM_TYPES = new Set([
  'userMessage',
  'hookPrompt',
  'agentMessage',
  'plan',
  'reasoning',
  'enteredReviewMode',
  'exitedReviewMode',
  'contextCompaction',
])

const NAMED_TOOL_ITEM_TYPES = new Set([
  'dynamicToolCall',
  'mcpToolCall',
  'collabAgentToolCall',
  'collabToolCall',
])

function normalizeTurnMode(value = '') {
  const mode = normalizeId(value).toLowerCase()
  return mode === 'plan' || mode === 'thinking' ? mode : 'execute'
}

export function resolveOpenAIAccountTurnModePolicy({
  requestContext = {},
  permissionMode = 'ask',
  permissionProfile = '',
  projectFolder = '',
} = {}) {
  const turnMode = normalizeTurnMode(requestContext?.mode)
  return {
    turnMode,
    launchPolicy: createOpenAIAccountSandboxPolicy({
      permissionMode,
      permissionProfile,
      turnMode,
      projectFolder,
    }),
  }
}

export function rejectOpenAIAccountNativeToolForMode({
  protocolMethod = '',
  itemType = '',
  item = null,
  turnMode = 'execute',
  bridge = null,
  bridgeThreadId = '',
  turnId = '',
  rejectTurn = () => {},
} = {}) {
  if (protocolMethod !== 'item/started') return false
  if (NON_EXECUTABLE_ITEM_TYPES.has(itemType)) return false
  const capabilityName = NAMED_TOOL_ITEM_TYPES.has(itemType)
    ? normalizeId(item?.tool || item?.name || itemType)
    : itemType
  const capability = resolveModeCapability(capabilityName, turnMode, {
    trustedReadOnly: item?.metadata?.trustedReadOnly === true,
  })
  if (capability.allowed) return false
  void bridge?.interruptTurn?.(bridgeThreadId, turnId).catch(() => {})
  rejectTurn(createOpenAIAccountRuntimeError(
    'turn_mode_capability_denied',
    `OpenAI account runtime attempted ${itemType} while ${turnMode} mode was active, but that capability is not allowed.`,
  ))
  return true
}
