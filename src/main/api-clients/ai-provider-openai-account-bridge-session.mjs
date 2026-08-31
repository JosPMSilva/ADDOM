import { normalizePermissionMode } from '../../common/chat/permission-mode.mjs'
import {
  createOpenAIAccountRuntimeError,
  getStoredContinuityBridgeMeta,
  getStoredOpenAIThreadState,
  normalizeId,
  normalizeProjectFolder,
} from './ai-provider-openai-account-shared.mjs'
import {
  buildDynamicToolSignature,
  buildModeSignature,
  buildModelSignature,
} from './ai-provider-openai-account-dynamic-tools.mjs'

export function createOpenAIAccountSandboxPolicy({
  permissionMode = 'ask',
  permissionProfile = '',
  turnMode = 'execute',
  projectFolder = '',
} = {}) {
  const mode = normalizePermissionMode(permissionMode)
  const normalizedPermissionProfile = normalizeId(permissionProfile)
  const normalizedTurnMode = normalizeId(turnMode).toLowerCase() || 'execute'
  const normalizedProjectFolder = normalizeProjectFolder(projectFolder)

  if (normalizedTurnMode === 'plan' || normalizedTurnMode === 'thinking') {
    return {
      threadApprovalPolicy: 'on-request',
      threadPermissions: ':read-only',
      turnApprovalPolicy: 'on-request',
      turnPermissions: ':read-only',
    }
  }

  if (normalizedPermissionProfile) {
    return {
      threadApprovalPolicy: 'on-request',
      threadPermissions: normalizedPermissionProfile,
      turnApprovalPolicy: 'on-request',
      turnPermissions: normalizedPermissionProfile,
    }
  }

  if (mode === 'full_access') {
    return {
      threadApprovalPolicy: 'never',
      threadPermissions: ':danger-full-access',
      turnApprovalPolicy: 'never',
      turnPermissions: ':danger-full-access',
    }
  }

  if (normalizedProjectFolder) {
    return {
      threadApprovalPolicy: 'on-request',
      threadPermissions: ':workspace',
      turnApprovalPolicy: 'on-request',
      turnPermissions: ':workspace',
    }
  }

  return {
    threadApprovalPolicy: 'on-request',
    threadPermissions: ':read-only',
    turnApprovalPolicy: 'on-request',
    turnPermissions: ':read-only',
  }
}

export function buildThreadLaunchParams(model = '', dynamicTools = [], {
  cwd = '',
  launchPolicy = null,
} = {}) {
  const policy = launchPolicy && typeof launchPolicy === 'object' ? launchPolicy : {}
  const params = {
    model: normalizeId(model),
    approvalPolicy: normalizeId(policy.threadApprovalPolicy) || 'never',
    personality: 'pragmatic',
    serviceName: 'addom_openai_account',
  }
  const permissions = normalizeId(policy.threadPermissions)
  if (permissions) params.permissions = permissions
  else params.sandbox = normalizeId(policy.threadSandbox) || 'read-only'
  const normalizedCwd = normalizeProjectFolder(cwd)
  if (normalizedCwd) params.cwd = normalizedCwd
  if (Array.isArray(dynamicTools) && dynamicTools.length > 0) {
    params.dynamicTools = dynamicTools
  }
  return params
}

function cloneCollaborationModePresetForTurn(preset = null) {
  const source = preset && typeof preset === 'object' ? preset : null
  if (!source) return null
  const settings = source.settings && typeof source.settings === 'object'
    ? source.settings
    : {}
  return {
    ...source,
    settings: {
      ...settings,
      developer_instructions: null,
    },
  }
}

function scoreNativeCollaborationModePreset(preset = null) {
  const source = preset && typeof preset === 'object' ? preset : {}
  const id = normalizeId(source.id).toLowerCase()
  const name = normalizeId(source.name).toLowerCase()
  const description = normalizeId(source.description).toLowerCase()
  let score = 0
  if (source.isDefault === true) score += 100
  if (id === 'default' || name === 'default') score += 80
  if (id.includes('default') || name.includes('default')) score += 40
  if (description.includes('default')) score += 10
  return score
}

function selectNativeCollaborationModePreset(presets = []) {
  const source = Array.isArray(presets) ? presets.filter((entry) => entry && typeof entry === 'object') : []
  if (source.length === 0) return null
  const scored = source
    .map((entry) => ({ entry, score: scoreNativeCollaborationModePreset(entry) }))
    .sort((left, right) => right.score - left.score)
  if ((scored[0]?.score || 0) > 0) return scored[0]?.entry || null
  return source.length === 1 ? source[0] : null
}

