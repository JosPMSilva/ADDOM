import {
  AGENT_PROVIDER_CAPABILITY_FIELDS,
  validateAgentProviderCapabilitySnapshot,
} from '../../../common/agents/agent-provider-capability-snapshot.mjs'
import {
  validateAgentCapabilities,
} from '../../../common/agents/agent-capabilities.mjs'

const NODE_CAPABILITY_BY_ROUTE_CAPABILITY = Object.freeze({
  message: 'childMessaging',
  cancel: 'childCancellation',
  retry: 'childRetry',
  resume: 'resumableChildren',
  streaming: 'childStreams',
  usage: 'perNodeUsage',
})

function contractOnlyCapabilities(reason) {
  return validateAgentCapabilities({
    mode: 'contract_only',
    nativeAgents: false,
    recursiveAgents: false,
    childStreams: false,
    addressableChildren: false,
    childMessaging: false,
    childCancellation: false,
    childRetry: false,
    resumableChildren: false,
    perNodeUsage: false,
    approvalAttribution: false,
    workspaceIsolation: false,
    maxDepthHint: null,
    maxConcurrencyHint: null,
    visibilityReason: reason,
    capabilityKey: 'contract_only',
  })
}

function resolveRunCapabilities({
  runtimeAvailability,
  providerOperations,
  modelCapabilities,
  providerNode,
}) {
  const runtimeEnabled = (
    runtimeAvailability.status === 'available'
    && modelCapabilities.agentRuntime !== false
  )
  const disabled = new Set(modelCapabilities.disabledCapabilities)
  const result = Object.fromEntries(AGENT_PROVIDER_CAPABILITY_FIELDS.map((field) => [
    field,
    runtimeEnabled && providerOperations[field] && !disabled.has(field),
  ]))
  if (providerNode.mode === 'provider_opaque') {
    for (const field of ['message', 'interrupt', 'cancel', 'retry', 'usage', 'artifacts']) {
      result[field] = false
    }
  }
  return result
}

function resolveNodeCapabilities({
  runtimeAvailability,
  providerNode,
  modelCapabilities,
  runCapabilities,
}) {
  if (runtimeAvailability.status !== 'available' || modelCapabilities.agentRuntime === false) {
    return contractOnlyCapabilities(
      runtimeAvailability.reason || 'The selected model does not expose an agent runtime.',
    )
  }
  const result = { ...providerNode }
  for (const [runCapability, nodeCapability] of Object.entries(NODE_CAPABILITY_BY_ROUTE_CAPABILITY)) {
    if (!runCapabilities[runCapability]) result[nodeCapability] = false
  }
  for (const [modelField, nodeField] of [
    ['maxDepthHint', 'maxDepthHint'],
    ['maxConcurrencyHint', 'maxConcurrencyHint'],
  ]) {
    const modelValue = modelCapabilities[modelField]
    if (modelValue !== null) {
      result[nodeField] = result[nodeField] === null
        ? modelValue
        : Math.min(result[nodeField], modelValue)
    }
  }
  return validateAgentCapabilities(result)
}

export function createAgentProviderCapabilitySnapshot(input) {
  const providerNode = validateAgentCapabilities(input?.providerCapabilities?.node)
  const runCapabilities = resolveRunCapabilities({
    runtimeAvailability: input.runtimeAvailability,
    providerOperations: input.providerCapabilities.operations,
    modelCapabilities: input.modelCapabilities,
    providerNode,
  })
  const nodeCapabilities = resolveNodeCapabilities({
    runtimeAvailability: input.runtimeAvailability,
    providerNode,
    modelCapabilities: input.modelCapabilities,
    runCapabilities,
  })
  return validateAgentProviderCapabilitySnapshot({
    schemaVersion: 1,
    ...input,
    runCapabilities,
    nodeCapabilities,
  })
}

export async function captureAgentProviderCapabilities({
  adapterId,
  providerId = adapterId,
  modelId,
  capturedAt = Date.now(),
  capabilityProbe,
  context = {},
}) {
  if (typeof capabilityProbe !== 'function') {
    throw new TypeError('capabilityProbe must be a function')
  }
  const discovered = await capabilityProbe({ adapterId, providerId, modelId, context })
  return createAgentProviderCapabilitySnapshot({
    adapterId,
    providerId,
    modelId,
    capturedAt,
    ...discovered,
  })
}
