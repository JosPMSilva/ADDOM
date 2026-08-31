import crypto from 'node:crypto'
import { isProviderChainCompactionAllowed } from './continuity/continuity-policy.mjs'
import { tryOpenAIProviderNativeCompaction } from './continuity/provider-native/openai-provider-native-compaction.mjs'
import {
  normalizeAnthropicCommandTurnOptions,
  normalizeOpenAICommandTurnOptions,
} from './chat-stream-precall-budget.mjs'
import {
  emitCompactionNotice,
  emitOpenAICompactionEvent,
} from './chat-stream-precall-compaction-helpers.mjs'
import { COMPACTION_MODES } from './continuity/compaction-mode-contract.mjs'
import { buildOpenAICompactionActivityId } from './chat-stream-precall-openai-command-helpers.mjs'

export function resolveEffectivePreCallCommandOptions({
  turnOptions = {},
  providerId = '',
  providerRuntimeSettings = null,
  continuityPolicy = null,
  model = '',
  activeThreadId = '',
  activeTurnId = '',
  send = () => {},
  persistTimelineEvent = () => {},
} = {}) {
  const openAICommandTurnOptions = normalizeOpenAICommandTurnOptions(turnOptions)
  const effectiveOpenAICommandTurnOptions = { ...openAICommandTurnOptions }
  const anthropicCommandTurnOptions = normalizeAnthropicCommandTurnOptions(turnOptions)
  const effectiveAnthropicCommandTurnOptions = { ...anthropicCommandTurnOptions }
  const normalizedProviderId = String(providerId || '').trim().toLowerCase()
  const openAIContinuityEnabled = normalizedProviderId === 'openai'
  const anthropicContinuityEnabled = normalizedProviderId === 'anthropic'
  const openAIRuntimeSettings = providerRuntimeSettings?.openai && typeof providerRuntimeSettings.openai === 'object'
    ? providerRuntimeSettings.openai
    : {}
  const openAIPromptCommandsEnabled = openAIRuntimeSettings.allowPromptCompactionCommands === true
  const openAIThresholdOverridesEnabled = openAIRuntimeSettings.allowPromptCompactionThresholdOverride === true

  if (effectiveOpenAICommandTurnOptions.forceServerSideCompaction) {
    if (!openAIContinuityEnabled) {
      emitCompactionNotice({
        send,
        persistTimelineEvent,
        threadId: activeThreadId,
        turnId: activeTurnId,
        type: 'warning',
        text: 'Compaction threshold override ignored: OpenAI must be the active provider for this command.',
        meta: {
          reason: 'provider_not_openai',
          explicit: true,
          providerId: normalizedProviderId,
          model: String(model || '').trim(),
        },
      })
      effectiveOpenAICommandTurnOptions.forceServerSideCompaction = false
      effectiveOpenAICommandTurnOptions.serverSideCompactionThresholdTokens = 0
    } else if (!openAIPromptCommandsEnabled) {
      emitCompactionNotice({
        send,
        persistTimelineEvent,
        threadId: activeThreadId,
        turnId: activeTurnId,
        type: 'warning',
        text: 'Compaction threshold override ignored: prompt-triggered compaction commands are disabled in OpenAI runtime settings.',
        meta: {
          reason: 'commands_disabled',
          explicit: true,
          providerId: 'openai',
          model: String(model || '').trim(),
        },
      })
      effectiveOpenAICommandTurnOptions.forceServerSideCompaction = false
      effectiveOpenAICommandTurnOptions.serverSideCompactionThresholdTokens = 0
    } else if (!openAIThresholdOverridesEnabled) {
      emitCompactionNotice({
        send,
        persistTimelineEvent,
        threadId: activeThreadId,
        turnId: activeTurnId,
        type: 'warning',
        text: 'Compaction threshold override ignored: per-turn threshold overrides are disabled in OpenAI runtime settings.',
        meta: {
          reason: 'threshold_override_disabled',
          explicit: true,
          providerId: 'openai',
          model: String(model || '').trim(),
        },
      })
      effectiveOpenAICommandTurnOptions.forceServerSideCompaction = false
      effectiveOpenAICommandTurnOptions.serverSideCompactionThresholdTokens = 0
    }
  }

  if (effectiveAnthropicCommandTurnOptions.forceContextManagementCompaction) {
    if (!anthropicContinuityEnabled) {
      emitCompactionNotice({
        send,
        persistTimelineEvent,
        threadId: activeThreadId,
        turnId: activeTurnId,
        persistEventName: 'anthropic_compaction_notice',
        type: 'warning',
        text: 'Compaction threshold override ignored: Anthropic must be the active provider for this command.',
        meta: {
          reason: 'provider_not_anthropic',
          explicit: true,
          providerId: normalizedProviderId,
          model: String(model || '').trim(),
        },
      })
      effectiveAnthropicCommandTurnOptions.forceContextManagementCompaction = false
      effectiveAnthropicCommandTurnOptions.contextManagementCompactionThresholdTokens = 0
      effectiveAnthropicCommandTurnOptions.contextManagementCompactionInstructions = ''
    } else if (!isProviderChainCompactionAllowed('anthropic', continuityPolicy || {})) {
      emitCompactionNotice({
        send,
        persistTimelineEvent,
        threadId: activeThreadId,
        turnId: activeTurnId,
        persistEventName: 'anthropic_compaction_notice',
        type: 'warning',
        text: 'Anthropic compaction threshold override ignored: Anthropic provider compaction is disabled in continuity policy.',
        meta: {
          reason: 'provider_chain_compaction_disabled',
          explicit: true,
          providerId: 'anthropic',
          model: String(model || '').trim(),
        },
      })
      effectiveAnthropicCommandTurnOptions.forceContextManagementCompaction = false
      effectiveAnthropicCommandTurnOptions.contextManagementCompactionThresholdTokens = 0
      effectiveAnthropicCommandTurnOptions.contextManagementCompactionInstructions = ''
    } else if (effectiveAnthropicCommandTurnOptions.contextManagementCompactionThresholdTokens <= 0) {
      emitCompactionNotice({
        send,
        persistTimelineEvent,
        threadId: activeThreadId,
        turnId: activeTurnId,
        persistEventName: 'anthropic_compaction_notice',
        type: 'warning',
        text: 'Anthropic compaction threshold override ignored: provide a positive token threshold for Anthropic context management.',
        meta: {
          reason: 'invalid_threshold',
          explicit: true,
          providerId: 'anthropic',
          model: String(model || '').trim(),
        },
      })
      effectiveAnthropicCommandTurnOptions.forceContextManagementCompaction = false
      effectiveAnthropicCommandTurnOptions.contextManagementCompactionThresholdTokens = 0
      effectiveAnthropicCommandTurnOptions.contextManagementCompactionInstructions = ''
    }
  }

  return {
    openAICommandTurnOptions,
    effectiveOpenAICommandTurnOptions,
    anthropicCommandTurnOptions,
    effectiveAnthropicCommandTurnOptions,
    openAIContinuityEnabled,
    anthropicContinuityEnabled,
  }
}

