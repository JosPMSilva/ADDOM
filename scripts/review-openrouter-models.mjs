import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  buildOpenRouterModelsReviewReport,
  buildOpenRouterModelsSnapshot,
} from './lib/openrouter-models-review.mjs'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_SNAPSHOT_OUTPUT = path.resolve(ROOT_DIR, 'tests/fixtures/model-catalog/openrouter-live-models.snapshot.json')
const DEFAULT_REPORT_OUTPUT = path.resolve(ROOT_DIR, 'tests/fixtures/model-catalog/openrouter-live-models.drift-report.json')
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'

function trimString(value = '') {
  return String(value || '').trim()
}

function parseArgs(argv = []) {
  const args = [...argv]
  const parsed = {
    input: '',
    snapshotOutput: DEFAULT_SNAPSHOT_OUTPUT,
    reportOutput: DEFAULT_REPORT_OUTPUT,
    baseSnapshot: DEFAULT_SNAPSHOT_OUTPUT,
  }
  while (args.length > 0) {
    const flag = trimString(args.shift())
    if (flag === '--input') {
      parsed.input = trimString(args.shift())
      continue
    }
    if (flag === '--snapshot-output') {
      parsed.snapshotOutput = trimString(args.shift())
      continue
    }
    if (flag === '--report-output') {
      parsed.reportOutput = trimString(args.shift())
      continue
    }
    if (flag === '--base-snapshot') {
      parsed.baseSnapshot = trimString(args.shift())
      continue
    }
    throw new Error(`Unknown flag: ${flag}`)
  }
  return parsed
}

async function loadJsonFile(filePath = '') {
  const resolved = path.resolve(filePath)
  const contents = await readFile(resolved, 'utf8')
  return JSON.parse(contents)
}

async function readLivePayload(input = '') {
  if (trimString(input)) {
    return loadJsonFile(input)
  }
  const response = await fetch(OPENROUTER_MODELS_URL, {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`OpenRouter /models request failed with ${response.status}`)
  }
  return response.json()
}

async function loadPreviousSnapshot(filePath = '') {
  try {
    return await loadJsonFile(filePath)
  } catch {
    return { models: [], rawFieldInventory: {} }
  }
}

async function writeJsonFile(filePath = '', value = {}) {
  const resolved = path.resolve(filePath)
  await mkdir(path.dirname(resolved), { recursive: true })
  await writeFile(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const generatedAt = new Date().toISOString()
  const payload = await readLivePayload(options.input)
  const previousSnapshot = await loadPreviousSnapshot(options.baseSnapshot)
  const currentSnapshot = buildOpenRouterModelsSnapshot(payload, { generatedAt })
  const report = buildOpenRouterModelsReviewReport(currentSnapshot, previousSnapshot, { generatedAt })

  await writeJsonFile(options.snapshotOutput, currentSnapshot)
  await writeJsonFile(options.reportOutput, report)

  console.log(`Wrote OpenRouter snapshot: ${path.resolve(options.snapshotOutput)}`)
  console.log(`Wrote OpenRouter drift report: ${path.resolve(options.reportOutput)}`)
  console.log(`Routes: ${report.summary.currentRouteCount}`)
  console.log(`Added: ${report.summary.addedRouteCount}`)
  console.log(`Removed: ${report.summary.removedRouteCount}`)
  console.log(`Supported-parameter changes: ${report.summary.supportedParameterChangeCount}`)
  console.log(`Shape changes: ${report.summary.shapeChangeCount}`)
}

await main()
