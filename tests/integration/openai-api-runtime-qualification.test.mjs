import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

import { openai } from '@ai-sdk/openai'

import {
  OPENAI_API_HOSTED_TOOL_BUILDERS,
  OPENAI_API_QUALIFIED_RUNTIME_MANIFEST,
} from '../../src/main/api-clients/openai-api-capability-contract.mjs'

const require = createRequire(import.meta.url)

test('OpenAI API qualification manifest matches the installed provider runtimes', () => {
  assert.equal(
    require('@ai-sdk/openai/package.json').version,
    OPENAI_API_QUALIFIED_RUNTIME_MANIFEST.openaiAdapterVersion,
  )
  assert.equal(
    require('undici/package.json').version,
    OPENAI_API_QUALIFIED_RUNTIME_MANIFEST.undiciVersion,
  )

  for (const [toolId, definition] of Object.entries(OPENAI_API_HOSTED_TOOL_BUILDERS)) {
    assert.equal(
      typeof openai?.tools?.[definition.builderName],
      'function',
      `${toolId} requires @ai-sdk/openai.tools.${definition.builderName}`,
    )
  }
})
