import { randomUUID } from 'node:crypto'

import {
  deepFreeze,
  validateString,
} from '../../../common/agents/agent-contract-utils.mjs'
import {
  validateAgentProviderCapabilitySnapshot,
} from '../../../common/agents/agent-provider-capability-snapshot.mjs'
import {
  AGENT_PROVIDER_TERMINAL_STATUSES,
  createProviderEventNormalizer,
} from './provider-event-normalizer.mjs'
import {
  captureAgentProviderCapabilities,
} from './agent-provider-capability-probe.mjs'

const OPERATIONS = Object.freeze([
  'create',
  'start',
  'resume',
  'message',
  'interrupt',
  'cancel',
  'dispose',
])

export class AgentProviderCapabilityError extends Error {
  constructor(adapterId, capability) {
    super(`Agent provider ${adapterId} does not support ${capability}`)
    this.name = 'AgentProviderCapabilityError'
    this.code = 'AGENT_PROVIDER_CAPABILITY_UNSUPPORTED'
    this.adapterId = adapterId
    this.capability = capability
  }
}

function assertImplementation(definition, operation) {
  const implementation = definition.implementation?.[operation]
  if (typeof implementation !== 'function') {
    throw new TypeError(`Agent provider implementation.${operation} must be a function`)
  }
  return implementation
}

function isTerminalResult(value) {
  return (
    value
    && typeof value === 'object'
    && AGENT_PROVIDER_TERMINAL_STATUSES.includes(value.status)
  )
}

function assertObservableResult(capabilities, result) {
  if (result?.usage != null && !capabilities.runCapabilities.usage) {
    throw new AgentProviderCapabilityError(capabilities.providerId, 'usage')
  }
  if (Array.isArray(result?.artifacts) && result.artifacts.length > 0) {
    if (!capabilities.runCapabilities.artifacts) {
      throw new AgentProviderCapabilityError(capabilities.providerId, 'artifacts')
    }
  }
}

function publicSession(entry) {
  return deepFreeze({
    adapterId: entry.adapterId,
    sessionId: entry.sessionId,
    providerSessionId: entry.providerSessionId,
    capabilitySnapshot: entry.capabilitySnapshot,
  })
}

export function createAgentProviderAdapter(definition) {
  const adapterId = validateString(definition?.adapterId, 'agent provider adapterId', {
    maxLength: 256,
  })
  if (typeof definition.capabilityProbe !== 'function') {
    throw new TypeError('agent provider capabilityProbe must be a function')
  }
  const sessions = new Map()

  function requireSession(sessionId) {
    const entry = sessions.get(String(sessionId || '').trim())
    if (!entry) throw new TypeError(`Agent provider session ${sessionId} is not active`)
    return entry
  }

  function requireCapability(entry, capability) {
    if (!entry.capabilitySnapshot.runCapabilities[capability]) {
      throw new AgentProviderCapabilityError(adapterId, capability)
    }
  }

  function createEmitter(entry) {
    return async (providerEvent) => {
      if (providerEvent?.kind === 'result') {
        assertObservableResult(entry.capabilitySnapshot, providerEvent.payload)
      }
      const decision = entry.normalizer.normalize(providerEvent)
      if (decision.accepted) await entry.appendEvent(decision.event)
      return decision
    }
  }

  async function probe(input = {}) {
    const providerId = validateString(
      input.providerId ?? adapterId,
      'agent provider providerId',
      { maxLength: 512 },
    )
    const modelId = validateString(input.modelId, 'agent provider modelId', { maxLength: 1_024 })
    return captureAgentProviderCapabilities({
      adapterId,
      providerId,
      modelId,
      capturedAt: input.capturedAt ?? Date.now(),
      capabilityProbe: definition.capabilityProbe,
      context: input.context || {},
    })
  }

  async function routeReturnedResult(entry, operation, result) {
    if (!isTerminalResult(result)) return result
    assertObservableResult(entry.capabilitySnapshot, result)
    entry.generatedEventSequence += 1
    const decision = await createEmitter(entry)({
      providerEventId: `${entry.sessionId}:${operation}:${entry.generatedEventSequence}`,
      kind: 'result',
      occurredAt: Date.now(),
      payload: result,
    })
    return decision.accepted ? decision.event.payload : entry.normalizer.state().terminalResult
  }

  async function create(input = {}) {
    const providerId = validateString(
      input.providerId ?? adapterId,
      'agent provider providerId',
      { maxLength: 512 },
    )
    const modelId = validateString(input.modelId, 'agent provider modelId', { maxLength: 1_024 })
    if (typeof input.appendEvent !== 'function') {
      throw new TypeError('agent provider appendEvent must be a function')
    }
    const capabilitySnapshot = input.capabilitySnapshot
      ? validateAgentProviderCapabilitySnapshot(input.capabilitySnapshot)
      : await probe({
          providerId,
          modelId,
          capturedAt: input.capturedAt,
          context: input.context,
        })
    if (
      capabilitySnapshot.adapterId !== adapterId
      || capabilitySnapshot.providerId !== providerId
      || capabilitySnapshot.modelId !== modelId
    ) {
      throw new TypeError('Agent provider capability snapshot route does not match create input')
    }
    if (!capabilitySnapshot.runCapabilities.create) {
      throw new AgentProviderCapabilityError(adapterId, 'create')
    }
    const sessionId = `${adapterId}:${randomUUID()}`
    const entry = {
      adapterId,
      sessionId,
      providerSessionId: null,
      capabilitySnapshot,
      appendEvent: input.appendEvent,
      normalizer: createProviderEventNormalizer({ diagnosticsNamespace: adapterId }),
      controlHandle: null,
      generatedEventSequence: 0,
      context: input.context || {},
    }
    const result = await assertImplementation(definition, 'create')({
      adapterId,
      providerId,
      modelId,
      context: entry.context,
      capabilitySnapshot,
      emit: createEmitter(entry),
    })
    entry.providerSessionId = validateString(
      result?.providerSessionId,
      'agent provider create result.providerSessionId',
      { maxLength: 1_024 },
    )
    entry.controlHandle = result?.controlHandle ?? null
    sessions.set(sessionId, entry)
    return publicSession(entry)
  }

  async function invoke(operation, sessionId, input = {}) {
    const entry = requireSession(sessionId)
    requireCapability(entry, operation)
    const result = await assertImplementation(definition, operation)({
      adapterId,
      sessionId: entry.sessionId,
      providerSessionId: entry.providerSessionId,
      controlHandle: entry.controlHandle,
      capabilitySnapshot: entry.capabilitySnapshot,
      context: entry.context,
      input,
      emit: createEmitter(entry),
    })
    const normalized = await routeReturnedResult(entry, operation, result)
    if (operation === 'dispose') sessions.delete(entry.sessionId)
    return normalized
  }

  const adapter = {
    adapterId,
    create,
    probe,
    getSession(sessionId) {
      return publicSession(requireSession(sessionId))
    },
  }
  for (const operation of OPERATIONS.filter((value) => value !== 'create')) {
    adapter[operation] = (sessionId, input) => invoke(operation, sessionId, input)
  }
  return Object.freeze(adapter)
}
