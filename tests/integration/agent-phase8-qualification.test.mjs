import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  buildCanonicalTurnFromEvents,
  selectCanonicalFinalDocument,
} from '../../src/common/chat/canonical-turn-engine.mjs'
import {
  buildChildFinalContinuation,
  buildOrchestratorSynthesis,
  MAX_ORCHESTRATOR_CONTRIBUTIONS,
} from '../../src/main/agents/agent-orchestrator-synthesis.mjs'
import {
  createAgentRunState,
  hydrateAgentRunSnapshot,
} from '../../src/renderer/store/agents/agent-run-reducer.mjs'
import {
  NAVIGATOR_VIRTUALIZE_MIN_ROWS,
  selectAgentNavigatorModel,
} from '../../src/renderer/store/agents/agent-navigator-view-model.mjs'

const MATRIX_PATH = new URL(
  '../fixtures/agent-runtime-phase8/qualification-matrix.json',
  import.meta.url,
)
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..', '..')

const REQUIRED_CAPABILITY_CLASSES = Object.freeze([
  'managed_cross_provider_child',
  'native_attributable_child',
  'native_opaque_child',
  'continuation_route_selection',
  'account_and_api_route_truth',
  'unicode_rich_child_content',
  'scaled_lazy_child_inspection',
  'recovery_failure_permission_and_route_removal',
])

const REQUIRED_COVERAGE = Object.freeze([
  'managed_child',
  'native_attributable',
  'native_opaque',
  'native_resume',
  'managed_rehydration',
  'api_key_route',
  'account_auth_route',
  'english',
  'portuguese',
  'cjk',
  'rtl',
  'emoji',
  'code',
  'structured_rich_content',
  'agents_20',
  'agents_50',
  'agents_100',
  'restart',
  'interruption',
  'provider_failure',
  'permission_denial',
  'route_removal',
])

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function assertEvidenceReference(reference, label) {
  assert.equal(typeof reference?.file, 'string', `${label} file is required`)
  assert.equal(typeof reference?.test, 'string', `${label} test is required`)
  const filePath = path.resolve(REPOSITORY_ROOT, reference.file)
  assert.equal(filePath.startsWith(`${REPOSITORY_ROOT}${path.sep}`), true, `${label} escapes repository`)
  const source = await fs.readFile(filePath, 'utf8')
  assert.match(source, new RegExp(escaped(reference.test), 'i'), `${label} test is missing`)
}

test('Phase 8 qualification matrix is complete, deterministic, and blocks unsupported release claims', async () => {
  const matrix = JSON.parse(await fs.readFile(MATRIX_PATH, 'utf8'))
  assert.equal(matrix.schemaVersion, 1)
  assert.deepEqual(matrix.rows.map((row) => row.capabilityClass), REQUIRED_CAPABILITY_CLASSES)
  assert.deepEqual([...new Set(matrix.coverage)].sort(), [...REQUIRED_COVERAGE].sort())

  for (const row of matrix.rows) {
    assert.equal(row.networkRequired, false, `${row.capabilityClass} must remain offline deterministic evidence`)
    assert.ok(['managed', 'native_partial', 'native_opaque', 'route_policy', 'shared_engine'].includes(row.routeClass))
    assert.ok(['qualified', 'qualified_partial', 'qualified_opaque', 'contract_only', 'release_blocked_live'].includes(row.releaseDisposition))
    assert.equal(typeof row.claim, 'string')
    assert.ok(row.claim.length > 0)
    assert.equal(Array.isArray(row.coverage), true)
    assert.ok(row.coverage.length > 0)
    assert.equal(Array.isArray(row.evidence), true)
    assert.ok(row.evidence.length > 0)
    for (const evidence of row.evidence) {
      await assertEvidenceReference(evidence, `${row.capabilityClass} evidence`)
    }
    if (row.releaseDisposition === 'contract_only') {
      assert.match(row.claim, /not.*(shipped|available)|without.*evidence/i)
    }
    if (row.routeClass === 'native_partial') {
      assert.equal(row.releaseDisposition, 'qualified_partial')
      assert.match(row.claim, /partial/i)
    }
    if (row.routeClass === 'native_opaque') {
      assert.equal(row.releaseDisposition, 'qualified_opaque')
      assert.match(row.claim, /opaque/i)
    }
    if (row.coverage.includes('native_resume')) {
      assert.match(row.claim, /no current provider native-resume availability is claimed/i)
    }
  }

  assert.deepEqual(matrix.liveReleaseGate, {
    required: true,
    managedCrossProviderConversation: 'qualified',
    nativeOrAccountConversation: 'qualified',
    rule: 'No provider capability claim changes until both local live qualifications are recorded.',
  })
})

