import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let MemoryNodeCard = null
let HistoryEventCard = null
let MemoryPanel = null
let useMemoryStore = null
let useAppStore = null
let useChatStore = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/MemoryPanel.jsx')
  const leafMod = await ssrLoadRendererModule('/components/memory/MemoryPanelLeafComponents.jsx')
  MemoryPanel = mod?.default || null
  MemoryNodeCard = mod?.MemoryNodeCard || null
  HistoryEventCard = leafMod?.HistoryEventCard || null
  useMemoryStore = (await ssrLoadRendererModule('/store/useMemoryStore.js'))?.default || null
  useAppStore = (await ssrLoadRendererModule('/store/useAppStore.js'))?.default || null
  useChatStore = (await ssrLoadRendererModule('/store/useChatStore.js'))?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test.afterEach(() => {
  useAppStore?.setState?.({
    projectFolder: null,
    activeThreadId: null,
  })
  useChatStore?.setState?.({
    timeline: [],
    activeThreadId: null,
  })
  useMemoryStore?.setState?.({
    nodes: [],
    loading: false,
    nodesProjectFolder: '',
    activeThreadId: '',
    activeScopeFilter: 'current_thread',
    loadError: '',
    includeCompressed: false,
    lastCompressionEvent: null,
    searchQuery: '',
    searchResults: null,
    searching: false,
    embedderState: 'idle',
    embedderProgress: 0,
    editingNode: null,
  })
})

test('MemoryNodeCard SSR renders terminal provenance and hides system provenance tags', () => {
  assert.equal(typeof MemoryNodeCard, 'function')

  const html = renderToStaticMarkup(React.createElement(MemoryNodeCard, {
    node: {
      id: 'memory-terminal-panel-1',
      sortId: 7,
      project: 'memory-panel-project',
      projectKey: 'memory-panel-project',
      scope: 'project',
      isGlobal: false,
      topic: 'Terminal summary: deploy fix',
      content: 'Restart the worker after applying the migration to clear the lock.',
      tags: [
        'terminal_summary',
        'terminal_session',
        'terminal_session:term_panel_1',
        'terminal_thread:thread_panel_1',
        'terminal_accepted_at:1700000000000',
        'deployment',
      ],
      displayTags: ['deployment'],
      pinned: false,
      dataPolicy: 'standard',
      source: 'terminal_summary',
      provenance: {
        kind: 'terminal',
        sessionId: 'term_panel_1',
        threadId: 'thread_panel_1',
        acceptedAt: 1700000000000,
      },
      compressed: false,
      compressedInto: null,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      accessCount: 1,
      lastAccessed: 1700000000000,
    },
    onPin: () => {},
    onEdit: () => {},
    onDelete: () => {},
  }))

  assert.match(html, /Terminal summary/)
  assert.match(html, /Memory provenance/)
  assert.match(html, /Accepted terminal summary/)
  assert.match(html, /Session/)
  assert.match(html, /term_panel_1/)
  assert.match(html, /Thread/)
  assert.match(html, /thread_panel_1/)
  assert.match(html, /Saved/)
  assert.match(html, /deployment/)
  assert.doesNotMatch(html, /terminal_session:term_panel_1/)
  assert.doesNotMatch(html, /terminal_thread:thread_panel_1/)
  assert.doesNotMatch(html, /terminal_accepted_at:1700000000000/)
})

