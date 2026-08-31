import { ipcMain } from 'electron'
import * as vault from '../vault.mjs'
import { createInlineCompletion } from '../api-clients/ai-provider.mjs'
import { createOpenAIAccountInlineCompletion } from '../api-clients/ai-provider-openai-account.mjs'
import {
  buildInlineCompletionMessages,
  isLocalProviderId,
  normalizeInlineCompletionPayload,
  sanitizeInlineCompletionText,
} from './editor-completion-utils.mjs'
import { recordGlobalInlineCompletionTelemetryEvent } from '../editor/inline-completion-telemetry.mjs'
import { getSettings } from '../settings.mjs'
import { handleVersioned } from '../ipc/ipc-versioning.mjs'
import { resolveOpenAIExecutionAuth } from '../openai-account/openai-execution-auth.mjs'

const INLINE_COMPLETION_MAX_OUTPUT_TOKENS = 160

function assertTestOnlyEditorCompletionAccess() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Test-only editor completion helper called in non-test environment.')
  }
  if (!process.env.ADDOM_USER_DATA_PATH && process.env.NODE_ENV !== 'test') {
    throw new Error('Test-only editor completion helper requires a test user-data path.')
  }
}

function missingApiKeyResponse(providerId = '') {
  return {
    ok: true,
    available: false,
    reason: 'missing_api_key',
    message: `No API key for ${providerId}. Add it in Settings.`,
  }
}

function blockedAuthResponse(message = '', reason = 'auth_blocked') {
  return {
    ok: true,
    available: false,
    reason: String(reason || 'auth_blocked').trim() || 'auth_blocked',
    message: String(message || 'OpenAI authentication is unavailable for inline completion.').trim(),
  }
}

async function requestInlineCompletion(payload = {}) {
  const normalized = normalizeInlineCompletionPayload(payload)
  if (!normalized.ok) {
    recordGlobalInlineCompletionTelemetryEvent('error', {
      reason: normalized.error,
    })
    return {
      ok: false,
      error: normalized.error,
    }
  }

  const req = normalized.value
  const settings = getSettings()
  if (settings.inlineCompletionEnabled === false) {
    recordGlobalInlineCompletionTelemetryEvent('empty', {
      providerId: req.providerId,
      model: req.model,
      filePath: req.filePath,
      reason: 'disabled',
    })
    return {
      ok: true,
      available: false,
      reason: 'disabled',
    }
  }
  recordGlobalInlineCompletionTelemetryEvent('request', {
    providerId: req.providerId,
    model: req.model,
    filePath: req.filePath,
  })
  const providerId = String(req.providerId || '').trim().toLowerCase()
  const openAIAuth = providerId === 'openai'
    ? resolveOpenAIExecutionAuth({ allowAccountRuntime: true })
    : null
  const usesOpenAIAccountRuntime = providerId === 'openai' && openAIAuth?.authMethod === 'account'
  const apiKey = providerId === 'openai'
    ? String(openAIAuth?.apiKey || '')
    : String(vault.getKey(req.providerId) || '')
  if (providerId === 'openai' && openAIAuth?.ok !== true) {
    recordGlobalInlineCompletionTelemetryEvent('error', {
      providerId: req.providerId,
      model: req.model,
      filePath: req.filePath,
      reason: String(openAIAuth?.blockedReason || 'auth_blocked'),
    })
    return blockedAuthResponse(
      openAIAuth?.userFacingBlockedMessage
      || openAIAuth?.blockedMessage
      || 'OpenAI authentication is unavailable for inline completion.',
      openAIAuth?.blockedReason || 'auth_blocked',
    )
  }
  if (!apiKey && !isLocalProviderId(req.providerId)) {
    recordGlobalInlineCompletionTelemetryEvent('error', {
      providerId: req.providerId,
      model: req.model,
      filePath: req.filePath,
      reason: 'missing_api_key',
    })
    return missingApiKeyResponse(req.providerId)
  }

  try {
    const messages = buildInlineCompletionMessages(req)
    const completionOptions = {
      model: req.model,
      messages,
      maxOutputTokens: INLINE_COMPLETION_MAX_OUTPUT_TOKENS,
      providerRuntimeSettings: settings?.providerRuntimeSettings?.openai,
      requestContext: {
        projectId: '',
        threadId: '',
      },
    }
    const completionResult = usesOpenAIAccountRuntime
      ? await createOpenAIAccountInlineCompletion({
        messages,
        options: completionOptions,
      })
      : await createInlineCompletion(req.providerId, apiKey, completionOptions)
    const completion = sanitizeInlineCompletionText(completionResult?.text || '', {
      prefix: req.prefix,
      suffix: req.suffix,
    })
    if (!completion) {
      recordGlobalInlineCompletionTelemetryEvent('empty', {
        providerId: req.providerId,
        model: req.model,
        filePath: req.filePath,
      })
      return {
        ok: true,
        available: false,
        reason: 'empty_completion',
      }
    }
    recordGlobalInlineCompletionTelemetryEvent('success', {
      providerId: req.providerId,
      model: req.model,
      filePath: req.filePath,
      chars: completion.length,
    })
    return {
      ok: true,
      available: true,
      providerId: req.providerId,
      model: req.model,
      completion,
    }
  } catch (error) {
    recordGlobalInlineCompletionTelemetryEvent('error', {
      providerId: req.providerId,
      model: req.model,
      filePath: req.filePath,
      reason: String(error?.message || error || 'provider_error'),
    })
    return {
      ok: true,
      available: false,
      reason: 'provider_error',
      message: String(error?.message || error || 'Failed to generate completion.'),
    }
  }
}

function normalizeInlineTelemetryPayload(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const eventType = String(source.eventType || source.type || '').trim().toLowerCase()
  if (eventType !== 'accept' && eventType !== 'dismiss') return null
  return {
    eventType,
    providerId: String(source.providerId || '').trim().toLowerCase(),
    model: String(source.model || '').trim(),
    filePath: String(source.filePath || '').trim(),
    chars: Math.max(0, Number(source.chars || 0) || 0),
    reason: String(source.reason || '').trim().toLowerCase().slice(0, 120),
  }
}

export function registerEditorCompletionHandlers() {
  handleVersioned(ipcMain, 'editor:request-inline-completion', async (_event, payload = {}) => {
    return requestInlineCompletion(payload || {})
  })
  handleVersioned(ipcMain, 'editor:log-inline-completion-telemetry', async (_event, payload = {}) => {
    const normalized = normalizeInlineTelemetryPayload(payload)
    if (!normalized) return { ok: false, error: 'invalid_event_type' }
    recordGlobalInlineCompletionTelemetryEvent(normalized.eventType, {
      providerId: normalized.providerId,
      model: normalized.model,
      filePath: normalized.filePath,
      chars: normalized.chars,
      reason: normalized.reason,
    })
    return { ok: true }
  })
}

export const __testEditorCompletionInternals = Object.freeze({
  missingApiKeyResponse: (...args) => {
    assertTestOnlyEditorCompletionAccess()
    return missingApiKeyResponse(...args)
  },
  requestInlineCompletion: async (...args) => {
    assertTestOnlyEditorCompletionAccess()
    return requestInlineCompletion(...args)
  },
})
