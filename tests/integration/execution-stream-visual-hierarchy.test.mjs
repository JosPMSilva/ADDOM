import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let CanonicalExecutionStream = null
let EvidenceDetail = null
let rendererUseAppStore = null

before(async () => {
  const canonicalMod = await ssrLoadRendererModule('/components/chat/CanonicalExecutionStream.jsx')
  CanonicalExecutionStream = canonicalMod?.default || null
  const evidenceMod = await ssrLoadRendererModule('/components/chat/ExecutionEvidenceDisclosure.jsx')
  EvidenceDetail = evidenceMod?.EvidenceDetail || null
  const appStoreMod = await ssrLoadRendererModule('/store/useAppStore.js')
  rendererUseAppStore = appStoreMod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('canonical stream shades reasoning brighter than tool verb/identity', () => {
  assert.equal(typeof CanonicalExecutionStream, 'function')
  const html = renderToStaticMarkup(
    React.createElement(CanonicalExecutionStream, {
      items: [
        {
          id: 'reasoning:1',
          kind: 'reasoning',
          label: 'Planning the PDF/A checker.',
        },
        {
          id: 'tool:1',
          kind: 'tool',
          label: 'Edited pdfa_checker.py',
          verb: 'Edited',
          identity: 'pdfa_checker.py',
          statusMark: '✓',
          accessibleStatus: 'Succeeded',
          expandable: false,
          evidenceSections: [],
        },
        {
          id: 'tool:2',
          kind: 'tool',
          label: 'Read file',
          verb: 'Read file',
          identity: '',
          statusMark: '✓',
          accessibleStatus: 'Succeeded',
          expandable: false,
          evidenceSections: [],
        },
      ],
    }),
  )

  assert.match(html, /data-ui="execution-reasoning"/)
  assert.match(html, /text-text-secondary/)
  assert.match(html, /chat-typo-exec-row-verb[^"]*text-text-tertiary[^"]*">Edited</)
  assert.match(html, /chat-typo-exec-row-identity[^"]*text-text-subtle[^"]*">pdfa_checker\.py</)
  assert.match(html, /chat-typo-exec-row-verb[^"]*text-text-tertiary[^"]*">Read file</)
  assert.doesNotMatch(html, /execution-evidence-row[\s\S]*text-text-primary/)
})

test('settled canonical stream collapses reasoning into Reasoned briefly rows', () => {
  assert.equal(typeof CanonicalExecutionStream, 'function')
  const html = renderToStaticMarkup(
    React.createElement(CanonicalExecutionStream, {
      collapseReasoning: true,
      items: [
        {
          id: 'tool:1',
          kind: 'tool',
          label: 'Grepped pattern',
          verb: 'Grepped',
          identity: 'pattern',
          statusMark: '✓',
          accessibleStatus: 'Succeeded',
          expandable: false,
          evidenceSections: [],
        },
        {
          id: 'reasoning:1',
          kind: 'reasoning',
          label: 'All 12 tests pass. Preparing a concise summary of the improvements.',
        },
        {
          id: 'tool:2',
          kind: 'tool',
          label: 'Read file',
          verb: 'Read',
          identity: 'notes.md',
          statusMark: '✓',
          accessibleStatus: 'Succeeded',
          expandable: false,
          evidenceSections: [],
        },
      ],
    }),
  )

  assert.match(html, /data-thought-collapsed="true"/)
  assert.match(html, /chat-typo-exec-row-verb[^"]*">Reasoned</)
  assert.match(html, /chat-typo-exec-row-identity[^"]*">briefly</)
  assert.doesNotMatch(html, /Preparing a concise summary/)
  assert.doesNotMatch(html, /data-ui="execution-thought-detail"/)
})

test('live canonical stream keeps commentary expanded', () => {
  assert.equal(typeof CanonicalExecutionStream, 'function')
  const html = renderToStaticMarkup(
    React.createElement(CanonicalExecutionStream, {
      collapseReasoning: false,
      items: [
        {
          id: 'reasoning:live',
          kind: 'commentary',
          label: 'Planning the next edit.',
        },
      ],
    }),
  )

  assert.match(html, /Planning the next edit\./)
  assert.doesNotMatch(html, /data-thought-collapsed/)
})

test('evidence duration values use exec output body typography', () => {
  assert.equal(typeof EvidenceDetail, 'function')
  const html = renderToStaticMarkup(
    React.createElement(EvidenceDetail, {
      sections: [
        { key: 'result', label: 'Result', value: '{"ok":true}', mono: true },
        { key: 'duration', label: 'Duration', value: '53ms', mono: false },
      ],
    }),
  )

  assert.match(html, /data-ui="execution-evidence-detail"/)
  assert.match(html, /chat-typo-exec-row-label[^"]*text-text-tertiary[^"]*">Duration</)
  assert.match(html, /chat-typo-exec-output-body[^"]*text-text-secondary[^"]*">53ms</)
  assert.match(html, /<pre class="chat-typo-exec-output-body[^"]*font-mono[^"]*">/)
})

test('canonical file evidence makes only recognized filenames directly navigable', () => {
  assert.equal(typeof rendererUseAppStore?.getState, 'function')
  const previousProjectFolder = rendererUseAppStore.getState().projectFolder
  const previousProjectId = rendererUseAppStore.getState().activeProjectId

  try {
    rendererUseAppStore.setState({
      projectFolder: 'C:/Users/example/Documents/ADDOM',
      activeProjectId: 'project_addom',
    })
    const html = renderToStaticMarkup(
      React.createElement(CanonicalExecutionStream, {
        items: [
          {
            id: 'tool:markdown',
            kind: 'tool',
            toolKind: 'file_read',
            label: 'Read SKILL.md',
            verb: 'Read',
            identity: 'SKILL.md',
            statusMark: '✓',
            accessibleStatus: 'Succeeded',
            expandable: true,
            expandedEvidence: { input: 'skills/example/SKILL.md' },
            evidenceSections: [{ key: 'path', label: 'Path', value: 'skills/example/SKILL.md' }],
          },
          {
            id: 'tool:json',
            kind: 'tool',
            toolKind: 'file_read',
            label: 'Read package.json',
            verb: 'Read',
            identity: 'package.json',
            statusMark: '✓',
            accessibleStatus: 'Succeeded',
            expandable: false,
            expandedEvidence: { input: 'package.json' },
            evidenceSections: [],
          },
          {
            id: 'tool:external-markdown',
            kind: 'tool',
            toolKind: 'file_read',
            label: 'Read SKILL.md',
            verb: 'Read',
            identity: 'SKILL.md',
            statusMark: '✓',
            accessibleStatus: 'Succeeded',
            expandable: true,
            expandedEvidence: { input: 'C:/Users/example/AppData/Roaming/ADDOM/openai-account/codex-home/skills/example/SKILL.md' },
            evidenceSections: [],
          },
          {
            id: 'tool:external-json',
            kind: 'tool',
            toolKind: 'file_read',
            label: 'Read manifest.json',
            verb: 'Read',
            identity: 'manifest.json',
            statusMark: '✓',
            accessibleStatus: 'Succeeded',
            expandable: false,
            expandedEvidence: { input: 'C:/Users/example/AppData/Roaming/ADDOM/openai-account/codex-home/manifest.json' },
            evidenceSections: [],
          },
          {
            id: 'tool:command',
            kind: 'tool',
            toolKind: 'command',
            label: 'Ran package.json',
            verb: 'Ran',
            identity: 'package.json',
            statusMark: '✓',
            accessibleStatus: 'Succeeded',
            expandable: false,
            expandedEvidence: { input: 'package.json' },
            evidenceSections: [],
          },
        ],
      }),
    )

    assert.equal((html.match(/data-chat-file-reference="true"/g) || []).length, 2)
    assert.equal((html.match(/data-evidence-file-reference="true"/g) || []).length, 2)
    assert.match(html, /data-chat-file-reference="true"[^>]*>SKILL\.md<\/a>/)
    assert.match(html, /data-chat-file-reference="true"[^>]*>package\.json<\/a>/)
    assert.match(html, /data-evidence-file-reference="true"[^>]*>SKILL\.md<\/a>/)
    assert.match(html, /data-evidence-file-reference="true"[^>]*>manifest\.json<\/a>/)
    assert.equal((html.match(/cursor-pointer/g) || []).length, 4)
    assert.match(html, /data-ui="execution-evidence-toggle"/)
  } finally {
    rendererUseAppStore.setState({
      projectFolder: previousProjectFolder,
      activeProjectId: previousProjectId,
    })
  }
})

test('evidence disclosure uses icons instead of encoded chevron text', () => {
  const source = fs.readFileSync(
    path.resolve('src/renderer/components/chat/ExecutionEvidenceDisclosure.jsx'),
    'utf8',
  )

  assert.match(source, /<Icon name=\{expanded \? 'caret-down' : 'caret-right'\}/)
  assert.doesNotMatch(source, /â–|Ã¢|Â/)
})