test('MemoryNodeCard keeps scope with source metadata after card controls', () => {
  const html = renderToStaticMarkup(React.createElement(MemoryNodeCard, {
    node: {
      id: 'memory-thread-metadata-1',
      sortId: 8,
      scope: 'thread',
      topic: 'Thread-scoped decision',
      content: 'Keep scope metadata separate from record controls.',
      displayTags: ['decision'],
      pinned: false,
      source: 'validated_decision',
      compressed: false,
    },
    onPin: () => {},
    onEdit: () => {},
    onDelete: () => {},
  }))

  assert.ok(html.indexOf('aria-label="Delete"') < html.lastIndexOf('thread'))
  assert.match(html, /#decision.*thread.*Validated decision/)
})

test('MemoryNodeCard renders scope actions as compact tonal buttons', () => {
  const html = renderToStaticMarkup(React.createElement(MemoryNodeCard, {
    node: {
      id: 'memory-tonal-actions-1',
      sortId: 9,
      scope: 'thread',
      topic: 'Tonal action controls',
      content: 'Make record actions identifiable without adding heavy chrome.',
      displayTags: [],
      pinned: false,
      source: 'validated_decision',
      compressed: false,
    },
    onPin: () => {},
    onEdit: () => {},
    onDelete: () => {},
    onPromoteToProject: () => {},
    onMakeGlobal: () => {},
    onInvalidate: () => {},
  }))

  assert.match(html, /class="[^"]*min-h-7[^"]*border-transparent[^"]*bg-surface-panel\/70[^"]*"[^>]*>Promote to project<\/button>/)
  assert.match(html, /class="[^"]*text-danger[^"]*"[^>]*>Invalidate<\/button>/)
  assert.doesNotMatch(html, /bg-danger/)
})

test('Memory navigation and panel header use the open-book glyph', () => {
  const panelSource = fs.readFileSync('src/renderer/components/MemoryPanel.jsx', 'utf8')
  const sidebarSource = fs.readFileSync('src/renderer/components/Sidebar.jsx', 'utf8')

  assert.match(panelSource, /<Icon name="book-open"/)
  assert.match(sidebarSource, /<Icon name="book-open"/)
  assert.doesNotMatch(panelSource, /<Icon name="brain"/)
  assert.doesNotMatch(sidebarSource, /<Icon name="brain"/)
})

test('MemoryPanel SSR renders scope filters and scope-aware card actions', () => {
  assert.equal(typeof MemoryPanel, 'function')

  useAppStore.setState({
    projectFolder: 'memory-panel-project',
    activeThreadId: 'thread-panel-current',
  })
  useChatStore.setState({
    timeline: [],
    activeThreadId: 'thread-panel-current',
  })
  useMemoryStore.setState({
    nodes: [
      {
        id: 'memory-thread-card-1',
        sortId: 11,
        project: 'memory-panel-project',
        projectKey: 'memory-panel-project',
        scope: 'thread',
        isGlobal: false,
        threadId: 'thread-panel-current',
        originThreadId: 'thread-panel-current',
        topic: 'Debugger finding',
        content: 'Thread-local note about the failing test.',
        tags: ['debug'],
        displayTags: ['debug'],
        pinned: false,
        dataPolicy: 'standard',
        source: 'validated_decision',
        durability: 'ephemeral',
        confidence: 0.8,
        provenance: null,
        compressed: false,
        compressedInto: null,
        promotedAt: null,
        invalidatedAt: null,
        supersededBy: null,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        accessCount: 2,
        lastAccessed: 1700000000000,
        lastUsedAt: 1700000000000,
      },
      {
        id: 'memory-project-card-2',
        sortId: 12,
        project: 'memory-panel-project',
        projectKey: 'memory-panel-project',
        scope: 'project',
        isGlobal: false,
        threadId: null,
        originThreadId: 'thread-panel-current',
        topic: 'Stable repo rule',
        content: 'Project memory that can be returned to the current thread.',
        tags: ['repo-rule'],
        displayTags: ['repo-rule'],
        pinned: false,
        dataPolicy: 'standard',
        source: 'reference_note',
        durability: 'promoted',
        confidence: 0.95,
        provenance: null,
        compressed: false,
        compressedInto: null,
        promotedAt: 1700000000000,
        invalidatedAt: null,
        supersededBy: null,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        accessCount: 4,
        lastAccessed: 1700000000000,
        lastUsedAt: 1700000000000,
      },
    ],
    loading: false,
    nodesProjectFolder: 'memory-panel-project',
    activeThreadId: 'thread-panel-current',
    activeScopeFilter: 'current_thread',
    includeCompressed: false,
    searchQuery: '',
    searchResults: null,
    searching: false,
    embedderState: 'idle',
    embedderProgress: 0,
    editingNode: null,
  })

  const panelHtml = renderToStaticMarkup(React.createElement(MemoryPanel))
  const cardHtml = renderToStaticMarkup(React.createElement(MemoryNodeCard, {
    node: {
      id: 'memory-project-card-2',
      sortId: 12,
      project: 'memory-panel-project',
      projectKey: 'memory-panel-project',
      scope: 'project',
      isGlobal: false,
      threadId: null,
      originThreadId: 'thread-panel-current',
      topic: 'Stable repo rule',
      content: 'Project memory that can be returned to the current thread.',
      tags: ['repo-rule'],
      displayTags: ['repo-rule'],
      pinned: false,
      dataPolicy: 'standard',
      source: 'reference_note',
      durability: 'promoted',
      confidence: 0.95,
      provenance: null,
      compressed: false,
      compressedInto: null,
      promotedAt: 1700000000000,
      invalidatedAt: null,
      supersededBy: null,
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      accessCount: 4,
      lastAccessed: 1700000000000,
      lastUsedAt: 1700000000000,
    },
    onPin: () => {},
    onEdit: () => {},
    onDelete: () => {},
    onKeepInThread: () => {},
    onMakeGlobal: () => {},
    onInvalidate: () => {},
  }))

  assert.match(panelHtml, />Memory</)
  assert.match(panelHtml, /Thread History/)
  assert.match(panelHtml, /Current Thread/)
  assert.match(panelHtml, /Project/)
  assert.match(panelHtml, /Global/)
  assert.match(panelHtml, />All</)
  assert.match(cardHtml, /Keep in this thread/)
  assert.match(cardHtml, /Make global/)
  assert.match(cardHtml, /Invalidate/)
  assert.match(cardHtml, /project/)
  assert.match(cardHtml, /Last used/)
})

test('MemoryPanel uses one low-chrome knowledge ledger shell', () => {
  useAppStore.setState({
    projectFolder: 'memory-panel-project',
    activeThreadId: 'thread-panel-current',
  })
  useMemoryStore.setState({
    nodes: [],
    loading: false,
    nodesProjectFolder: 'memory-panel-project',
    activeThreadId: 'thread-panel-current',
    activeScopeFilter: 'current_thread',
    includeCompressed: false,
    searchQuery: '',
    searchResults: null,
    searching: false,
    editingNode: null,
  })
  useMemoryStore.getState().setEmbedderStatus({ state: 'loading', progress: 0 })

  const html = renderToStaticMarkup(React.createElement(MemoryPanel))
  const source = fs.readFileSync('src/renderer/components/MemoryPanel.jsx', 'utf8')
  const leafSource = fs.readFileSync('src/renderer/components/memory/MemoryPanelLeafComponents.jsx', 'utf8')

  assert.match(html, /data-memory-layout="ledger"/)
  assert.match(html, /role="tablist"/)
  assert.match(html, /role="tab"[^>]*aria-selected="true"/)
  assert.match(html, /aria-pressed="true"/)
  assert.doesNotMatch(source, /bg-gradient|backdrop-blur|shadow-\[/)
  assert.match(leafSource, /state === 'error' \? 'text-danger' : 'text-text-muted'/)
})

test('Memory records and history use flat evidence rows without card chrome', () => {
  const nodeHtml = renderToStaticMarkup(React.createElement(MemoryNodeCard, {
    node: {
      id: 'memory-flat-record-1',
      sortId: 21,
      scope: 'project',
      topic: 'Release sequence',
      content: 'Run verification before packaging the desktop build.',
      displayTags: ['release'],
      pinned: true,
      source: 'validated_decision',
      compressed: false,
      invalidatedAt: null,
      createdAt: 1700000000000,
      lastUsedAt: 1700000000000,
    },
    onPin: () => {},
    onEdit: () => {},
    onDelete: () => {},
    onInvalidate: () => {},
  }))
  const historyHtml = renderToStaticMarkup(React.createElement(HistoryEventCard, {
    entry: {
      eventId: 'history-flat-row-1',
      kind: 'assistant_message',
      content: 'Verification completed.',
      createdAt: 1700000000000,
    },
    locale: 'en',
  }))
  const leafSource = fs.readFileSync('src/renderer/components/memory/MemoryPanelLeafComponents.jsx', 'utf8')

  assert.match(nodeHtml, /data-memory-record="true"/)
  assert.match(nodeHtml, /aria-label="Unpin"/)
  assert.match(nodeHtml, /aria-label="Edit"/)
  assert.match(nodeHtml, /aria-label="Delete"/)
  assert.match(historyHtml, /data-memory-history-entry="true"/)
  assert.doesNotMatch(leafSource, /bg-gradient|bg-danger-bg|backdrop-blur|shadow-(?:sm|md|2xl)/)
})

test('MemoryNodeCard presents deleted-thread provenance separately from compression archive', () => {
  const html = renderToStaticMarkup(React.createElement(MemoryNodeCard, {
    node: {
      id: 'memory-deleted-thread-1',
      sortId: 31,
      scope: 'thread',
      threadId: 'thread-deleted-1',
      originThreadId: 'thread-deleted-1',
      originThreadTitle: 'Investigate renderer crash',
      originThreadState: 'deleted',
      originThreadDeletedAt: 1_700_000_000_000,
      topic: 'Recovered finding',
      content: 'Preserved after its source thread was deleted.',
      displayTags: [],
      pinned: false,
      source: 'validated_decision',
      compressed: false,
      invalidatedAt: null,
      createdAt: 1_699_000_000_000,
      lastUsedAt: 1_699_000_000_000,
    },
    onPin: () => {},
    onEdit: () => {},
    onDelete: () => {},
    onPromoteToProject: () => {},
    onMakeGlobal: () => {},
  }))

  assert.match(html, /Deleted thread/)
  assert.match(html, /Investigate renderer crash/)
  assert.match(html, /2023/)
  assert.doesNotMatch(html, />archived</)
})
