import { randomUUID } from 'node:crypto'

import { AGENT_PROVIDER_CAPABILITY_FIELDS } from '../../../common/agents/agent-provider-capability-snapshot.mjs'
import { createAgentProviderAdapter } from './agent-provider-adapter.mjs'
import { createNativeAgentIdentityReconciler } from './native-agent-identity-reconciler.mjs'
import { NATIVE_AGENT_SUPPORT_TARGETS } from './native-agent-support-targets.mjs'

function text(value) {
  return String(value ?? '').trim()
}

function operations(enabled = []) {
  const allowed = new Set(enabled)
  return Object.fromEntries(
    AGENT_PROVIDER_CAPABILITY_FIELDS.map((field) => [field, allowed.has(field)]),
  )
}

function partialNativeCapabilities() {
  const target = NATIVE_AGENT_SUPPORT_TARGETS.openaiAccount
  return {
    runtimeAvailability: { status: 'available', reason: null },
    providerCapabilities: {
      operations: operations(['create', 'start', 'cancel', 'dispose', 'usage']),
      node: {
        mode: 'partial_native_projection',
        nativeAgents: true,
        recursiveAgents: false,
        childStreams: false,
        addressableChildren: true,
        childMessaging: false,
        childCancellation: false,
        childRetry: false,
        resumableChildren: false,
        perNodeUsage: false,
        approvalAttribution: false,
        workspaceIsolation: false,
        maxDepthHint: null,
        maxConcurrencyHint: null,
        visibilityReason: target.limitations.join(' '),
        capabilityKey: 'partial_native_projection',
      },
      evidence: {
        sourceClass: 'sanitized_provider_fixture',
        confidence: 'verified',
        provenance: [...target.evidence],
      },
    },
    modelCapabilities: {
      agentRuntime: true,
      disabledCapabilities: [],
      maxDepthHint: null,
      maxConcurrencyHint: null,
    },
  }
}

function providerEventId(prefix, sequence) {
  return `openai-account:${prefix}:${sequence}`
}

function rootChunkText(payload) {
  if (typeof payload === 'string') return payload
  return String(payload?.chunk ?? '')
}

export function createOpenAINativeAgentAdapter({
  startOperation,
  now = Date.now,
  idFactory = randomUUID,
} = {}) {
  if (typeof startOperation !== 'function') {
    throw new TypeError('OpenAI native adapter requires startOperation')
  }
  return createAgentProviderAdapter({
    adapterId: 'openai-native',
    capabilityProbe: async () => partialNativeCapabilities(),
    implementation: {
      async create({ context, emit }) {
        const reconciler = createNativeAgentIdentityReconciler({
          namespace: 'openai-account',
          nodeIdFactory: () => `agent_openai_${idFactory()}`,
        })
        let sequence = 0
        let ready = false
        const buffered = []
        let eventChain = Promise.resolve()
        const pendingDeltas = {
          commentary: '',
          reasoning: '',
        }
        const enqueue = (event) => {
          if (!ready) {
            buffered.push(event)
            return
          }
          eventChain = eventChain.then(() => emit(event))
        }
        const enqueueDelta = (kind, chunk) => {
          const delta = String(chunk ?? '')
          if (!delta) return
          pendingDeltas[kind] += delta
          if (!pendingDeltas[kind].trim()) return
          const value = pendingDeltas[kind]
          pendingDeltas[kind] = ''
          enqueue({
            providerEventId: providerEventId(kind, ++sequence),
            kind,
            occurredAt: now(),
            payload: { text: value },
          })
        }
        const onCollaborationEvent = (event = {}) => {
          if (event.phase === 'started') {
            reconciler.registerSpawnIntent({
              spawnRequestId: event.spawnRequestId || event.providerActivityId,
              parentAttemptId: event.parentAttemptId || context.parentAttemptId,
              parentProviderThreadId: event.parentProviderThreadId,
              expectedProviderThreadId: event.providerThreadId,
            })
          }
          if (!text(event.providerThreadId)) return
          const nodeProviderEventId = event.providerEventId
            || providerEventId('node', ++sequence)
          const node = reconciler.observeNode({
            ...event,
            providerEventId: nodeProviderEventId,
            parentAttemptId: event.parentAttemptId || context.parentAttemptId,
          })
          enqueue({
            providerEventId: nodeProviderEventId,
            kind: 'node_discovered',
            occurredAt: now(),
            payload: {
              ...node,
              capabilityMode: 'partial_native_projection',
              nodeCapabilityMode: 'provider_opaque',
              workspaceMode: 'opaque_no_write_surface',
              transcriptEvidence: 'status_only',
            },
            providerMetadata: {
              providerActivityId: event.providerActivityId || null,
              phase: event.phase || null,
            },
          })
        }
        const operation = await startOperation({
          messages: Array.isArray(context.messages) ? context.messages : [],
          options: context.options || {},
          onCollaborationEvent,
          onChunk: (payload) => {
            const chunk = rootChunkText(payload)
            if (text(payload?.phase).toLowerCase() !== 'commentary') return
            enqueueDelta('commentary', chunk)
          },
          onReasoning: (chunk) => {
            enqueueDelta('reasoning', chunk)
          },
          onProviderToolStatus: (payload = {}) => enqueue({
            providerEventId: providerEventId(`tool:${text(payload.toolCallId) || 'unknown'}:started`, ++sequence),
            kind: 'tool_started',
            occurredAt: now(),
            payload,
          }),
          onProviderToolOutput: (payload = {}) => enqueue({
            providerEventId: providerEventId(`tool:${text(payload.toolCallId) || 'unknown'}:output`, ++sequence),
            kind: 'tool_output',
            occurredAt: now(),
            payload,
          }),
        })
        const providerSessionId = text(
          operation?.response?.conversation?.id
          || operation?.providerSessionId,
        )
        if (!providerSessionId) {
          throw new TypeError('OpenAI native operation did not expose a provider session ID')
        }
        await emit({
          providerEventId: providerEventId('created', ++sequence),
          kind: 'created',
          occurredAt: now(),
          payload: {
            providerSessionId,
            providerRequestId: text(operation?.response?.id) || null,
          },
        })
        ready = true
        for (const event of buffered.splice(0)) enqueue(event)
        await eventChain
        return {
          providerSessionId,
          controlHandle: { operation, eventChain: () => eventChain },
        }
      },
      async start({ controlHandle }) {
        const payload = await controlHandle.operation.awaitResult()
        await controlHandle.eventChain()
        return {
          status: text(payload?.stopReason).toLowerCase() === 'cancel'
            ? 'cancelled'
            : 'completed',
          summary: String(payload?.text || ''),
          usage: payload?.usage ?? null,
          providerMetadata: payload?.providerResponseMeta ?? null,
        }
      },
      async cancel({ controlHandle }) {
        await controlHandle.operation.cancel()
        return { cancelled: true }
      },
      async dispose() {
        return { disposed: true }
      },
    },
  })
}
