import { OPENAI_ACCOUNT_ITEM_HANDLER_REGISTRY } from './ai-provider-openai-account-protocol-registry.mjs'

export const SUPPORTED_ITEM_TYPES = new Set(
  Object.entries(OPENAI_ACCOUNT_ITEM_HANDLER_REGISTRY)
    .filter(([, entry]) => entry.status !== 'unknown')
    .map(([itemType]) => itemType),
)

export const ACCOUNT_NATIVE_ACTIVITY_ITEM_TYPES = new Set([
  'plan',
  'webSearch',
  'commandExecution',
  'fileChange',
  'mcpToolCall',
  'imageView',
  'imageGeneration',
  'enteredReviewMode',
  'exitedReviewMode',
])

export const OPENAI_ACCOUNT_TRANSPORT_MODE = 'codex_app_server_chatgpt'
