import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import fs from 'node:fs'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let TurnFileChangesCard = null
let TurnFileChangesHeader = null
let buildRowActionItems = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/TurnFileChangesCard.jsx')
  TurnFileChangesCard = mod?.default || null
  const headerMod = await ssrLoadRendererModule('/components/chat/TurnFileChangesHeader.jsx')
  TurnFileChangesHeader = headerMod?.default || null
  const actionsMod = await ssrLoadRendererModule('/components/chat/turn-file-changes-actions.jsx')
  buildRowActionItems = actionsMod?.buildRowActionItems || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('TurnFileChangesCard starts with only the native provider aggregate visible', () => {
  assert.equal(typeof TurnFileChangesCard, 'function')

  const html = renderToStaticMarkup(React.createElement(TurnFileChangesCard, {
    turnId: 'turn-rendered-native-files',
    projectFolder: '',
    activities: [
      {
        id: 'provider-native-output',
        type: 'result',
        eventKind: 'provider_tool_output',
        toolName: 'file_change',
        sequence: 4,
        createdAt: 4,
        fileChanges: [
          { path: 'public/index.html', kind: 'modify', addedLines: 12, removedLines: 3 },
          { path: 'public/styles.css', kind: 'create', addedLines: 44, removedLines: 0 },
          { path: 'public/app.js', kind: 'modify', addedLines: 9, removedLines: 2 },
        ],
      },
      {
        id: 'native-summary',
        type: 'file_change',
        eventKind: 'openai_account_native_file_change',
        toolName: 'file_change',
        sequence: 5,
        createdAt: 5,
        fileChanges: [
          { filePath: 'public/index.html', changeType: 'modify' },
          { filePath: 'public/styles.css', changeType: 'create' },
          { filePath: 'public/app.js', changeType: 'modify' },
        ],
      },
      {
        id: 'shell-side-effect',
        type: 'file_change',
        eventKind: 'file_change',
        sequence: 6,
        createdAt: 6,
        fileChange: {
          filePath: 'car-rental.db-shm',
          newRevId: 'db_shm_1',
          addedLines: 0,
          removedLines: 0,
        },
      },
    ],
  }))

  assert.match(html, /Files changed:\s*4/)
  assert.match(html, /\+65/)
  assert.match(html, /-5/)
  assert.match(html, /aria-expanded="false"/)
  assert.doesNotMatch(html, /index\.html|styles\.css|app\.js|car-rental\.db-shm/)
  assert.doesNotMatch(html, /Undo file changes|Delete created files/)
})

test('file-row overflow menu opens above the trigger and turn shell does not clip it', () => {
  const actionsSource = fs.readFileSync(
    new URL('../../src/renderer/components/chat/turn-file-changes-actions.jsx', import.meta.url),
    'utf8',
  )
  const shellSource = fs.readFileSync(
    new URL('../../src/renderer/components/chat/TurnShell.jsx', import.meta.url),
    'utf8',
  )

  assert.match(actionsSource, /data-ui="turn-file-changes-overflow-menu"/)
  assert.match(actionsSource, /absolute right-0 bottom-\[calc\(100%\+6px\)\]/)
  assert.doesNotMatch(actionsSource, /left-\[calc\(100%\+6px\)\]/)
  assert.match(shellSource, /data-turn-shell-slot="files"[\s\S]*overflow-visible/)
  assert.match(shellSource, /data-turn-shell-slot="execution"/)
  assert.match(shellSource, /data-turn-shell-slot="answer"/)
  assert.match(shellSource, /execution header → final answer → file artifacts/)
  assert.match(shellSource, /filesHint/)
  assert.match(shellSource, /revealFiles/)
  assert.doesNotMatch(shellSource, /space-y-4/)

  const shellCss = fs.readFileSync(
    new URL('../../src/renderer/styles/chat-turn-shell.css', import.meta.url),
    'utf8',
  )
  assert.match(shellCss, /margin-bottom:\s*1\.75rem/)
  assert.match(shellCss, /data-turn-shell-slot='execution'\] \+ \[data-turn-shell-slot='answer'/)
  assert.match(shellCss, /data-turn-shell-slot='answer'\] \+ \[data-turn-shell-slot='files'/)
})