export function selectRequestedNativeCollaborationModePreset(presets = [], requestedModeId = '') {
  const source = Array.isArray(presets) ? presets.filter((entry) => entry && typeof entry === 'object') : []
  if (source.length === 0) return null
  const normalizedRequestedModeId = normalizeId(requestedModeId)
  if (normalizedRequestedModeId) {
    const exactMatch = source.find((entry) => normalizeId(entry.id) === normalizedRequestedModeId)
    if (exactMatch) return exactMatch
  }
  return selectNativeCollaborationModePreset(source)
}

export function buildTurnLaunchParams({
  bridgeThreadId = '',
  input = [],
  model = '',
  collaborationModePreset = null,
  launchPolicy = null,
  effort = 'medium',
  serviceTier = '',
} = {}) {
  const policy = launchPolicy && typeof launchPolicy === 'object' ? launchPolicy : {}
  const params = {
    threadId: normalizeId(bridgeThreadId),
    input: Array.isArray(input) ? input : [],
    approvalPolicy: normalizeId(policy.turnApprovalPolicy) || 'never',
    model: normalizeId(model),
    effort: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(normalizeId(effort).toLowerCase())
      ? normalizeId(effort).toLowerCase()
      : 'medium',
    summary: 'concise',
    personality: 'pragmatic',
  }
  const permissions = normalizeId(policy.turnPermissions)
  if (permissions) params.permissions = permissions
  else {
    params.sandboxPolicy = policy.turnSandboxPolicy && typeof policy.turnSandboxPolicy === 'object'
      ? { ...policy.turnSandboxPolicy }
      : {
          type: 'readOnly',
          networkAccess: false,
        }
  }
  const collaborationMode = cloneCollaborationModePresetForTurn(collaborationModePreset)
  if (collaborationMode) params.collaborationMode = collaborationMode
  if (normalizeId(serviceTier).toLowerCase() === 'fast') params.serviceTier = 'fast'
  return params
}

function canReuseBridgeThreadForProject(requestedProjectFolder = '', bridgeProjectFolder = '') {
  const requested = normalizeProjectFolder(requestedProjectFolder)
  if (!requested) return true
  const existing = normalizeProjectFolder(bridgeProjectFolder)
  if (!existing) return false
  return existing === requested
}

export function bridgeCompatibilityMatches({
  requestedProjectFolder = '',
  existingProjectFolder = '',
} = {}) {
  return canReuseBridgeThreadForProject(requestedProjectFolder, existingProjectFolder)
}

export async function ensureConnectedAccountSession(service = null) {
  const state = service?.getState?.()
  const sessionSummary = state?.sessionSummary && typeof state.sessionSummary === 'object'
    ? state.sessionSummary
    : null
  const availability = state?.storage?.availability && typeof state.storage.availability === 'object'
    ? state.storage.availability
    : null
  if (availability?.supported !== true) {
    throw createOpenAIAccountRuntimeError(
      normalizeId(availability?.reason) || 'account_bridge_unavailable',
      normalizeId(availability?.message) || 'OpenAI account bridge is unavailable.',
    )
  }
  if (sessionSummary?.hasSession !== true) {
    throw createOpenAIAccountRuntimeError(
      'account_login_required',
      'OpenAI account auth is selected, but no active account session is connected.',
    )
  }
  return state
}

