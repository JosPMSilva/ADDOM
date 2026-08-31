import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

test('child turns render through the root TurnShell execution and answer surfaces', async () => {
  const mod = await ssrLoadRendererModule('/components/agents/AgentConversationView.jsx')
  const AgentConversationTurn = mod?.AgentConversationTurn
  assert.equal(typeof AgentConversationTurn, 'function')

  const html = renderToStaticMarkup(React.createElement(AgentConversationTurn, {
    group: {
      turn: { id: 'agent_turn_01', status: 'running' },
      executionItems: [
        { id: 'reasoning_01', nodeSequence: 1, kind: 'agent_reasoning_delta', content: 'The first ' },
        { id: 'reasoning_02', nodeSequence: 2, kind: 'agent_reasoning_delta', content: 'word stays separated.' },
      ],
      messages: [
        { id: 'user_01', role: 'user', content: 'Inspect this.', contentParts: [{ kind: 'markdown', text: 'Inspect this.' }] },
        { id: 'assistant_01', role: 'assistant', content: '## Result\n\nReady.', status: 'streaming' },
      ],
    },
  }))

  assert.match(html, /data-turn-shell="true"/)
  assert.match(html, /data-turn-shell-slot="execution"/)
  assert.match(html, /data-live-execution-stream-root="true"/)
  assert.match(html, /data-turn-shell-slot="answer"/)
  assert.match(html, /The first word stays separated\./)
  assert.match(html, /<h2[^>]*>Result<\/h2>/)

  await closeViteSsrLoader()
})
