import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildOpenRouterVisibilityView,
  normalizeOpenRouterModelCatalogVisibility,
  resolveOpenRouterVisibilityMetadata,
} from '../../src/common/api-clients/model-catalog-visibility.mjs'

test('openrouter visibility supports namespace hides with per-model overrides', () => {
  const view = buildOpenRouterVisibilityView({
    models: [
      { id: 'openai/gpt-5', label: 'GPT-5', group: 'OpenAI' },
      { id: 'openai/gpt-5-mini', label: 'GPT-5 mini', group: 'OpenAI' },
      { id: 'perplexity/sonar', label: 'Sonar', group: 'Perplexity' },
    ],
    visibility: {
      namespaceVisibility: {
        openai: false,
      },
      modelOverrides: {
        'openai/gpt-5': true,
      },
      filters: {},
    },
  })

  assert.deepEqual(
    view.visibleModels.map((model) => model.id),
    ['openai/gpt-5', 'perplexity/sonar'],
  )
})

test('openrouter visibility supports hidden-by-default mode with namespace and model opt-ins', () => {
  const view = buildOpenRouterVisibilityView({
    models: [
      { id: 'openai/gpt-5', label: 'GPT-5', group: 'OpenAI' },
      { id: 'openai/gpt-5-mini', label: 'GPT-5 mini', group: 'OpenAI' },
      { id: 'perplexity/sonar', label: 'Sonar', group: 'Perplexity' },
    ],
    visibility: {
      defaultVisible: false,
      namespaceVisibility: {
        openai: true,
      },
      modelOverrides: {
        'perplexity/sonar': true,
      },
      filters: {},
    },
  })

  assert.deepEqual(
    view.visibleModels.map((model) => model.id),
    ['openai/gpt-5', 'openai/gpt-5-mini', 'perplexity/sonar'],
  )
})

test('openrouter visibility keeps the currently selected hidden model visible in browsing lists', () => {
  const view = buildOpenRouterVisibilityView({
    models: [
      { id: 'openai/gpt-5', label: 'GPT-5', group: 'OpenAI' },
      { id: 'openai/gpt-5-mini', label: 'GPT-5 mini', group: 'OpenAI' },
    ],
    visibility: {
      namespaceVisibility: {
        openai: false,
      },
      modelOverrides: {},
      filters: {},
    },
    selectedModel: 'openai/gpt-5-mini',
  })

  assert.deepEqual(
    view.visibleModels.map((model) => model.id),
    ['openai/gpt-5-mini'],
  )
  assert.equal(view.visibleModels[0].visibilitySelected, true)
})

test('openrouter visibility metadata distinguishes reviewed, live-estimated, and unknown models', () => {
  const reviewed = resolveOpenRouterVisibilityMetadata({
    id: 'openai/gpt-5.4',
    supportsTools: false,
    reasoning: true,
    vision: true,
  })
  const estimated = resolveOpenRouterVisibilityMetadata({
    id: 'vendor/live-only-route',
    openrouterInferredCapabilities: {
      supportsTools: true,
      supportsReasoning: true,
      supportsVision: true,
    },
  })
  const unknown = resolveOpenRouterVisibilityMetadata({
    id: 'some-vendor/some-custom-model',
  })

  assert.equal(reviewed.reviewState, 'reviewed')
  assert.equal(reviewed.supportsTools, false)
  assert.equal(reviewed.fieldProvenance.tools.source, 'addom_openrouter_reviewed_route')

  assert.equal(estimated.reviewState, 'estimated')
  assert.equal(estimated.supportsTools, true)
  assert.equal(estimated.supportsReasoning, true)
  assert.equal(estimated.supportsVision, true)
  assert.equal(estimated.fieldProvenance.tools.source, 'unknown')
  assert.equal(estimated.fieldProvenance.vision.source, 'unknown')

  assert.equal(unknown.reviewState, 'unknown')
  assert.equal(unknown.supportsTools, false)
  assert.equal(unknown.fieldProvenance.tools.source, 'unknown')
})

test('openrouter visibility keeps reviewed moonshot routes reviewed without inheriting provider runtime tools', () => {
  const reviewed = resolveOpenRouterVisibilityMetadata({
    id: 'moonshotai/kimi-k2.5',
    supportsTools: false,
  })

  assert.equal(reviewed.reviewState, 'reviewed')
  assert.equal(reviewed.supportsTools, false)
})

