import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildPresenceTriage,
  classifyPresenceOverflowId,
  resolvePresenceSuggestedAction,
} from '../../scripts/classify-model-presence-overflow.mjs'

test('classifyPresenceOverflowId buckets common upstream-only ids', () => {
  assert.equal(classifyPresenceOverflowId('deepseek/deepseek-r1__58__free'), 'free_or_promo')
  assert.equal(classifyPresenceOverflowId('google/gemini-3.1-pro-preview-customtools'), 'preview_or_exp')
  assert.equal(classifyPresenceOverflowId('openai/gpt-5-image'), 'image_or_media')
  assert.equal(classifyPresenceOverflowId('openai/gpt-5'), 'provider_family_match')
  assert.equal(classifyPresenceOverflowId('minimax/minimax-m2.5'), 'other')
})

test('resolvePresenceSuggestedAction narrows openrouter review to explicit candidates', () => {
  assert.deepEqual(resolvePresenceSuggestedAction('openrouter', 'openai/gpt-5'), {
    action: 'keep_upstream_only',
    reason: 'covered_by_curated_native_provider',
    bucketId: 'provider_family_match',
  })

  assert.deepEqual(resolvePresenceSuggestedAction('openrouter', 'deepseek/deepseek-v3.2'), {
    action: 'review_for_curated_scope',
    reason: 'current_generation_gap_in_curated_scope',
    bucketId: 'provider_family_match',
  })

  assert.deepEqual(resolvePresenceSuggestedAction('openrouter', 'anthropic/claude-3.7-sonnet'), {
    action: 'keep_upstream_only',
    reason: 'older_model_not_needed',
    bucketId: 'provider_family_match',
  })

  assert.deepEqual(resolvePresenceSuggestedAction('openrouter', 'qwen/qwen3-coder'), {
    action: 'keep_upstream_only',
    reason: 'out_of_current_curated_family_scope',
    bucketId: 'provider_family_match',
  })
})

test('resolvePresenceSuggestedAction narrows native-provider review queues', () => {
  assert.deepEqual(resolvePresenceSuggestedAction('openai', 'gpt-5'), {
    action: 'review_for_curated_scope',
    reason: 'high_value_current_generation_gap',
    bucketId: 'other',
  })

  assert.deepEqual(resolvePresenceSuggestedAction('openai', 'text-embedding-3-large'), {
    action: 'keep_upstream_only',
    reason: 'embedding_surface_not_curated',
    bucketId: 'other',
  })

  assert.deepEqual(resolvePresenceSuggestedAction('anthropic', 'claude-sonnet-4-20250514'), {
    action: 'keep_upstream_only',
    reason: 'snapshot_or_alias',
    bucketId: 'other',
  })

  assert.deepEqual(resolvePresenceSuggestedAction('mistral', 'pixtral-12b'), {
    action: 'keep_upstream_only',
    reason: 'image_surface_not_curated',
    bucketId: 'other',
  })
})

test('buildPresenceTriage creates a conservative review queue', () => {
  const triage = buildPresenceTriage({
    providerId: 'openrouter',
    onlyInModelsDev: [
      'deepseek/deepseek-r1__58__free',
      'google/gemini-3.1-pro-preview-customtools',
      'openai/gpt-5-image',
      'openai/gpt-5',
      'deepseek/deepseek-v3.2',
      'qwen/qwen3-coder',
      'openai/gpt-5-chat-latest',
      'openrouter/aurora-alpha',
      'minimax/minimax-m2.5',
    ],
  })

  assert.equal(triage.providerId, 'openrouter')
  assert.equal(triage.onlyInModelsDevCount, 9)
  assert.equal(triage.bucketSummaries.free_or_promo.count, 1)
  assert.equal(triage.bucketSummaries.preview_or_exp.count, 1)
  assert.equal(triage.bucketSummaries.image_or_media.count, 1)
  assert.equal(triage.bucketSummaries.provider_family_match.count, 4)
  assert.equal(triage.bucketSummaries.other.count, 2)
  assert.equal(triage.reviewCandidateCount, 3)
  assert.deepEqual(triage.suggestedActionSummary, {
    keep_upstream_only: 2,
    review_for_curated_scope: 1,
  })
  assert.deepEqual(triage.suggestedActions, [
    {
      id: 'deepseek/deepseek-v3.2',
      action: 'review_for_curated_scope',
      reason: 'current_generation_gap_in_curated_scope',
      bucketId: 'provider_family_match',
    },
    {
      id: 'openai/gpt-5',
      action: 'keep_upstream_only',
      reason: 'covered_by_curated_native_provider',
      bucketId: 'provider_family_match',
    },
    {
      id: 'qwen/qwen3-coder',
      action: 'keep_upstream_only',
      reason: 'out_of_current_curated_family_scope',
      bucketId: 'provider_family_match',
    },
  ])
  assert.deepEqual(triage.suggestedReviewQueue, ['deepseek/deepseek-v3.2'])
})

test('buildPresenceTriage creates a focused native openai review queue', () => {
  const triage = buildPresenceTriage({
    providerId: 'openai',
    onlyInModelsDev: [
      'gpt-4.1',
      'gpt-4o-mini',
      'gpt-5',
      'gpt-5-pro',
      'gpt-5-chat-latest',
      'gpt-3.5-turbo',
      'text-embedding-3-large',
      'o4-mini',
    ],
  })

  assert.equal(triage.onlyInModelsDevCount, 8)
  assert.equal(triage.reviewCandidateCount, 8)
  assert.deepEqual(triage.suggestedActionSummary, {
    keep_upstream_only: 3,
    review_for_curated_scope: 5,
  })
  assert.deepEqual(triage.suggestedReviewQueue, ['gpt-4.1', 'gpt-4o-mini', 'gpt-5', 'gpt-5-pro', 'o4-mini'])
})
