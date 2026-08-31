import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let ProviderModelSelector = null

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/ChatHeaderControls.jsx')
  ProviderModelSelector = mod?.ProviderModelSelector || null
})

after(async () => {
  await closeViteSsrLoader()
})

function renderSelector(overrides = {}) {
  return renderToStaticMarkup(React.createElement(ProviderModelSelector, {
    providers: [],
    loaded: true,
    refreshing: false,
    selectedProvider: '',
    selectedModel: '',
    onComplianceNotice: () => {},
    onChangeProvider: () => {},
    onChangeModel: () => {},
    onRefresh: () => {},
    modelMenuTopContent: null,
    modelMenuOpenOverride: undefined,
    ...overrides,
  }))
}

test('provider model selector does not show reviewed badge for selected openrouter routes', () => {
  assert.equal(typeof ProviderModelSelector, 'function')

  const html = renderSelector({
    providers: [{
      id: 'openrouter',
      name: 'OpenRouter',
      hasKey: true,
      defaultModel: 'openai/gpt-5.4',
      models: [],
    }],
    selectedProvider: 'openrouter',
    selectedModel: 'openai/gpt-5.4',
  })

  assert.doesNotMatch(html, />Reviewed</)
})

test('provider model selector displays selected custom models that are not listed', () => {
  const html = renderSelector({
    providers: [{
      id: 'openrouter',
      name: 'OpenRouter',
      hasKey: true,
      defaultModel: 'openai/gpt-5.4',
      models: [{
        id: 'openai/gpt-5.4',
        label: 'openai/gpt-5.4',
      }],
    }],
    selectedProvider: 'openrouter',
    selectedModel: 'custom/vendor-model-alpha',
  })

  assert.match(html, /custom\/vendor-model-alpha/)
  assert.doesNotMatch(html, />openai\/gpt-5\.4</)
})

test('provider model selector strips normalized OpenRouter namespace prefixes inside grouped menus', () => {
  const html = renderSelector({
    providers: [{
      id: 'openrouter',
      name: 'OpenRouter',
      hasKey: true,
      defaultModel: 'ibm-granite/granite-3.3-8b-instruct',
      models: [{
        id: 'ibm-granite/granite-3.3-8b-instruct',
        label: 'ibm-granite/granite-3.3-8b-instruct',
        group: 'ibm granite',
      }],
    }],
    selectedProvider: 'openrouter',
    selectedModel: 'ibm-granite/granite-3.3-8b-instruct',
    modelMenuOpenOverride: true,
  })

  assert.match(html, />ibm granite</)
  assert.match(html, />granite-3\.3-8b-instruct</)
  assert.doesNotMatch(html, />ibm-granite\/granite-3\.3-8b-instruct</)
})

test('provider model selector strips provider namespace variants inside OpenRouter groups', () => {
  const providers = [{
    id: 'openrouter',
    name: 'OpenRouter',
    hasKey: true,
    defaultModel: 'mistralai/mistral-small-3.2-24b-instruct',
    models: [
      {
        id: 'mistralai/mistral-small-3.2-24b-instruct',
        label: 'mistralai/mistral-small-3.2-24b-instruct',
        group: 'Mistral',
      },
      {
        id: 'meta-llama/llama-3.3-70b-instruct',
        label: 'meta-llama/llama-3.3-70b-instruct',
        group: 'Meta',
      },
    ],
  }]
  const mistralHtml = renderSelector({
    providers,
    selectedProvider: 'openrouter',
    selectedModel: 'mistralai/mistral-small-3.2-24b-instruct',
    modelMenuOpenOverride: true,
  })
  const metaHtml = renderSelector({
    providers,
    selectedProvider: 'openrouter',
    selectedModel: 'meta-llama/llama-3.3-70b-instruct',
    modelMenuOpenOverride: true,
  })

  assert.match(mistralHtml, />Mistral</)
  assert.match(mistralHtml, />mistral-small-3\.2-24b-instruct</)
  assert.doesNotMatch(mistralHtml, />mistralai\/mistral-small-3\.2-24b-instruct</)
  assert.match(metaHtml, />Meta</)
  assert.match(metaHtml, />llama-3\.3-70b-instruct</)
  assert.doesNotMatch(metaHtml, />meta-llama\/llama-3\.3-70b-instruct</)
})

test('provider model selector preserves custom labels while hiding provider prefixes', () => {
  const html = renderSelector({
    providers: [{
      id: 'openrouter',
      name: 'OpenRouter',
      hasKey: true,
      defaultModel: 'openai/gpt-5.4',
      models: [],
    }],
    selectedProvider: 'openrouter',
    selectedModel: 'custom/vendor-model-alpha',
  })

  assert.match(html, /Custom: custom\/vendor-model-alpha/)
})

