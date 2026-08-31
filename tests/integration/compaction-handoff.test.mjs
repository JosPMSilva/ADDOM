import test from 'node:test'
import assert from 'node:assert/strict'

import { estimateTextTokens } from '../../src/main/chat/token-utils.mjs'
import {
  buildCompactionHandoffPayload,
  normalizeCompactionHandoffPayload,
} from '../../src/main/chat/continuity/compaction-handoff-state.mjs'
import {
  COMPACTION_HANDOFF_HEADER,
  COMPACTION_VICINITY_MARKER_HEADER,
  renderCompactionVicinityMarker,
  renderCompactionHandoffPrompt,
  upsertCompactionVicinityMarkerMessage,
} from '../../src/main/chat/continuity/compaction-handoff-prompt.mjs'
import { applyContinuityCompaction } from '../../src/main/chat/continuity/compaction-engine.mjs'

test('normalizeCompactionHandoffPayload enforces canonical schema defaults and bounds', () => {
  const normalized = normalizeCompactionHandoffPayload({
    compactionEvent: {
      occurred: true,
      type: 'provider_truncation',
      phase: 'resumed_after',
      providerId: 'OpenAI',
      source: 'provider',
      confidence: 'explicit',
    },
    workState: {
      objective: '  Keep active files and next step stable after compaction.  ',
      activeFiles: ['src/main/chat/a.mjs', 'src/main/chat/a.mjs', 'docs/specs/x.md'],
    },
    planState: {
      mode: 'plan',
      steps: [
        { id: 's1', text: 'Define schema', status: 'completed' },
        { id: 's2', text: 'Render prompt', status: 'in_progress' },
      ],
    },
  })

  assert.equal(normalized.compactionEvent.occurred, true)
  assert.equal(normalized.compactionEvent.type, 'provider_truncation')
  assert.equal(normalized.compactionEvent.phase, 'resumed_after')
  assert.equal(normalized.compactionEvent.providerId, 'openai')
  assert.deepEqual(normalized.workState.activeFiles, [
    'src/main/chat/a.mjs',
    'docs/specs/x.md',
  ])
  assert.equal(Object.hasOwn(normalized, 'planState'), false)
})

test('renderCompactionHandoffPrompt emits deterministic marker and respects token bound', () => {
  const payload = buildCompactionHandoffPayload({
    compactionEvent: {
      occurred: true,
      type: 'local_summary',
      phase: 'resumed_after',
      source: 'local',
      confidence: 'explicit',
      providerId: 'openai',
      turnId: 'turn_handoff_1',
    },
    historyBeforeCompaction: [
      { role: 'user', content: 'Implement the plan and keep changes in src/main/chat/continuity.' },
      { role: 'assistant', content: 'Next step: write tests and verify failures are addressed.' },
    ],
  })

  const prompt = renderCompactionHandoffPrompt(payload, { tokenBudget: 140 })
  assert.match(prompt, /\[ADDOM Compaction Handoff\]/)
  assert.match(prompt, /phase=resumed_after/)
  assert.ok(estimateTextTokens(prompt) <= 200)
})

test('applyContinuityCompaction injects exactly one compaction handoff message after packet', async () => {
  const history = [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'system', content: `${COMPACTION_HANDOFF_HEADER}\nold stale handoff` },
  ]
  const filler = 'x'.repeat(9000)
  for (let i = 0; i < 24; i += 1) {
    history.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `${i}: ${filler}` })
  }

  const result = await applyContinuityCompaction({
    history,
    modelLimit: 32_000,
    packetText: '[ADDOM Continuity Packet]\n## decisions\n- Keep deterministic ordering.',
    providerId: 'openai',
    turnId: 'turn_compaction_1',
  })

  const handoffMessages = result.history.filter((row) => String(row?.content || '').includes(COMPACTION_HANDOFF_HEADER))
  const packetIndex = result.history.findIndex((row) => String(row?.content || '').includes('[ADDOM Continuity Packet]'))
  const handoffIndex = result.history.findIndex((row) => String(row?.content || '').includes(COMPACTION_HANDOFF_HEADER))

  assert.equal(result.compacted, true)
  assert.equal(handoffMessages.length, 1)
  assert.ok(packetIndex >= 0)
  assert.ok(handoffIndex > packetIndex)
  assert.match(String(handoffMessages[0]?.content || ''), /type=local_summary/)
  assert.match(String(handoffMessages[0]?.content || ''), /phase=resumed_after/)
})

test('compaction vicinity marker renders compactly and upserts once', () => {
  const marker = renderCompactionVicinityMarker({
    providerId: 'openai',
    turnId: 'turn_vicinity_1',
    occupancyRatio: 0.812,
  }, {
    tokenBudget: 64,
  })

  const history = [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'system', content: '[ADDOM Continuity Packet]\n## decisions\n- Keep deterministic ordering.' },
  ]
  const withMarker = upsertCompactionVicinityMarkerMessage(history, marker)
  const withMarkerTwice = upsertCompactionVicinityMarkerMessage(withMarker, marker)
  const markerRows = withMarkerTwice.filter((row) => String(row?.content || '').includes(COMPACTION_VICINITY_MARKER_HEADER))

  assert.match(marker, /\[ADDOM Compaction Marker\]/)
  assert.match(marker, /phase=imminent/)
  assert.ok(estimateTextTokens(marker) <= 96)
  assert.equal(markerRows.length, 1)
})

