import { normalizeAssistantPhase } from '../../common/chat/assistant-phase.mjs'
import { resolveRegistryModel } from '../../common/api-clients/model-registry.mjs'
import {
  resolveModelAttachmentSupport,
} from '../../common/attachments/attachment-support-policy.mjs'
import { buildOpenAIProviderOptions } from './ai-provider-openai-runtime.mjs'
import { isLikelyOllamaThinkingModelId } from './ai-provider-model-utils.mjs'
import { normalizeGeminiToolSchemas } from './gemini-tool-schema-normalization.mjs'
import { resolveProviderPromptBudgetProfile } from '../chat/provider-prompt-budget-profile.mjs'
import {
  annotateAnthropicPromptCacheControl,
  adaptNormalizedToolResultMessage,
  applyMistralSequenceShim,
  downgradeUnsupportedUserAttachments,
  filterAnthropicEmptyMessageParts,
  flattenUserContentPartsToString,
  normalizeMessageForProviderTransform,
  normalizeStructuredContentParts,
  normalizeToolCallIdsForProvider,
  replayInterleavedReasoningMessage,
  resolveInterleavedReasoningReplayTarget,
} from './provider-model-transform-message-utils.mjs'
import { resolveProviderModelAdapter } from './provider-model-adapters.mjs'

export {
  flattenContentPartsToString,
  flattenStructuredTextOnlyContent,
  flattenUserContentPartsToString,
  normalizeStructuredContentParts,
  normalizeToolResultMediaMessages,
  replayInterleavedReasoningMessage,
  resolveInterleavedReasoningReplayTarget,
} from './provider-model-transform-message-utils.mjs'

function trimString(value = '') {
  return String(value || '').trim()
}

function normalizeProviderId(value = '') {
  return trimString(value).toLowerCase()
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function mergePlainObjects(base = {}, override = {}) {
  const left = isPlainObject(base) ? base : {}
  const right = isPlainObject(override) ? override : {}
  const merged = { ...left }

  for (const [key, value] of Object.entries(right)) {
    if (isPlainObject(value) && isPlainObject(left[key])) {
      merged[key] = mergePlainObjects(left[key], value)
      continue
    }
    merged[key] = cloneJson(value)
  }

  return merged
}

function normalizePositiveInteger(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim().length === 0) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.round(numeric)
}

function resolveRequestedVariantId(runtimeSettings = null, requestContext = {}) {
  const sources = [
    requestContext?.modelVariantId,
    requestContext?.variantId,
    runtimeSettings?.modelVariantId,
    runtimeSettings?.variantId,
  ]
  for (const source of sources) {
    const id = trimString(source)
    if (id) return id
  }
  return ''
}

function resolveSelectedVariant(registryModel = null, runtimeSettings = null, requestContext = {}) {
  const variants = Array.isArray(registryModel?.variants) ? registryModel.variants : []
  if (variants.length === 0) return null

  const requestedVariantId = resolveRequestedVariantId(runtimeSettings, requestContext).toLowerCase()
  if (requestedVariantId) {
    return variants.find((variant) => trimString(variant?.id).toLowerCase() === requestedVariantId) || null
  }

  return variants.find((variant) => variant?.default === true) || null
}

function resolveCatalogOutputLimit(registryModel = null) {
  return normalizePositiveInteger(
    registryModel?.maxOutputTokens
    ?? registryModel?.limits?.output
    ?? null,
  )
}

function resolveRequestedMaxOutputTokens({
  requestedMaxOutputTokens = null,
  runtimeSettings = null,
  requestContext = {},
} = {}) {
  const direct = normalizePositiveInteger(requestedMaxOutputTokens)
  if (direct !== null) return direct

  const contextual = normalizePositiveInteger(
    requestContext?.maxOutputTokens
    ?? runtimeSettings?.maxOutputTokens
    ?? null,
  )
  return contextual
}

