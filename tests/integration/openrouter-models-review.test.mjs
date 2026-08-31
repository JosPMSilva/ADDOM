import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import {
  buildOpenRouterModelsReviewReport,
  buildOpenRouterModelsSnapshot,
} from '../../scripts/lib/openrouter-models-review.mjs'

const FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'model-catalog',
)

async function readJsonFixture(fileName) {
  const filePath = path.join(FIXTURES_DIR, fileName)
  return JSON.parse(await readFile(filePath, 'utf8'))
}

test('openrouter models review snapshot preserves raw field inventory and normalized rows', async () => {
  const payload = await readJsonFixture('openrouter-live-models.sample.json')
  const snapshot = buildOpenRouterModelsSnapshot(payload, {
    generatedAt: '2026-03-16T12:00:00.000Z',
  })

  assert.equal(snapshot.sourceRowCount, 3)
  assert.equal(snapshot.normalizedRouteCount, 3)
  assert.deepEqual(snapshot.rawFieldInventory.supportedParameters, [
    'reasoning',
    'reasoning_effort',
    'tool_choice',
    'tools',
  ])
  assert.equal(snapshot.models[0].id, 'openai/gpt-5.4')
  assert.equal(snapshot.models[0].openrouterInferredCapabilities.supportsReasoningEffort, true)
  assert.equal(snapshot.models[1].openrouterInferredCapabilities.supportsVision, true)
})

test('openrouter models review report flags route, parameter, context, pricing, and shape drift', async () => {
  const payload = await readJsonFixture('openrouter-live-models.sample.json')
  const previousSnapshot = await readJsonFixture('openrouter-live-models.snapshot.json')
  const currentSnapshot = buildOpenRouterModelsSnapshot(payload, {
    generatedAt: '2026-03-16T12:00:00.000Z',
  })
  const report = buildOpenRouterModelsReviewReport(currentSnapshot, previousSnapshot, {
    generatedAt: '2026-03-16T12:00:00.000Z',
  })

  assert.deepEqual(report.addedRoutes, ['vendor/live-only-route'])
  assert.deepEqual(report.removedRoutes, ['vendor/old-route'])
  assert.equal(report.summary.supportedParameterChangeCount, 2)
  assert.equal(report.summary.contextLengthChangeCount, 2)
  assert.equal(report.summary.pricingChangeCount, 1)
  assert.equal(report.summary.shapeChangeCount, 2)
  assert.deepEqual(report.shapeChanges.supportedParameters.added, ['reasoning_effort'])
  assert.equal(
    report.supportedParameterChanges.find((entry) => entry.routeId === 'openai/gpt-5.4')?.added.includes('reasoning_effort'),
    true,
  )
  assert.equal(
    report.contextLengthChanges.find((entry) => entry.routeId === 'vendor/changed-route')?.after,
    192000,
  )
})
