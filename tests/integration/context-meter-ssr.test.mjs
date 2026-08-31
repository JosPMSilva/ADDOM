import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let ContextMeter = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/ContextMeter.jsx')
  ContextMeter = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('ContextMeter renders a hover-only context window tooltip', () => {
  assert.equal(typeof ContextMeter, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ContextMeter, {
      usage: {
        modelLimit: 1_000_000,
        latestMeasuredTurnTokens: 4_500,
        threadOccupancyTokens: 1_500,
        threadOccupancyAvailable: true,
        threadOccupancySource: 'provider_thread_context',
        threadOccupancyConfidence: 'provider_verified',
        threadOccupancyProvenance: 'provider_verified',
        effectiveOccupancyTokens: 1500,
        contextOccupancyTokens: 1500,
        contextRemainingTokens: 998500,
        totalTokens: 4500,
        sessionSpendTokens: 4500,
        occupancySource: 'provider_rendered_input',
        occupancyConfidence: 'provider_verified',
        providerCachedReadTokens: 250,
        limitProvenance: 'provider',
        limitPrecision: 'exact',
      },
      costEstimate: {
        estimatedTotalTokens: 15900,
        estimatedUsd: 0.036,
        estimateConfidence: 'token_plus_pricing',
      },
      continuityStatus: {
        enabled: true,
        profile: 'balanced',
        packetTokens: 402,
        tokenBudget: 7000,
        driftRisk: 'low',
      },
    }),
  )

  assert.match(html, /data-ui="context-meter"/)
  assert.match(html, /role="img"/)
  assert.match(html, /tabindex="0"/)
  assert.match(html, /aria-describedby="[^"]+"/)
  assert.match(html, /role="tooltip"/)
  assert.match(html, /Context window:/)
  assert.match(html, /0% used \(100% left\)/)
  assert.match(html, /1\.5k \/ 1\.0M tokens used/)
  assert.doesNotMatch(html, /Compacting context automatically/)
  assert.doesNotMatch(html, /type="button"/)
  assert.doesNotMatch(html, /aria-expanded/)
  assert.doesNotMatch(html, />Context left</)
  assert.doesNotMatch(html, />Session spend</)
  assert.doesNotMatch(html, />Cache read</)
})

test('ContextMeter supports compact composer rail mode', () => {
  assert.equal(typeof ContextMeter, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ContextMeter, {
      usage: {
        modelLimit: 512000,
        latestMeasuredTurnTokens: 2000,
        threadOccupancyTokens: 2000,
        threadOccupancyAvailable: true,
        threadOccupancySource: 'estimated_history',
        threadOccupancyConfidence: 'calibrated_estimate',
        threadOccupancyProvenance: 'calibrated_estimate',
        effectiveOccupancyTokens: 2000,
        contextOccupancyTokens: 2000,
        contextRemainingTokens: 510000,
        occupancySource: 'estimated_history',
        occupancyConfidence: 'calibrated_estimate',
      },
      compact: true,
      detailsDock: 'external_left',
    }),
  )

  assert.match(html, /class="relative flex h-8 w-8/)
  assert.match(html, /w-\[11\.75rem\]/)
  assert.match(html, /bg-surface-raised/)
  assert.match(html, /aria-label="Context window: 0% used \(100% left\), 2000\/512000 tokens used"/)
})

test('ContextMeter renders unavailable occupancy as a dashed unknown ring', () => {
  assert.equal(typeof ContextMeter, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ContextMeter, {
      usage: {
        modelLimit: 512000,
        threadOccupancyAvailable: false,
        rollingTotalTokens: 9000,
        occupancyAvailable: false,
        occupancySource: 'unavailable',
        occupancyConfidence: 'unavailable',
      },
      compact: true,
    }),
  )

  assert.match(html, /Context window unavailable \(512000 token limit; thread occupancy unavailable\)/)
  assert.match(html, /data-meter-ring="unavailable"/)
  assert.match(html, />Unavailable</)
  assert.match(html, />\?</)
})

test('ContextMeter shows a full ring for empty threads with a known limit before occupancy telemetry arrives', () => {
  assert.equal(typeof ContextMeter, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ContextMeter, {
      usage: {
        modelLimit: 512000,
        threadOccupancyAvailable: false,
        occupancyAvailable: false,
        occupancySource: 'unavailable',
        occupancyConfidence: 'unavailable',
        contextRemainingTokens: 512000,
      },
      activeThreadIsEmpty: true,
      compact: true,
    }),
  )

  assert.match(html, /Context window: 0% used \(100% left\), empty thread/)
  assert.match(html, /0 \/ 512\.0k tokens used/)
  assert.match(html, /data-meter-ring="empty_thread_fallback"/)
  assert.doesNotMatch(html, />\?</)
})

test('ContextMeter shows a full ring during the first turn before occupancy telemetry arrives', () => {
  assert.equal(typeof ContextMeter, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ContextMeter, {
      usage: {
        modelLimit: 512000,
        threadOccupancyAvailable: false,
        occupancyAvailable: false,
        occupancySource: 'unavailable',
        occupancyConfidence: 'unavailable',
        contextRemainingTokens: 512000,
      },
      activeThreadContextFallbackMode: 'initial_turn',
      compact: true,
    }),
  )

  assert.match(html, /Context window: 0% used \(100% left\), first turn/)
  assert.match(html, /0 \/ 512\.0k tokens used/)
  assert.match(html, /data-meter-ring="initial_turn_fallback"/)
  assert.doesNotMatch(html, />\?</)
})

test('ContextMeter renders a recalculating state after compaction without faking a full reset', () => {
  assert.equal(typeof ContextMeter, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ContextMeter, {
      usage: {
        modelLimit: 512000,
        threadOccupancyAvailable: false,
        occupancyAvailable: false,
        occupancySource: 'unavailable',
        occupancyConfidence: 'unavailable',
        compactionStrategy: 'codex_thread_compaction',
        compactionScope: 'thread_reset',
        compactionSource: 'provider',
        usageRefreshState: 'recalculating',
      },
      activeThreadIsEmpty: true,
      compact: true,
    }),
  )

  assert.match(html, /Context window recalculating after compaction \(512000 token limit\)/)
  assert.match(html, />Unavailable</)
  assert.match(html, /data-meter-ring="unavailable"/)
  assert.doesNotMatch(html, /empty thread/)
})
