import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { REASONING_PHASE_BOUNDARY } from '../../src/common/chat/reasoning-phase-boundary.mjs'
import { mergeReasoningChunks } from '../../src/renderer/store/chat/live-execution-store-reasoning.mjs'
import { normalizeReasoningPreview } from '../../src/renderer/components/chat/live-execution-reasoning-render.mjs'
import { reduceCanonicalExecutionEvent } from '../../src/renderer/store/chat/live-execution-canonical-reducer.mjs'
import { buildExecutionStreamItems } from '../../src/renderer/components/chat/live-execution-stream-items.mjs'
import { resolveExecutionCapabilityProfile } from '../../src/common/chat/execution-capabilities.mjs'
import { mapTimelineFromPersistedEvents } from '../../src/renderer/store/chat/timeline-hydration.mjs'

test('mergeReasoningChunks inserts paragraph breaks at phase boundaries within a phase', () => {
  const merged = mergeReasoningChunks([
    'Adding scientific functions',
    ' to upgrade the calculator.',
    REASONING_PHASE_BOUNDARY,
    'Reviewing the existing calculator code',
    ' and design documents.',
  ])
  assert.match(merged, /Adding scientific functions to upgrade the calculator\.\n\nReviewing the existing calculator code/)
  assert.doesNotMatch(merged, /calculator\.Reviewing/)
})

test('mergeReasoningChunks soft-joins mid-clause phase boundaries with a space', () => {
  const merged = mergeReasoningChunks([
    'Fixing messy logic in',
    REASONING_PHASE_BOUNDARY,
    'Running tests and verifying results.',
  ])
  assert.equal(merged, 'Fixing messy logic in Running tests and verifying results.')
  assert.doesNotMatch(merged, /inRunning/)
  assert.doesNotMatch(merged, /\n\n/)
})

test('mergeReasoningChunks keeps space-only joins inside the same thinking phase', () => {
  const merged = mergeReasoningChunks(['Checking', ' the command'])
  assert.equal(merged, 'Checking the command')
})

test('mergeReasoningChunks preserves exact Unicode provider deltas without inferred spaces', () => {
  const chunks = [
    'A',
    ' especific',
    'ação',
    ' está',
    ' alinh',
    'ada',
    ' com',
    ' a',
    ' dire',
    'cção',
    ' apro',
    'vada',
    ':',
    ' português',
    ',',
    ' re',
    'posit',
    'ório',
    '.',
  ]

  assert.equal(
    mergeReasoningChunks(chunks),
    'A especificação está alinhada com a direcção aprovada: português, repositório.',
  )
})

test('mergeReasoningChunks round-trips arbitrary Unicode chunk boundaries', () => {
  const samples = [
    'Português: implementação, delegação e repositório.',
    'Français : spécification, vérification et déjà vu.',
    'Deutsch: Ausführung und Überprüfung.',
    'Українська: перевірка виконання.',
    'العربية: مراجعة التنفيذ بعناية.',
    '日本語の実装確認と中文验证。',
    'Combining: Cafe\u0301; emoji: 👩🏽‍💻; path: docs/設計.md.',
  ]

  for (const sample of samples) {
    for (let width = 1; width <= 7; width += 1) {
      const chunks = []
      for (let index = 0; index < sample.length; index += width) {
        chunks.push(sample.slice(index, index + width))
      }
      assert.equal(
        mergeReasoningChunks(chunks),
        sample,
        `width ${width} changed ${JSON.stringify(sample)}`,
      )
      assert.equal(
        normalizeReasoningPreview(mergeReasoningChunks(chunks)),
        sample,
        `visible reasoning changed ${JSON.stringify(sample)} at width ${width}`,
      )
    }
  }
})

test('normalizeReasoningPreview preserves intentional paragraph breaks', () => {
  const input = 'Phase one ends here.\n\n- concrete step one\n- concrete step two'
  const normalized = normalizeReasoningPreview(input)
  assert.match(normalized, /Phase one ends here\.\n\n- concrete step one/)
})

