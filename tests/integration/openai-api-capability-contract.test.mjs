import test from 'node:test'
import assert from 'node:assert/strict'

import {
  OPENAI_API_WEBSOCKET_PROTOCOL_REVISION,
  resolveOpenAIApiCapabilityContract,
  resolveOpenAIResponsesWebSocketQualification,
} from '../../src/main/api-clients/openai-api-capability-contract.mjs'

test('openai API capability contract separates eligibility, implementation, and qualification evidence', () => {
  const contract = resolveOpenAIApiCapabilityContract('gpt-5.4')
  const webSearch = contract.hostedTools.web_search

  assert.equal(contract.modelEligibility.status, 'curated')
  assert.equal(contract.modelEligibility.eligible, true)
  assert.equal(webSearch.modelEligibility.eligible, true)
  assert.equal(webSearch.modelEligibility.source, 'curated_model_metadata')
  assert.equal(webSearch.implementation.supported, true)
  assert.equal(webSearch.implementation.handlerId, 'ai_sdk_openai.tools.webSearch')
  assert.equal(webSearch.qualification.status, 'fixture_qualified')
  assert.equal(webSearch.qualification.liveQualified, false)
  assert.equal(webSearch.supported, true)
})

test('openai API capability contract exposes a local explanation for ineligible tools', () => {
  const contract = resolveOpenAIApiCapabilityContract('gpt-5.3-codex')
  const webSearch = contract.hostedTools.web_search

  assert.equal(contract.modelEligibility.eligible, true)
  assert.equal(webSearch.modelEligibility.eligible, false)
  assert.equal(webSearch.implementation.supported, true)
  assert.equal(webSearch.supported, false)
  assert.match(webSearch.reason, /model.*not eligible/i)
})

test('openai API capability contract cannot offer a tool whose ADDOM implementation is absent', () => {
  const contract = resolveOpenAIApiCapabilityContract('gpt-5.4', {
    implementationRegistry: {
      web_search: {
        supported: false,
        handlerId: 'ai_sdk_openai.tools.webSearch',
        reason: 'The loaded adapter does not expose web search.',
      },
    },
  })
  const webSearch = contract.hostedTools.web_search

  assert.equal(webSearch.modelEligibility.eligible, true)
  assert.equal(webSearch.implementation.supported, false)
  assert.equal(webSearch.supported, false)
  assert.match(webSearch.reason, /loaded adapter/i)
})

test('experimental OpenAI websocket support is version gated', () => {
  const qualified = resolveOpenAIResponsesWebSocketQualification({
    undiciVersion: '6.28.0',
    protocolRevision: OPENAI_API_WEBSOCKET_PROTOCOL_REVISION,
  })
  assert.equal(qualified.supported, true)
  assert.equal(qualified.qualification.status, 'fixture_qualified')

  const driftedDependency = resolveOpenAIResponsesWebSocketQualification({
    undiciVersion: '7.0.0',
    protocolRevision: OPENAI_API_WEBSOCKET_PROTOCOL_REVISION,
  })
  assert.equal(driftedDependency.supported, false)
  assert.equal(driftedDependency.qualification.status, 'version_mismatch')
  assert.match(driftedDependency.reason, /undici 6\.28\.x/i)

  const driftedProtocol = resolveOpenAIResponsesWebSocketQualification({
    undiciVersion: '6.28.0',
    protocolRevision: OPENAI_API_WEBSOCKET_PROTOCOL_REVISION + 1,
  })
  assert.equal(driftedProtocol.supported, false)
  assert.equal(driftedProtocol.qualification.status, 'version_mismatch')
  assert.match(driftedProtocol.reason, /protocol revision/i)
})
