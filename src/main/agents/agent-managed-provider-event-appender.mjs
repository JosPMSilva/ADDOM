import { managedProviderEventKind } from './agent-managed-runtime-values.mjs'
import { readRegisteredText } from '../../common/chat/canonical-turn-engine.mjs'

const DELTA_PROVIDER_KINDS = new Set(['assistant_delta', 'commentary', 'reasoning'])

function normalizeProviderDeltaPayload(kind, payload) {
  if (!DELTA_PROVIDER_KINDS.has(kind)) return payload
  const source = payload && typeof payload === 'object' ? payload : {}
  const delta = readRegisteredText(source, { requireNonWhitespace: true })
  if (!delta) return null
  return { ...source, delta }
}

export function createManagedProviderEventAppender({
  collaborationProjection,
  draft,
  eventStore,
  repository,
} = {}) {
  if (!collaborationProjection || !draft || !eventStore || !repository) {
    throw new TypeError('Managed provider event appender requires runtime dependencies')
  }

  return function appendProviderEvent(entry, providerEvent) {
    if (String(providerEvent?.kind || '') === 'node_discovered') {
      if (String(entry?.adapterId || '') !== 'openai-native') {
        throw new TypeError(`Adapter ${String(entry?.adapterId || 'unknown')} does not own node discovery`)
      }
      collaborationProjection.materializeProviderDiscoveredChild(entry, providerEvent)
      return
    }
    const canonicalKind = managedProviderEventKind(providerEvent.kind)
    if (!canonicalKind) return
    const payload = normalizeProviderDeltaPayload(providerEvent.kind, providerEvent.payload)
    if (payload === null) return
    const graph = repository.getRunGraph(entry.runId)
    const node = graph.nodes.find((candidate) => candidate.id === entry.nodeId)
    const attempt = graph.attempts.find((candidate) => candidate.id === entry.attemptId)
    eventStore.append(draft(canonicalKind, {
      runId: entry.runId,
      nodeId: entry.nodeId,
      parentNodeId: node.parentNodeId,
      attemptId: entry.attemptId,
      providerEventId: providerEvent.providerEventId,
      providerCorrelationKey: attempt.providerCorrelationKey || `addom-managed:${entry.attemptId}`,
      payload,
      suffix: `provider:${providerEvent.providerEventId}`,
      createdAt: providerEvent.occurredAt,
    }))
  }
}
