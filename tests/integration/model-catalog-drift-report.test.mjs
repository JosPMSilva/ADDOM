import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

function runDriftReport({
  provider = 'openai',
  outputFile,
  vendorRoot = null,
} = {}) {
  const args = [
    'scripts/verify-model-catalog-drift.mjs',
    '--provider',
    provider,
    '--output',
    outputFile,
  ]
  if (vendorRoot) {
    args.push('--vendor-root', vendorRoot)
  }

  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `drift report failed with status ${result.status}`)
  }
}

test('verify-model-catalog-drift does not misreport generated openai input limits as conflicts', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'addom-model-catalog-drift-'))
  const outputFile = path.join(tempDir, 'drift-report.json')

  runDriftReport({ outputFile })

  const parsed = JSON.parse(await readFile(outputFile, 'utf8'))
  assert.equal(parsed.summary.providerCount, 1)
  assert.equal(Array.isArray(parsed.providers), true)
  assert.equal(parsed.providers[0].providerId, 'openai')
  assert.equal(Array.isArray(parsed.providers[0].conflicts), true)
  const gpt54Conflict = parsed.providers[0].conflicts.find((entry) => entry.canonicalModelId === 'gpt-5.4')
  assert.equal(gpt54Conflict?.conflicts.some((conflict) => conflict.field === 'inputLimit') ?? false, false)
})

test('verify-model-catalog-drift reports audio and tiered pricing conflicts for Gemini TOML fixtures', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'addom-model-catalog-drift-gemini-'))
  const vendorRoot = path.join(tempDir, 'providers')
  const providerRoot = path.join(vendorRoot, 'google')
  const modelsRoot = path.join(providerRoot, 'models')
  const outputFile = path.join(tempDir, 'gemini-drift-report.json')

  await mkdir(modelsRoot, { recursive: true })
  await writeFile(path.join(providerRoot, 'provider.toml'), [
    'name = "Google Gemini"',
    'doc = "https://ai.google.dev/gemini-api/docs/models"',
  ].join('\n'), 'utf8')
  await writeFile(path.join(modelsRoot, 'gemini-2.5-pro.toml'), [
    'name = "Gemini 2.5 Pro"',
    'family = "gemini-pro"',
    'release_date = "2025-06-17"',
    'last_updated = "2025-06-17"',
    'attachment = true',
    'reasoning = true',
    'tool_call = true',
    'structured_output = true',
    '',
    '[cost]',
    'input = 0.30',
    'output = 2.50',
    'cache_read = 0.03',
    'input_audio = 1.25',
    'cache_read_audio = 0.15',
    '',
    '[cost.context_over_200k]',
    'input = 0.60',
    'output = 3.50',
    '',
    '[limit]',
    'context = 1_048_576',
    'output = 65_536',
    '',
    '[modalities]',
    'input = ["text", "image", "audio", "video", "pdf"]',
    'output = ["text"]',
  ].join('\n'), 'utf8')

  runDriftReport({
    provider: 'gemini',
    outputFile,
    vendorRoot,
  })

  const parsed = JSON.parse(await readFile(outputFile, 'utf8'))
  assert.equal(parsed.summary.providerCount, 1)
  assert.equal(parsed.providers[0].providerId, 'gemini')
  const modelConflict = parsed.providers[0].conflicts.find((entry) => entry.canonicalModelId === 'gemini-2.5-pro')
  assert.ok(modelConflict)
  assert.ok(modelConflict.conflicts.some((conflict) => conflict.field === 'pricing.inputAudioUsdPer1M'))
  assert.ok(modelConflict.conflicts.some((conflict) => conflict.field === 'pricing.tiers.context_over_200k.inputUsdPer1M'))
})

test('verify-model-catalog-drift suppresses intentional openrouter moonshot tool-policy deltas', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'addom-model-catalog-drift-openrouter-'))
  const outputFile = path.join(tempDir, 'openrouter-drift-report.json')

  runDriftReport({
    provider: 'openrouter',
    outputFile,
  })

  const parsed = JSON.parse(await readFile(outputFile, 'utf8'))
  assert.equal(parsed.summary.providerCount, 1)
  assert.equal(parsed.providers[0].providerId, 'openrouter')
  const kimiConflict = parsed.providers[0].conflicts.find((entry) => entry.canonicalModelId === 'moonshotai/kimi-k2.5')
  assert.equal(kimiConflict?.conflicts.some((conflict) => conflict.field === 'toolCall') ?? false, false)
})