export async function resolveOpenAIAccountBridgeTurnSession({
  bridge = null,
  modelId = '',
  dynamicTools = [],
  projectFolder = '',
  threadId = '',
  requestContext = {},
  requestedDelegationBackend = 'none',
  requestedCollaborationModeId = '',
  permissionMode = 'ask',
  launchPolicy = null,
} = {}) {
  const normalizedThreadId = normalizeId(threadId)
  const storedThreadState = normalizedThreadId ? await getStoredOpenAIThreadState(normalizedThreadId) : null
  const continuityBridgeMeta = normalizedThreadId
    ? await getStoredContinuityBridgeMeta(normalizedThreadId)
    : { epoch: 1, reducerVersion: '' }
  const continuityEpoch = Math.max(1, Number(continuityBridgeMeta?.epoch || 1) || 1)
  const continuityReducerVersion = normalizeId(continuityBridgeMeta?.reducerVersion)
  const modeSignature = buildModeSignature({
    delegationBackend: requestedDelegationBackend,
    collaborationModeId: requestedCollaborationModeId,
    permissionMode,
  })
  const modelSignature = buildModelSignature(modelId)
  const storedBridgeThreadId = normalizeId(storedThreadState?.metadata?.accountBridgeThreadId)
  const storedDynamicToolSignature = normalizeId(storedThreadState?.metadata?.accountDynamicToolSignature)
  const requestedDynamicToolSignature = buildDynamicToolSignature(dynamicTools)
  const dynamicToolContractChanged = Boolean(
    storedDynamicToolSignature
    && requestedDynamicToolSignature
    && storedDynamicToolSignature !== requestedDynamicToolSignature,
  )
  const storedBridgeProjectFolder = normalizeProjectFolder(storedThreadState?.metadata?.accountBridgeProjectFolder)
  const canReuseStoredBridgeThread = bridgeCompatibilityMatches({
    requestedProjectFolder: projectFolder,
    existingProjectFolder: storedBridgeProjectFolder,
  })

  const explicitBridgeThreadId = normalizeId(
    requestContext?.openai?.accountBridgeThreadId
    || requestContext?.accountBridgeThreadId,
  )
  const explicitBridgeProjectFolder = normalizeProjectFolder(
    requestContext?.openai?.accountBridgeProjectFolder
    || requestContext?.accountBridgeProjectFolder,
  )
  let bridgeThreadId = !dynamicToolContractChanged && bridgeCompatibilityMatches({
    requestedProjectFolder: projectFolder,
    existingProjectFolder: explicitBridgeProjectFolder,
  })
    ? explicitBridgeThreadId
    : ''

  let resumedExistingThread = false
  if (bridgeThreadId) {
    try {
      const resumed = await bridge.resumeThread({
        threadId: bridgeThreadId,
        model: modelId,
        personality: 'pragmatic',
      })
      bridgeThreadId = normalizeId(resumed?.thread?.id) || bridgeThreadId
      resumedExistingThread = true
    } catch {
      throw createOpenAIAccountRuntimeError(
        'account_thread_resume_failed',
        'OpenAI account runtime could not resume its existing provider thread. Retry after restoring the account session.',
      )
    }
  }
  if (!bridgeThreadId && storedBridgeThreadId && canReuseStoredBridgeThread && !dynamicToolContractChanged) {
    try {
      const resumed = await bridge.resumeThread({
        threadId: storedBridgeThreadId,
        model: modelId,
        personality: 'pragmatic',
      })
      bridgeThreadId = normalizeId(resumed?.thread?.id) || storedBridgeThreadId
      resumedExistingThread = true
    } catch {
      throw createOpenAIAccountRuntimeError(
        'account_thread_resume_failed',
        'OpenAI account runtime could not resume its existing provider thread. Retry after restoring the account session.',
      )
    }
  }
  if (!bridgeThreadId) {
    const started = await bridge.startThread(buildThreadLaunchParams(modelId, dynamicTools, {
      cwd: projectFolder,
      launchPolicy,
    }))
    bridgeThreadId = normalizeId(started?.thread?.id)
  }
  if (!bridgeThreadId) {
    throw createOpenAIAccountRuntimeError(
      'account_thread_start_failed',
      'OpenAI account runtime could not start a bridge-backed thread.',
    )
  }

  let selectedCollaborationModePreset = null
  let selectedCollaborationModeId = ''
  if (requestedDelegationBackend === 'openai_native' && typeof bridge.listCollaborationModes === 'function') {
    try {
      const collaborationModes = await bridge.listCollaborationModes()
      selectedCollaborationModePreset = selectRequestedNativeCollaborationModePreset(
        collaborationModes,
        requestedCollaborationModeId,
      )
      selectedCollaborationModeId = normalizeId(selectedCollaborationModePreset?.id)
    } catch {
      selectedCollaborationModePreset = null
      selectedCollaborationModeId = ''
    }
  }
  const effectiveDelegationBackend = (
    requestedDelegationBackend === 'openai_native' && !selectedCollaborationModePreset
  )
    ? 'none'
    : requestedDelegationBackend

  return {
    bridgeThreadId,
    resumedExistingThread,
    selectedCollaborationModePreset,
    selectedCollaborationModeId,
    effectiveDelegationBackend,
    continuityEpoch,
    continuityReducerVersion,
    modeSignature,
    modelSignature,
  }
}
