import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let QuestionUserCard = null
let shouldSubmitQuestionAnswer = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/QuestionUserCard.jsx')
  QuestionUserCard = mod?.default || null
  shouldSubmitQuestionAnswer = mod?.shouldSubmitQuestionAnswer || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('QuestionUserCard calm chrome: no badge cluster, quiet options, ink well, Send + enter chip', () => {
  assert.equal(typeof QuestionUserCard, 'function')

  const html = renderToStaticMarkup(React.createElement(QuestionUserCard, {
    request: {
      header: 'Pick a package manager',
      question: 'Which package manager should I use for this install?',
      options: [
        { id: 'npm', label: 'npm', description: 'Matches the lockfile.', recommended: true },
        { id: 'pnpm', label: 'pnpm', description: 'Needs a new lockfile.' },
      ],
    },
  }))

  assert.match(html, /data-ui="chat-question-user-card"/)
  assert.match(html, /data-tone="warning"/)
  assert.match(html, /Pick a package manager/)
  assert.match(html, /Which package manager/)

  assert.doesNotMatch(html, /Clarification Needed/)
  assert.doesNotMatch(html, /Waiting On You/)
  assert.doesNotMatch(html, /border-success-border bg-success-bg/)
  assert.doesNotMatch(html, /Send a quick answer here/)

  assert.match(html, /Recommended/)
  assert.match(html, /data-ui="chat-question-user-option"/)
  assert.match(html, /data-ui="chat-question-user-answer"/)
  assert.match(html, /data-ui="chat-question-user-submit"/)
  assert.match(html, /data-ui="approval-shortcut-enter"/)
  assert.match(html, /Send(?! Answer)/)
  assert.match(html, /bg-surface-panel-muted-strong/)
  // Short header stays compact; body/options use regular 12px weight.
  assert.match(html, /text-xs font-medium leading-tight text-text-primary/)
  assert.match(html, /text-xs font-normal leading-5 text-text-secondary/)
  assert.match(html, /text-xs font-normal text-text-primary/)
})

test('QuestionUserCard question-only prompt uses body weight, not a bold display title', () => {
  const html = renderToStaticMarkup(React.createElement(QuestionUserCard, {
    request: {
      question: 'Posso criar um ficheiro de boas-vindas?',
      options: [
        { id: 'yes', label: 'Sim, cria' },
        { id: 'no', label: 'Não, outro nome' },
      ],
    },
  }))

  assert.match(html, /Posso criar um ficheiro/)
  assert.doesNotMatch(html, /<h2/)
  assert.doesNotMatch(html, /font-semibold/)
  assert.match(html, /text-xs font-normal leading-5 text-text-primary/)
  assert.match(html, /Sim, cria/)
})

test('QuestionUserCard does not submit Enter while an IME composition is active', () => {
  assert.equal(typeof shouldSubmitQuestionAnswer, 'function')
  assert.equal(shouldSubmitQuestionAnswer({ key: 'Enter', isComposing: true }), false)
  assert.equal(shouldSubmitQuestionAnswer({ key: 'Enter', nativeEvent: { isComposing: true } }), false)
  assert.equal(shouldSubmitQuestionAnswer({ key: 'Enter', keyCode: 229 }), false)
  assert.equal(shouldSubmitQuestionAnswer({ key: 'Enter' }), true)
  assert.equal(shouldSubmitQuestionAnswer({ key: 'Enter', shiftKey: true }), false)
})
