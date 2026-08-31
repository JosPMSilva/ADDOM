import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { shouldRenderExecutionTurn } from '../../src/renderer/components/chat/turn-shell-execution.mjs'
import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

test('shouldRenderExecutionTurn hides empty completed turns', () => {
  assert.equal(shouldRenderExecutionTurn(null), false)
  assert.equal(shouldRenderExecutionTurn({ status: 'done', eventOrder: [] }), false)
  assert.equal(shouldRenderExecutionTurn({ status: 'done', eventOrder: ['a'] }), true)
  assert.equal(shouldRenderExecutionTurn({ status: 'done', itemOrder: ['a'] }), true)
  assert.equal(shouldRenderExecutionTurn({ status: 'active', eventOrder: [] }, { isLiveTurn: true }), true)
  assert.equal(
    shouldRenderExecutionTurn({ status: 'interrupted', eventOrder: [] }, { canContinueInterrupted: true }),
    true,
  )
  assert.equal(
    shouldRenderExecutionTurn({ status: 'interrupted', eventOrder: [] }, { canContinueInterrupted: false }),
    false,
  )
})

test('TurnShell renders execution → answer → files and skips empty execution slots', async () => {
  const mod = await ssrLoadRendererModule('/components/chat/TurnShell.jsx')
  const TurnShell = mod?.default
  assert.equal(typeof TurnShell, 'function')

  const withEmptyExecution = renderToStaticMarkup(React.createElement(TurnShell, {
    turnId: 't1',
    executionTurn: { turnId: 't1', status: 'done', eventOrder: [], eventsById: {} },
    fileRows: [{ fileChange: { filePath: 'a.js', addedLines: 1, removedLines: 0 } }],
  }, React.createElement('p', null, 'Answer text')))

  assert.match(withEmptyExecution, /data-turn-shell="true"/)
  assert.doesNotMatch(withEmptyExecution, /data-turn-shell-slot="execution"/)
  assert.match(withEmptyExecution, /data-turn-shell-slot="answer"/)
  assert.match(withEmptyExecution, /data-turn-shell-slot="files"/)
  assert.ok(
    withEmptyExecution.indexOf('data-turn-shell-slot="answer"')
      < withEmptyExecution.indexOf('data-turn-shell-slot="files"'),
  )

  const withExecution = renderToStaticMarkup(React.createElement(TurnShell, {
    turnId: 't2',
    executionTurn: {
      turnId: 't2',
      status: 'done',
      eventOrder: ['e1'],
      eventsById: {
        e1: { id: 'e1', kind: 'reasoning', status: 'done', detail: 'Thinking about it.' },
      },
    },
    fileRows: [{ fileChange: { filePath: 'b.js', addedLines: 2, removedLines: 0 } }],
  }, React.createElement('p', null, 'Final answer')))

  assert.match(withExecution, /data-turn-shell-slot="execution"/)
  assert.match(withExecution, /data-turn-shell-slot="answer"/)
  assert.match(withExecution, /data-turn-shell-slot="files"/)
  assert.ok(
    withExecution.indexOf('data-turn-shell-slot="execution"')
      < withExecution.indexOf('data-turn-shell-slot="answer"'),
  )
  assert.ok(
    withExecution.indexOf('data-turn-shell-slot="answer"')
      < withExecution.indexOf('data-turn-shell-slot="files"'),
  )
  assert.match(withExecution, /data-ui="turn-shell-files-hint"/)
  assert.match(withExecution, /1 file/)

  await closeViteSsrLoader()
})
