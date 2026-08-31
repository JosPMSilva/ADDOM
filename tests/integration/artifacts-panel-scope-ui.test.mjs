import assert from 'node:assert/strict'
import fs from 'node:fs'
import React from 'react'
import { after, before, test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let ArtifactScopeFilter = null
let revisionProvenanceLabel = null

before(async () => {
  ArtifactScopeFilter = (await ssrLoadRendererModule('/components/artifacts/ArtifactScopeFilter.jsx'))?.default || null
  revisionProvenanceLabel = (await ssrLoadRendererModule('/components/artifacts/artifact-panel-labels.mjs'))?.revisionProvenanceLabel || null
})

test('deleted Artifact revision provenance keeps the thread title snapshot and deletion date', () => {
  const label = revisionProvenanceLabel((key, values) => `${key}:${values.threadTitle}:${values.date}`, {
    origin_thread_id: 'deleted-thread-id',
    origin_thread_title: 'Deleted implementation thread',
    origin_thread_state: 'deleted',
    origin_thread_deleted_at: 1_700_000_000_000,
  }, 'en')

  assert.match(label, /artifacts\.revisionOrigin\.deletedThread/)
  assert.match(label, /Deleted implementation thread/)
  assert.match(label, /2023/)
})

after(async () => {
  await closeViteSsrLoader()
})

test('Artifact scope filter defaults to the project and announces file results', () => {
  const html = renderToStaticMarkup(React.createElement(ArtifactScopeFilter, {
    activeThreadId: 'thread-artifact-ui',
    resultCount: 2,
    scope: 'project',
    onChange: () => {},
  }))

  assert.match(html, />Project<\/button>/)
  assert.match(html, />Thread<\/button>/)
  assert.doesNotMatch(html, /Entire project|This thread/)
  assert.match(html, /aria-pressed="true"/)
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /2 files/)
})

test('Artifact scope filter keeps Thread disabled without an active thread', () => {
  const html = renderToStaticMarkup(React.createElement(ArtifactScopeFilter, {
    activeThreadId: '',
    resultCount: 0,
    scope: 'project',
    onChange: () => {},
  }))

  assert.match(html, /<button[^>]*disabled=""[^>]*>Thread<\/button>/)
})

test('ArtifactsPanel wires active-thread discovery without filtering revision history', () => {
  const source = fs.readFileSync('src/renderer/components/ArtifactsPanel.jsx', 'utf8')

  assert.match(source, /const activeThreadId = useAppStore\(\(s\) => s\.activeThreadId\)/)
  assert.match(source, /<ArtifactScopeFilter/)
  assert.match(source, /loadFiles\(projectFolder, \{ scope: artifactScope, threadId: activeThreadId \}\)/)
  assert.match(source, /window\.addom\.artifacts\.listRevisions\(projectFolder, filePath\)/)
  assert.doesNotMatch(source, /listRevisions\(projectFolder, filePath, \{[^}]*threadId/)
  assert.doesNotMatch(source, /trackedFilesTitle|Tracked files/)
})
