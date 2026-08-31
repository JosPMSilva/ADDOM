import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let ChatCompanionShell = null
let AgentNavigatorPanel = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/ChatCompanionShell.jsx')
  ChatCompanionShell = mod?.default || null
  const agentMod = await ssrLoadRendererModule('/components/agents/AgentNavigatorPanel.jsx')
  AgentNavigatorPanel = agentMod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('shared companion chrome renders contextual settings, closable tabs, and window-aligned actions', () => {
  assert.equal(typeof ChatCompanionShell, 'function')
  const html = renderToStaticMarkup(React.createElement(ChatCompanionShell, {
    activeCompanion: 'agents',
    visible: true,
    views: [
      { key: 'agents', type: 'agents', label: 'Agents' },
      { key: 'document:plan', type: 'document', label: 'Plan.md' },
    ],
    onMoveView: () => {},
    headerAction: {
      key: 'agent-settings',
      icon: 'gear',
      label: 'Agent settings',
      onSelect: () => {},
    },
  }, React.createElement('div', null, 'Agent content')))

  assert.match(html, /data-companion-header-action="agent-settings"/)
  assert.match(html, /data-ui="chat-companion-header-actions"/)
  assert.match(html, /data-companion-tab="agents"/)
  assert.match(html, /data-companion-tab="document:plan"/)
  assert.match(html, /data-companion-tab-close="agents"/)
  assert.match(html, /data-companion-tab-close="document:plan"/)
  assert.match(html, /draggable="true"/)
  assert.ok(html.indexOf('Agent settings') < html.indexOf('Focus companion'))
  assert.ok(html.indexOf('Focus companion') < html.indexOf('Close companion view'))
})

test('embedded agent navigator contributes content without a second header row', () => {
  assert.equal(typeof AgentNavigatorPanel, 'function')
  const embeddedHtml = renderToStaticMarkup(React.createElement(AgentNavigatorPanel, {
    embeddedInCompanion: true,
  }))
  const standaloneHtml = renderToStaticMarkup(React.createElement(AgentNavigatorPanel, {
    embeddedInCompanion: false,
  }))

  assert.match(embeddedHtml, /data-ui="agent-navigator-panel"/)
  assert.doesNotMatch(embeddedHtml, /data-ui="agent-navigator-header"/)
  assert.match(standaloneHtml, /data-ui="agent-navigator-header"/)
})
