import {
  formatRuntimeDiagnosticsDetail,
  hasWriteIntentWithoutMutation,
  summarizeRuntimeDiagnostics,
} from '../chat/chat-runtime-diagnostics.mjs'
import { summarizeCanonicalTurnToolEvidence } from '../chat/chat-runtime-diagnostic-evidence.mjs'
import { buildOpenAIAccountProtocolCapabilitySnapshot } from '../api-clients/ai-provider-openai-account-protocol-registry.mjs'
import { listTimeline } from '../workspace/workspace-store.mjs'
import { getAddomBuildIdentity } from '../runtime/addom-build-identity.mjs'
import { commitProjectedTimelineEvent } from '../chat/canonical-root-event-writer.mjs'

function isProviderOwnedRuntime(adapterProfile = null) {
  return String(
    adapterProfile?.providerNativeRuntime?.mode
    || adapterProfile?.openaiRuntimeSupport?.providerNativeRuntimeMode
    || adapterProfile?.openaiRuntimeSupport?.accountCapabilityContract?.providerNativeRuntime?.mode
    || '',
  ).trim().toLowerCase() === 'provider_owned_runtime'
}

function mergeUsedTools(current = [], observed = []) {
  return Array.from(new Set([
    ...(Array.isArray(current) ? current : []),
    ...(Array.isArray(observed) ? observed : []),
  ].map((value) => String(value || '').trim()).filter(Boolean))).sort()
}

function reconcileCanonicalToolEvidence({
  errorDiagnostics = {},
  activeTurnId = '',
  adapterProfile = null,
  readTimelineEvents = null,
} = {}) {
  const mutableLocalCount = Math.max(0, Number(errorDiagnostics.toolCallCount || 0) || 0)
  let evidence = null
  if (typeof readTimelineEvents === 'function') {
    try {
      evidence = summarizeCanonicalTurnToolEvidence(readTimelineEvents(), { turnId: activeTurnId })
    } catch {
      evidence = null
    }
  }
  if (!evidence?.available) {
    errorDiagnostics.localToolCallCount = mutableLocalCount
    errorDiagnostics.providerToolCallCount = 0
    errorDiagnostics.toolActivityEvidenceSource = isProviderOwnedRuntime(adapterProfile)
      ? 'unavailable'
      : 'mutable_counter'
    return { available: false, totalToolCallCount: mutableLocalCount }
  }

  const reconciledLocalCount = Math.max(mutableLocalCount, evidence.localToolCallCount)
  const totalToolCallCount = reconciledLocalCount + evidence.providerToolCallCount
  errorDiagnostics.localToolCallCount = reconciledLocalCount
  errorDiagnostics.providerToolCallCount = evidence.providerToolCallCount
  errorDiagnostics.toolCallCount = totalToolCallCount
  errorDiagnostics.toolActivityEvidenceSource = mutableLocalCount > evidence.localToolCallCount
    ? 'canonical_timeline_reconciled'
    : 'canonical_timeline'
  errorDiagnostics.usedTools = mergeUsedTools(errorDiagnostics.usedTools, evidence.usedTools)
  errorDiagnostics.providerRuntimeVersion = String(evidence.providerRuntimeVersion || '').trim()
  return { available: true, totalToolCallCount }
}

