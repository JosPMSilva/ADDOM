import { resolveModelCapabilities } from '../api-clients/ai-provider.mjs'

export async function resolveModelCapabilitiesWithTimeout({
  providerId = '',
  apiKey = '',
  modelId = '',
  authMethod = 'api_key',
  forceRefresh = false,
  failOnProbeError = false,
  timeoutMs = 45_000,
  abortSignal = null,
  resolveCapabilities = resolveModelCapabilities,
} = {}) {
  const createAbortError = () => {
    const error = new Error('Capability probe aborted.')
    error.name = 'AbortError'
    return error
  }
  if (abortSignal?.aborted) {
    throw createAbortError()
  }
  const probeAbortController = new AbortController()
  const probePromise = Promise.resolve().then(() => resolveCapabilities(
    providerId,
    apiKey,
    modelId,
    {
      authMethod,
      forceRefresh,
      failOnProbeError,
      abortSignal: probeAbortController.signal,
    },
  ))
  const normalizedTimeoutMs = Math.max(1_000, Number(timeoutMs || 0) || 45_000)
  let timer = null
  let onAbort = null
  try {
    return await Promise.race([
      probePromise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`Capability probe timed out after ${normalizedTimeoutMs}ms.`)
          error.name = 'TimeoutError'
          reject(error)
          probeAbortController.abort(error)
        }, normalizedTimeoutMs)
        if (abortSignal?.addEventListener) {
          onAbort = () => {
            const error = createAbortError()
            reject(error)
            probeAbortController.abort(abortSignal.reason || error)
          }
          abortSignal.addEventListener('abort', onAbort, { once: true })
        }
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
    if (onAbort && abortSignal?.removeEventListener) {
      abortSignal.removeEventListener('abort', onAbort)
    }
  }
}
