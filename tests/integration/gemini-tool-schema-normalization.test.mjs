import test from 'node:test'
import assert from 'node:assert/strict'

import {
  __testGeminiToolSchemaNormalization,
  normalizeGeminiToolSchemas,
} from '../../src/main/api-clients/gemini-tool-schema-normalization.mjs'
import { toAISDKTools } from '../../src/main/tools/tool-definitions.mjs'

test('Gemini schema normalization rewrites nullable array fields into anyOf schemas that preserve items', () => {
  const tools = toAISDKTools('ask', true)
  const normalized = normalizeGeminiToolSchemas(tools)
  const searchSchema = normalized.search_code?.inputSchema?.jsonSchema
  const fileExtensions = searchSchema?.properties?.file_extensions
  const questionSchema = normalized.question_user?.inputSchema?.jsonSchema
  const options = questionSchema?.properties?.options

  assert.equal(Array.isArray(fileExtensions?.type), false)
  assert.equal(Array.isArray(fileExtensions?.anyOf), true)
  assert.equal(fileExtensions.anyOf[0]?.type, 'array')
  assert.deepEqual(fileExtensions.anyOf[0]?.items, { type: 'string' })
  assert.equal(fileExtensions.anyOf[1]?.type, 'null')

  assert.equal(Array.isArray(options?.type), false)
  assert.equal(Array.isArray(options?.anyOf), true)
  assert.equal(options.anyOf[0]?.type, 'array')
  assert.equal(options.anyOf[0]?.items?.type, 'object')
  assert.equal(options.anyOf[1]?.type, 'null')
})

test('Gemini schema normalization keeps scalar nullable fields representable via anyOf', () => {
  const normalized = __testGeminiToolSchemaNormalization.normalizeGeminiJsonSchema({
    type: 'object',
    properties: {
      path: {
        type: ['string', 'null'],
        description: 'Optional path',
      },
    },
    required: ['path'],
    additionalProperties: false,
  })

  assert.equal(Array.isArray(normalized.properties.path?.type), false)
  assert.equal(Array.isArray(normalized.properties.path?.anyOf), true)
  assert.equal(normalized.properties.path.anyOf[0]?.type, 'string')
  assert.equal(normalized.properties.path.anyOf[1]?.type, 'null')
})

test('Gemini schema normalization expands required-only anyOf object branches into explicit object schemas', () => {
  const tools = toAISDKTools('ask', true)
  const normalized = normalizeGeminiToolSchemas(tools)
  const taskItem = normalized.delegate_tasks?.inputSchema?.jsonSchema?.properties?.tasks?.items

  assert.equal(Array.isArray(taskItem?.anyOf), true)
  for (const branch of taskItem.anyOf) {
    assert.equal(branch?.type, 'object')
    assert.equal(branch?.additionalProperties, false)
    assert.equal(Array.isArray(branch?.required), true)
    assert.equal(branch.required.length, 1)
    assert.equal(
      Object.prototype.hasOwnProperty.call(branch?.properties || {}, branch.required[0]),
      true,
    )
  }
})
