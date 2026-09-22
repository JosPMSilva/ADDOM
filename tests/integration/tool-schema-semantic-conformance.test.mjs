import test from 'node:test'
import assert from 'node:assert/strict'

import Ajv from 'ajv'

import { normalizeGeminiToolSchemas } from '../../src/main/api-clients/gemini-tool-schema-normalization.mjs'
import { toAISDKTools } from '../../src/main/tools/tool-definitions.mjs'

function validateSchema(schema, value) {
  const ajv = new Ajv({ allErrors: true, strict: false })
  const validate = ajv.compile(schema)
  return {
    valid: validate(value) === true,
    errors: validate.errors || [],
  }
}

function buildTerminalWaitInput({ pattern = 'READY', text = null } = {}) {
  return {
    sessionId: 'term_fixture',
    pattern,
    text,
    sinceSequence: null,
    timeoutMs: null,
    maxChars: null,
    mode: null,
  }
}

function buildDelegationInput({ context = 'Inspect the named module.', paths = null } = {}) {
  return {
    tasks: [{
      task_id: null,
      kind: null,
      specialty: null,
      task_type: null,
      goal: null,
      instruction: 'Review the implementation for correctness.',
      context,
      paths,
      constraints: null,
      access: null,
      expected_output_format: null,
    }],
  }
}

for (const [label, buildTools] of [
  ['default', () => toAISDKTools('ask', true)],
  ['Gemini-normalized', () => normalizeGeminiToolSchemas(toAISDKTools('ask', true))],
]) {
  test(`${label} terminal wait schema accepts either valid pattern or text input`, () => {
    const schema = buildTools().terminal_session_wait_for_output.inputSchema.jsonSchema
    const byPattern = validateSchema(schema, buildTerminalWaitInput())
    const byText = validateSchema(schema, buildTerminalWaitInput({ pattern: null, text: 'READY' }))

    assert.equal(byPattern.valid, true, JSON.stringify(byPattern.errors, null, 2))
    assert.equal(byText.valid, true, JSON.stringify(byText.errors, null, 2))
  })

  test(`${label} terminal wait schema rejects missing useful wait criteria`, () => {
    const schema = buildTools().terminal_session_wait_for_output.inputSchema.jsonSchema
    const result = validateSchema(schema, buildTerminalWaitInput({ pattern: null, text: null }))

    assert.equal(result.valid, false)
  })

  test(`${label} delegation schema accepts either context or paths`, () => {
    const schema = buildTools().delegate_tasks.inputSchema.jsonSchema
    const byContext = validateSchema(schema, buildDelegationInput())
    const byPaths = validateSchema(schema, buildDelegationInput({ context: null, paths: ['src/main'] }))

    assert.equal(byContext.valid, true, JSON.stringify(byContext.errors, null, 2))
    assert.equal(byPaths.valid, true, JSON.stringify(byPaths.errors, null, 2))
  })

  test(`${label} delegation schema rejects missing useful task context`, () => {
    const schema = buildTools().delegate_tasks.inputSchema.jsonSchema
    const result = validateSchema(schema, buildDelegationInput({ context: null, paths: null }))

    assert.equal(result.valid, false)
  })
}