test('normalizeReasoningPreview preserves provider paragraph boundaries', () => {
  const normalized = normalizeReasoningPreview('Fixing messy logic in\n\nRunning tests and\n\n')
  assert.equal(normalized, 'Fixing messy logic in\n\nRunning tests and')

  // Explicit complete prose paragraphs remain separate Markdown blocks.
  const complete = normalizeReasoningPreview(
    'Existing Python tools and calculator.py. style.\n\nEvaluating PDF/A validation options.',
  )
  assert.match(complete, /style\.\n\nEvaluating/)
})

test('sealed incomplete thinking stubs remain visible in stream items', () => {
  const items = buildExecutionStreamItems({
    status: 'done',
    itemOrder: [
      'tool:edit-1',
      'reasoning:execution_reasoning:turn-1:8',
      'tool:read-1',
    ],
    sessionsById: {
      'edit-1': {
        id: 'edit-1',
        toolKind: 'file_edit',
        state: 'succeeded',
        inputDetail: 'test_pdfa_checker.py',
        detail: '',
      },
      'read-1': {
        id: 'read-1',
        toolKind: 'file_read',
        state: 'succeeded',
        inputDetail: 'pdfa_checker.py',
        detail: '',
      },
    },
    reasoningById: {
      'execution_reasoning:turn-1:8': {
        id: 'execution_reasoning:turn-1:8',
        role: 'commentary',
        state: 'done',
        detail: 'Fixing messy logic in\n\nRunning tests and\n\n',
      },
    },
  }, { reasoning: true, commentary: true, tools: true }, { collapseSettled: false })

  assert.deepEqual(items.map((item) => item.kind), ['tool', 'commentary', 'tool'])
  const commentary = items.find((item) => item.kind === 'commentary')
  assert.match(commentary?.label || '', /Fixing messy logic in\n\nRunning tests and/)
  assert.doesNotMatch(commentary?.label || '', /inRunning/)
  assert.match(items[0].label, /Edited test_pdfa_checker\.py/)
  assert.match(items[2].label, /Read pdfa_checker\.py/)
})

test('live in-progress incomplete titles remain visible until sealed', () => {
  const items = buildExecutionStreamItems({
    status: 'active',
    itemOrder: ['reasoning:execution_reasoning:turn-1'],
    sessionsById: {},
    reasoningById: {
      'execution_reasoning:turn-1': {
        id: 'execution_reasoning:turn-1',
        role: 'commentary',
        detail: 'Fixing messy logic in',
      },
    },
  }, { reasoning: true, commentary: true, tools: true }, { collapseSettled: false })

  assert.equal(items.length, 1)
  assert.equal(items[0].kind, 'commentary')
  assert.match(items[0].label, /Fixing messy logic in/)
})

test('canonical reducer merges phased reasoning chunks into one commentary row with paragraph gaps', () => {
  const messageId = 'execution_reasoning:turn-calc'
  let state = { turnsById: {}, turnOrder: [] }
  const events = [
    {
      kind: 'reasoning_chunk',
      turnId: 'turn-calc',
      threadId: 'thread-1',
      messageId,
      reasoningRole: 'commentary',
      detail: 'Adding scientific functions to upgrade the calculator.',
      emittedAt: 100,
      providerId: 'cursor',
    },
    {
      kind: 'reasoning_chunk',
      turnId: 'turn-calc',
      threadId: 'thread-1',
      messageId,
      reasoningRole: 'commentary',
      detail: REASONING_PHASE_BOUNDARY,
      emittedAt: 110,
      providerId: 'cursor',
    },
    {
      kind: 'reasoning_chunk',
      turnId: 'turn-calc',
      threadId: 'thread-1',
      messageId,
      reasoningRole: 'commentary',
      detail: 'Reviewing the existing calculator code.',
      emittedAt: 120,
      providerId: 'cursor',
    },
  ]
  for (const event of events) {
    state = reduceCanonicalExecutionEvent(state, event)
  }

  const reasoning = state.turnsById['turn-calc'].reasoningById[messageId]
  assert.match(String(reasoning?.detail || ''), /calculator\.\n\nReviewing/)
})