test('applyContinuityCompaction removes stale vicinity marker once compaction is applied', async () => {
  const history = [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'system', content: `${COMPACTION_VICINITY_MARKER_HEADER}\nold imminent marker` },
  ]
  const filler = 'x'.repeat(9000)
  for (let i = 0; i < 24; i += 1) {
    history.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `${i}: ${filler}` })
  }

  const result = await applyContinuityCompaction({
    history,
    modelLimit: 32_000,
    packetText: '[ADDOM Continuity Packet]\n## decisions\n- Keep deterministic ordering.',
    providerId: 'openai',
    turnId: 'turn_compaction_2',
  })

  const markerCount = result.history.filter((row) => String(row?.content || '').includes(COMPACTION_VICINITY_MARKER_HEADER)).length
  const handoffCount = result.history.filter((row) => String(row?.content || '').includes(COMPACTION_HANDOFF_HEADER)).length

  assert.equal(result.compacted, true)
  assert.equal(markerCount, 0)
  assert.equal(handoffCount, 1)
})

test('applyContinuityCompaction preserves deterministic packet->handoff ordering with stale marker/handoff inputs', async () => {
  const history = [
    { role: 'system', content: 'You are ADDOM.' },
    { role: 'system', content: '[ADDOM Continuity Packet]\n## decisions\n- stale packet' },
    { role: 'system', content: `${COMPACTION_VICINITY_MARKER_HEADER}\nold imminent marker` },
    { role: 'system', content: `${COMPACTION_HANDOFF_HEADER}\nold handoff` },
  ]
  const filler = 'x'.repeat(9000)
  for (let i = 0; i < 24; i += 1) {
    history.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `${i}: ${filler}` })
  }

  const result = await applyContinuityCompaction({
    history,
    modelLimit: 32_000,
    packetText: '[ADDOM Continuity Packet]\n## decisions\n- fresh packet',
    providerId: 'openai',
    turnId: 'turn_compaction_3',
  })

  const packetRows = result.history.filter((row) => String(row?.content || '').includes('[ADDOM Continuity Packet]'))
  const handoffRows = result.history.filter((row) => String(row?.content || '').includes(COMPACTION_HANDOFF_HEADER))
  const markerRows = result.history.filter((row) => String(row?.content || '').includes(COMPACTION_VICINITY_MARKER_HEADER))
  const packetIndex = result.history.findIndex((row) => String(row?.content || '').includes('[ADDOM Continuity Packet]'))
  const handoffIndex = result.history.findIndex((row) => String(row?.content || '').includes(COMPACTION_HANDOFF_HEADER))

  assert.equal(result.compacted, true)
  assert.equal(packetRows.length, 1)
  assert.equal(handoffRows.length, 1)
  assert.equal(markerRows.length, 0)
  assert.ok(packetIndex >= 0)
  assert.ok(handoffIndex > packetIndex)
  assert.match(String(packetRows[0]?.content || ''), /fresh packet/)
})

test('applyContinuityCompaction does not reconstruct plan authority from legacy snapshot prose', async () => {
  const history = [
    { role: 'system', content: 'You are ADDOM.' },
    {
      role: 'user',
      content: [
        '[Plan State Snapshot]',
        'Completed request ids: c1, c2',
        'Pending request ids: p1, p2',
      ].join('\n'),
    },
  ]
  const filler = 'x'.repeat(10_000)
  for (let i = 0; i < 24; i += 1) {
    history.push({
      role: 'assistant',
      content: `message_${i}: ${filler}`,
    })
  }

  const result = await applyContinuityCompaction({
    history,
    modelLimit: 3_200,
    packetText: '[ADDOM Continuity Packet]\n## decisions\n- Preserve plan-state carry-forward.',
    providerId: 'openai',
    turnId: 'turn_compaction_plan_state_1',
  })

  const handoffRow = result.history.find((row) => String(row?.content || '').includes(COMPACTION_HANDOFF_HEADER))
  const handoffText = String(handoffRow?.content || '')

  assert.equal(result.compacted, true)
  assert.ok(handoffRow)
  assert.doesNotMatch(handoffText, /plan_mode:/)
  assert.doesNotMatch(handoffText, /plan_summary:/)
  assert.doesNotMatch(handoffText, /plan_questions_open:/)
  assert.doesNotMatch(handoffText, /plan_steps:/)
})

