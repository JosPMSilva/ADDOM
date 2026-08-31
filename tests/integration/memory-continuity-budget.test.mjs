import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-memory-continuity-budget-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb } = await import('../../src/main/memory/db.mjs')
const { addNode } = await import('../../src/main/memory/memory-store.mjs')
const { bootstrapTurnHistory } = await import('../../src/main/chat/chat-turn-bootstrap.mjs')
const { applyMemoryContextBudgetToHistory } = await import('../../src/main/chat/memory-context-budget.mjs')
const { buildContinuityPacket } = await import('../../src/main/chat/continuity/packet-builder.mjs')
const { upsertContinuityPacketMessage } = await import('../../src/main/chat/continuity/packet-injection.mjs')
const { planContinuityTokenBudget } = await import('../../src/main/chat/continuity/token-budget-planner.mjs')
const { resolveProviderPromptBudgetProfile } = await import('../../src/main/chat/provider-prompt-budget-profile.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

async function seedMemory(project, query, count, {
  contentSize = 260,
  scope = 'project',
  threadId = '',
} = {}) {
  for (let index = 0; index < count; index += 1) {
    await addNode({
      project,
      topic: `Memory ${index + 1}`,
      content: `${query} ${'detail '.repeat(Math.max(1, Math.round(contentSize / 7)))}`.trim(),
      source: 'user',
      scope,
      threadId,
    })
  }
}

test.after(() => {
  try { closeDb() } catch { /* best-effort */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort */ }
})

test('normal profile keeps expected memory context', async (t) => {
  try {
    const project = 'memory-budget-openai'
    const query = 'OPENAI_MEMORY_KEEP'
    await seedMemory(project, query, 3, {
      contentSize: 120,
      scope: 'thread',
      threadId: 'thread-openai',
    })

    const sent = []
    const errorDiagnostics = {}
    const history = await bootstrapTurnHistory({
      history: [{ role: 'system', content: 'You are ADDOM.' }],
      mode: 'execute',
      modeSystemPrompt: 'You are ADDOM.',
      runtimeContextBlock: '[ADDOM Runtime Context]\nOS: Windows',
      providerId: 'openai',
      model: 'gpt-5.3-codex',
      modelContext: { limitTokens: 128_000, maxOutputTokens: 8_192, source: 'test' },
      userMessage: query,
      projectFolder: project,
      activeThreadId: 'thread-openai',
      activeTurnId: 'turn-openai',
      promptBudgetProfile: resolveProviderPromptBudgetProfile({ providerId: 'openai', modelId: 'gpt-5.3-codex' }),
      errorDiagnostics,
      send: (channel, payload) => sent.push({ channel, payload }),
      persistTimelineEvent: () => {},
    })

    const memoryEvent = sent.find((entry) => entry.channel === 'memory:context-injected')
    assert.ok(memoryEvent)
    assert.equal(memoryEvent.payload.nodeCount, 3)
    assert.deepEqual(memoryEvent.payload.laneNodeCounts, { thread: 3, project: 0, global: 0 })
    assert.equal(errorDiagnostics.memoryContextNodeCount, 3)
    assert.deepEqual(errorDiagnostics.memoryContextLaneCounts, { thread: 3, project: 0, global: 0 })
    assert.equal(errorDiagnostics.memoryContextBudgetReductionApplied, false)
    assert.match(String(history[0]?.content || ''), /OPENAI_MEMORY_KEEP/)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('bootstrapTurnHistory forwards promoted memory lane counts into diagnostics', async (t) => {
  try {
    const project = 'memory-budget-promotion-diagnostics'
    const query = 'PROMOTION_DIAGNOSTICS_MEMORY'
    await addNode({
      project,
      topic: 'Thread memory',
      content: `${query} thread lane`,
      source: 'validated_decision',
      scope: 'thread',
      threadId: 'thread-promotion',
    })
    await addNode({
      project,
      topic: 'Promoted project memory',
      content: `${query} promoted lane`,
      source: 'reference_note',
      scope: 'project',
      originThreadId: 'thread-promotion',
      promotedAt: Date.now(),
    })

    const sent = []
    const errorDiagnostics = {}
    await bootstrapTurnHistory({
      history: [{ role: 'system', content: 'You are ADDOM.' }],
      mode: 'execute',
      modeSystemPrompt: 'You are ADDOM.',
      runtimeContextBlock: '[ADDOM Runtime Context]\nOS: Windows',
      providerId: 'openai',
      model: 'gpt-5.3-codex',
      modelContext: { limitTokens: 128_000, maxOutputTokens: 8_192, source: 'test' },
      userMessage: query,
      projectFolder: project,
      activeThreadId: 'thread-promotion',
      activeTurnId: 'turn-promotion',
      promptBudgetProfile: resolveProviderPromptBudgetProfile({ providerId: 'openai', modelId: 'gpt-5.3-codex' }),
      errorDiagnostics,
      send: (channel, payload) => sent.push({ channel, payload }),
      persistTimelineEvent: () => {},
    })

    const memoryEvent = sent.find((entry) => entry.channel === 'memory:context-injected')
    assert.ok(memoryEvent)
    assert.deepEqual(memoryEvent.payload.promotionCounts, { thread: 0, project: 1, global: 0 })
    assert.deepEqual(errorDiagnostics.memoryContextPromotionCounts, { thread: 0, project: 1, global: 0 })
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('Anthropic strict profile reduces memory context when continuity is also present', async (t) => {
  try {
    const project = 'memory-budget-anthropic'
    const query = 'ANTHROPIC_MEMORY_PRESSURE'
    await seedMemory(project, query, 6, {
      contentSize: 1200,
      scope: 'thread',
      threadId: 'thread-anthropic',
    })

    const errorDiagnostics = {}
    const promptBudgetProfile = resolveProviderPromptBudgetProfile({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-6',
    })
    const history = await bootstrapTurnHistory({
      history: [{ role: 'system', content: 'You are ADDOM.' }],
      mode: 'execute',
      modeSystemPrompt: 'You are ADDOM.',
      runtimeContextBlock: '[ADDOM Runtime Context]\nOS: Windows',
      providerId: 'anthropic',
      model: 'claude-sonnet-4-6',
      modelContext: { limitTokens: 24_000, maxOutputTokens: 16_000, source: 'test' },
      userMessage: query,
      projectFolder: project,
      activeThreadId: 'thread-anthropic',
      activeTurnId: 'turn-anthropic',
      promptBudgetProfile,
      errorDiagnostics,
      send: () => {},
      persistTimelineEvent: () => {},
    })

    assert.equal(errorDiagnostics.memoryContextNodeCount, 4)
    assert.deepEqual(errorDiagnostics.memoryContextLaneCounts, { thread: 4, project: 0, global: 0 })

    const continuityBudget = planContinuityTokenBudget({
      modelLimit: 24_000,
      maxOutputTokens: 16_000,
      contextOccupancyTokens: 18_500,
      policy: { enabled: true, activeProfile: 'balanced', maxContinuityPacketTokens: 7_000 },
      promptBudgetProfile,
    })
    const packetBuilt = buildContinuityPacket({
      packetId: 'pkt_anthropic',
      threadId: 'thread-anthropic',
      turnId: 'turn-anthropic',
      profile: continuityBudget.profileKey,
      tokenBudget: continuityBudget.packet.budget,
      maxFacts: continuityBudget.maxInjectedFacts,
      maxSourceRefs: continuityBudget.maxSourceRefs,
      retrieval: {
        facts: Array.from({ length: 10 }, (_, index) => ({
          id: `fact_${index + 1}`,
          factType: index % 2 === 0 ? 'decision' : 'constraint',
          factText: `Continuity fact ${index + 1} ${'evidence '.repeat(24)}`.trim(),
          sourceTurnId: `turn_${index + 1}`,
          sourceRef: 'thread_state:test',
        })),
        invariants: [{ id: 'inv_1', invariantText: 'Keep continuity packet under budget.' }],
        snapshots: [{ id: 'snap_1', turnId: 'turn-anthropic', qualityMeta: { taskSummary: 'Track budget pressure.' } }],
      },
      openLoops: [{ id: 'loop_1', factText: 'Finish the strict-budget regression test.' }],
      drift: { driftRisk: 'low', violationCount: 0 },
    })
    const historyWithPacket = upsertContinuityPacketMessage(history, packetBuilt.packetText)
    const reduced = applyMemoryContextBudgetToHistory(historyWithPacket, {
      maxNodes: promptBudgetProfile.memoryTightMaxNodes,
      maxTokens: promptBudgetProfile.memoryTightBudgetTokens,
    })

    assert.equal(reduced.diagnostics.applied, true)
    assert.ok(reduced.diagnostics.reducedNodeCount < errorDiagnostics.memoryContextNodeCount)
    assert.ok(reduced.diagnostics.reducedNodeCount <= promptBudgetProfile.memoryTightMaxNodes)
    assert.ok(packetBuilt.packetTokens <= continuityBudget.packet.budget)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('continuity packet remains single and within budget', () => {
  const promptBudgetProfile = resolveProviderPromptBudgetProfile({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6',
  })
  const continuityBudget = planContinuityTokenBudget({
    modelLimit: 24_000,
    maxOutputTokens: 16_000,
    contextOccupancyTokens: 18_500,
    policy: { enabled: true, activeProfile: 'balanced', maxContinuityPacketTokens: 7_000 },
    promptBudgetProfile,
  })

  const packetBuilt = buildContinuityPacket({
    packetId: 'pkt_single',
    threadId: 'thread-single',
    turnId: 'turn-single',
    profile: continuityBudget.profileKey,
    tokenBudget: continuityBudget.packet.budget,
    maxFacts: continuityBudget.maxInjectedFacts,
    maxSourceRefs: continuityBudget.maxSourceRefs,
    retrieval: {
      facts: Array.from({ length: 12 }, (_, index) => ({
        id: `fact_${index}`,
        factType: 'decision',
        factText: `Decision ${index} ${'context '.repeat(30)}`.trim(),
        sourceTurnId: `turn_${index}`,
        sourceRef: 'thread_state:test',
      })),
      invariants: [{ id: 'inv', invariantText: 'Never duplicate continuity packets.' }],
      snapshots: [{ id: 'snap', turnId: 'turn-single', qualityMeta: { taskSummary: 'Packet duplication check.' } }],
    },
    openLoops: [{ id: 'loop', factText: 'Verify there is still exactly one packet.' }],
    drift: { driftRisk: 'low', violationCount: 0 },
  })

  const first = upsertContinuityPacketMessage([
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'system', content: '[ADDOM Continuity Packet]\n## decisions\n- stale packet' },
  ], packetBuilt.packetText)
  const second = upsertContinuityPacketMessage(first, packetBuilt.packetText)
  const packetCount = second.filter((row) => String(row?.content || '').includes('[ADDOM Continuity Packet]')).length

  assert.equal(packetCount, 1)
  assert.ok(packetBuilt.packetTokens <= continuityBudget.packet.budget)
  assert.ok(continuityBudget.packet.budget <= promptBudgetProfile.continuityBudgetTokens)
})