test('cursor hydration without assistantMessageId keeps thinking visible after reload', () => {
  const mapped = mapTimelineFromPersistedEvents([{
    eventId: 1,
    kind: 'execution_reasoning_chunk',
    turnId: 'turn-cursor',
    content: 'Checking the existing calculator implementation.',
    createdAt: 100,
    meta: {
      threadId: 'thread-1',
      turnId: 'turn-cursor',
      providerId: 'cursor',
      emittedAt: 100,
    },
  }, {
    eventId: 2,
    kind: 'execution_reasoning_chunk',
    turnId: 'turn-cursor',
    content: REASONING_PHASE_BOUNDARY,
    createdAt: 110,
    meta: {
      threadId: 'thread-1',
      turnId: 'turn-cursor',
      providerId: 'cursor',
      emittedAt: 110,
    },
  }, {
    eventId: 3,
    kind: 'execution_reasoning_chunk',
    turnId: 'turn-cursor',
    content: 'Reviewing the existing calculator code.',
    createdAt: 120,
    meta: {
      threadId: 'thread-1',
      turnId: 'turn-cursor',
      providerId: 'cursor',
      emittedAt: 120,
    },
  }])

  const turn = mapped.liveExecution.turnsById['turn-cursor']
  const profile = resolveExecutionCapabilityProfile({ family: 'cursor' })
  const items = buildExecutionStreamItems(turn, profile)
  assert.equal(items.some((item) => item.kind === 'reasoning' && item.label.includes('Checking the existing calculator')), true)
  assert.match(
    turn.reasoningById['execution_reasoning:turn-cursor']?.detail || '',
    /calculator implementation\.\n\nReviewing/,
  )
})

test('cursor capability profile still hides execution commentary rows', () => {
  const profile = resolveExecutionCapabilityProfile({ family: 'cursor' })
  const turn = {
    status: 'done',
    itemOrder: ['reasoning:execution_commentary:turn-1'],
    reasoningById: {
      'execution_commentary:turn-1': {
        id: 'execution_commentary:turn-1',
        role: 'commentary',
        detail: 'Final answer duplicate',
      },
    },
    sessionsById: {},
  }
  const items = buildExecutionStreamItems(turn, profile)
  assert.equal(items.length, 0)
})

test('normalizeReasoningPreview escapes quoted markdown emphasis markers', () => {
  const normalized = normalizeReasoningPreview(
    'The x² button will append "**2", xʸ will append "**", and the √ button will append "sqrt(".',
  )
  assert.match(normalized, /append "\\\*\\\*2"/)
  assert.match(normalized, /append "\\\*\\\*"/)
})

test('execution reasoning prose uses muted secondary tone', () => {
  const assistant = fs.readFileSync('src/renderer/components/chat/AssistantRichContent.jsx', 'utf8')
  const prose = fs.readFileSync('src/renderer/styles/chat-prose.css', 'utf8')
  const renderer = fs.readFileSync('src/renderer/components/chat/chat-rich-content-renderer.jsx', 'utf8')

  assert.match(assistant, /'exec-reasoning': 'chat-typo-exec-reasoning-prose'/)
  assert.match(assistant, /'exec-reasoning': 'text-text-secondary'/)
  assert.match(assistant, /PLAIN_PROSE_CLASSNAME_BY_ROLE[\s\S]*'exec-reasoning': 'whitespace-pre-wrap break-words text-text-secondary'/)
  assert.match(prose, /\.prose-chat\.chat-typo-exec-reasoning-prose strong[\s\S]*--color-text-secondary/)
  assert.doesNotMatch(prose, /\.prose-chat strong \{/)
  assert.match(renderer, /'execution-stream':[\s\S]*strongClassName: 'font-semibold',/)
})

test('execution reasoning prose applies nested paragraph spacing in chat-prose.css', () => {
  const prose = fs.readFileSync('src/renderer/styles/chat-prose.css', 'utf8')
  assert.match(prose, /\.prose-chat\.chat-typo-content-prose p \+ p[\s\S]*--chat-prose-block-gap/)
})
