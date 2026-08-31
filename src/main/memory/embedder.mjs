/**
 * embedder.mjs — on-device text embedding using @huggingface/transformers.
 */

import path from 'path'
import { EventEmitter } from 'events'
import { getUserDataPath } from '../platform/electron-app.mjs'

const MODEL_ID  = 'Xenova/all-MiniLM-L6-v2'

function getCacheDir() {
  return path.join(getUserDataPath(), 'models')
}

export async function createEmbeddingPipeline({
  cacheDir = getCacheDir(),
  loadTransformers = null,
  onProgress = () => {},
} = {}) {
  const { pipeline, env } = typeof loadTransformers === 'function'
    ? await loadTransformers()
    : await import('@huggingface/transformers')
  env.cacheDir = cacheDir
  env.allowRemoteModels = true
  env.allowLocalModels = true
  return pipeline('feature-extraction', MODEL_ID, {
    dtype: 'fp32',
    progress_callback: onProgress,
  })
}

class Embedder extends EventEmitter {
  constructor() {
    super()
    this._pipeline = null
    this._loading  = false
    this._ready    = false
    this._initPromise = null
  }

  async _init() {
    if (this._ready) return
    if (this._initPromise) {
      await this._initPromise
      return
    }

    this._loading = true
    this.emit('status', { state: 'downloading', progress: 0 })

    this._initPromise = (async () => {
      try {
        this._pipeline = await createEmbeddingPipeline({
          onProgress: (info) => {
            if (info.status === 'downloading') {
              const pct = info.total > 0 ? Math.round((info.loaded / info.total) * 100) : 0
              this.emit('status', { state: 'downloading', progress: pct, file: info.file })
            } else if (info.status === 'loading') {
              this.emit('status', { state: 'loading', progress: 100 })
            }
          },
        })

        this._ready = true
        this.emit('ready')
        this.emit('status', { state: 'ready', progress: 100 })
      } catch (err) {
        this.emit('error', err)
        this.emit('status', { state: 'error', message: err?.message || String(err) })
        throw err
      } finally {
        this._loading = false
        this._initPromise = null
      }
    })()

    await this._initPromise
  }

  async embed(text) {
    await this._init()
    const output = await this._pipeline(text, { pooling: 'mean', normalize: true })
    return output.data instanceof Float32Array
      ? output.data
      : new Float32Array(output.data)
  }

  async embedBatch(texts) {
    await this._init()
    return Promise.all(texts.map(t => this.embed(t)))
  }

  get isReady() { return this._ready }
}

export const embedder = new Embedder()
