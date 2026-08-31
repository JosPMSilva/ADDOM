import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let BackgroundJobsModal = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/BackgroundJobsModal.jsx')
  BackgroundJobsModal = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('background jobs modal renders OpenAI and command rows with normalized status labels', () => {
  assert.equal(typeof BackgroundJobsModal, 'function')

  const html = renderToStaticMarkup(React.createElement(BackgroundJobsModal, {
    jobs: [
      {
        id: 'oaibg-1',
        kind: 'openai_response',
        status: 'cancel_requested',
        model: 'gpt-5.2',
        threadId: 'thread_a',
        responseId: 'resp_123',
        promptPreview: 'Refactor auth middleware',
        startedAt: 1,
      },
      {
        id: 'cmd-1',
        kind: 'command',
        command: 'npm run build',
        cwd: 'C:/repo',
        shell: 'pwsh',
        pid: 1234,
        startedAt: 1,
      },
    ],
    loading: false,
    error: '',
    lastUpdated: 1,
    busyId: '',
    onRefresh: () => {},
    onStopJob: () => {},
    onStopAll: () => {},
    onClose: () => {},
  }))

  assert.match(html, /Background Jobs/)
  assert.match(html, /Task/)
  assert.match(html, /status: Cancel requested/)
  assert.match(html, /gpt-5\.2/)
  assert.match(html, /thread: thread_a/)
  assert.match(html, /response: resp_123/)
  assert.match(html, /npm run build/)
  assert.match(html, /cwd: C:\/repo/)
})
