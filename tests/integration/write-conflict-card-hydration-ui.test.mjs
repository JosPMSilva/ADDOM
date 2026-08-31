import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const chatPanelSource = readFileSync(path.resolve(__dirname, '../../src/renderer/components/ChatPanel.jsx'), 'utf8')

let WriteConflictCard = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/WriteConflictCard.jsx')
  WriteConflictCard = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('ChatPanel renders unresolved writeConflicts through WriteConflictCard', () => {
  assert.match(chatPanelSource, /const writeConflicts = useChatStore\(\(s\) => s\.writeConflicts\)/)
  assert.match(chatPanelSource, /const unresolvedConflicts = useMemo\(/)
  assert.match(chatPanelSource, /filter\(\(c\) => !c\.resolved\)/)
  assert.match(chatPanelSource, /<WriteConflictCard/)
  assert.match(chatPanelSource, /conflict=\{conflict\}/)
})

test('WriteConflictCard renders hydrated conflict data', () => {
  assert.equal(typeof WriteConflictCard, 'function')

  const html = renderToStaticMarkup(
    React.createElement(WriteConflictCard, {
      conflict: {
        id: 'write_conflict:thread_ui|turn_ui|calculator.py|rev_new|rev_prev|rev_base|rev_actual',
        threadId: 'thread_ui',
        turnId: 'turn_ui',
        toolName: 'write_file',
        filePath: 'calculator.py',
        newRevId: 'rev_new',
        prevRevId: 'rev_prev',
        conflictBaseRevId: 'rev_base',
        conflictActualRevId: 'rev_actual',
        detectedAt: 5_025,
        resolved: false,
        mergeProposal: null,
      },
      projectFolder: '/tmp/project',
      providerId: 'openai',
      model: 'gpt-4o-mini',
      onResolve: () => {},
      onDismiss: () => {},
      onSetMergeProposal: () => {},
    }),
  )

  assert.match(html, /calculator\.py/)
  assert.match(html, /conflict/)
  assert.match(html, /AI Merge/)
})

test('WriteConflictCard renders stale-merge apply guidance without retry action', () => {
  assert.equal(typeof WriteConflictCard, 'function')

  const html = renderToStaticMarkup(
    React.createElement(WriteConflictCard, {
      conflict: {
        id: 'write_conflict:thread_ui|turn_ui|calculator.py|rev_new|rev_prev|rev_base|rev_actual',
        threadId: 'thread_ui',
        turnId: 'turn_ui',
        toolName: 'write_file',
        filePath: 'calculator.py',
        newRevId: 'rev_new',
        prevRevId: 'rev_prev',
        conflictBaseRevId: 'rev_base',
        conflictActualRevId: 'rev_actual',
        detectedAt: 5_025,
        resolved: false,
        mergeProposal: {
          status: 'error',
          content: 'merged output\n',
          explanation: 'Merged both sides.',
          error: 'This file changed again after the conflict was detected. Retry from the latest thread state.',
          errorKind: 'changed_since_conflict',
          generatedAt: 6_000,
        },
      },
      projectFolder: '/tmp/project',
      providerId: 'openai',
      model: 'gpt-4o-mini',
      onResolve: () => {},
      onDismiss: () => {},
      onSetMergeProposal: () => {},
    }),
  )

  assert.match(html, /Retry from the latest thread state\./)
  assert.doesNotMatch(html, /Retry Merge/)
  assert.doesNotMatch(html, /Try Apply Again/)
})
