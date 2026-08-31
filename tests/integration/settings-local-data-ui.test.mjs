import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let DataResetBlock = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/settings/SettingsBlocks.jsx')
  DataResetBlock = mod?.DataResetBlock || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('data reset settings block renders production data actions without maintenance dashboards', () => {
  assert.equal(typeof DataResetBlock, 'function')

  const html = renderToStaticMarkup(React.createElement(DataResetBlock, {
    activeProjectId: 'project_1',
    activeThreadId: 'thread_1',
    localDataSummary: {
      profileKind: 'packaged',
      configuredProviderCount: 3,
      workspaceDataPresent: true,
      settingsPresent: true,
      attachmentCachePresent: true,
      modelCachePresent: false,
      userDataPath: 'C:\\Users\\example\\AppData\\Roaming\\ADDOM',
    },
    providerBudgetSummary: {
      totalCount: 4,
      activeCount: 2,
      staleCount: 1,
      expiredCount: 1,
      pruneEligibleCount: 1,
      invalidCount: 0,
      manualOverrideCount: 0,
      lastObservedAt: Date.UTC(2026, 3, 17, 8, 0, 0),
      lastResolvedAt: Date.UTC(2026, 3, 17, 9, 30, 0),
    },
    spilloverSummary: {
      rootPath: 'C:\\Users\\example\\AppData\\Roaming\\ADDOM\\tool-result-spillover',
      fileCount: 3,
      totalBytes: 9216,
      retentionPolicy: {
        maxFileCount: 64,
        maxAggregateBytes: 20 * 1024 * 1024,
        maxAgeMs: 7 * 24 * 60 * 60 * 1000,
      },
      sessionCleanupRecorded: true,
      sessionCleanupState: 'pruned',
      sessionCleanupAt: Date.UTC(2026, 3, 17, 10, 15, 0),
      sessionCleanupDeletedFileCount: 2,
      sessionCleanupDeletedBytes: 4096,
    },
    onClearCurrentThread: () => {},
    onClearCurrentProject: () => {},
    onClearMemoryAndTranscript: () => {},
    onExportCurrentThread: () => {},
    onImportThread: () => {},
    onRefreshProviderBudgetSummary: () => {},
    onCleanupProviderBudgetProfiles: () => {},
    onResetProviderBudgetProfiles: () => {},
    onRefreshToolResultSpilloverSummary: () => {},
    onCleanupToolResultSpillover: () => {},
    onResetToolResultSpillover: () => {},
    onDeleteApiKeysNow: () => {},
    onResetLocalDataAndRestart: () => {},
  }))

  assert.match(html, /Data Reset &amp; Cleanup/)
  assert.match(html, /Active Thread Migration/)
  assert.doesNotMatch(html, /Current Conversation/)
  assert.doesNotMatch(html, /Project Conversation History/)
  assert.match(html, /Local Profile Reset/)
  assert.doesNotMatch(html, /Adaptive Provider Budgets/)
  assert.doesNotMatch(html, /Tool Result Spillover/)
  assert.doesNotMatch(html, /4 learned/)
  assert.doesNotMatch(html, /Prune spillover/)
  assert.doesNotMatch(html, /Clear spillover/)
  assert.doesNotMatch(html, /Cleanup learned budgets/)
  assert.doesNotMatch(html, /Reset learned budgets/)
  assert.match(html, /Delete saved API keys/)
  assert.match(html, /Reset local profile &amp; restart/)
  assert.doesNotMatch(html, /Profile:\s*<strong[^>]*>packaged<\/strong>/)
  assert.doesNotMatch(html, /Providers:\s*<strong[^>]*>3 stored<\/strong>/)
  assert.doesNotMatch(html, /\$HOME_REF:/)
})
