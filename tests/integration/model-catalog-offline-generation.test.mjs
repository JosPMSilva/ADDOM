import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { readNormalizedCatalogSource } from '../../scripts/lib/model-catalog-source.mjs'

const SOURCE_PATH = path.resolve('catalog-source/models-dev.normalized.json')
const LOCK_PATH = path.resolve('catalog-source/models-dev.lock.json')

function sha256(contents) {
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`
}

test('tracked model catalog source is bound to immutable upstream provenance', async () => {
  const [sourceContents, lockContents] = await Promise.all([
    readFile(SOURCE_PATH),
    readFile(LOCK_PATH, 'utf8'),
  ])
  const source = JSON.parse(sourceContents.toString('utf8'))
  const lock = JSON.parse(lockContents)

  assert.equal(source.schemaVersion, 1)
  assert.ok(Array.isArray(source.catalog))
  assert.ok(source.catalog.length >= 10)
  assert.equal(lock.schemaVersion, 1)
  assert.match(lock.upstream.repository, /^https:\/\/github\.com\/[^/]+\/[^/]+\.git$/)
  assert.match(lock.upstream.commit, /^[a-f0-9]{40}$/)
  assert.match(lock.upstream.tree, /^[a-f0-9]{40}$/)
  assert.equal(lock.sourceDigest, sha256(sourceContents))
  assert.equal(lock.providerCount, source.catalog.length)
  assert.equal(
    lock.modelCount,
    source.catalog.reduce((sum, provider) => sum + provider.models.length, 0),
  )
})

test('generated catalog verification succeeds without machine-local models.dev cache', () => {
  const missingCache = path.resolve('.cache/definitely-missing-models.dev/providers')
  const result = spawnSync(process.execPath, [
    'scripts/check-generated-model-catalog.mjs',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      ADDOM_MODEL_CATALOG_INPUT: missingCache,
    },
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /offline generated model catalog check passed/i)
})

test('tracked catalog mutation fails its provenance digest before generation', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'addom-catalog-lock-'))
  const sourcePath = path.join(temporaryRoot, 'source.json')
  const lockPath = path.join(temporaryRoot, 'lock.json')
  try {
    await Promise.all([
      cp(SOURCE_PATH, sourcePath),
      cp(LOCK_PATH, lockPath),
    ])
    const source = JSON.parse(await readFile(sourcePath, 'utf8'))
    source.catalog[0].name = `${source.catalog[0].name} modified`
    await writeFile(sourcePath, `${JSON.stringify(source, null, 2)}\n`, 'utf8')

    await assert.rejects(
      readNormalizedCatalogSource({ sourcePath, lockPath }),
      /source digest mismatch/i,
    )
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
})

test('refresh candidates cannot delete outside the repository cache', () => {
  const result = spawnSync(process.execPath, [
    'scripts/refresh-model-catalog-source.mjs',
    '--output',
    '.',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /must be a child of the repository \.cache directory/i)
})
