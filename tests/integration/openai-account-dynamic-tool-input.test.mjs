import test from 'node:test'
import assert from 'node:assert/strict'

import { extractDynamicToolCall } from '../../src/main/api-clients/ai-provider-openai-account-dynamic-tools.mjs'

test('account apply_patch accepts serialized object arguments before raw patch fallback', () => {
  const patch = [
    '*** Begin Patch',
    '*** Add File: fixture.txt',
    '+fixture',
    '*** End Patch',
  ].join('\n')

  assert.deepEqual(extractDynamicToolCall({
    itemId: 'call_serialized_patch',
    tool: 'workspace_apply_patch',
    arguments: JSON.stringify({ patch }),
  }), {
    id: 'call_serialized_patch',
    toolName: 'apply_patch',
    input: { patch },
  })
})
