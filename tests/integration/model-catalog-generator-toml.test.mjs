import test from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { parsePortableToml } from '../../scripts/lib/models-dev-portable.mjs'

const VENDORED_PROVIDER_ROOT = path.resolve('tests/fixtures/models-dev-portable-sample/providers')

test('portable TOML parser accepts arrays of inline tables', () => {
  const parsed = parsePortableToml(`
reasoning = [{ type = "toggle" }, { type = "budget_tokens", min = 1024, max = 63999 }]
`)

  assert.deepEqual(parsed.reasoning, [
    { type: 'toggle' },
    { type: 'budget_tokens', min: 1024, max: 63999 },
  ])
})

function runGenerator(inputPath, outputFile) {
  const result = spawnSync(process.execPath, [
    'scripts/generate-model-catalog.mjs',
    '--input',
    inputPath,
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

test('generate-model-catalog reads vendored portable TOML providers deterministically', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'addom-model-catalog-toml-'))
  const inputDir = path.join(tempDir, 'providers')
  const firstOutput = path.join(tempDir, 'first.mjs')
  const secondOutput = path.join(tempDir, 'second.mjs')
  const firstLookup = path.join(tempDir, 'first.lookup.mjs')
  const firstLogos = path.join(tempDir, 'first.provider-logos.mjs')
  const firstProvenance = path.join(tempDir, 'first.provenance-map.mjs')

  for (const providerId of ['openai', 'anthropic', 'google', 'groq']) {
    await cp(
      path.join(VENDORED_PROVIDER_ROOT, providerId),
      path.join(inputDir, providerId),
      { recursive: true },
    )
  }

  const unrelatedProviderPath = path.join(inputDir, 'unrelated')
  await mkdir(path.join(unrelatedProviderPath, 'models'), { recursive: true })
  await writeFile(path.join(unrelatedProviderPath, 'provider.toml'), 'name = "Unrelated"\n', 'utf8')
  await writeFile(path.join(unrelatedProviderPath, 'models', 'unused.toml'), 'name = "Unused"\n', 'utf8')
  await writeFile(path.join(unrelatedProviderPath, 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>\n', 'utf8')

  const gemini31ProPath = path.join(inputDir, 'google', 'models', 'gemini-3.1-pro-preview.toml')
  const gemini31ProContents = await readFile(gemini31ProPath, 'utf8')
  await writeFile(
    gemini31ProPath,
    `${gemini31ProContents}\n[cost.context_over_500k]\ninput = 6.00\noutput = 22.00\ncache_read = 0.60\n`,
    'utf8',
  )

  const baseModelPath = path.join(tempDir, 'models', 'google', 'gemini-3.5-flash.toml')
  await mkdir(path.dirname(baseModelPath), { recursive: true })
  await writeFile(baseModelPath, `
name = "Gemini 3.5 Flash"
family = "gemini-flash"
release_date = "2026-06-25"
structured_output = true
[limit]
context = 1_048_576
output = 65_536
`, 'utf8')
  await writeFile(path.join(inputDir, 'google', 'models', 'gemini-3.5-flash.toml'), `
base_model = "google/gemini-3.5-flash"
base_model_omit = ["structured_output"]
[cost]
input = 0.50
output = 3.00
`, 'utf8')

  runGenerator(inputDir, firstOutput)
  runGenerator(inputDir, secondOutput)

  const firstContents = await readFile(firstOutput, 'utf8')
  const secondContents = await readFile(secondOutput, 'utf8')
  const lookupContents = await readFile(firstLookup, 'utf8')
  const logosContents = await readFile(firstLogos, 'utf8')
  const provenanceContents = await readFile(firstProvenance, 'utf8')
  const snapshotModule = await import(pathToFileURL(firstOutput).href)
  const lookupModule = await import(pathToFileURL(firstLookup).href)
  const logosModule = await import(pathToFileURL(firstLogos).href)
  const provenanceModule = await import(pathToFileURL(firstProvenance).href)

  assert.equal(firstContents, secondContents)
  assert.match(firstContents, /"providerId": "openai"/)
  assert.match(firstContents, /"providerId": "anthropic"/)
  assert.match(firstContents, /"providerId": "gemini"/)
  assert.match(firstContents, /"providerId": "groq"/)
  assert.match(firstContents, /"id": "gpt-5\.3-codex"/)
  assert.match(firstContents, /"id": "claude-opus-4-0"/)
  assert.match(firstContents, /"id": "gemini-2\.5-pro"/)
  assert.match(firstContents, /"id": "openai\/gpt-oss-20b"/)
  assert.match(firstContents, /"id": "qwen\/qwen3-32b"/)
  assert.match(firstContents, /"sourceFile": "providers\/openai\/models\/gpt-5\.3-codex\.toml"/)
  assert.match(firstContents, /"id": "context_over_200k"/)
  assert.match(firstContents, /"minPromptTokens": 200001/)
  assert.match(firstContents, /"id": "context_over_500k"/)
  assert.match(firstContents, /"minPromptTokens": 500001/)
  assert.match(firstContents, /"releaseDate": /)
  assert.match(firstContents, /"knowledge": /)
  assert.match(lookupContents, /export const GENERATED_MODEL_CATALOG_LOOKUP = /)
  assert.match(logosContents, /export const GENERATED_MODEL_CATALOG_PROVIDER_LOGOS = /)
  assert.match(provenanceContents, /export const GENERATED_MODEL_CATALOG_PROVENANCE_MAP = /)
  const inheritedModel = snapshotModule.GENERATED_MODEL_CATALOG_SNAPSHOT
    .find((provider) => provider.providerId === 'gemini')
    ?.models.find((model) => model.id === 'gemini-3.5-flash')
  assert.equal(inheritedModel?.label, 'Gemini 3.5 Flash')
  assert.equal(inheritedModel?.limits?.context, 1_048_576)
  assert.equal(inheritedModel?.limits?.output, 65_536)
  assert.equal(inheritedModel?.structuredOutput, undefined)
  assert.equal(
    lookupModule.GENERATED_MODEL_CATALOG_LOOKUP.providersById.openai.logoPath,
    'provider-logos/openai.svg',
  )
  assert.equal(
    lookupModule.GENERATED_MODEL_CATALOG_LOOKUP.modelsByProviderId.openai['gpt-5.3-codex'].sourceFile,
    'providers/openai/models/gpt-5.3-codex.toml',
  )
  assert.equal(
    logosModule.GENERATED_MODEL_CATALOG_PROVIDER_LOGOS.gemini.path,
    'provider-logos/gemini.svg',
  )
  assert.equal(logosModule.GENERATED_MODEL_CATALOG_PROVIDER_LOGOS.unrelated, undefined)
  assert.equal(
    provenanceModule.GENERATED_MODEL_CATALOG_PROVENANCE_MAP.modelsByProviderId.gemini['gemini-2.5-pro'].sourceFile,
    'providers/google/models/gemini-2.5-pro.toml',
  )
  assert.equal(
    provenanceModule.GENERATED_MODEL_CATALOG_PROVENANCE_MAP.modelsByProviderId.groq['openai/gpt-oss-20b'].sourceFile,
    'providers/groq/models/openai/gpt-oss-20b.toml',
  )
  assert.equal(
    provenanceModule.GENERATED_MODEL_CATALOG_PROVENANCE_MAP.modelsByProviderId.groq['qwen/qwen3-32b'].sourceFile,
    'providers/groq/models/qwen/qwen3-32b.toml',
  )
})
