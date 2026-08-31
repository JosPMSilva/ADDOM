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
  if (abortSignal?.aborted) {
    throw new Error('Capability probe aborted.')
  }
  const probePromise = Promise.resolve().then(() => resolveCapabilities(
    providerId,
    apiKey,
    modelId,
    {
      authMethod,
      forceRefresh,
      failOnProbeError,
      abortSignal,
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
          reject(new Error(`Capability probe timed out after ${normalizedTimeoutMs}ms.`))
        }, normalizedTimeoutMs)
        if (abortSignal?.addEventListener) {
          onAbort = () => reject(new Error('Capability probe aborted.'))
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
