import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const FIXTURE_INPUT = path.resolve('tests/fixtures/model-catalog/models.dev.sample.json')

function runGenerator(outputFile) {
  const result = spawnSync(process.execPath, [
    'scripts/generate-model-catalog.mjs',
    '--input',
    FIXTURE_INPUT,
    '--output',
    outputFile,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `generator failed with status ${result.status}`)
  }
}

test('generate-model-catalog writes a deterministic normalized snapshot from fixture input', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'addom-model-catalog-'))
  const firstOutput = path.join(tempDir, 'first.mjs')
  const secondOutput = path.join(tempDir, 'second.mjs')

  runGenerator(firstOutput)
  runGenerator(secondOutput)

  const firstContents = await readFile(firstOutput, 'utf8')
  const secondContents = await readFile(secondOutput, 'utf8')

  assert.equal(firstContents, secondContents)
  assert.match(firstContents, /export const GENERATED_MODEL_CATALOG_SOURCE_URL = /)
  assert.match(firstContents, /export const GENERATED_MODEL_CATALOG_SNAPSHOT = /)
  assert.match(firstContents, /"providerId": "gemini"/)
  assert.match(firstContents, /"providerId": "moonshot"/)
  assert.match(firstContents, /"providerId": "anthropic"/)
  assert.match(firstContents, /"cacheWriteUsdPer1M": 3.75/)
  assert.match(firstContents, /"status": "unknown"/)
})
