import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getChatStreamPrereqError,
  getChatStreamPrereqFailure,
} from '../../src/main/chat/chat-stream-guards.mjs'

test('chat stream prereq guard blocks unsupported adapter availability before runtime execution starts', () => {
  const input = {
    providerId: 'openai',
    modelId: 'custom-openai-model',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: 'sk-test',
    isLocal: false,
    adapterProfile: {
      availability: {
        status: 'unsupported',
        selectionState: 'unsupported',
        requiresKey: true,
        configured: true,
      },
    },
  }
  const failure = getChatStreamPrereqFailure(input)
  const error = getChatStreamPrereqError(input)

  assert.equal(failure?.errorClass, 'capability_unsupported')
  assert.equal(failure?.canonicalErrorClass, 'capability_unsupported')
  assert.equal(
    error,
    'ADDOM does not currently support openai:custom-openai-model through the curated compatibility engine.',
  )
})

test('chat stream prereq guard blocks unconfigured curated models from adapter availability state', () => {
  const input = {
    providerId: 'gemini',
    modelId: 'gemini-2.5-pro',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: '',
    isLocal: false,
    adapterProfile: {
      availability: {
        status: 'verified',
        selectionState: 'curated',
        requiresKey: true,
        configured: false,
      },
    },
  }
  const failure = getChatStreamPrereqFailure(input)
  const error = getChatStreamPrereqError(input)

  assert.equal(failure?.errorClass, 'missing_prerequisite')
  assert.equal(failure?.canonicalErrorClass, 'missing_prerequisite')
  assert.equal(error, 'No API key for gemini. Add it in Settings.')
})

test('chat stream prereq guard still allows configured curated models', () => {
  const error = getChatStreamPrereqError({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: 'sk-test',
    isLocal: false,
    adapterProfile: {
      availability: {
        status: 'verified',
        selectionState: 'curated',
        requiresKey: true,
        configured: true,
      },
    },
  })

  assert.equal(error, '')
})

test('chat stream prereq guard does not reject generic non-curated models solely from unknown availability', () => {
  const error = getChatStreamPrereqError({
    providerId: 'openai',
    modelId: 'custom-openai-model',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: 'sk-test',
    isLocal: false,
    adapterProfile: {
      availability: {
        status: 'unknown',
        selectionState: 'generic',
        requiresKey: true,
        configured: true,
      },
    },
  })

  assert.equal(error, '')
})

test('chat stream prereq guard can surface auth-blocked account mode errors before API-key checks', () => {
  const input = {
    providerId: 'openai',
    modelId: 'gpt-5.4',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: '',
    isLocal: false,
    authMethod: 'account',
    authBlockedReason: 'account_runtime_unsupported',
    authBlockedMessage: 'This OpenAI capability is not available in the current runtime path.',
    authBlockedClass: 'capability_unsupported',
    authDiagnosticMessage: 'OpenAI account auth is connected, but this runtime path does not yet support account-mode execution.',
    adapterProfile: {
      availability: {
        status: 'unknown',
        selectionState: 'curated',
        requiresKey: true,
        configured: false,
      },
    },
  }
  const failure = getChatStreamPrereqFailure(input)
  const error = getChatStreamPrereqError(input)

  assert.equal(failure?.errorClass, 'capability_unsupported')
  assert.equal(failure?.canonicalErrorClass, 'capability_unsupported')
  assert.equal(failure?.diagnosticReason, 'account_runtime_unsupported')
  assert.match(String(failure?.diagnosticMessage || ''), /account-mode execution/i)
  assert.equal(error, 'This OpenAI capability is not available in the current runtime path.')
})

test('chat stream prereq guard blocks an account-unsupported model before dispatch', () => {
  const failure = getChatStreamPrereqFailure({
    providerId: 'openai',
    modelId: 'gpt-5.3-codex',
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: '',
    isLocal: false,
    authMethod: 'account',
    adapterProfile: {
      availability: { status: 'verified', selectionState: 'curated' },
      openaiRuntimeSupport: {
        accountRuntimeStatus: 'unsupported',
        accountRuntimeMessage: 'GPT-5.3 Codex is not supported with a ChatGPT account.',
      },
    },
  })

  assert.equal(failure?.errorClass, 'capability_unsupported')
  assert.equal(failure?.reason, 'account_model_unsupported')
  assert.match(failure?.message, /not supported.*ChatGPT account/i)
})
