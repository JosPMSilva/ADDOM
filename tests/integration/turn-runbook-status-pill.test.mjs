import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let TurnRunbook = null
let useChatStore = null

before(async () => {
  const runbookMod = await ssrLoadRendererModule('/components/chat/TurnRunbook.jsx')
  TurnRunbook = runbookMod?.default || null

  const storeMod = await ssrLoadRendererModule('/store/useChatStore.js')
  useChatStore = storeMod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

function renderRunbook(activities = [], options = {}) {
  if (useChatStore && typeof useChatStore.setState === 'function') {
    const baseState = typeof useChatStore.getInitialState === 'function'
      ? useChatStore.getInitialState()
      : useChatStore.getState()
    useChatStore.setState({
      ...baseState,
      ...(options.storeState && typeof options.storeState === 'object' ? options.storeState : {}),
    }, true)
  }
  return renderToStaticMarkup(React.createElement(TurnRunbook, {
    turnId: 'turn-test',
    activities,
    initialExpanded: options.initialExpanded === true,
  }))
}

test('turn runbook does not mark continuity non-fatal events as finished-with-errors', () => {
  assert.equal(typeof TurnRunbook, 'function')
  const html = renderRunbook([
    {
      id: 't1',
      type: 'turn',
      turnState: 'completed',
      createdAt: 1,
    },
    {
      id: 't2',
      type: 'result',
      isError: true,
      decision: 'approved',
      eventKind: 'continuity_invariant_violated',
      label: 'Continuity invariant violated',
      createdAt: 2,
    },
  ])

  assert.doesNotMatch(html, /finished with errors/i)
  assert.match(html, /finished/i)
})

test('turn runbook still marks true tool failures as finished-with-errors', () => {
  const html = renderRunbook([
    {
      id: 't10',
      type: 'turn',
      turnState: 'completed',
      turnStatus: 'error',
      createdAt: 1,
    },
    {
      id: 't11',
      type: 'result',
      isError: true,
      decision: 'approved',
      eventKind: 'tool_result',
      toolName: 'run_command',
      label: 'Command failed',
      createdAt: 2,
    },
  ])

  assert.match(html, /finished with errors/i)
})

test('turn runbook keeps completed error turns with recorded file changes as finished-with-errors', () => {
  const html = renderRunbook([
    {
      id: 'tp1',
      type: 'turn',
      turnState: 'completed',
      turnStatus: 'error',
      createdAt: 1,
    },
    {
      id: 'tp2',
      type: 'file_change',
      eventKind: 'file_change',
      fileChange: {
        filePath: 'src/app.js',
        changeType: 'modified',
        addedLines: 3,
        removedLines: 1,
      },
      createdAt: 2,
    },
  ])

  assert.match(html, /finished with errors/i)
  assert.doesNotMatch(html, /finished with warnings/i)
})

test('turn runbook keeps the terminal error authoritative after a timed-out approval denial', () => {
  const html = renderRunbook([
    {
      id: 'ta1',
      type: 'turn',
      turnState: 'completed',
      turnStatus: 'error',
      createdAt: 1,
    },
    {
      id: 'ta2',
      type: 'result',
      isError: true,
      decision: 'denied',
      denyReason: 'timeout',
      eventKind: 'approval_timeout',
      label: 'Approval expired for run_command (timeout).',
      createdAt: 2,
    },
  ])

  assert.match(html, /finished with errors/i)
  assert.doesNotMatch(html, /finished with warnings/i)
})

test('turn runbook dismisses recovered tool failures after terminal success', () => {
  const html = renderRunbook([
    {
      id: 't20',
      type: 'turn',
      turnState: 'completed',
      turnStatus: 'ok',
      createdAt: 1,
    },
    {
      id: 't21',
      type: 'result',
      isError: true,
      decision: 'approved',
      eventKind: 'tool_result',
      toolName: 'fetch_page',
      label: 'Fetch failed',
      createdAt: 2,
    },
  ])

  assert.match(html, />finished</i)
  assert.doesNotMatch(html, /finished with warnings/i)
  assert.doesNotMatch(html, /finished with errors/i)
})

test('turn runbook keeps verbose operational rows that the execution stream hides', () => {
  const html = renderRunbook([
    {
      id: 'r1',
      type: 'turn',
      turnState: 'completed',
      createdAt: 1,
    },
    {
      id: 'r2',
      type: 'info',
      eventKind: 'chat_cost_estimate',
      label: 'Turn cost estimate: $0.4001 (31515 tokens)',
      createdAt: 2,
    },
    {
      id: 'r3',
      type: 'usage',
      eventKind: 'chat_usage',
      label: 'Context usage: 9251 tokens this step',
      createdAt: 3,
    },
    {
      id: 'r4',
      type: 'info',
      eventKind: 'continuity_packet_built',
      label: 'Continuity packet built (balanced)',
      createdAt: 4,
    },
    {
      id: 'r5',
      type: 'provider_tool',
      eventKind: 'provider_tool_status',
      label: 'Provider tool input: tool',
      createdAt: 5,
    },
  ], { initialExpanded: true })

  assert.match(html, /Turn cost estimate: \$0\.4001/)
  assert.match(html, /Context usage: 9251 tokens this step/)
  assert.match(html, /Continuity packet built \(balanced\)/)
  assert.match(html, /Provider tool input: tool/)
})

test('turn runbook hides api-key-oriented diagnostics for openai account turns', () => {
  const html = renderRunbook([
    {
      id: 'a1',
      type: 'turn',
      turnState: 'completed',
      threadId: 'thread_account',
      createdAt: 1,
    },
    {
      id: 'a2',
      type: 'info',
      eventKind: 'chat_cost_estimate',
      authMethod: 'account',
      label: 'Turn cost estimate: $0.3968 (29624 tokens)',
      threadId: 'thread_account',
      createdAt: 2,
    },
    {
      id: 'a3',
      type: 'info',
      eventKind: 'continuity_packet_built',
      authMethod: 'account',
      label: 'Continuity packet built (balanced)',
      threadId: 'thread_account',
      createdAt: 3,
    },
    {
      id: 'a4',
      type: 'info',
      eventKind: 'openai_continuity_status',
      authMethod: 'account',
      label: 'OpenAI response tracked: resp_123',
      threadId: 'thread_account',
      createdAt: 4,
    },
    {
      id: 'a5',
      type: 'usage',
      eventKind: 'chat_usage',
      authMethod: 'account',
      providerUsageAvailable: false,
      totalTokens: 0,
      label: 'Context usage: 0 tokens this step',
      threadId: 'thread_account',
      createdAt: 5,
    },
  ], {
    initialExpanded: true,
    storeState: {
      activeThreadId: 'thread_account',
      contextUsage: {
        authMethod: 'account',
        providerUsageAvailable: false,
      },
    },
  })

  assert.doesNotMatch(html, /Turn cost estimate:/)
  assert.doesNotMatch(html, /Continuity packet built/)
  assert.doesNotMatch(html, /OpenAI response tracked:/)
  assert.doesNotMatch(html, /Context usage: 0 tokens this step/)
  assert.match(html, /actions 1/)
  assert.match(html, /usage 0/)
})

test('turn runbook keeps runtime diagnostics that the execution stream hides', () => {
  const html = renderRunbook([
    {
      id: 'd1',
      type: 'turn',
      turnState: 'completed',
      createdAt: 1,
    },
    {
      id: 'd2',
      type: 'warning',
      eventKind: 'runtime_diagnostics',
      label: 'Runtime diagnostics: model_no_tool_support',
      detail: 'provider_model: openrouter/vendor/model\nmodel_tool_support: false',
      createdAt: 2,
    },
  ], { initialExpanded: true })

  assert.match(html, /Runtime diagnostics: model_no_tool_support/)
  assert.match(html, /provider_model: openrouter\/vendor\/model/)
  assert.match(html, /model_tool_support: false/)
})

test('turn runbook renders sanitized adaptive budget notes for standard users', () => {
  const html = renderRunbook([
    {
      id: 'ab1',
      type: 'turn',
      turnState: 'completed',
      createdAt: 1,
    },
    {
      id: 'ab2',
      type: 'info',
      eventKind: 'runtime_diagnostics',
      label: 'Adaptive budget: strict for this turn',
      detail: [
        'source: learned provider budget',
        'reason: recent provider feedback suggests a smaller prompt budget.',
      ].join('\n'),
      createdAt: 2,
    },
  ], { initialExpanded: true })

  assert.match(html, /Adaptive budget: strict for this turn/)
  assert.match(html, /source: learned provider budget/)
  assert.match(html, /reason: recent provider feedback suggests a smaller prompt budget\./)
  assert.doesNotMatch(html, /sha256:/i)
  assert.doesNotMatch(html, /org_/i)
})

test('turn runbook keeps explicit openai auth parity mismatch diagnostics visible', () => {
  const html = renderRunbook([
    {
      id: 'p1',
      type: 'turn',
      turnState: 'completed',
      createdAt: 1,
    },
    {
      id: 'p2',
      type: 'warning',
      eventKind: 'runtime_diagnostics',
      label: 'Runtime diagnostics: openai_auth_surface_mismatch',
      detail: 'auth_method: account\nopenai_auth_parity_mismatches: shell(api=true,account=false,status=parity)',
      createdAt: 2,
    },
  ], { initialExpanded: true })

  assert.match(html, /Runtime diagnostics: openai_auth_surface_mismatch/)
  assert.match(html, /openai_auth_parity_mismatches: shell\(api=true,account=false,status=parity\)/)
})

test('turn runbook does not inherit streaming status from a different thread', () => {
  const html = renderRunbook([
    {
      id: 'x1',
      type: 'turn',
      turnState: 'started',
      threadId: 'thread_hidden',
      createdAt: 1,
    },
  ], {
    storeState: {
      activeThreadId: 'thread_visible',
      streamingId: 'assistant_visible',
      threadStateById: {
        thread_visible: { streamingId: 'assistant_visible' },
        thread_hidden: { streamingId: null },
      },
    },
  })

  assert.match(html, /finished/i)
  assert.doesNotMatch(html, /running/i)
})