export function buildPreCallContinuityIdentity({
  history = [],
  activeToolDefinitions = {},
  providerId = '',
  model = '',
} = {}) {
  const stablePromptText = history
    .filter((message) => {
      const role = String(message?.role || '').trim().toLowerCase()
      return role === 'system' || role === 'developer'
    })
    .map((message) => String(message?.content || ''))
    .join('\n')
  const toolsetHash = crypto.createHash('sha256')
    .update(JSON.stringify(Object.keys(activeToolDefinitions || {}).sort()))
    .digest('hex')
    .slice(0, 16)
  const systemPromptHash = crypto.createHash('sha256')
    .update(stablePromptText)
    .digest('hex')
    .slice(0, 16)
  const continuitySignature = crypto.createHash('sha256')
    .update(JSON.stringify({
      providerId: String(providerId || '').trim().toLowerCase(),
      model: String(model || '').trim(),
      toolsetHash,
      systemPromptHash,
    }))
    .digest('hex')
    .slice(0, 16)
  return {
    toolsetHash,
    systemPromptHash,
    continuitySignature,
  }
}

export function createOpenAIProviderNativeCompactionRunner({
  enabled = false,
  activeThreadId = '',
  activeTurnId = '',
  model = '',
  candidateCompactionModes = [],
  providerId = '',
  continuityPolicy = null,
  history = [],
  effectiveOpenAIContinuation = null,
  apiKey = '',
  send = () => {},
  persistTimelineEvent = () => {},
} = {}) {
  if (!enabled) return null
  return async (providerNativePayload = {}) => {
    const automaticProviderCompactionActivityId = buildOpenAICompactionActivityId({
      threadId: activeThreadId,
      turnId: activeTurnId,
      mode: 'automatic',
      compactionEventType: 'provider_chain_compaction',
    })
    emitOpenAICompactionEvent({
      send,
      persistTimelineEvent,
      activityId: automaticProviderCompactionActivityId,
      threadId: activeThreadId,
      turnId: activeTurnId,
      providerId: 'openai',
      model: String(model || '').trim(),
      status: 'requested',
      mode: 'automatic',
      reason: 'automatic_compaction_requested',
      selectedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
      candidateCompactionModes,
      compactionEventType: 'provider_chain_compaction',
      compactionEventPhase: 'running',
      compactionEventOccurred: false,
    })
    const providerNativeMeta = await tryOpenAIProviderNativeCompaction({
      providerId: String(providerId || '').trim().toLowerCase(),
      policy: continuityPolicy || {},
      history: Array.isArray(providerNativePayload?.history) ? providerNativePayload.history : history,
      model: String(model ?? ''),
      previousResponseId: String(effectiveOpenAIContinuation?.previousResponseId || ''),
      apiKey,
      historyTokenEstimate: Number(providerNativePayload?.historyTokenEstimate || 0) || 0,
      packetTokens: Number(providerNativePayload?.packetTokens || 0) || 0,
      promptCacheKey: String(providerNativePayload?.promptCacheKey || ''),
    })
    if (providerNativeMeta?.used === true) {
      emitOpenAICompactionEvent({
        send,
        persistTimelineEvent,
        activityId: automaticProviderCompactionActivityId,
        threadId: activeThreadId,
        turnId: activeTurnId,
        providerId: 'openai',
        model: String(model || '').trim(),
        status: 'applied',
        mode: 'automatic',
        reason: 'compacted',
        responseId: String(providerNativeMeta?.responseId || ''),
        compactionId: String(providerNativeMeta?.compactionId || ''),
        selectedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
        candidateCompactionModes,
        compactionEventType: 'provider_chain_compaction',
        compactionEventPhase: 'resumed_after',
        compactionEventOccurred: true,
      })
    } else {
      const automaticFailureReason = String(providerNativeMeta?.reason || 'unknown_reason')
      emitOpenAICompactionEvent({
        send,
        persistTimelineEvent,
        activityId: automaticProviderCompactionActivityId,
        threadId: activeThreadId,
        turnId: activeTurnId,
        providerId: 'openai',
        model: String(model || '').trim(),
        status: 'failed',
        mode: 'automatic',
        reason: automaticFailureReason,
        selectedCompactionMode: COMPACTION_MODES.PROVIDER_CHAIN_COMPACTION,
        candidateCompactionModes,
        compactionFailureReason: automaticFailureReason,
        fallbackCompactionMode: COMPACTION_MODES.LOCAL_SUMMARY,
        fallbackReason: 'provider_chain_compaction_unavailable',
        compactionEventType: 'provider_chain_compaction',
        compactionEventPhase: 'running',
        compactionEventOccurred: false,
      })
    }
    return providerNativeMeta
  }
}
