import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildContextMeterViewModel,
  formatTokenCompact,
} from '../../src/renderer/components/chat/context-meter-view-model.mjs'

test('formatTokenCompact formats token counts consistently', () => {
  assert.equal(formatTokenCompact(0), '0')
  assert.equal(formatTokenCompact(999), '999')
  assert.equal(formatTokenCompact(2500), '2.5k')
  assert.equal(formatTokenCompact(2_250_000), '2.3M')
})

test('buildContextMeterViewModel exposes Codex-style used context window labels', () => {
  const vm = buildContextMeterViewModel({
    usage: {
      modelLimit: 258400,
      threadOccupancyTokens: 75292,
      threadOccupancyAvailable: true,
      contextRemainingTokens: 183108,
    },
  })

  assert.equal(vm.used, 75292)
  assert.equal(vm.remaining, 183108)
  assert.equal(vm.usedPercent, 29)
  assert.equal(vm.remainingPercent, 71)
  assert.equal(vm.ringPercent, 29)
  assert.equal(vm.tooltipPercentLabel, '29% used (71% left)')
  assert.equal(vm.tooltipTokensUsedLabel, '75.3k / 258.4k tokens used')
  assert.equal(vm.tooltipCompactionLabel, '')
  assert.match(vm.title, /Context window: 29% used \(71% left\)/)
})

test('buildContextMeterViewModel keeps the ring unavailable for non-empty threads with missing occupancy telemetry', () => {
  const vm = buildContextMeterViewModel({
    usage: {
      modelLimit: 10000,
      threadOccupancyAvailable: false,
      occupancyAvailable: false,
      occupancySource: 'unavailable',
      occupancyConfidence: 'unavailable',
    },
  })

  assert.equal(vm.used, 0)
  assert.equal(vm.remaining, 0)
  assert.equal(vm.ringPercent, 0)
  assert.equal(vm.ringStyle, 'unavailable')
  assert.equal(vm.tooltipPercentLabel, 'Unavailable')
  assert.match(vm.title, /Context window unavailable/)
})

test('buildContextMeterViewModel shows zero used for empty threads with a known limit and no occupancy telemetry', () => {
  const vm = buildContextMeterViewModel({
    usage: {
      modelLimit: 10000,
      threadOccupancyAvailable: false,
      occupancyAvailable: false,
      contextRemainingTokens: 10000,
      emptyThreadContextLeftFallback: true,
    },
  })

  assert.equal(vm.emptyThreadFallbackActive, true)
  assert.equal(vm.used, 0)
  assert.equal(vm.remaining, 10000)
  assert.equal(vm.usedPercent, 0)
  assert.equal(vm.remainingPercent, 100)
  assert.equal(vm.ringPercent, 0)
  assert.equal(vm.ringStyle, 'empty_thread_fallback')
  assert.match(vm.title, /0% used \(100% left\), empty thread/)
})

test('buildContextMeterViewModel shows zero used for the first turn before occupancy telemetry arrives', () => {
  const vm = buildContextMeterViewModel({
    usage: {
      modelLimit: 10000,
      threadOccupancyAvailable: false,
      occupancyAvailable: false,
      contextRemainingTokens: 10000,
    },
    contextLeftFallbackMode: 'initial_turn',
  })

  assert.equal(vm.emptyThreadFallbackActive, false)
  assert.equal(vm.initialTurnFallbackActive, true)
  assert.equal(vm.used, 0)
  assert.equal(vm.remaining, 10000)
  assert.equal(vm.ringPercent, 0)
  assert.equal(vm.ringStyle, 'initial_turn_fallback')
  assert.match(vm.title, /0% used \(100% left\), first turn/)
})

test('buildContextMeterViewModel clamps used tokens to the model limit', () => {
  const vm = buildContextMeterViewModel({
    usage: {
      modelLimit: 8192,
      threadOccupancyTokens: 9000,
      threadOccupancyAvailable: true,
    },
  })

  assert.equal(vm.used, 8192)
  assert.equal(vm.remaining, 0)
  assert.equal(vm.usedPercent, 100)
  assert.equal(vm.remainingPercent, 0)
  assert.equal(vm.ringPercent, 100)
})

test('buildContextMeterViewModel shows a recalculating state after thread-reset compaction without fresh occupancy telemetry', () => {
  const vm = buildContextMeterViewModel({
    usage: {
      modelLimit: 400000,
      threadOccupancyAvailable: false,
      occupancyAvailable: false,
      compactionStrategy: 'codex_thread_compaction',
      compactionScope: 'thread_reset',
      compactionSource: 'provider',
      usageRefreshState: 'recalculating',
    },
  })

  assert.equal(vm.recalculatingCompactionActive, true)
  assert.equal(vm.ringStyle, 'unavailable')
  assert.match(vm.title, /Context window recalculating after compaction/)
})

test('buildContextMeterViewModel supports compact meter sizing', () => {
  const vm = buildContextMeterViewModel({
    usage: {
      modelLimit: 128000,
      contextOccupancyTokens: 1000,
      threadOccupancyAvailable: true,
    },
    compact: true,
  })

  assert.equal(vm.diameter, 24)
  assert.equal(vm.radius, 9)
})

test('buildContextMeterViewModel lowers the ring after compaction lowers thread occupancy', () => {
  const before = buildContextMeterViewModel({
    usage: {
      modelLimit: 200000,
      threadOccupancyTokens: 180000,
      threadOccupancyAvailable: true,
    },
  })
  const after = buildContextMeterViewModel({
    usage: {
      modelLimit: 200000,
      threadOccupancyTokens: 40000,
      threadOccupancyAvailable: true,
    },
  })

  assert.equal(before.ringPercent, 90)
  assert.equal(after.ringPercent, 20)
  assert.equal(after.ringPercent < before.ringPercent, true)
})