test('Phase 8: child canonical engine preserves multilingual reasoning, code, emoji, and rich final parts', () => {
  const multilingual = [
    'Reviewing `src/app.js`.\n',
    'A decis\u00e3o est\u00e1 aprovada: a\u00e7\u00e3o conclu\u00edda.\n',
    '\u8a2d\u8a08\u3092\u78ba\u8a8d\u3057\u307e\u3057\u305f\u3002\n',
    '\u062a\u0645\u062a \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629 \u0628\u0646\u062c\u0627\u062d.\n',
    '\ud83d\udc69\ud83c\udffd\u200d\ud83d\udcbb \u2705\n',
    '```js\nconst result = true\n```\n',
  ]
  const events = multilingual.map((delta, index) => ({
    id: `reasoning_${index + 1}`,
    nodeSequence: index + 1,
    kind: 'agent_reasoning_delta',
    payload: { delta },
  }))
  events.push({
    id: 'tool_1', nodeSequence: 7, kind: 'agent_tool_started',
    payload: { toolCallId: 'tool_1', toolName: 'read_file', text: 'src/app.js' },
  }, {
    id: 'final_1', nodeSequence: 8, kind: 'agent_final_message',
    payload: { text: 'Fallback final text.' },
    finalDocument: {
      parts: [
        { appendOrder: 1, kind: 'markdown', text: '## Resultado\n' },
        { appendOrder: 2, kind: 'file', text: 'docs/\u8a2d\u8a08.md\n' },
        { appendOrder: 3, kind: 'image', text: 'generated: imagem-\u2705.png\n' },
      ],
    },
  })

  const turn = buildCanonicalTurnFromEvents(events)
  assert.equal(turn.reasoningById.reasoning_1.detail, multilingual.join(''))
  assert.deepEqual(turn.itemOrder, ['reasoning:reasoning_1', 'tool:tool_1'])

  const finalDocument = selectCanonicalFinalDocument(events, {
    threadId: 'thread_1', turnId: 'turn_1',
  })
  assert.ok(finalDocument)
  assert.equal(finalDocument.text, '## Resultado\ndocs/\u8a2d\u8a08.md\ngenerated: imagem-\u2705.png\n')
  assert.deepEqual(finalDocument.parts.map((part) => part.kind), ['markdown', 'file', 'image'])
})

test('Phase 8: provider-declared reasoning boundaries preserve words without language heuristics', () => {
  const turn = buildCanonicalTurnFromEvents([
    { id: 'reasoning_1', nodeSequence: 1, kind: 'agent_reasoning_delta', payload: { delta: 'Reviewing platform compatibility checks' } },
    { id: 'boundary_1', nodeSequence: 2, kind: 'agent_reasoning_boundary', payload: { boundary: 'end' } },
    { id: 'reasoning_2', nodeSequence: 3, kind: 'agent_reasoning_delta', payload: { delta: 'Examining error handling and type support' } },
    { id: 'answer_1', nodeSequence: 4, kind: 'agent_assistant_delta', payload: { delta: '{"summary":"internal transport"}' } },
  ])

  assert.deepEqual(turn.itemOrder, ['reasoning:reasoning_1', 'reasoning:reasoning_2'])
  assert.equal(turn.reasoningById.reasoning_1.detail, 'Reviewing platform compatibility checks')
  assert.equal(turn.reasoningById.reasoning_2.detail, 'Examining error handling and type support')
  assert.doesNotMatch(JSON.stringify(turn), /internal transport/)
})

test('Phase 8: authoritative reasoning snapshots replace non-reconstructable provider deltas', () => {
  const turn = buildCanonicalTurnFromEvents([
    { id: 'reasoning_1', nodeSequence: 1, kind: 'agent_reasoning_delta', payload: { delta: 'Theuser' } },
    { id: 'reasoning_2', nodeSequence: 2, kind: 'agent_reasoning_delta', payload: { delta: 'wantsaconcisereview.' } },
    {
      id: 'reasoning_snapshot',
      nodeSequence: 3,
      kind: 'agent_reasoning_delta',
      payload: { delta: 'The user wants a concise review.', snapshot: true },
    },
  ])

  assert.deepEqual(turn.itemOrder, ['reasoning:reasoning_1'])
  assert.equal(turn.reasoningById.reasoning_1.detail, 'The user wants a concise review.')
})