test('file-row overflow menu adds the document viewer only when the row supplies that action', () => {
  assert.equal(typeof buildRowActionItems, 'function')
  const t = (_key, options = {}) => String(options.defaultValue || '')
  const baseOptions = {
    t,
    onOpen() {},
    onReview() {},
    onCopyPath() {},
  }

  assert.deepEqual(
    buildRowActionItems({ ...baseOptions, onOpenDocument() {} }).map((item) => item.id),
    ['open', 'open-document', 'review', 'copy'],
  )
  assert.deepEqual(
    buildRowActionItems(baseOptions).map((item) => item.id),
    ['open', 'review', 'copy'],
  )
})

test('collapsed file-change header keeps actionable conflicts visible', () => {
  const html = renderToStaticMarkup(React.createElement(TurnFileChangesHeader, {
    expanded: false,
    controlsId: 'files-panel',
    summary: { fileCount: 4, totalAdded: 65, totalRemoved: 5, conflictCount: 2 },
    onToggle() {},
  }))

  assert.match(html, /Files changed:\s*4/)
  assert.match(html, /2 conflicts/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /data-turn-header-dock-row="files"/)
  assert.match(html, /border-surface-border\/45/)
  assert.match(html, /font-medium text-text-secondary/)
  assert.doesNotMatch(html, /shadow-\[0_8px_20px_rgba\(0,0,0,0\.14\)\]/)
  assert.doesNotMatch(html, /[⌃⌄]/)
})

test('file-change details stay demand-driven at both disclosure levels', () => {
  const source = fs.readFileSync('src/renderer/components/chat/TurnFileChangesCard.jsx', 'utf8')
  assert.match(source, /useState\(false\)/)
  assert.match(source, /collectionExpanded \? \(/)
  assert.match(source, /open \? <TurnFileChangeExpandedPreview row=\{row\}/)
  assert.doesNotMatch(source, /selectLiveDiffPrefetchCandidates|LIVE_DIFF_PREFETCH_LIMIT|runPrefetch/)
})

test('TurnFileChangesCard displays turn-net totals via readDisplayedLineTotals', () => {
  const source = fs.readFileSync('src/renderer/components/chat/TurnFileChangesCard.jsx', 'utf8')
  assert.match(source, /readDisplayedLineTotals/)
  assert.doesNotMatch(source, /const added = Number\(row\?\.fileChange\?\.addedLines/)
  assert.doesNotMatch(source, /const removed = Number\(row\?\.fileChange\?\.removedLines/)
})

test('file-change row text shares the header px-3 inset', () => {
  const card = fs.readFileSync('src/renderer/components/chat/TurnFileChangesCard.jsx', 'utf8')
  const header = fs.readFileSync('src/renderer/components/chat/TurnFileChangesHeader.jsx', 'utf8')

  assert.match(header, /className="flex min-h-8 min-w-0 flex-1 items-center gap-2 px-3/)
  assert.match(card, /<div className="px-3 py-0\.5">/)
  assert.match(card, /-mx-1\.5 px-1\.5/)
  assert.doesNotMatch(card, /<div className="px-1 py-0\.5">/)
  assert.doesNotMatch(card, /flex items-stretch gap-2 px-1/)
})

test('bulk undo lives in the header slot without a spacer band between header and rows', () => {
  const card = fs.readFileSync('src/renderer/components/chat/TurnFileChangesCard.jsx', 'utf8')
  const header = fs.readFileSync('src/renderer/components/chat/TurnFileChangesHeader.jsx', 'utf8')

  assert.match(header, /actions/)
  assert.match(card, /actions=\{/)
  assert.doesNotMatch(card, /flex items-center justify-end gap-0\.5 px-1 py-1/)
  assert.match(card, /showBulkUndo/)
  assert.match(card, /projectFolder/)
})

test('TurnFileChangesHeader renders trailing actions beside the toggle without nesting buttons', () => {
  const html = renderToStaticMarkup(React.createElement(TurnFileChangesHeader, {
    expanded: true,
    controlsId: 'files-panel-actions',
    summary: { fileCount: 2, totalAdded: 4, totalRemoved: 1 },
    onToggle() {},
    actions: React.createElement('button', {
      type: 'button',
      'aria-label': 'Undo file changes from this turn',
    }, 'undo'),
  }))

  assert.match(html, /data-turn-header-dock-row="files"/)
  assert.match(html, /aria-expanded="true"[\s\S]*<\/button>[\s\S]*aria-label="Undo file changes from this turn"/)
  assert.match(html, /Undo file changes from this turn/)
})