function resolveCatalogDrivenProviderOptions({
  registryModel = null,
  selectedVariant = null,
  metadataOptions = undefined,
} = {}) {
  const merged = mergePlainObjects(
    registryModel?.defaultProviderOptions,
    selectedVariant?.providerOptions,
  )
  const withMetadata = mergePlainObjects(merged, metadataOptions)
  const normalized = normalizeProviderOptionsPayload(withMetadata)
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function normalizeProviderOptionsPayload(providerOptions = {}) {
  const normalized = isPlainObject(providerOptions) ? cloneJson(providerOptions) : {}
  const anthropicThinking = normalized?.anthropic?.thinking
  if (!isPlainObject(anthropicThinking)) return normalized

  const thinkingType = trimString(anthropicThinking.type).toLowerCase()
  if (thinkingType === 'disabled') {
    normalized.anthropic = {
      ...(isPlainObject(normalized.anthropic) ? normalized.anthropic : {}),
      thinking: { type: 'disabled' },
    }
    return normalized
  }

  if (thinkingType === 'adaptive') {
    normalized.anthropic = {
      ...(isPlainObject(normalized.anthropic) ? normalized.anthropic : {}),
      thinking: { type: 'adaptive' },
    }
  }

  return normalized
}

function resolveMetadataDrivenOptions({
  providerId = '',
  modelId = '',
  runtimeSettings = null,
  requestContext = {},
  adapterProfile = null,
  registryModel = null,
} = {}) {
  const provider = normalizeProviderId(providerId)
  const options = {}

  if (provider === 'anthropic') {
    Object.assign(options, buildAnthropicProviderOptions({
      runtimeSettings,
      requestContext,
      registryModel,
    }))
  }

  if (provider === 'openai') {
    Object.assign(options, buildOpenAIProviderOptions({
      modelId,
      runtimeSettings,
      requestContext,
      adapterProfile,
    }))
  }

  const optionFamily = String(adapterProfile?.optionFamily || '').trim().toLowerCase()
  if (optionFamily === 'openai_compatible_thinking_toggle' && isLikelyOllamaThinkingModelId(modelId)) {
    options.openaiCompatible = { think: true }
  }

  return Object.keys(options).length > 0 ? options : undefined
}

function resolveAnthropicRequestSettingValue(requestContext = {}, runtimeSettings = {}, key = '') {
  const scopedRequest = requestContext?.anthropic && typeof requestContext.anthropic === 'object'
    ? requestContext.anthropic
    : {}
  if (Object.prototype.hasOwnProperty.call(scopedRequest, key)) {
    return scopedRequest[key]
  }
  return runtimeSettings?.[key]
}

function buildAnthropicProviderOptions({
  runtimeSettings = null,
  requestContext = {},
  registryModel = null,
} = {}) {
  const normalizedThinkingType = trimString(
    resolveAnthropicRequestSettingValue(
      requestContext,
      runtimeSettings,
      'thinkingType',
    ),
  ).toLowerCase()
  const normalizedEffort = trimString(
    resolveAnthropicRequestSettingValue(
      requestContext,
      runtimeSettings,
      'reasoningEffort',
    ),
  ).toLowerCase()
  const useContextManagementCompaction = (
    resolveAnthropicRequestSettingValue(
      requestContext,
      runtimeSettings,
      'useContextManagementCompaction',
    ) === true
  )
  const options = {}
  const reasoningControls = Array.isArray(registryModel?.capabilities?.reasoning?.providerControls)
    ? registryModel.capabilities.reasoning.providerControls.map((entry) => trimString(entry).toLowerCase())
    : []
  const supportsAnthropicThinkingType = reasoningControls.includes('anthropic:thinking.type')
  const supportsAnthropicThinkingDisable = reasoningControls.includes('anthropic:thinking.disable')
  const supportsAnthropicEffort = reasoningControls.includes('anthropic:effort')

  if (
    supportsAnthropicThinkingType
    && normalizedThinkingType
    && normalizedThinkingType !== 'provider_default'
  ) {
    options.thinking = { type: normalizedThinkingType }
  }

  if (supportsAnthropicThinkingDisable && normalizedThinkingType === 'disabled') {
    options.thinking = { type: 'disabled' }
  }

  if (supportsAnthropicEffort && normalizedEffort && normalizedEffort !== 'provider_default') {
    options.effort = normalizedEffort
  }

  if (useContextManagementCompaction) {
    const thresholdTokens = normalizePositiveInteger(
      resolveAnthropicRequestSettingValue(
        requestContext,
        runtimeSettings,
        'contextManagementCompactionThresholdTokens',
      ),
    )

    if (thresholdTokens !== null) {
      const instructions = trimString(
        resolveAnthropicRequestSettingValue(
          requestContext,
          runtimeSettings,
          'contextManagementCompactionInstructions',
        ),
      )

      const edit = {
        type: 'compact_20260112',
        trigger: {
          type: 'input_tokens',
          value: thresholdTokens,
        },
      }
      if (instructions) {
        edit.instructions = instructions
      }

      options.contextManagement = {
        edits: [edit],
      }
    }
  }

  return Object.keys(options).length > 0
    ? { anthropic: options }
    : undefined
}

function resolveInvocationConfig({
  providerId = '',
  modelId = '',
  runtimeSettings = null,
  requestContext = {},
  adapterProfile = null,
  registryModel = null,
  requestedMaxOutputTokens = null,
} = {}) {
  const selectedVariant = resolveSelectedVariant(registryModel, runtimeSettings, requestContext)
  const metadataOptions = resolveMetadataDrivenOptions({
    providerId,
    modelId,
    runtimeSettings,
    requestContext,
    adapterProfile,
    registryModel,
  })
  const providerOptions = resolveCatalogDrivenProviderOptions({
    registryModel,
    selectedVariant,
    metadataOptions,
  })
  const promptBudgetProfile = resolveProviderPromptBudgetProfile({
    providerId,
    modelId,
    mode: requestContext?.mode,
    runtimeSettings,
    requestContext,
  })
  const catalogOutputLimit = resolveCatalogOutputLimit(registryModel)
  const requestedOutputLimit = resolveRequestedMaxOutputTokens({
    requestedMaxOutputTokens,
    runtimeSettings,
    requestContext,
  })
  const profileOutputLimit = requestedOutputLimit === null
    ? normalizePositiveInteger(promptBudgetProfile?.defaultMaxOutputTokens)
    : null
  const effectiveOutputLimit = requestedOutputLimit ?? profileOutputLimit
  const maxOutputTokens = effectiveOutputLimit === null
    ? null
    : (
        catalogOutputLimit === null
          ? effectiveOutputLimit
          : Math.min(effectiveOutputLimit, catalogOutputLimit)
      )

  return {
    providerOptions,
    selectedVariantId: trimString(selectedVariant?.id) || null,
    maxOutputTokens,
    modelMaxOutputTokens: catalogOutputLimit,
    promptBudgetProfile,
  }
}

function normalizeMessagesWithTransform({
  providerId = '',
  messages = [],
  adapterProfile = null,
  attachment = null,
  registryModel = null,
  preserveUserAttachments = false,
} = {}) {
  const provider = normalizeProviderId(providerId)
  const rows = Array.isArray(messages) ? messages : []
  const openAISupportsAssistantPhase = (
    provider === 'openai'
    && adapterProfile?.promptPolicy?.assistantPhase === 'recommended'
  )
  const interleavedReasoningReplayTarget = resolveInterleavedReasoningReplayTarget(
    registryModel?.capabilities?.interleavedReasoning,
  )

  const normalizeSingleMessage = (message) => {
    const role = String(message?.role || '').trim().toLowerCase()
    const normalizedPhase = normalizeAssistantPhase(message?.phase)
    let nextMessage = normalizeMessageForProviderTransform(message)
    const providerHistoryParts = Array.isArray(message?.providerHistoryParts)
      ? normalizeStructuredContentParts(message.providerHistoryParts)
      : null

    if (!preserveUserAttachments) {
      nextMessage = downgradeUnsupportedUserAttachments({
        providerId: provider,
        message: nextMessage,
        attachment,
        registryModel,
      })
    }

    if (provider === 'openai') {
      const content = Array.isArray(nextMessage?.content) ? nextMessage.content : null
      if (content) {
        const sanitizedContent = content.filter((part) => {
          const type = String(part?.type || '').trim().toLowerCase()
          return type !== 'reasoning'
        })
        if (sanitizedContent.length !== content.length) {
          nextMessage = { ...nextMessage, content: sanitizedContent }
        }
      }
    }

    if (provider === 'anthropic') {
      if (role === 'assistant' && providerHistoryParts && providerHistoryParts.length > 0) {
        nextMessage = {
          ...nextMessage,
          content: providerHistoryParts,
        }
      }
      nextMessage = filterAnthropicEmptyMessageParts(nextMessage)
      if (!nextMessage) return null
    }

    nextMessage = replayInterleavedReasoningMessage(
      nextMessage,
      interleavedReasoningReplayTarget,
    )

    if (role === 'assistant') {
      if (openAISupportsAssistantPhase && normalizedPhase) {
        nextMessage = { ...nextMessage, phase: normalizedPhase }
      } else if (Object.prototype.hasOwnProperty.call(nextMessage || {}, 'phase')) {
        nextMessage = { ...nextMessage }
        delete nextMessage.phase
      }
    }

    if (role !== 'user') return nextMessage
    if (!shouldFlattenUserContentForProvider({
      adapterProfile,
      attachment,
    })) return nextMessage

    return {
      ...nextMessage,
      content: flattenUserContentPartsToString(message?.content),
    }
  }

  const normalized = []
  const mistralIdMap = provider === 'mistral' ? new Map() : null
  for (const rawMessage of rows) {
    const nextMessage = normalizeSingleMessage(rawMessage)
    if (!nextMessage) continue
    const providerNormalizedMessage = normalizeToolCallIdsForProvider({
      providerId: provider,
      message: nextMessage,
      mistralIdMap,
    })
    normalized.push(adaptNormalizedToolResultMessage(providerNormalizedMessage))
  }

  const providerNormalizedMessages = provider === 'anthropic'
    ? annotateAnthropicPromptCacheControl(normalized)
    : normalized

  return provider === 'mistral'
    ? applyMistralSequenceShim(providerNormalizedMessages)
    : providerNormalizedMessages
}

function shouldFlattenUserContentForProvider({
  adapterProfile = null,
  attachment = null,
} = {}) {
  const transportFamily = String(adapterProfile?.transportFamily || '').trim().toLowerCase()
  if (transportFamily !== 'groq_chat') return false
  return attachment?.supportsVision !== true
}

export function resolveProviderModelTransform({
  providerId = '',
  modelId = '',
  adapterProfile = null,
  registryModelOverride = null,
} = {}) {
  const resolvedAdapterProfile = adapterProfile || resolveProviderModelAdapter(providerId, modelId)
  const normalizedProviderId = normalizeProviderId(providerId)
  const effectiveModelId = trimString(resolvedAdapterProfile?.adapterModelId || modelId)
  const registryResolution = resolveRegistryModel(normalizedProviderId, effectiveModelId)
  const registryModel = registryModelOverride && typeof registryModelOverride === 'object'
    ? cloneJson(registryModelOverride)
    : (registryResolution?.model || null)
  const attachment = resolvedAdapterProfile?.attachment
    ? cloneJson(resolvedAdapterProfile.attachment)
    : resolveModelAttachmentSupport(registryModel || {})

  return Object.freeze({
    providerId: normalizedProviderId,
    modelId: effectiveModelId,
    adapterProfile: cloneJson(resolvedAdapterProfile),
    registryModel: cloneJson(registryModel),
    attachment,
    resolveInvocationConfig({ runtimeSettings = null, requestContext = {}, requestedMaxOutputTokens = null } = {}) {
      return resolveInvocationConfig({
        providerId: normalizedProviderId,
        modelId: effectiveModelId,
        runtimeSettings,
        requestContext,
        adapterProfile: resolvedAdapterProfile,
        registryModel,
        requestedMaxOutputTokens,
      })
    },
    buildProviderOptions({ runtimeSettings = null, requestContext = {} } = {}) {
      return resolveInvocationConfig({
        providerId: normalizedProviderId,
        modelId: effectiveModelId,
        runtimeSettings,
        requestContext,
        adapterProfile: resolvedAdapterProfile,
        registryModel,
      }).providerOptions
    },
    normalizeMessages({ messages = [], preserveUserAttachments = false } = {}) {
      return normalizeMessagesWithTransform({
        providerId: normalizedProviderId,
        messages,
        adapterProfile: resolvedAdapterProfile,
        attachment,
        registryModel,
        preserveUserAttachments,
      })
    },
    normalizeTools({ tools = {} } = {}) {
      if (normalizedProviderId === 'gemini') {
        return normalizeGeminiToolSchemas(tools)
      }
      return tools
    },
  })
}
