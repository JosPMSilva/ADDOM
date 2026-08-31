import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCancelledOpenAIAccountMcpElicitationResponse,
  normalizeOpenAIAccountMcpElicitationRequest,
  normalizeOpenAIAccountMcpElicitationSubmission,
} from '../../src/main/api-clients/ai-provider-openai-account-elicitation.mjs'

function buildFormRequest(overrides = {}) {
  return {
    threadId: 'provider_thread_1',
    turnId: 'provider_turn_1',
    serverName: 'example-mcp',
    mode: 'form',
    message: 'Choose deployment settings.',
    requestedSchema: {
      type: 'object',
      properties: {
        environment: {
          type: 'string',
          title: 'Environment',
          oneOf: [
            { const: 'staging', title: 'Staging' },
            { const: 'production', title: 'Production' },
          ],
          default: 'staging',
        },
        replicas: {
          type: 'integer',
          title: 'Replicas',
          minimum: 1,
          maximum: 10,
          default: 2,
        },
        notify: {
          type: 'boolean',
          title: 'Send notification',
          default: true,
        },
        tags: {
          type: 'array',
          title: 'Tags',
          minItems: 1,
          maxItems: 2,
          items: {
            anyOf: [
              { const: 'frontend', title: 'Frontend' },
              { const: 'backend', title: 'Backend' },
            ],
          },
          default: ['frontend'],
        },
      },
      required: ['environment', 'replicas'],
    },
    _meta: {
      privateProviderPayload: 'must-not-cross-the-boundary',
    },
    ...overrides,
  }
}

test('MCP elicitation normalizer produces a bounded renderer-safe form contract', () => {
  const normalized = normalizeOpenAIAccountMcpElicitationRequest(buildFormRequest())

  assert.equal(normalized.valid, true)
  assert.equal(normalized.elicitation.mode, 'form')
  assert.equal(normalized.elicitation.serverName, 'example-mcp')
  assert.equal(normalized.elicitation.message, 'Choose deployment settings.')
  assert.equal(normalized.elicitation.fields.length, 4)
  assert.deepEqual(normalized.elicitation.fields.map((field) => field.kind), [
    'single_select',
    'integer',
    'boolean',
    'multi_select',
  ])
  assert.equal(normalized.elicitation.fields[0].required, true)
  assert.equal(normalized.elicitation.fields[2].required, false)
  assert.equal(Object.hasOwn(normalized.elicitation, '_meta'), false)
  assert.equal(JSON.stringify(normalized).includes('privateProviderPayload'), false)
})

test('MCP elicitation normalizer rejects unknown schema fields and URL mode', () => {
  const unknownField = buildFormRequest()
  unknownField.requestedSchema.properties.environment.rawHtml = '<b>unsafe</b>'
  assert.deepEqual(normalizeOpenAIAccountMcpElicitationRequest(unknownField), {
    valid: false,
    reason: 'unsupported_field_schema',
    elicitation: null,
  })

  assert.deepEqual(normalizeOpenAIAccountMcpElicitationRequest({
    threadId: 'provider_thread_1',
    serverName: 'example-mcp',
    mode: 'url',
    message: 'Open this page.',
    url: 'https://example.test/login',
    elicitationId: 'elicit_1',
  }), {
    valid: false,
    reason: 'unsupported_url_mode',
    elicitation: null,
  })
})

test('MCP elicitation submission accepts only typed content declared by the form', () => {
  const { elicitation } = normalizeOpenAIAccountMcpElicitationRequest(buildFormRequest())
  const accepted = normalizeOpenAIAccountMcpElicitationSubmission(elicitation, {
    environment: 'production',
    replicas: 3,
    notify: false,
    tags: ['frontend', 'backend'],
  })

  assert.deepEqual(accepted, {
    valid: true,
    content: {
      environment: 'production',
      replicas: 3,
      notify: false,
      tags: ['frontend', 'backend'],
    },
  })

  assert.equal(normalizeOpenAIAccountMcpElicitationSubmission(elicitation, {
    environment: 'production',
    replicas: 3,
    unexpected: 'value',
  }).valid, false)
  assert.equal(normalizeOpenAIAccountMcpElicitationSubmission(elicitation, {
    environment: 'other',
    replicas: 3,
  }).valid, false)
  assert.equal(normalizeOpenAIAccountMcpElicitationSubmission(elicitation, {
    environment: 'staging',
    replicas: 2.5,
  }).valid, false)
})

test('MCP elicitation validates declared string formats at the main-process boundary', () => {
  const request = buildFormRequest()
  request.requestedSchema.properties = {
    when: {
      type: 'string',
      title: 'When',
      format: 'date-time',
    },
    day: {
      type: 'string',
      title: 'Day',
      format: 'date',
    },
    contact: {
      type: 'string',
      title: 'Contact',
      format: 'email',
    },
    callback: {
      type: 'string',
      title: 'Callback',
      format: 'uri',
    },
  }
  request.requestedSchema.required = ['when', 'day', 'contact', 'callback']
  const { elicitation } = normalizeOpenAIAccountMcpElicitationRequest(request)

  const accepted = normalizeOpenAIAccountMcpElicitationSubmission(elicitation, {
    when: '2026-08-01T12:30:00.000Z',
    day: '2026-08-01',
    contact: 'user@example.com',
    callback: 'https://example.com/callback',
  })
  assert.equal(accepted.valid, true)

  const invalidValues = [
    { when: '2026-08-01T12:30', day: '2026-08-01', contact: 'user@example.com', callback: 'https://example.com/callback' },
    { when: '2026-08-01T12:30:00Z', day: '2026-02-30', contact: 'user@example.com', callback: 'https://example.com/callback' },
    { when: '2026-08-01T12:30:00Z', day: '2026-08-01', contact: 'not-an-email', callback: 'https://example.com/callback' },
    { when: '2026-08-01T12:30:00Z', day: '2026-08-01', contact: 'user@example.com', callback: 'not a uri' },
  ]
  for (const content of invalidValues) {
    assert.equal(normalizeOpenAIAccountMcpElicitationSubmission(elicitation, content).valid, false)
  }
})

test('MCP elicitation cancellation never returns provider metadata or content', () => {
  assert.deepEqual(buildCancelledOpenAIAccountMcpElicitationResponse('decline'), {
    action: 'decline',
    content: null,
    _meta: null,
  })
  assert.deepEqual(buildCancelledOpenAIAccountMcpElicitationResponse('anything-else'), {
    action: 'cancel',
    content: null,
    _meta: null,
  })
})
