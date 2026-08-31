import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveRegistryModel } from '../../src/common/api-clients/model-registry.mjs'
import {
  resolveModelAttachmentSupport,
  supportsNativeFileMediaTypeForSelection,
  supportsNativeImageAttachmentForSelection,
} from '../../src/common/attachments/attachment-support-policy.mjs'
import { resolveProviderModelTransform } from '../../src/main/api-clients/provider-model-transform.mjs'
import { resolveProviderToolSurface } from '../../src/main/chat/tool-surface-selection.mjs'
import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'

function buildTools(names = []) {
  return Object.fromEntries(
    names.map((name) => [name, { description: `${name} tool`, inputSchema: {} }]),
  )
}

test('attachment and tool matrix keeps attachment acceptance model-driven', () => {
  const moonshot = resolveRegistryModel('moonshot', 'kimi-k2.6')?.model
  const openai = resolveRegistryModel('openai', 'gpt-5.4')?.model

  const moonshotAttachment = resolveModelAttachmentSupport(moonshot)
  const openaiAttachment = resolveModelAttachmentSupport(openai)

  assert.equal(moonshotAttachment.supportsVision, true)
  assert.equal(moonshotAttachment.supportsPdf, false)
  assert.equal(openaiAttachment.supportsVision, true)
  assert.equal(openaiAttachment.supportsPdf, true)

  assert.equal(supportsNativeImageAttachmentForSelection({
    providerId: 'moonshot',
    modelManifest: moonshot,
  }), true)
  assert.equal(supportsNativeFileMediaTypeForSelection({
    providerId: 'moonshot',
    modelManifest: moonshot,
    mediaType: 'application/pdf',
    fileName: 'spec.pdf',
  }), false)
  assert.equal(supportsNativeFileMediaTypeForSelection({
    providerId: 'openai',
    modelManifest: openai,
    mediaType: 'application/pdf',
    fileName: 'spec.pdf',
  }), true)
})

test('attachment and tool matrix sanitizes unsupported tool-result media without breaking canonical tool history', () => {
  const transform = resolveProviderModelTransform({
    providerId: 'gemini',
    modelId: 'gemini-2.5-pro',
  })
  const normalized = transform.normalizeMessages({
    messages: [{
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId: 'call_1',
        toolName: 'browser_action',
        output: {
          type: 'json',
          value: {
            content: [
              { type: 'text', text: 'Snapshot ready.' },
              { type: 'image', filename: 'capture.jpg', mediaType: 'image/jpeg' },
              { type: 'file', filename: 'capture.pdf', mediaType: 'application/pdf' },
            ],
          },
        },
      }],
    }],
  })

  assert.equal(normalized[0].role, 'tool')
  assert.equal(normalized[0].content[0].type, 'tool-result')
  assert.deepEqual(normalized[0].content[0].output.value.content, [
    { type: 'text', text: 'Snapshot ready.' },
    { type: 'text', text: '[Tool result image omitted: capture.jpg]' },
    { type: 'text', text: '[Tool result file omitted: capture.pdf]' },
  ])
})

test('attachment and tool matrix keeps tool-surface gating model-aware by family', () => {
  const openaiHosted = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
    addomTools: buildTools(['read_file', 'write_file']),
    providerTools: buildTools(['web_search']),
  })
  const moonshotFormula = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('moonshot', 'kimi-k2.6'),
    addomTools: buildTools(['read_file']),
    providerTools: buildTools(['moonshot_formula__web_search__search']),
  })
  const perplexitySearch = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('perplexity', 'sonar-pro'),
    addomTools: buildTools(['read_file']),
    providerTools: {},
  })
  const generic = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('openai', 'unknown-openai-build'),
    addomTools: buildTools(['read_file']),
    providerTools: buildTools(['web_search']),
  })

  assert.equal(openaiHosted.toolSurfaceKind, 'openai_hosted')
  assert.equal(moonshotFormula.toolSurfaceKind, 'moonshot_formula')
  assert.equal(perplexitySearch.toolSurfaceKind, 'perplexity_search')
  assert.equal(generic.toolSurfaceKind, 'addom_native')
})

test('openrouter matrix keeps provider-native source families on plain ADDOM-native tool ownership', () => {
  const openrouterMoonshot = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('openrouter', 'moonshotai/kimi-k2.5'),
    addomTools: buildTools(['read_file']),
    providerTools: buildTools(['moonshot_formula__web_search__search']),
  })
  const openrouterPerplexity = resolveProviderToolSurface({
    adapterProfile: resolveProviderModelAdapter('openrouter', 'perplexity/sonar-pro'),
    addomTools: buildTools(['read_file']),
    providerTools: buildTools(['perplexity_search']),
  })

  assert.equal(openrouterMoonshot.toolSurfaceKind, 'addom_native')
  assert.deepEqual(Object.keys(openrouterMoonshot.tools), ['read_file'])
  assert.equal(openrouterPerplexity.toolSurfaceKind, 'addom_native')
  assert.deepEqual(Object.keys(openrouterPerplexity.tools), ['read_file'])
})
