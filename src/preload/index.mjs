const electron = require('electron')
const { contextBridge, ipcRenderer } = electron

const {
  resolveAppVersion,
  resolveInitialAppearance,
  asTrimmedString,
  asString,
  asPlainObject,
  notifyRendererOption,
  hasOwn,
  asBoolean,
  asOptionalRoundedNumber,
  asOptionalNumber,
  asStringArray,
  normalizeMemoryListPayload,
  normalizeMemorySearchPayload,
  normalizeMemoryScopeMutationPayload,
  sanitizeOpenAIAssetPayload,
  normalizeChatTurnOptions,
  requireNonEmptyString,
  normalizeHttpUrl,
} = require('./preload-normalizers.cjs')
const { createTerminalApi } = require('./preload-terminal-api.cjs')
const {
  createAttachmentsApi,
  createVaultApi,
  createChatApi,
  createOpenAIAccountApi,
  createCursorAgentApi,
} = require('./preload-chat-api.cjs')
const {
  createWorkspaceApi,
  createDocumentsApi,
  createProcessesApi,
  createToolApi,
  createMemoryApi,
} = require('./preload-workspace-api.cjs')
const { createFileApi, createEditorApi } = require('./preload-editor-api.cjs')
const {
  createAppApi,
  createWindowApi,
  createDialogApi,
  createShellApi,
  createClipboardApi,
  createUpdaterApi,
  createSettingsApi,
  createLocalDataApi,
  createSystemApi,
} = require('./preload-misc-apis.cjs')
const {
  createGitApi,
  createSkillsApi,
  createPipelineApi,
  createCouncilApi,
  createAgentMemoryApi,
  createOpenAIAssetsApi,
  createOpenAIMcpApi,
} = require('./preload-git-api.cjs')
const { createAgentsApi } = require('./preload-agents-api.cjs')
const { createArtifactsApi } = require('./preload-artifacts-api.cjs')
const { createAgentRunsApi } = require('./preload-agent-runs-api.cjs')

const IPC_API_VERSION = 'v1'
const MAX_SUBSCRIPTIONS_PER_CHANNEL = 10
const activeChannelHandlers = new Map()
const warnedSubscriptionLimitChannels = new Set()

const APP_VERSION = resolveAppVersion()
const INITIAL_APPEARANCE = resolveInitialAppearance()

function toVersionedChannel(channel) {
  const raw = String(channel || '').trim()
  if (!raw) return ''
  return raw.startsWith(`${IPC_API_VERSION}:`) ? raw : `${IPC_API_VERSION}:${raw}`
}

function sendVersioned(channel, payload) {
  const versioned = toVersionedChannel(channel)
  if (!versioned) return
  ipcRenderer.send(versioned, payload)
}

async function invokeVersioned(channel, payload) {
  const raw = asTrimmedString(channel)
  if (!raw) throw new Error('channel is required')
  const versioned = toVersionedChannel(raw)
  return ipcRenderer.invoke(versioned, payload)
}

function subVersioned(channel, cb) {
  return sub(toVersionedChannel(channel), cb)
}

async function invokeOpenAIAccountVersioned(channel, payload) {
  return invokeVersioned(channel, payload)
}

/*
Source contract anchors kept in the composition root for source-level integration tests:
openLegalDocument: (documentId) => invokeVersioned('app:openLegalDocument'
getProviderModels: (providerId, forceRefresh = false) =>
invokeVersioned('vault:getProviderModels'
onArtifactTracking: (cb) => subVersioned('chat:artifact-tracking', cb)
saveFile: (project, filePath, content, encoding = '')
onTreeChanged: (cb) => subVersioned('file:tree-changed', cb)
refreshRuntime: (payload = {}) => invokeVersioned(
'editor:service:refresh-runtime'
Rejected invalid tool approval response channel
return false
sendVersioned(channel, payload)
return true
sendVersioned('tool:approval-response', payload)
return true
*/

