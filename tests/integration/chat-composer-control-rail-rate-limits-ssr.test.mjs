import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let ChatComposerControlRail = null

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

before(async () => {
  const railMod = await ssrLoadRendererModule('/components/chat/ChatComposerControlRail.jsx')
  ChatComposerControlRail = railMod?.ChatComposerControlRail || railMod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

function renderRail(overrides = {}) {
  return renderToStaticMarkup(React.createElement(ChatComposerControlRail, {
    chatMode: 'execute',
    onModeChange: () => {},
    providers: [],
    loaded: true,
    refreshing: false,
    selectedProvider: '',
    selectedModel: '',
    modelCatalogVisibility: null,
    activeThreadId: 'thread_ssr',
    activeThreadIsEmpty: false,
    hasConversation: false,
    onComplianceNotice: () => {},
    onProviderChange: () => {},
    onModelChange: () => {},
    onRefreshProviders: () => {},
    contextUsage: null,
    costEstimate: null,
    continuityStatus: null,
    attachmentsEnabled: false,
    fileAttachmentsEnabled: false,
    imageAttachmentsEnabled: false,
    agentQuickActionsEnabled: false,
    agentMenuOpen: false,
    disabled: false,
    isStreaming: false,
    canSend: true,
    onAgentMenuOpenChange: () => {},
    onAttachFiles: () => {},
    onSend: () => {},
    onStop: () => {},
    onOpenJobsModal: () => {},
    commandPaletteEvent: null,
    ...overrides,
  }))
}

test('chat composer control rail shows OpenAI account rate limits inside quick actions for connected account auth', () => {
  assert.equal(typeof ChatComposerControlRail, 'function')
  const html = renderRail({
    providers: [{
      id: 'openai',
      name: 'OpenAI',
      hasCredential: true,
      authMethod: 'account',
      defaultModel: 'gpt-5.3-codex',
      models: [],
    }],
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.3-codex',
    openAIAccountSessionOverride: {
      hasSession: true,
      rateLimitSummary: {
        rateLimits: {
          limitId: 'codex',
          primary: { usedPercent: 48, windowDurationMins: 300, resetsAt: 1_774_452_203 },
          secondary: { usedPercent: 70, windowDurationMins: 10080, resetsAt: 1_774_892_121 },
        },
      },
    },
    overflowOpenOverride: true,
  })

  assert.doesNotMatch(html, />Quick Actions</)
  assert.match(html, /data-ui="chat-composer-rate-limits"/)
  assert.match(html, />Rate Limits</)
  assert.match(html, />5h</)
  assert.match(html, />52%</)
  assert.match(html, />Weekly</)
})

test('chat composer control rail has no Agents enable toggle contract', () => {
  const source = [
    readSource('src/renderer/components/chat/ChatComposerControlRail.jsx'),
    readSource('src/renderer/components/chat/ChatComposerControlRailView.jsx'),
  ].join('\n')

  assert.doesNotMatch(source, /onToggleMoaEnabled|moaEnabled|Enable Subagents|Disable MoA/)
})

test('chat mode choices are locked to the active turn while streaming', () => {
  const html = renderRail({ isStreaming: true })
  for (const label of ['Execute', 'Plan', 'Thinking']) {
    assert.match(html, new RegExp(`<button[^>]*disabled=""[^>]*>${label}</button>`))
  }
})

test('composer submission never silently promotes Plan or Thinking to Execute', () => {
  const source = readSource('src/renderer/components/chat/use-chat-panel-composer-actions.mjs')
  assert.doesNotMatch(source, /shouldAutoSwitchToExecuteFrom(?:Plan|Thinking)/)
  assert.doesNotMatch(source, /setChatMode\('execute'\)/)
})

test('chat composer control rail omits context and usage surfaces for Cursor', () => {
  const html = renderRail({
    providers: [{
      id: 'cursor',
      name: 'Cursor',
      providerClass: 'agent_runtime',
      hasCredential: true,
      ready: true,
      authMethod: 'account',
      defaultModel: 'composer-2.5',
      capabilities: {
        contextTelemetry: false,
        quotaTelemetry: false,
        compactionTelemetry: false,
      },
      models: [{ id: 'composer-2.5', label: 'Composer 2.5' }],
    }],
    selectedProvider: 'cursor',
    selectedModel: 'composer-2.5',
    contextUsage: { modelLimit: 0, occupancyAvailable: false },
    activeThreadIsEmpty: true,
    overflowOpenOverride: true,
  })

  assert.doesNotMatch(html, /data-ui="context-meter"/)
  assert.doesNotMatch(html, /data-ui="chat-composer-rate-limits"/)
  assert.doesNotMatch(html, /compaction|quota|limit unknown/i)
  assert.match(html, /Composer 2\.5/)
})

test('chat composer control rail suppresses internal-only context metrics for connected OpenAI account auth', () => {
  assert.equal(typeof ChatComposerControlRail, 'function')
  const html = renderRail({
    providers: [{
      id: 'openai',
      name: 'OpenAI',
      hasCredential: true,
      authMethod: 'account',
      defaultModel: 'gpt-5.3-codex',
      models: [],
    }],
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.3-codex',
    openAIAccountSessionOverride: {
      hasSession: true,
      rateLimitSummary: {
        rateLimits: {
          limitId: 'codex',
          primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1_774_452_203 },
        },
      },
    },
    contextUsage: {
      modelLimit: 400000,
      effectiveOccupancyTokens: 1200,
      contextOccupancyTokens: 1200,
      contextRemainingTokens: 398800,
      totalTokens: 320,
      rollingTotalTokens: 85000,
      occupancyAvailable: true,
      occupancyConfidence: 'rough_estimate',
      occupancySource: 'thread_local_estimate',
      authMethod: 'account',
      limitProvenance: 'verified_fallback',
      limitPrecision: 'verified_fallback',
    },
    costEstimate: {
      estimatedTotalTokens: 5600,
      estimatedUsd: 0.0425,
      estimateConfidence: 'token_plus_pricing',
    },
    continuityStatus: {
      enabled: true,
      profile: 'balanced',
      packetTokens: 900,
      tokenBudget: 4000,
      driftRisk: 'low',
    },
  })

  assert.match(html, /data-ui="context-meter"/)
  assert.match(html, /Context window: 0% used \(100% left\), 1200\/400000 tokens used/)
  assert.match(html, /1\.2k \/ 400\.0k tokens used/)
  assert.doesNotMatch(html, /Compacting context automatically/)
  assert.doesNotMatch(html, />Thread occ\. \(est\.\)</)
  assert.doesNotMatch(html, />Context left</)
  assert.doesNotMatch(html, />Limit</)
  assert.doesNotMatch(html, />Latest turn</)
  assert.doesNotMatch(html, />Continuity</)
  assert.doesNotMatch(html, />Packet</)
  assert.doesNotMatch(html, />Provenance</)
  assert.doesNotMatch(html, />Precision</)
  assert.doesNotMatch(html, />Occupancy Src</)
  assert.doesNotMatch(html, />Session spend</)
  assert.doesNotMatch(html, />Turn est tok</)
  assert.doesNotMatch(html, />Turn est usd</)
  assert.doesNotMatch(html, />Cost conf</)
})

test('chat composer control rail shows full context left on an empty thread with a known limit', () => {
  assert.equal(typeof ChatComposerControlRail, 'function')
  const html = renderRail({
    activeThreadIsEmpty: true,
    contextUsage: {
      modelLimit: 400000,
      threadOccupancyAvailable: false,
      occupancyAvailable: false,
      occupancySource: 'unavailable',
      occupancyConfidence: 'unavailable',
      contextRemainingTokens: 400000,
    },
  })

  assert.match(html, /Context window: 0% used \(100% left\), empty thread/)
  assert.match(html, /0 \/ 400\.0k tokens used/)
  assert.match(html, /data-meter-ring="empty_thread_fallback"/)
  assert.doesNotMatch(html, /data-meter-ring="unavailable"/)
})

test('chat composer control rail keeps the meter full during a fresh thread first turn before occupancy telemetry arrives', () => {
  assert.equal(typeof ChatComposerControlRail, 'function')
  const html = renderRail({
    activeThreadContextFallbackMode: 'initial_turn',
    contextUsage: {
      modelLimit: 400000,
      threadOccupancyAvailable: false,
      occupancyAvailable: false,
      occupancySource: 'unavailable',
      occupancyConfidence: 'unavailable',
      contextRemainingTokens: 400000,
    },
  })

  assert.match(html, /Context window: 0% used \(100% left\), first turn/)
  assert.match(html, /0 \/ 400\.0k tokens used/)
  assert.match(html, /data-meter-ring="initial_turn_fallback"/)
  assert.doesNotMatch(html, /data-meter-ring="unavailable"/)
})

test('chat composer control rail does not render the duplicated OpenAI delegation backend control', () => {
  assert.equal(typeof ChatComposerControlRail, 'function')
  const html = renderRail({
    providers: [{
      id: 'openai',
      name: 'OpenAI',
      hasCredential: true,
      authMethod: 'account',
      defaultModel: 'gpt-5.4',
      models: [],
    }],
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.4',
  })

  assert.doesNotMatch(html, /data-ui="chat-composer-delegation-backend"/)
  assert.doesNotMatch(html, /Delegation auto/)
})

test('chat composer control rail renders discovered native collaboration modes for OpenAI account turns', () => {
  assert.equal(typeof ChatComposerControlRail, 'function')
  const html = renderRail({
    providers: [{
      id: 'openai',
      name: 'OpenAI',
      hasCredential: true,
      authMethod: 'account',
      defaultModel: 'gpt-5.4',
      models: [],
    }],
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.4',
    openAIAccountSessionOverride: {
      hasSession: true,
      defaultCollaborationModeId: 'plan',
      collaborationModes: [
        { id: 'default', name: 'Default', description: '', isDefault: false },
        { id: 'plan', name: 'Plan', description: '', isDefault: true },
      ],
    },
  })

  assert.match(html, /data-ui="chat-composer-collaboration-mode"/)
  assert.match(html, />Plan</)
})

test('chat composer control rail exposes a labelled lightning toggle for supported OpenAI routes', () => {
  const apiKeyHtml = renderRail({
    providers: [{
      id: 'openai',
      name: 'OpenAI',
      hasCredential: true,
      authMethod: 'api_key',
      defaultModel: 'gpt-5.6-sol',
      models: [],
    }],
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.6-sol',
  })
  const accountHtml = renderRail({
    providers: [{
      id: 'openai',
      name: 'OpenAI',
      hasCredential: true,
      authMethod: 'account',
      defaultModel: 'gpt-5.6-sol',
      models: [],
    }],
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.6-sol',
  })
  const unsupportedHtml = renderRail({
    providers: [{
      id: 'openai',
      name: 'OpenAI',
      hasCredential: true,
      authMethod: 'api_key',
      defaultModel: 'gpt-5.3-codex',
      models: [],
    }],
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.3-codex',
  })

  assert.match(apiKeyHtml, /data-ui="chat-composer-processing-mode"/)
  assert.match(apiKeyHtml, /ph-lightning/)
  assert.match(apiKeyHtml, /aria-pressed="false"/)
  assert.match(apiKeyHtml, /aria-label="Use faster processing Faster processing may use premium pricing\."/)
  assert.doesNotMatch(apiKeyHtml, />Standard</)
  assert.match(accountHtml, /data-ui="chat-composer-processing-mode"/)
  assert.match(accountHtml, /ph-lightning/)
  assert.doesNotMatch(accountHtml, />Standard</)
  assert.doesNotMatch(unsupportedHtml, /data-ui="chat-composer-processing-mode"/)
})

test('enabled fast processing uses a filled control with a dark lightning glyph', () => {
  const source = readSource('src/renderer/components/chat/ChatProcessingModeControl.jsx')

  assert.match(source, /bg-accent-strong text-surface/)
  assert.doesNotMatch(source, /bg-surface-panel-alt\/55 text-accent-strong/)
})

test('chat composer control rail exposes an interrupt-and-replace send action while streaming when the composer has content', () => {
  assert.equal(typeof ChatComposerControlRail, 'function')
  const html = renderRail({
    isStreaming: true,
    canSend: true,
  })

  assert.match(html, /data-ui="chat-composer-send"/)
  assert.match(html, /Replace current turn/i)
  assert.doesNotMatch(html, /data-ui="chat-composer-stop"/)
})

test('chat composer control rail keeps only Anthropic effort in the rail for supported Sonnet 5 models', () => {
  assert.equal(typeof ChatComposerControlRail, 'function')
  const html = renderRail({
    providers: [{
      id: 'anthropic',
      name: 'Anthropic',
      hasCredential: true,
      authMethod: 'api_key',
      defaultModel: 'claude-sonnet-5',
      models: [],
    }],
    selectedProvider: 'anthropic',
    selectedModel: 'claude-sonnet-5',
  })

  assert.doesNotMatch(html, /data-ui="chat-composer-anthropic-thinking"/)
  assert.match(html, /data-ui="chat-composer-reasoning-effort"/)
  assert.match(html, /Reasoning effort: Provider default/)
})

test('chat composer control rail keeps Haiku 4.5 slim with no Anthropic effort control', () => {
  assert.equal(typeof ChatComposerControlRail, 'function')
  const html = renderRail({
    providers: [{
      id: 'anthropic',
      name: 'Anthropic',
      hasCredential: true,
      authMethod: 'api_key',
      defaultModel: 'claude-haiku-4-5',
      models: [],
    }],
    selectedProvider: 'anthropic',
    selectedModel: 'claude-haiku-4-5',
  })

  assert.doesNotMatch(html, /data-ui="chat-composer-reasoning-effort"/)
})

test('chat composer control rail exposes a single terminal entry button', () => {
  assert.equal(typeof ChatComposerControlRail, 'function')
  const html = renderRail({
    terminalButtonEnabled: true,
    overflowOpenOverride: true,
  })

  assert.match(html, /data-ui="chat-composer-terminal-toggle"/)
  assert.match(html, /aria-label="Show terminal"/)
  assert.match(html, /aria-pressed="false"/)
  assert.doesNotMatch(html, /bg-info-bg\/50 text-info/)
})

test('chat composer menu selected rows use neutral compact styling', () => {
  const source = readSource('src/renderer/components/chat/ChatComposerControlRailView.jsx')

  assert.doesNotMatch(source, /bg-info-bg\/50 text-info/)
  assert.doesNotMatch(source, /border-info-border\/50/)
  assert.doesNotMatch(source, /quickActionsTitle/)
  assert.match(source, /data-ui="chat-composer-overflow-toggle"/)
  assert.match(source, /data-ui="chat-composer-overflow-menu"/)
  assert.match(source, /min-h-7 w-full items-center/)
})

test('chat composer Anthropic thinking top slot is a compact switch row', () => {
  const source = readSource('src/renderer/components/chat/ChatComposerControlRail.jsx')

  assert.match(source, /data-ui="provider-model-selector-anthropic-thinking"/)
  assert.match(source, /role="switch"/)
  assert.match(source, /group-hover:max-w-\[40%\]/)
  assert.doesNotMatch(source, /aria-label=\{`\$\{label\} info`\}/)
  assert.doesNotMatch(source, /Extended\s*<\/span>\s*<span[\s\S]*Thinking/)
  assert.doesNotMatch(source, /border-accent bg-accent\/90/)
})