test('Phase 8: a paged authoritative reasoning snapshot remains independently renderable', () => {
  const turn = buildCanonicalTurnFromEvents([
    {
      id: 'reasoning_snapshot',
      nodeSequence: 99,
      kind: 'agent_reasoning_delta',
      payload: { delta: 'A decisão está aprovada.', snapshot: true },
    },
  ])

  assert.deepEqual(turn.itemOrder, ['reasoning:reasoning_snapshot'])
  assert.equal(turn.reasoningById.reasoning_snapshot.detail, 'A decisão está aprovada.')
})

test('Phase 8: legacy structured transport is not rendered as reasoning prose', () => {
  const turn = buildCanonicalTurnFromEvents([
    { id: 'reasoning_1', nodeSequence: 1, kind: 'agent_reasoning_delta', payload: { delta: 'Inspecting the implementation.' } },
    { id: 'boundary_1', nodeSequence: 2, kind: 'agent_reasoning_boundary', payload: { boundary: 'end' } },
    { id: 'transport_1', nodeSequence: 3, kind: 'agent_commentary_delta', payload: { delta: '{"summary":"Complete","findings":[]}' } },
  ])

  assert.deepEqual(turn.itemOrder, ['reasoning:reasoning_1'])
  assert.doesNotMatch(JSON.stringify(turn), /"findings"/)
})

function navigatorSnapshot(count) {
  const rootNodeId = 'agent_root'
  return {
    schemaVersion: 1,
    run: {
      id: 'run_phase8', projectId: 'project_01', threadId: 'thread_01', rootNodeId,
      status: 'running', createdAt: 1, lastRunSequence: count,
    },
    nodes: [
      {
        id: rootNodeId, runId: 'run_phase8', parentNodeId: null, rootNodeId, depth: 0,
        branchPath: [rootNodeId], providerId: 'openai-account', modelId: 'gpt-5.6-luna',
        roleId: 'root', roleLabel: 'Primary agent', taskSummary: 'Root', status: 'running',
        capabilitySnapshot: { mode: 'managed_hierarchy', visibilityReason: null },
        workspaceMode: 'local_shared_read', createdAt: 1, startedAt: 1, finishedAt: null,
        childCount: count, resultSummary: null, errorSummary: null,
      },
      ...Array.from({ length: count }, (_, index) => ({
        id: `agent_${index + 1}`, runId: 'run_phase8', parentNodeId: rootNodeId, rootNodeId,
        depth: 1, branchPath: [rootNodeId, `agent_${index + 1}`], providerId: 'openrouter',
        modelId: 'anthropic/claude-sonnet-5', roleId: 'reviewer', roleLabel: 'Reviewer',
        taskSummary: `Review ${index + 1}`, status: 'running',
        capabilitySnapshot: { mode: 'managed_hierarchy', visibilityReason: null },
        workspaceMode: 'local_shared_read', createdAt: 1, startedAt: 1, finishedAt: null,
        childCount: 0, resultSummary: null, errorSummary: null,
      })),
    ],
    attempts: [], approvals: [], artifacts: [], workspaces: [], mergeQueue: [], lastRunSequence: count,
    nodeSequences: {},
  }
}

test('Phase 8: 20/50/100-agent navigator selection remains bounded and root synthesis stays bounded', () => {
  for (const count of [20, 50, 100]) {
    const continuations = Array.from({ length: count }, (_, index) => buildChildFinalContinuation({
      conversationId: `conversation_${index + 1}`,
      turnId: `turn_${index + 1}`,
      nodeId: `agent_${index + 1}`,
      finalMessageId: `final_${index + 1}`,
      status: 'completed',
      provenance: { authorKind: 'agent', authorId: `agent_${index + 1}` },
      conclusion: `Conclusion ${index + 1}: ${'detail '.repeat(300)}`,
    }))
    const synthesis = buildOrchestratorSynthesis({ continuations })
    assert.equal(synthesis.totals.observed, count)
    assert.ok(synthesis.totals.included <= MAX_ORCHESTRATOR_CONTRIBUTIONS)
    assert.equal(synthesis.totals.omitted, count - synthesis.totals.included)
    assert.equal(Object.hasOwn(synthesis, 'transcript'), false)

    let state = createAgentRunState()
    state = hydrateAgentRunSnapshot(state, navigatorSnapshot(count))
    const navigator = selectAgentNavigatorModel(state, {
      projectId: 'project_01', threadId: 'thread_01', now: 1000,
    })
    assert.equal(navigator.visibleRowCount, count)
    assert.equal(navigator.virtualize, count >= NAVIGATOR_VIRTUALIZE_MIN_ROWS)
  }
})
