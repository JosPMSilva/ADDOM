import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8')

test('App owns one Chat companion shell', () => {
  const app = read('src/renderer/App.jsx')
  const shell = read('src/renderer/components/chat/ChatCompanionShell.jsx')
  assert.match(app, /<ChatCompanionShell/)
  assert.match(app, /view\.type === CHAT_COMPANION_GIT/)
  assert.match(app, /view\.type === CHAT_COMPANION_AGENTS/)
  assert.match(app, /view\.type === CHAT_COMPANION_DOCUMENT/)
  assert.match(shell, /data-chat-companion=/)
  assert.match(shell, /motion-reduce:transition-none/)
  assert.doesNotMatch(shell, /CHAT_COMPANION_GIT|CHAT_COMPANION_AGENTS|CHAT_COMPANION_DOCUMENT/)
})

test('Chat companion resizing uses a wide hit target and commits after direct preview', () => {
  const app = read('src/renderer/App.jsx')
  const shell = read('src/renderer/components/chat/ChatCompanionShell.jsx')
  assert.match(shell, /createChatCompanionDragSession/)
  assert.match(shell, /startChatCompanionDragPresentation/)
  assert.match(shell, /style\.setProperty\('--chat-companion-inline-size'/)
  assert.match(shell, /onCommit:\s*\(nextWidth\)[\s\S]{0,160}onResize\?\.\(nextWidth/)
  assert.match(shell, /w-3[^"\n]*touch-none/)
  assert.doesNotMatch(shell, /-translate-x-1\/2/)
  assert.doesNotMatch(shell, /onResize\?\.\(state\.startWidth/)
  assert.match(app, /<ChatCompanionShell[\s\S]*workspaceRailOpen=\{workspaceRailOpen\}/)
})

test('Chat header derives its Agents control from canonical agent state', () => {
  const header = read('src/renderer/components/chat/ChatPanelHeaderBar.jsx')
  assert.match(header, /data-ui="git-companion-toggle"/)
  assert.match(header, /data-ui="agents-companion-toggle"/)
  assert.match(header, /aria-pressed=/)
  assert.match(header, /selectAgentCompanionStatus/)
  assert.match(header, /shouldShowAgentCompanionTrigger/)
  assert.match(header, /formatAgentCompanionLabel/)
  assert.doesNotMatch(header, /useMoaStore/)
})

test('the shared companion header keeps the same chrome height as chat', () => {
  const chatHeader = read('src/renderer/components/chat/ChatPanelHeaderBar.jsx')
  const shell = read('src/renderer/components/chat/ChatCompanionShell.jsx')
  const agentsHeader = read('src/renderer/components/agents/AgentNavigatorPanel.jsx')

  // Shared workspace chrome rhythm (chat / rail / settings): 52px header band.
  assert.match(chatHeader, /min-h-\[52px\]/)
  assert.match(
    shell,
    /<header className="flex min-h-\[52px\]/,
    'The shared dock header must match chat height so the bottom borders align',
  )
  assert.match(
    agentsHeader,
    /!embeddedInCompanion \? \(/,
    'Embedded Agents must yield all header chrome to the shared companion shell',
  )
  assert.match(shell, /headerAction/)
  assert.match(shell, /data-companion-header-action=/)
})

test('companion tabs support closing and reordering without adding a second toolbar', () => {
  const app = read('src/renderer/App.jsx')
  const shell = read('src/renderer/components/chat/ChatCompanionShell.jsx')
  const agents = read('src/renderer/components/agents/AgentNavigatorPanel.jsx')

  assert.match(app, /moveChatCompanionView/)
  assert.match(app, /headerAction=/)
  assert.match(shell, /onMoveView/)
  assert.match(shell, /onDragStart/)
  assert.match(shell, /onDragEnter/)
  assert.match(shell, /core:editor\.tabBar\.closeTabAriaLabel/)
  assert.match(shell, /focus-within:bg-surface-panel/)
  assert.doesNotMatch(shell, /focus-within:ring/)
  assert.doesNotMatch(agents, /embeddedInCompanion \? 'min-h-9/)
})

test('App keeps Agents open through same-thread completion but closes inactive destinations', () => {
  const app = read('src/renderer/App.jsx')
  assert.match(app, /agentCompanionOwnerThreadRef/)
  assert.match(app, /shouldCloseAgentCompanionOnThreadChange/)
  assert.doesNotMatch(app, /CHAT_COMPANION_AGENTS && !agentCompanionStatus\.visible/)
})

test('document-to-document navigation restores the originating view before focus', () => {
  const link = read('src/renderer/components/chat/ProjectFileReferenceLink.jsx')
  const state = read('src/renderer/components/chat/chat-companion-state.mjs')
  const shell = read('src/renderer/components/chat/ChatCompanionShell.jsx')

  assert.match(link, /closest\('\[data-companion-view-key\]'\)/)
  assert.match(link, /originViewKey/)
  assert.match(state, /originViewKey/)
  assert.match(shell, /requestAnimationFrame/)
})
