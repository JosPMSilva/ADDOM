import test from 'node:test'
import assert from 'node:assert/strict'
import { planContinuityTokenBudget } from '../../src/main/chat/continuity/token-budget-planner.mjs'

test('planContinuityTokenBudget scales packet budgets by profile depth', () => {
  const base = {
    modelLimit: 128_000,
    rollingTotalTokens: 20_000,
    policy: {
      enabled: true,
      activeProfile: 'balanced',
      maxContinuityPacketTokens: 20_000,
      profiles: {
        economy: { packetTokensRatio: 0.05, outputReserveRatio: 0.15, toolReserveRatio: 0.08, maxInjectedFacts: 6, maxSourceRefs: 8, injectEveryRound: false },
        balanced: { packetTokensRatio: 0.12, outputReserveRatio: 0.2, toolReserveRatio: 0.1, maxInjectedFacts: 14, maxSourceRefs: 16, injectEveryRound: false },
        deep: { packetTokensRatio: 0.2, outputReserveRatio: 0.22, toolReserveRatio: 0.12, maxInjectedFacts: 24, maxSourceRefs: 28, injectEveryRound: true },
        custom: { packetTokensRatio: 0.12, outputReserveRatio: 0.2, toolReserveRatio: 0.1, maxInjectedFacts: 14, maxSourceRefs: 16, injectEveryRound: false },
      },
    },
  }

  const economy = planContinuityTokenBudget({
    ...base,
    policy: { ...base.policy, activeProfile: 'economy' },
  })
  const balanced = planContinuityTokenBudget({
    ...base,
    policy: { ...base.policy, activeProfile: 'balanced' },
  })
  const deep = planContinuityTokenBudget({
    ...base,
    policy: { ...base.policy, activeProfile: 'deep' },
  })

  assert.ok(economy.packet.budget > 0)
  assert.ok(balanced.packet.budget > economy.packet.budget)
  assert.ok(deep.packet.budget > balanced.packet.budget)
  assert.equal(deep.injectEveryRound, true)
  assert.equal(economy.injectEveryRound, false)
})

test('planContinuityTokenBudget returns zero budget when no remaining room', () => {
  const budget = planContinuityTokenBudget({
    modelLimit: 8192,
    contextOccupancyTokens: 8192,
    rollingTotalTokens: 999_999,
    policy: { enabled: true, activeProfile: 'balanced' },
  })
  assert.equal(budget.remaining, 0)
  assert.equal(budget.packet.budget, 0)
})

test('planContinuityTokenBudget respects explicit maxOutputTokens when lower than ratio reserve', () => {
  const base = {
    modelLimit: 50_000,
    contextOccupancyTokens: 35_000,
    policy: { enabled: true, activeProfile: 'balanced' },
  }

  const withoutMaxOutput = planContinuityTokenBudget(base)
  const withMaxOutput = planContinuityTokenBudget({
    ...base,
    maxOutputTokens: 4096,
  })

  assert.equal(withoutMaxOutput.reserves.output, 10_000) // balanced default ratio = 20%
  assert.equal(withMaxOutput.reserves.output, 4096)
  assert.equal(withMaxOutput.maxOutputTokens, 4096)
  assert.equal(withoutMaxOutput.packet.budget, 0)
  assert.ok(withMaxOutput.packet.budget > withoutMaxOutput.packet.budget)
})

test('planContinuityTokenBudget prefers context occupancy over rolling token spend when provided', () => {
  const budget = planContinuityTokenBudget({
    modelLimit: 128_000,
    rollingTotalTokens: 120_000,
    contextOccupancyTokens: 24_000,
    policy: { enabled: true, activeProfile: 'balanced' },
  })

  assert.equal(budget.used, 24_000)
  assert.equal(budget.usageSource, 'context_occupancy')
  assert.ok(budget.remaining > 100_000 - 1) // sanity: not using rollingTotalTokens
})

test('planContinuityTokenBudget does not treat rolling total token spend as prompt occupancy when occupancy is unavailable', () => {
  const budget = planContinuityTokenBudget({
    modelLimit: 16_000,
    rollingTotalTokens: 500_000,
    policy: { enabled: true, activeProfile: 'balanced' },
  })

  assert.equal(budget.used, 0)
  assert.equal(budget.usageSource, 'occupancy_unavailable')
  assert.ok(budget.remaining > 0)
  assert.ok(budget.packet.budget > 0)
})

test('planContinuityTokenBudget prioritizes provider-verified thread occupancy over lower estimates', () => {
  const budget = planContinuityTokenBudget({
    modelLimit: 128_000,
    rollingTotalTokens: 999_999,
    contextOccupancyTokens: 4_000,
    occupancySignal: {
      providerVerifiedThreadOccupancyTokens: 96_000,
      estimatedThreadOccupancyTokens: 12_000,
      estimatedThreadOccupancyConfidence: 'calibrated_estimate',
      threadOccupancyTokens: 6_000,
      threadOccupancyConfidence: 'rough_estimate',
    },
    policy: { enabled: true, activeProfile: 'balanced' },
  })

  assert.equal(budget.used, 96_000)
  assert.equal(budget.usageSource, 'provider_verified_thread_occupancy')
  assert.equal(budget.occupancyProvenance, 'provider_verified')
})

test('planContinuityTokenBudget prefers calibrated occupancy estimates over rough fallbacks', () => {
  const budget = planContinuityTokenBudget({
    modelLimit: 128_000,
    occupancySignal: {
      estimatedThreadOccupancyTokens: 54_000,
      estimatedThreadOccupancyConfidence: 'calibrated_estimate',
      threadOccupancyTokens: 18_000,
      threadOccupancyConfidence: 'rough_estimate',
    },
    policy: { enabled: true, activeProfile: 'balanced' },
  })

  assert.equal(budget.used, 54_000)
  assert.equal(budget.usageSource, 'calibrated_thread_estimate')
  assert.equal(budget.occupancyProvenance, 'calibrated_estimate')
})