test('buildCompactionHandoffPayload ignores obsolete renderer plan state', () => {
  const payload = buildCompactionHandoffPayload({
    compactionEvent: {
      occurred: true,
      type: 'provider_truncation',
      phase: 'resumed_after',
      providerId: 'openai',
      source: 'provider',
      confidence: 'explicit',
    },
    historyBeforeCompaction: [{
      role: 'user',
      content: [
        '[Plan State Snapshot]',
        'Completed request ids: stale_c1',
        'Pending request ids: stale_p1',
      ].join('\n'),
    }],
    planState: {
      mode: 'execute_from_plan',
      summary: 'Preserve OpenAI first.',
      decisions: ['msg_plan: opt_a'],
      questionsResolved: ['q_scope: keep OpenAI'],
      questionsOpen: ['question:q_followup', 'request:msg_plan:req_1'],
      steps: [{
        id: 'msg_plan:req_1',
        text: 'Inspect compaction modules',
        status: 'pending',
      }],
      immediateNextStep: 'Inspect compaction modules',
      canonicalPlan: {
        messageId: 'msg_plan',
        summary: 'Preserve OpenAI first.',
        selectedOptionId: 'opt_a',
        customDirection: '',
        questions: [
          {
            id: 'q_scope',
            text: 'What provider should lead?',
            choices: ['keep OpenAI', 'stay provider agnostic'],
            answer: 'keep OpenAI',
          },
          {
            id: 'q_followup',
            text: 'Do we need Anthropic parity now?',
            choices: ['yes', 'not yet'],
          },
        ],
        options: [{
          id: 'opt_a',
          title: 'OpenAI first',
          description: 'Start with OpenAI continuity surfaces.',
          recommended: true,
          selected: true,
        }],
        requests: [{
          id: 'req_1',
          type: 'artifact_review',
          reason: 'Inspect compaction modules',
          trackedRequestId: 'msg_plan:req_1',
          status: 'pending',
          traceSummary: 'Inspect compaction modules',
          filePaths: ['src/main/chat/chat-stream-precall-round.mjs'],
        }],
      },
    },
  })

  assert.equal(Object.hasOwn(payload, 'planState'), false)
})

test('buildCompactionHandoffPayload includes bounded tool context fact summaries when provided', () => {
  const payload = buildCompactionHandoffPayload({
    compactionEvent: {
      occurred: true,
      type: 'local_summary',
      phase: 'resumed_after',
      providerId: 'openai',
      source: 'local',
      confidence: 'explicit',
    },
    historyBeforeCompaction: [
      { role: 'user', content: 'Keep schema work moving.' },
    ],
    toolContextFacts: [
      {
        kind: 'file_read',
        toolName: 'read_file',
        filePath: 'src/schema.sql',
        contentHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      },
      {
        kind: 'failure_class',
        toolName: 'apply_patch',
        failureClass: 'MALFORMED_PATCH_SYNTAX',
      },
    ],
  })

  assert.deepEqual(payload.workState.toolContextFacts, [
    'failure apply_patch (MALFORMED_PATCH_SYNTAX)',
    'read src/schema.sql @ 0123456789ab',
  ])
})

test('renderCompactionHandoffPrompt ignores obsolete renderer plan detail', () => {
  const prompt = renderCompactionHandoffPrompt({
    compactionEvent: {
      occurred: true,
      type: 'provider_truncation',
      phase: 'resumed_after',
      providerId: 'openai',
      source: 'provider',
      confidence: 'explicit',
    },
    planState: {
      mode: 'execute_from_plan',
      summary: 'Preserve OpenAI first.',
      immediateNextStep: 'Inspect compaction modules',
      canonicalPlan: {
        messageId: 'msg_plan',
        summary: 'Preserve OpenAI first.',
        selectedOptionId: 'opt_a',
        questions: [{
          id: 'q_scope',
          text: 'What provider should lead?',
          choices: ['keep OpenAI', 'stay provider agnostic'],
          answer: 'keep OpenAI',
        }],
        options: [{
          id: 'opt_a',
          title: 'OpenAI first',
          description: 'Start with OpenAI continuity surfaces.',
          recommended: true,
          selected: true,
        }],
        requests: [{
          id: 'req_1',
          type: 'artifact_review',
          reason: 'Inspect compaction modules',
          status: 'pending',
          trackedRequestId: 'msg_plan:req_1',
          traceSummary: 'Inspect compaction modules',
        }],
      },
    },
  }, { tokenBudget: 260 })

  assert.doesNotMatch(prompt, /plan_message_id:/)
  assert.doesNotMatch(prompt, /plan_selected_option:/)
  assert.doesNotMatch(prompt, /plan_questions:/)
  assert.doesNotMatch(prompt, /plan_options:/)
  assert.doesNotMatch(prompt, /plan_requests:/)
})

test('renderCompactionHandoffPrompt emits tool context fact section when present', () => {
  const prompt = renderCompactionHandoffPrompt({
    compactionEvent: {
      occurred: true,
      type: 'local_summary',
      phase: 'resumed_after',
      providerId: 'openai',
      source: 'local',
      confidence: 'explicit',
    },
    workState: {
      objective: 'Keep schema work moving.',
      toolContextFacts: [
        'failure apply_patch (MALFORMED_PATCH_SYNTAX)',
        'read src/schema.sql @ 0123456789ab',
      ],
    },
  })

  assert.match(prompt, /tool_context_facts:/)
  assert.match(prompt, /- failure apply_patch \(MALFORMED_PATCH_SYNTAX\)/)
  assert.match(prompt, /- read src\/schema\.sql @ 0123456789ab/)
})