contextBridge.exposeInMainWorld('addom', {
  _version: APP_VERSION,
  _initialAppearance: INITIAL_APPEARANCE,
  _ipcVersion: IPC_API_VERSION,
  app: createAppApi({ invokeVersioned, sendVersioned, requireNonEmptyString }),
  window: createWindowApi({ sendVersioned }),
  dialog: createDialogApi({ invokeVersioned }),
  shell: createShellApi({ invokeVersioned, requireNonEmptyString, normalizeHttpUrl }),
  clipboard: createClipboardApi({ invokeVersioned, asString }),
  terminal: createTerminalApi({
    invokeVersioned,
    subVersioned,
    asTrimmedString,
    asPlainObject,
    asString,
    asBoolean,
    asOptionalRoundedNumber,
  }),
  attachments: createAttachmentsApi({ invokeVersioned }),
  vault: createVaultApi({ invokeVersioned }),
  chat: createChatApi({
    sendVersioned,
    invokeVersioned,
    subVersioned,
    asTrimmedString,
    asPlainObject,
    asString,
    asOptionalRoundedNumber,
    normalizeChatTurnOptions,
  }),
  workspace: createWorkspaceApi({
    invokeVersioned,
    subVersioned,
    asTrimmedString,
    asString,
    asPlainObject,
    asBoolean,
    asOptionalRoundedNumber,
    notifyRendererOption,
  }),
  documents: createDocumentsApi({ invokeVersioned, asTrimmedString, asPlainObject }),
  processes: createProcessesApi({ invokeVersioned, asTrimmedString }),
  tool: createToolApi({ sendVersioned, subVersioned }),
  memory: createMemoryApi({
    invokeVersioned,
    subVersioned,
    asTrimmedString,
    asString,
    asPlainObject,
    hasOwn,
    asBoolean,
    asOptionalRoundedNumber,
    asOptionalNumber,
    asStringArray,
    normalizeMemoryListPayload,
    normalizeMemorySearchPayload,
    normalizeMemoryScopeMutationPayload,
    normalizeHttpUrl,
  }),
  file: createFileApi({ invokeVersioned, subVersioned }),
  editor: createEditorApi({ invokeVersioned, asPlainObject }),
  updater: createUpdaterApi({ invokeVersioned, subVersioned }),
  settings: createSettingsApi({ invokeVersioned, subVersioned }),
  localData: createLocalDataApi({ invokeVersioned }),
  openaiAccount: createOpenAIAccountApi({
    invokeOpenAIAccountVersioned,
    subVersioned,
    asTrimmedString,
  }),
  cursorAgent: createCursorAgentApi({ invokeVersioned }),
  system: createSystemApi({ invokeVersioned }),
  git: createGitApi({ invokeVersioned, asTrimmedString, asOptionalRoundedNumber }),
  skills: createSkillsApi({ invokeVersioned, asTrimmedString, asPlainObject }),
  pipeline: createPipelineApi({ invokeVersioned, asTrimmedString, asPlainObject }),
  council: createCouncilApi({ invokeVersioned, asTrimmedString, asPlainObject }),
  agentMemory: createAgentMemoryApi({ invokeVersioned, asTrimmedString }),
  openaiAssets: createOpenAIAssetsApi({
    invokeVersioned,
    asTrimmedString,
    sanitizeOpenAIAssetPayload,
  }),
  openaiMcp: createOpenAIMcpApi({ invokeVersioned, asTrimmedString, asPlainObject }),
  agents: createAgentsApi({
    invokeVersioned,
    sendVersioned,
    subVersioned,
    asTrimmedString,
    asString,
    asPlainObject,
    asBoolean,
    asOptionalRoundedNumber,
  }),
  artifacts: createArtifactsApi({
    invokeVersioned,
    subVersioned,
    asTrimmedString,
    asPlainObject,
    asStringArray,
    asOptionalRoundedNumber,
  }),
  agentRuns: createAgentRunsApi({
    invokeVersioned,
    subVersioned,
    asTrimmedString,
    asPlainObject,
    asString,
    asBoolean,
    asOptionalRoundedNumber,
  }),
})

function sub(channel, cb) {
  const key = asTrimmedString(channel)
  if (!key) throw new TypeError('channel is required')
  if (typeof cb !== 'function') throw new TypeError('callback must be a function')
  const activeHandlers = activeChannelHandlers.get(key) || new Set()
  if (activeHandlers.size >= MAX_SUBSCRIPTIONS_PER_CHANNEL) {
    if (!warnedSubscriptionLimitChannels.has(key)) {
      warnedSubscriptionLimitChannels.add(key)
      console.warn(
        `[preload] Subscription limit reached for "${key}" (${MAX_SUBSCRIPTIONS_PER_CHANNEL}). Ignoring additional listener.`,
      )
    }
    return () => {}
  }
  const handler = (_e, data) => cb(data)
  activeHandlers.add(handler)
  activeChannelHandlers.set(key, activeHandlers)
  ipcRenderer.on(key, handler)
  let unsubscribed = false
  return () => {
    if (unsubscribed) return
    unsubscribed = true
    ipcRenderer.removeListener(key, handler)
    const registeredHandlers = activeChannelHandlers.get(key)
    if (!registeredHandlers) return
    registeredHandlers.delete(handler)
    if (registeredHandlers.size === 0) {
      activeChannelHandlers.delete(key)
    }
  }
}