test('provider model selector shows provider runtime badge for selected native-runtime models', () => {
  const html = renderSelector({
    providers: [{
      id: 'perplexity',
      name: 'Perplexity',
      hasKey: true,
      defaultModel: 'sonar-pro',
      models: [],
    }],
    selectedProvider: 'perplexity',
    selectedModel: 'sonar-pro',
  })

  assert.match(html, /title="Uses provider-native runtime semantics/)
})

test('provider model selector shows remote bundle badge for selected remote-bundle models', () => {
  const html = renderSelector({
    providers: [{
      id: 'moonshot',
      name: 'Moonshot',
      hasKey: true,
      defaultModel: 'kimi-k2.6',
      models: [],
    }],
    selectedProvider: 'moonshot',
    selectedModel: 'kimi-k2.6',
  })

  assert.match(html, /title="Uses provider-managed remote tool-bundle semantics/)
})

test('provider model selector does not render OpenAI account rate limits inline', () => {
  const html = renderSelector({
    providers: [{
      id: 'openai',
      name: 'OpenAI',
      hasKey: false,
      hasCredential: true,
      authMethod: 'account',
      defaultModel: 'gpt-5.3-codex',
      models: [],
    }],
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.3-codex',
    openAIAccountSession: {
      hasSession: true,
      rateLimitSummary: {
        rateLimits: {
          limitId: 'codex',
          primary: { usedPercent: 48, windowDurationMins: 300, resetsAt: 1_774_452_203 },
          secondary: { usedPercent: 70, windowDurationMins: 10080, resetsAt: 1_774_892_121 },
        },
      },
    },
  })

  assert.doesNotMatch(html, />Rate Limits</)
  assert.doesNotMatch(html, />Limits</)
})

test('provider model selector renders a top model-menu panel when supplied', () => {
  const html = renderSelector({
    providers: [{
      id: 'anthropic',
      name: 'Anthropic',
      hasKey: true,
      defaultModel: 'claude-haiku-4-5',
      models: [],
    }],
    selectedProvider: 'anthropic',
    selectedModel: 'claude-haiku-4-5',
    modelMenuOpenOverride: true,
    modelMenuTopContent: React.createElement('div', { 'data-ui': 'selector-top-slot' }, 'Extended thinking'),
  })

  assert.match(html, /data-ui="provider-model-selector-menu-top"/)
  assert.match(html, /data-ui="selector-top-slot"/)
  assert.match(html, />Extended thinking</)
})

test('provider model selector top model-menu panel can keep help copy in hover metadata instead of body text', () => {
  const html = renderSelector({
    providers: [{
      id: 'anthropic',
      name: 'Anthropic',
      hasKey: true,
      defaultModel: 'claude-haiku-4-5',
      models: [],
    }],
    selectedProvider: 'anthropic',
    selectedModel: 'claude-haiku-4-5',
    modelMenuOpenOverride: true,
    modelMenuTopContent: React.createElement(
      'div',
      { 'data-ui': 'selector-top-compact' },
      React.createElement('span', { title: 'Enable only on Anthropic models that support thinking.' }, 'Extended thinking'),
    ),
  })

  assert.match(html, /data-ui="selector-top-compact"/)
  assert.match(html, /title="Enable only on Anthropic models that support thinking\."/)
})

test('provider model selector sizes its triggers to the active labels instead of reserving fixed equal columns', () => {
  const html = renderSelector({
    providers: [{
      id: 'openai',
      name: 'OpenAI',
      hasKey: true,
      defaultModel: 'gpt-5.6-luna',
      models: [{ id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' }],
    }],
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.6-luna',
  })

  assert.match(html, /data-ui="provider-model-selector-provider-trigger"/)
  assert.match(html, /data-ui="provider-model-selector-model-trigger"/)
  assert.match(html, /max-w-\[9rem\]/)
  assert.match(html, /max-w-\[12rem\]/)
  assert.match(html, /border-l border-surface-border\/20/)
  assert.doesNotMatch(html, /min-w-\[10rem\]/)
})

test('provider model selector menus use compact neutral production chrome', () => {
  const source = readSource('src/renderer/components/chat/ProviderModelSelectorMenus.jsx')

  assert.match(source, /data-ui="provider-model-selector-provider-menu"/)
  assert.match(source, /data-ui="provider-model-selector-model-menu"/)
  assert.match(source, /data-ui="provider-model-selector-model-option"/)
  assert.match(source, /group-hover:max-w-\[38%\]/)
  assert.match(source, /min-h-7 w-full rounded-md/)
  assert.doesNotMatch(source, /text-accent-soft font-medium/)
  assert.doesNotMatch(source, /border-info-border|bg-info-bg|text-info-soft/)
  assert.doesNotMatch(source, /shadow-\[0_12px_28px/)
  assert.doesNotMatch(source, /SelectorBadge/)
})

test('provider model selector opens the selected model group before rendering the menu', () => {
  const source = readSource('src/renderer/components/chat/ProviderModelSelectorMenus.jsx')

  assert.match(source, /const selectedModelGroup = React\.useMemo/)
  assert.match(source, /const opening = !effectiveModelMenuOpen/)
  assert.match(source, /setExpandedGroup\(selectedModelGroup\)/)

  const headerSource = readSource('src/renderer/components/chat/ChatHeaderControls.jsx')
  assert.match(headerSource, /const selectedCanonicalModelId = selectorVm\.selectedCanonicalModelId/)
  assert.match(headerSource, /String\(selectedCanonicalModelId \|\| selectedModel \|\| activeProvider\?\.defaultModel/)
})

test('provider model selector exposes runtime detail as hover metadata in model rows', () => {
  const html = renderSelector({
    providers: [{
      id: 'fixture',
      name: 'Fixture',
      hasKey: true,
      defaultModel: 'runtime-model',
      models: [{
        id: 'runtime-model',
        label: 'runtime-model',
        supportsProviderNativeRuntime: true,
        providerNativeRuntimeMode: 'native',
        providerNativeRuntimeFamily: 'fixture-runtime',
      }],
    }],
    selectedProvider: 'fixture',
    selectedModel: 'runtime-model',
    modelMenuOpenOverride: true,
    showModelSourceBadge: false,
  })

  assert.match(html, /data-ui="provider-model-selector-option-detail"/)
  assert.match(html, /Provider runtime/)
  assert.match(html, /title="runtime-model - Uses provider-native runtime semantics/)
  assert.doesNotMatch(html, /border-accent\/30 bg-accent\/10 text-accent-soft/)
})
