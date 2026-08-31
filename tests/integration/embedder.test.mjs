import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { createEmbeddingPipeline, embedder } from '../../src/main/memory/embedder.mjs'

const BASE_STATE = {
  _pipeline: embedder._pipeline,
  _loading: embedder._loading,
  _ready: embedder._ready,
  _initPromise: embedder._initPromise,
  _init: embedder._init,
}

function restoreEmbedder() {
  embedder.removeAllListeners()
  embedder._pipeline = BASE_STATE._pipeline
  embedder._loading = BASE_STATE._loading
  embedder._ready = BASE_STATE._ready
  embedder._initPromise = BASE_STATE._initPromise
  embedder._init = BASE_STATE._init
}

test.afterEach(() => {
  restoreEmbedder()
})

test('embedding pipeline selects the CPU dtype explicitly', async () => {
  const env = {}
  const calls = []
  const loadedPipeline = async () => ({ data: [] })

  const result = await createEmbeddingPipeline({
    cacheDir: 'C:/temp/addom-model-cache',
    loadTransformers: async () => ({
      env,
      pipeline: async (...args) => {
        calls.push(args)
        return loadedPipeline
      },
    }),
  })

  assert.equal(result, loadedPipeline)
  assert.equal(env.cacheDir, 'C:/temp/addom-model-cache')
  assert.equal(env.allowRemoteModels, true)
  assert.equal(env.allowLocalModels, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'feature-extraction')
  assert.equal(calls[0][1], 'Xenova/all-MiniLM-L6-v2')
  assert.equal(calls[0][2].dtype, 'fp32')
})

test('embedder embed initializes once, returns Float32Array, and embedBatch reuses the loaded pipeline', async () => {
  let initCalls = 0
  const pipelineCalls = []

  embedder._pipeline = null
  embedder._ready = false
  embedder._initPromise = null
  embedder._init = async function initStub() {
    if (this._ready) return
    initCalls += 1
    this._ready = true
    this._pipeline = async (text) => {
      pipelineCalls.push(String(text))
      return { data: [String(text).length, 7] }
    }
  }

  const first = await embedder.embed('alpha')
  const batch = await embedder.embedBatch(['b', 'charlie'])

  assert.equal(initCalls, 1)
  assert.equal(embedder.isReady, true)
  assert.ok(first instanceof Float32Array)
  assert.deepEqual([...first], [5, 7])
  assert.equal(batch.length, 2)
  assert.ok(batch[0] instanceof Float32Array)
  assert.deepEqual([...batch[0]], [1, 7])
  assert.deepEqual([...batch[1]], [7, 7])
  assert.deepEqual(pipelineCalls, ['alpha', 'b', 'charlie'])
})

test('embedder embed surfaces pipeline failures after initialization', async () => {
  embedder._pipeline = null
  embedder._ready = false
  embedder._initPromise = null
  embedder._init = async function initStub() {
    if (this._ready) return
    this._ready = true
    this._pipeline = async () => {
      throw new Error('pipeline_failed')
    }
  }

  await assert.rejects(
    () => embedder.embed('bad input'),
    /pipeline_failed/,
  )
})

test('embedder source keeps lazy Hugging Face transformer loading and status event emission', () => {
  const source = fs.readFileSync(path.resolve('src/main/memory/embedder.mjs'), 'utf8')

  assert.match(source, /await import\('@huggingface\/transformers'\)/)
  assert.doesNotMatch(source, /@xenova\/transformers/)
  assert.match(source, /pipeline\('feature-extraction', MODEL_ID/)
  assert.match(source, /this\.emit\('status', \{ state: 'downloading', progress: 0 \}\)/)
  assert.match(source, /this\.emit\('status', \{ state: 'loading', progress: 100 \}\)/)
  assert.match(source, /this\.emit\('ready'\)/)
  assert.match(source, /this\.emit\('status', \{ state: 'ready', progress: 100 \}\)/)
  assert.match(source, /this\.emit\('status', \{ state: 'error', message: err\?\.message \|\| String\(err\) \}\)/)
})
