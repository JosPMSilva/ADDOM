import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createInlineCompletion,
  createStreamWithTools,
} from '../../src/main/api-clients/ai-provider.mjs'
import { inferReasoning } from '../../src/main/api-clients/ai-provider-model-utils.mjs'
import {
  buildLiveSmokeRequest,
  buildLiveSmokeCases,
  createLiveSmokeExecutionContractRecorder,
  formatLiveSmokeCompactionDiagnostics,
  isLiveSmokeExecutionContractEnabled,
  isLiveSmokeStreamEnabled,
  resolveLiveSmokeCompactionVisibility,
  resolveLiveSmokeTimeoutMs,
  validateLiveSmokeExecutionContract,
} from './provider-smoke-helpers.mjs'

test('opt-in curated provider live smoke suite', async (t) => {
  const smokeCases = buildLiveSmokeCases(process.env)
  const runnableCases = smokeCases.filter((entry) => entry.run)
  const timeoutMs = resolveLiveSmokeTimeoutMs(process.env)
  const streamEnabled = isLiveSmokeStreamEnabled(process.env)
  const executionContractEnabled = isLiveSmokeExecutionContractEnabled(process.env)

  if (runnableCases.length === 0) {
    await t.test('live smoke disabled or no configured providers selected', { skip: true }, () => {})
    return
  }

  for (const smokeCase of runnableCases) {
    await t.test(`${smokeCase.providerId}:${smokeCase.modelId}`, async () => {
      const abortSignal = AbortSignal.timeout(timeoutMs)
      const request = buildLiveSmokeRequest({
        providerId: smokeCase.providerId,
        modelId: smokeCase.modelId,
        env: process.env,
      })
      const compactionVisibility = resolveLiveSmokeCompactionVisibility({
        providerId: smokeCase.providerId,
        modelId: smokeCase.modelId,
        providerRuntimeSettings: request.providerRuntimeSettings,
      })
      t.diagnostic(formatLiveSmokeCompactionDiagnostics({
        providerId: smokeCase.providerId,
        modelId: smokeCase.modelId,
        transport: 'inline',
        compaction: compactionVisibility,
      }))
      const result = await createInlineCompletion(smokeCase.providerId, smokeCase.apiKey, {
        model: smokeCase.modelId,
        messages: request.messages,
        maxOutputTokens: 64,
        providerRuntimeSettings: request.providerRuntimeSettings,
        abortSignal,
      })

      assert.equal(result.providerId, smokeCase.providerId)
      assert.equal(result.model, smokeCase.modelId)
      assert.match(String(result.text || ''), /ADDOM_LIVE_SMOKE_OK/i)
    })

    await t.test(`${smokeCase.providerId}:${smokeCase.modelId}:stream`, {
      skip: streamEnabled ? undefined : 'ADDOM_LIVE_SMOKE_STREAM is not enabled.',
    }, async () => {
      let streamedText = ''
      const executionRecorder = createLiveSmokeExecutionContractRecorder()
      const abortSignal = AbortSignal.timeout(timeoutMs)
      const request = buildLiveSmokeRequest({
        providerId: smokeCase.providerId,
        modelId: smokeCase.modelId,
        env: process.env,
      })
      const compactionVisibility = resolveLiveSmokeCompactionVisibility({
        providerId: smokeCase.providerId,
        modelId: smokeCase.modelId,
        providerRuntimeSettings: request.providerRuntimeSettings,
      })
      t.diagnostic(formatLiveSmokeCompactionDiagnostics({
        providerId: smokeCase.providerId,
        modelId: smokeCase.modelId,
        transport: 'stream',
        compaction: compactionVisibility,
      }))
      const result = await createStreamWithTools(
        smokeCase.providerId,
        smokeCase.apiKey,
        request.messages,
        {
          model: smokeCase.modelId,
          maxOutputTokens: 64,
          providerRuntimeSettings: request.providerRuntimeSettings,
          abortSignal,
        },
        (chunk) => {
          if (executionContractEnabled) executionRecorder.record('text', { detail: String(chunk || '') })
          streamedText += String(chunk || '')
        },
        (chunk) => {
          if (executionContractEnabled) executionRecorder.record('reasoning', { detail: String(chunk || ''), source: 'provider_callback' })
        },
      )

      assert.equal(result.text, streamedText)
      assert.match(String(result.text || ''), /ADDOM_LIVE_SMOKE_OK/i)
      if (executionContractEnabled) {
        executionRecorder.record('terminal', { state: 'succeeded', source: 'provider_result' })
        const events = executionRecorder.snapshot()
        const validation = validateLiveSmokeExecutionContract(events, {
          supportsReasoning: inferReasoning(smokeCase.providerId, smokeCase.modelId),
        })
        t.diagnostic(`execution_contract_events: ${JSON.stringify(events)}`)
        assert.deepEqual(validation.errors, [])
      }
      if (
        result?.providerResponseMeta
        && typeof result.providerResponseMeta === 'object'
        && (
          typeof result.providerResponseMeta.autoCompactionApplied === 'boolean'
          || (Array.isArray(result.providerResponseMeta.autoCompactionIds) && result.providerResponseMeta.autoCompactionIds.length > 0)
          || typeof result.providerResponseMeta.appliedContextManagement === 'boolean'
          || (Array.isArray(result.providerResponseMeta.contextManagementEdits) && result.providerResponseMeta.contextManagementEdits.length > 0)
        )
      ) {
        t.diagnostic(formatLiveSmokeCompactionDiagnostics({
          providerId: smokeCase.providerId,
          modelId: smokeCase.modelId,
          transport: 'stream_response',
          compaction: compactionVisibility,
          providerResponseMeta: result.providerResponseMeta,
        }))
      }
    })
  }
})
