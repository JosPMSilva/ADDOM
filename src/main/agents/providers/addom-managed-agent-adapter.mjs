import { randomUUID } from 'node:crypto'

import { AGENT_PROVIDER_CAPABILITY_FIELDS } from '../../../common/agents/agent-provider-capability-snapshot.mjs'
import { runSingleAgent } from '../../moa/agent-runtime.mjs'
import { createAgentProviderAdapter } from './agent-provider-adapter.mjs'

function managedCapabilities() {
  const operations = Object.fromEntries(
    AGENT_PROVIDER_CAPABILITY_FIELDS.map((field) => [field, true]),
  )
  operations.resume = false
  return {
    runtimeAvailability: { status: 'available', reason: null },
    providerCapabilities: {
      operations,
      node: {
        mode: 'managed_hierarchy',
        nativeAgents: false,
        recursiveAgents: true,
        childStreams: true,
        addressableChildren: true,
        childMessaging: true,
        childCancellation: true,
        childRetry: true,
        resumableChildren: false,
        perNodeUsage: true,
        approvalAttribution: true,
        workspaceIsolation: true,
        maxDepthHint: 8,
        maxConcurrencyHint: 64,
        visibilityReason: null,
        capabilityKey: 'managed_hierarchy',
      },
      evidence: {
        sourceClass: 'addom_managed_runtime',
        confidence: 'verified',
        provenance: ['src/main/agents/providers/addom-managed-agent-adapter.mjs'],
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

function resultText(result, fields, fallback) {
  for (const field of fields) {
    if (typeof result?.[field] === 'string' && result[field].trim()) return result[field].trim()
  }
  return fallback
}

function terminalResult(result) {
  const status = result?.status === 'completed'
    ? 'completed'
    : ['aborted', 'cancelled'].includes(result?.status)
      ? 'cancelled'
      : 'failed'
  return {
    status,
    summary: status === 'completed'
      ? resultText(result, ['reportMarkdown', 'output'], 'Agent completed.')
      : resultText(result, ['error'], `Agent ${status}.`),
    errorCode: status === 'completed'
      ? null
      : String(result?.status || 'AGENT_FAILED').toUpperCase(),
    retryable: status === 'failed' && (
      result?.retryable === true
      || ['rate_limited', 'stale', 'timeout'].includes(String(result?.status || ''))
    ),
    usage: result?.usage ?? null,
    artifacts: Array.isArray(result?.stagedChanges) ? result.stagedChanges : [],
    legacyResult: result,
  }
}

export function createAddomManagedAgentAdapter({
  runSingleAgentFn = runSingleAgent,
  now = Date.now,
  idFactory = randomUUID,
} = {}) {
  return createAgentProviderAdapter({
    adapterId: 'addom-managed',
    capabilityProbe: async () => managedCapabilities(),
    implementation: {
      async create({ context, emit }) {
        const controlHandle = {
          controller: new AbortController(),
          eventSequence: 0,
          context,
        }
        const providerSessionId = `addom-managed:${idFactory()}`
        await emit({
          providerEventId: `${providerSessionId}:created`,
          kind: 'created',
          occurredAt: now(),
          payload: { providerSessionId },
        })
        return { providerSessionId, controlHandle }
      },
      async start({ providerSessionId, controlHandle, emit }) {
        const { context } = controlHandle
        let eventChain = Promise.resolve()
        const emitStream = ({ kind, payload = {} }) => {
          eventChain = eventChain.then(() => {
            controlHandle.eventSequence += 1
            return emit({
              providerEventId: `${providerSessionId}:stream:${controlHandle.eventSequence}`,
              kind,
              occurredAt: now(),
              payload,
            })
          })
          // Mark handled for fire-and-forget callers; await eventChain still rejects.
          eventChain.catch(() => {})
          return eventChain
        }
        const emitLegacy = (channel, payload = {}) => {
          if (channel === 'moa:agent-start') {
            void emitStream({ kind: 'status', payload: { status: 'running', ...payload } })
          } else if (channel === 'moa:agent-recovery') {
            const delta = typeof payload.message === 'string' && payload.message.trim()
              ? payload.message.trim()
              : 'Agent recovered execution.'
            if (delta) {
              void emitStream({
                kind: 'commentary',
                payload: { delta },
              })
            }
          }
          context.emitLegacy?.(channel, payload)
        }
        const result = await runSingleAgentFn(
          context.task,
          context.role,
          context.apiKey,
          context.projectFolder,
          emitLegacy,
          controlHandle.controller.signal,
          {
            ...(context.runtime || {}),
            onAgentStreamEvent: emitStream,
          },
        )
        await eventChain
        return terminalResult(result)
      },
      async resume() {
        throw new TypeError('ADDOM-managed agent attempts are retried as new attempts, not resumed')
      },
      async message({ controlHandle, input }) {
        await controlHandle.context.onMessage?.(input)
        return { delivered: true }
      },
      async interrupt({ controlHandle, input }) {
        controlHandle.controller.abort(input?.reason || 'interrupted')
        return { interrupted: true }
      },
      async cancel({ controlHandle, input }) {
        controlHandle.controller.abort(input?.reason || 'cancelled')
        return { cancelled: true }
      },
      async dispose({ controlHandle }) {
        if (!controlHandle.controller.signal.aborted) {
          controlHandle.controller.abort('disposed')
        }
        return { disposed: true }
      },
    },
  })
}