function applyRuntimeIdentityDiagnostics(
  errorDiagnostics = {},
  addomBuildIdentity = null,
  adapterProfile = null,
) {
  const build = addomBuildIdentity && typeof addomBuildIdentity === 'object'
    ? addomBuildIdentity
    : {}
  errorDiagnostics.addomBuildVersion = String(build.version || '').trim()
  errorDiagnostics.addomBuildMode = String(build.mode || '').trim().toLowerCase()
  errorDiagnostics.addomProcessId = Math.max(0, Number(build.processId || 0) || 0)
  errorDiagnostics.addomProcessStartedAt = String(build.processStartedAt || '').trim()

  const isOpenAIAccount = (
    String(adapterProfile?.providerId || errorDiagnostics.providerId || '').trim().toLowerCase() === 'openai'
    && String(
      adapterProfile?.openaiRuntimeSupport?.authMethod
      || errorDiagnostics.authMethod
      || '',
    ).trim().toLowerCase() === 'account'
  )
  if (!isOpenAIAccount) return
  const protocol = buildOpenAIAccountProtocolCapabilitySnapshot({
    runtimeIdentity: { version: errorDiagnostics.providerRuntimeVersion },
  })
  const imageGeneration = protocol.itemTypes.imageGeneration
  errorDiagnostics.imageGenerationSupportStatus = String(imageGeneration?.status || '').trim()
  errorDiagnostics.imageGenerationHandlerId = String(imageGeneration?.handlerId || '').trim()
  errorDiagnostics.imageGenerationQualificationStatus = String(imageGeneration?.qualification?.status || '').trim()
  errorDiagnostics.imageGenerationQualificationFixtureId = String(imageGeneration?.qualification?.fixtureId || '').trim()
}

export function createRuntimeDiagnosticsEmitter({
  errorDiagnostics = {},
  adapterProfile = null,
  getAdapterProfile = null,
  activeThreadId = '',
  activeTurnId = '',
  readTimelineEvents = null,
  addomBuildIdentity = null,
  send = () => {},
  persistTimelineEvent = () => {},
} = {}) {
  let runtimeDiagnosticsEmitted = false

  return ({ backgroundQueued = false, terminalState = '', terminalReason = '' } = {}) => {
    if (runtimeDiagnosticsEmitted || errorDiagnostics.runtimeDiagnosticsVisible !== true) return
    const currentAdapterProfile = typeof getAdapterProfile === 'function'
      ? (getAdapterProfile() || adapterProfile)
      : adapterProfile
    errorDiagnostics.wireApi = (
      backgroundQueued === true
      && String(currentAdapterProfile?.transportFamily || '').trim().toLowerCase() === 'openai_responses'
    )
      ? 'openai_background_response'
      : (String(currentAdapterProfile?.wireApi || '').trim() || 'ai_sdk_stream_text:unknown')
    const evidence = reconcileCanonicalToolEvidence({
      errorDiagnostics,
      activeTurnId,
      adapterProfile: currentAdapterProfile,
      readTimelineEvents: typeof readTimelineEvents === 'function'
        ? readTimelineEvents
        : () => listTimeline(activeThreadId, { limit: 5000 }),
    })
    applyRuntimeIdentityDiagnostics(
      errorDiagnostics,
      addomBuildIdentity || getAddomBuildIdentity(),
      currentAdapterProfile,
    )
    errorDiagnostics.modelEmittedToolCalls = Number(evidence.totalToolCallCount || 0) > 0
    errorDiagnostics.zeroToolExecuteTurn = (
      errorDiagnostics.mode === 'execute'
      && Number(errorDiagnostics.requestedToolCount || 0) > 0
      && Number(evidence.totalToolCallCount || 0) === 0
      && (evidence.available || !isProviderOwnedRuntime(currentAdapterProfile))
    )
    if (hasWriteIntentWithoutMutation(errorDiagnostics, { requireToolCalls: true })) {
      errorDiagnostics.toolWorkflowTerminalState = String(terminalState || '').trim().toLowerCase()
      errorDiagnostics.toolWorkflowTerminalReason = String(terminalReason || '').trim()
    }
    const detail = formatRuntimeDiagnosticsDetail(errorDiagnostics)
    if (!detail) return
    const summary = summarizeRuntimeDiagnostics(errorDiagnostics)
    const payload = {
      threadId: activeThreadId,
      turnId: activeTurnId,
      type: summary.type,
      label: summary.label,
      detail,
    }
    if (summary.type !== 'warning') return
    commitProjectedTimelineEvent({
      persistTimelineEvent, send, kind: 'runtime_diagnostics',
      options: { role: 'system', content: summary.label, meta: payload },
      channel: 'chat:runtime-diagnostics', payload,
    })
    runtimeDiagnosticsEmitted = true
  }
}
