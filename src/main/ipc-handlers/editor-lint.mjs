import { Worker } from 'worker_threads'

const WORKER_REQUEST_TIMEOUT_MS = 15_000

function makeWorkerUnavailableResponse(reason, message) {
  return {
    ok: true,
    available: false,
    reason,
    message: String(message || ''),
  }
}

export function createEditorLintWorkerClient({
  WorkerClass = Worker,
  workerUrl = new URL('./editor-lint-worker.mjs', import.meta.url),
  workerOptions = { type: 'module' },
  requestTimeoutMs = WORKER_REQUEST_TIMEOUT_MS,
} = {}) {
  let lintWorker = null
  let nextRequestId = 1
  const pendingRequests = new Map()

  function clearPending(id) {
    const pending = pendingRequests.get(id)
    if (!pending) return null
    pendingRequests.delete(id)
    try { clearTimeout(pending.timer) } catch { /* best-effort pending timer cleanup */ }
    return pending
  }

  function rejectAllPending(reason, message) {
    for (const [id, pending] of pendingRequests.entries()) {
      pendingRequests.delete(id)
      try { clearTimeout(pending.timer) } catch { /* best-effort pending timer cleanup */ }
      pending.reject(new Error(`${reason}:${String(message || '')}`))
    }
  }

  function disposeLintWorker() {
    const worker = lintWorker
    lintWorker = null
    if (!worker) return
    try {
      worker.removeAllListeners()
    } catch {
      /* best-effort worker listener cleanup */
    }
    try {
      void worker.terminate()
    } catch {
      /* best-effort worker termination */
    }
  }

  function handleWorkerMessage(message = {}) {
    const id = Number(message?.id || 0)
    if (!id) return
    const pending = clearPending(id)
    if (!pending) return

    if (message?.ok) {
      pending.resolve(message.result)
      return
    }

    pending.reject(new Error(String(message?.error || 'editor-lint worker failed')))
  }

  function ensureLintWorker() {
    if (lintWorker) return lintWorker

    const worker = new WorkerClass(workerUrl, workerOptions)

    worker.on('message', handleWorkerMessage)
    worker.on('error', (err) => {
      rejectAllPending('worker_error', err?.message || err)
      if (lintWorker === worker) lintWorker = null
    })
    worker.on('exit', (code) => {
      if (lintWorker === worker) lintWorker = null
      if (pendingRequests.size > 0) {
        rejectAllPending('worker_exit', `code=${code}`)
      }
    })

    lintWorker = worker
    return worker
  }

  function invokeWorker(op, payload = {}) {
    return new Promise((resolve, reject) => {
      let worker
      try {
        worker = ensureLintWorker()
      } catch (err) {
        reject(err)
        return
      }

      const id = nextRequestId++
      const timer = setTimeout(() => {
        const pending = clearPending(id)
        if (!pending) return
        pending.reject(new Error('worker_timeout'))
        disposeLintWorker()
        rejectAllPending('worker_timeout', 'ESLint worker request timed out')
      }, Math.max(1_000, Number(requestTimeoutMs || WORKER_REQUEST_TIMEOUT_MS) || WORKER_REQUEST_TIMEOUT_MS))

      pendingRequests.set(id, { resolve, reject, timer })

      try {
        worker.postMessage({ id, op, payload })
      } catch (err) {
        const pending = clearPending(id)
        if (pending) pending.reject(err)
      }
    })
  }

  async function requestWithRetry(op, payload = {}) {
    try {
      return await invokeWorker(op, payload)
    } catch (error) {
      const normalizedMessage = String(error?.message || '')
      if (!normalizedMessage.startsWith('worker_timeout')) throw error
      disposeLintWorker()
      return invokeWorker(op, payload)
    }
  }

  return {
    async lintTextViaWorker(payload = {}) {
      try {
        return await requestWithRetry('lint', payload)
      } catch (err) {
        return makeWorkerUnavailableResponse('worker_error', err?.message || err)
      }
    },

    async fixTextViaWorker(payload = {}) {
      try {
        return await requestWithRetry('fix', payload)
      } catch (err) {
        return makeWorkerUnavailableResponse('worker_error', err?.message || err)
      }
    },

    resetEditorLintWorker() {
      rejectAllPending('worker_reset', 'Editor lint worker reset')
      disposeLintWorker()
    },
  }
}

const defaultEditorLintWorkerClient = createEditorLintWorkerClient()

async function lintTextViaWorker(payload = {}) {
  return defaultEditorLintWorkerClient.lintTextViaWorker(payload)
}

async function fixTextViaWorker(payload = {}) {
  return defaultEditorLintWorkerClient.fixTextViaWorker(payload)
}

export {
  lintTextViaWorker,
  fixTextViaWorker,
}

export function resetEditorLintWorker() {
  defaultEditorLintWorkerClient.resetEditorLintWorker()
}
