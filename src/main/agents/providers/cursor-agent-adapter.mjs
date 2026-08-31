import { AGENT_PROVIDER_CAPABILITY_FIELDS } from '../../../common/agents/agent-provider-capability-snapshot.mjs'
import { createAgentProviderAdapter } from './agent-provider-adapter.mjs'
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

function cursorCapabilities() {
  const target = NATIVE_AGENT_SUPPORT_TARGETS.cursor
  return {
    runtimeAvailability: { status: 'available', reason: null },
    providerCapabilities: {
      operations: operations(['create', 'start', 'cancel', 'dispose']),
      node: {
        mode: 'partial_native_projection',
        nativeAgents: true,
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

function toolPayload(event = {}) {
  return {
    toolCallId: text(event.callId),
    toolCall: event.toolCall && typeof event.toolCall === 'object' ? event.toolCall : {},
  }
}

export function createCursorAgentAdapter({
  startSession,
  now = Date.now,
} = {}) {
  if (typeof startSession !== 'function') {
    throw new TypeError('Cursor agent adapter requires startSession')
  }
  return createAgentProviderAdapter({
    adapterId: 'cursor-agent',
    capabilityProbe: async () => cursorCapabilities(),
    implementation: {
      async create({ context, emit }) {
        const userFacingOutput = String(
          context?.task?.outputPresentation
          || context?.task?.output_presentation
          || '',
        ).trim().toLowerCase() === 'natural'
        let sequence = 0
        let ready = false
        const buffered = []
        let eventChain = Promise.resolve()
        const enqueue = (event) => {
          if (!ready) {
            buffered.push(event)
            return
          }
          eventChain = eventChain.then(() => emit(event))
        }
        const onEvent = (event = {}) => {
          const id = `cursor:${text(event.sessionId) || 'pending'}:${++sequence}`
          if (event.kind === 'assistant_delta' && text(event.text)) {
            enqueue({
              providerEventId: id,
              kind: 'assistant_delta',
              occurredAt: now(),
              payload: {
                text: String(event.text),
                presentation: userFacingOutput ? 'user' : 'internal',
              },
            })
          } else if (event.kind === 'thinking_delta' && text(event.text)) {
            enqueue({
              providerEventId: id,
              kind: 'reasoning',
              occurredAt: now(),
              payload: { text: String(event.text) },
            })
          } else if (event.kind === 'tool_started') {
            enqueue({
              providerEventId: id,
              kind: 'tool_started',
              occurredAt: now(),
              payload: toolPayload(event),
            })
          } else if (event.kind === 'tool_completed') {
            enqueue({
              providerEventId: id,
              kind: 'tool_completed',
              occurredAt: now(),
              payload: toolPayload(event),
            })
          }
        }
        const operation = await startSession({
          context,
          onEvent,
        })
        const providerSessionId = text(operation?.providerSessionId)
        if (!providerSessionId) {
          throw new TypeError('Cursor agent session did not expose a provider session ID')
        }
        await emit({
          providerEventId: `cursor:${providerSessionId}:created`,
          kind: 'created',
          occurredAt: now(),
          payload: { providerSessionId },
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
        const result = await controlHandle.operation.awaitResult()
        await controlHandle.eventChain()
        return {
          status: result?.status === 'cancelled'
            ? 'cancelled'
            : result?.status === 'completed'
              ? 'completed'
              : 'failed',
          summary: String(result?.summary || ''),
          errorCode: result?.status === 'completed' ? null : 'CURSOR_AGENT_FAILED',
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
