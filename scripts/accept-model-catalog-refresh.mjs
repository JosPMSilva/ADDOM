import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

import { generateModelCatalog } from './generate-model-catalog.mjs'
import {
  DEFAULT_MODEL_CATALOG_LOCK,
  DEFAULT_MODEL_CATALOG_SOURCE,
  readNormalizedCatalogSource,
} from './lib/model-catalog-source.mjs'

const REVIEW_ROOT = path.resolve('.cache/model-catalog-review')
const GENERATED_ROOT = path.resolve('src/common/api-clients/generated')

async function main() {
  const candidateSource = path.join(REVIEW_ROOT, 'models-dev.normalized.json')
  const candidateLock = path.join(REVIEW_ROOT, 'models-dev.lock.json')
  const candidateLogos = path.join(REVIEW_ROOT, 'generated/provider-logos')
  await readNormalizedCatalogSource({
    sourcePath: candidateSource,
    lockPath: candidateLock,
  })
  await mkdir(path.dirname(DEFAULT_MODEL_CATALOG_SOURCE), { recursive: true })
  await Promise.all([
    cp(candidateSource, DEFAULT_MODEL_CATALOG_SOURCE, { force: true }),
    cp(candidateLock, DEFAULT_MODEL_CATALOG_LOCK, { force: true }),
  ])
  const targetLogos = path.join(GENERATED_ROOT, 'provider-logos')
  await rm(targetLogos, { recursive: true, force: true })
  await cp(candidateLogos, targetLogos, { recursive: true })
  await generateModelCatalog({
    input: DEFAULT_MODEL_CATALOG_SOURCE,
    lock: DEFAULT_MODEL_CATALOG_LOCK,
    output: path.join(GENERATED_ROOT, 'model-catalog.snapshot.mjs'),
  })
  console.log('Accepted reviewed models.dev catalog refresh.')
}

await main()