test('openrouter toolsOnly filter uses retained reviewed route capabilities', () => {
  const visibility = normalizeOpenRouterModelCatalogVisibility({
    filters: {
      toolsOnly: true,
    },
  })
  const view = buildOpenRouterVisibilityView({
    models: [
      { id: 'openai/gpt-5.4', label: 'GPT-5.4', group: 'OpenAI', supportsTools: false },
      { id: 'openai/gpt-5.3-codex', label: 'GPT-5.3 Codex', group: 'OpenAI', supportsTools: true },
    ],
    visibility,
  })

  assert.deepEqual(
    view.visibleModels.map((model) => model.id),
    ['openai/gpt-5.3-codex'],
  )
})

test('openrouter toolsOnly filter excludes reviewed moonshot routes without generic tool calling', () => {
  const visibility = normalizeOpenRouterModelCatalogVisibility({
    filters: {
      toolsOnly: true,
    },
  })
  const view = buildOpenRouterVisibilityView({
    models: [
      { id: 'moonshotai/kimi-k2.5', label: 'Kimi K2.5', group: 'Moonshot', supportsTools: false },
      { id: 'some-vendor/no-tools', label: 'No Tools', group: 'Other', supportsTools: false },
    ],
    visibility,
  })

  assert.deepEqual(
    view.visibleModels.map((model) => model.id),
    [],
  )
})

test('openrouter toolsOnly filter includes dynamic-only live rows with estimated tool support', () => {
  const visibility = normalizeOpenRouterModelCatalogVisibility({
    filters: {
      toolsOnly: true,
    },
  })
  const view = buildOpenRouterVisibilityView({
    models: [
      {
        id: 'vendor/live-only-route',
        label: 'vendor/live-only-route',
        group: 'Vendor',
        openrouterInferredCapabilities: {
          supportsTools: true,
        },
      },
      {
        id: 'vendor/no-signal-route',
        label: 'vendor/no-signal-route',
        group: 'Vendor',
      },
    ],
    visibility,
  })

  assert.deepEqual(
    view.visibleModels.map((model) => model.id),
    ['vendor/live-only-route'],
  )
})

test('openrouter visibility sorts namespace rows alphabetically by provider label', () => {
  const view = buildOpenRouterVisibilityView({
    models: [
      { id: 'x-ai/grok-4', label: 'Grok 4', group: 'xAI' },
      { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4', group: 'Anthropic' },
      { id: 'openai/gpt-5', label: 'GPT-5', group: 'OpenAI' },
      { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', group: 'Google' },
    ],
  })

  assert.deepEqual(
    view.namespaceRows.map((row) => row.label),
    ['Anthropic', 'Google', 'OpenAI', 'xAI'],
  )
})

test('openrouter namespace counts keep enabled state separate from filter-matched rows', () => {
  const view = buildOpenRouterVisibilityView({
    models: [
      { id: 'ai21/jamba-mini', label: 'Jamba Mini', group: 'AI21', supportsTools: false },
    ],
    visibility: {
      filters: {
        reviewedOnly: true,
      },
    },
  })

  assert.equal(view.baseVisibleCount, 1)
  assert.equal(view.visibleModels.length, 0)
  assert.equal(view.namespaceRows[0]?.effectiveVisible, true)
  assert.equal(view.namespaceRows[0]?.baseVisibleCount, 1)
  assert.equal(view.namespaceRows[0]?.shownCount, 0)
})

test('openrouter visibility normalization drops namespace overrides that match the default mode', () => {
  const visibility = normalizeOpenRouterModelCatalogVisibility({
    defaultVisible: false,
    namespaceVisibility: {
      openai: false,
      anthropic: true,
    },
  })

  assert.equal(visibility.defaultVisible, false)
  assert.deepEqual(visibility.namespaceVisibility, {
    anthropic: true,
  })
})

test('openrouter visibility view keeps enabled counts separate from filtered shown counts', () => {
  const view = buildOpenRouterVisibilityView({
    models: [
      { id: 'ai21/jamba', label: 'Jamba', group: 'AI21' },
    ],
    visibility: normalizeOpenRouterModelCatalogVisibility({
      filters: {
        reviewedOnly: true,
      },
    }),
  })

  assert.equal(view.baseVisibleCount, 1)
  assert.equal(view.visibleModels.length, 0)
  assert.equal(view.namespaceRows[0].baseVisibleCount, 1)
  assert.equal(view.namespaceRows[0].shownCount, 0)
})
