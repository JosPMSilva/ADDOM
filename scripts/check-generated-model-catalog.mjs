import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { generateModelCatalog } from './generate-model-catalog.mjs'
import {
  DEFAULT_MODEL_CATALOG_LOCK,
  DEFAULT_MODEL_CATALOG_SOURCE,
  readNormalizedCatalogSource,
} from './lib/model-catalog-source.mjs'

const GENERATED_ROOT = path.resolve('src/common/api-clients/generated')

async function requireEqualFile(actualPath, expectedPath) {
  const [actual, expected] = await Promise.all([
    readFile(actualPath),
    readFile(expectedPath),
  ])
  assert.equal(
    actual.equals(expected),
    true,
    `Generated model catalog artifact drifted: ${path.basename(expectedPath)}`,
  )
}

async function main() {
  const { source } = await readNormalizedCatalogSource()
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'addom-catalog-check-'))
  try {
    const temporarySnapshot = path.join(temporaryRoot, 'model-catalog.snapshot.mjs')
    await generateModelCatalog({
      input: DEFAULT_MODEL_CATALOG_SOURCE,
      lock: DEFAULT_MODEL_CATALOG_LOCK,
      output: temporarySnapshot,
    })
    await Promise.all([
      requireEqualFile(
        temporarySnapshot,
        path.join(GENERATED_ROOT, 'model-catalog.snapshot.mjs'),
      ),
      requireEqualFile(
        path.join(temporaryRoot, 'model-catalog.lookup.mjs'),
        path.join(GENERATED_ROOT, 'model-catalog.lookup.mjs'),
      ),
      requireEqualFile(
        path.join(temporaryRoot, 'model-catalog.provider-logos.mjs'),
        path.join(GENERATED_ROOT, 'model-catalog.provider-logos.mjs'),
      ),
      requireEqualFile(
        path.join(temporaryRoot, 'model-catalog.provenance-map.mjs'),
        path.join(GENERATED_ROOT, 'model-catalog.provenance-map.mjs'),
      ),
    ])
    for (const logo of Object.values(source.providerLogos)) {
      const logoPath = path.resolve(GENERATED_ROOT, String(logo?.path || ''))
      const relative = path.relative(GENERATED_ROOT, logoPath)
      assert.equal(
        relative.startsWith('..') || path.isAbsolute(relative),
        false,
        `Provider logo escapes generated assets: ${logo?.path || '(missing)'}`,
      )
      assert.equal((await stat(logoPath)).isFile(), true)
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
  console.log('Offline generated model catalog check passed.')
}

await main()
