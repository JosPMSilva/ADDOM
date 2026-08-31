import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { toAISDKTools } from '../../src/main/tools/tool-definitions.mjs'
import { resolveToolIdentity } from '../../src/main/tools/tool-identity-registry.mjs'
import { applyTerminalSessionRuntimeGating } from '../../src/main/chat/tool-surface-selection.mjs'

const CURRENT_TERMINAL_SESSION_TOOL_NAMES = Object.freeze([
  'terminal_session_list',
  'terminal_session_open',
  'terminal_session_read_snapshot',
  'terminal_session_wait_for_output',
  'terminal_session_attach',
  'terminal_session_write',
  'terminal_session_resize',
  'terminal_session_signal',
  'terminal_session_close',
])

function buildTools(names = []) {
  return Object.fromEntries(
    names.map((name) => [name, { description: `${name} tool`, inputSchema: {} }]),
  )
}

test('toAISDKTools exposes the explicit terminal_session tool family when runtime support is enabled', () => {
  const tools = toAISDKTools('ask', false, { includeTerminalSessionTools: true })

  assert.equal(Boolean(tools.terminal_session_open), true)
  assert.equal(Boolean(tools.terminal_session_list), true)
  assert.equal(Boolean(tools.terminal_session_read_snapshot), true)
  assert.equal(Boolean(tools.terminal_session_wait_for_output), true)
  assert.equal(Boolean(tools.terminal_session_attach), true)
  assert.equal(Boolean(tools.terminal_session_write), true)
  assert.equal(Boolean(tools.terminal_session_resize), true)
  assert.equal(Boolean(tools.terminal_session_signal), true)
  assert.equal(Boolean(tools.terminal_session_close), true)
  assert.equal(Boolean(tools.run_command), true)
  assert.match(tools.terminal_session_open.description, /visible interactive terminal session in the chat terminal/i)
  assert.match(tools.terminal_session_list.description, /reuse the right interactive session/i)
  assert.match(tools.terminal_session_read_snapshot.description, /bounded snapshot/i)
  assert.match(tools.terminal_session_wait_for_output.description, /instead of repeatedly polling snapshots/i)
  assert.match(tools.terminal_session_write.description, /existing visible terminal session/i)
  assert.match(tools.terminal_session_write.description, /submit/i)
  assert.equal(
    tools.terminal_session_write.inputSchema?.jsonSchema?.properties?.submit?.type?.[0]
      || tools.terminal_session_write.parameters?.properties?.submit?.type,
    'boolean',
  )
})

test('terminal tool surface baseline has the current explicit session capability set', () => {
  const tools = toAISDKTools('ask', false, { includeTerminalSessionTools: true })
  const terminalToolNames = Object.keys(tools).filter((name) => name.startsWith('terminal_session_')).sort()

  assert.deepEqual(terminalToolNames, [...CURRENT_TERMINAL_SESSION_TOOL_NAMES].sort())
  assert.equal(Boolean(tools.terminal_session_list), true)
  assert.equal(Boolean(tools.terminal_session_wait_for_output), true)
})

test('toAISDKTools can omit terminal_session tools without affecting run_command', () => {
  const tools = toAISDKTools('ask', false, { includeTerminalSessionTools: false })

  assert.equal(Boolean(tools.terminal_session_open), false)
  assert.equal(Boolean(tools.terminal_session_list), false)
  assert.equal(Boolean(tools.terminal_session_read_snapshot), false)
  assert.equal(Boolean(tools.terminal_session_wait_for_output), false)
  assert.equal(Boolean(tools.terminal_session_attach), false)
  assert.equal(Boolean(tools.terminal_session_write), false)
  assert.equal(Boolean(tools.run_command), true)
})

test('terminal session identities stay explicit and distinct from run_command', () => {
  const openIdentity = resolveToolIdentity('terminal_session_open')
  const listIdentity = resolveToolIdentity('terminal_session_list')
  const readIdentity = resolveToolIdentity('terminal_session_read_snapshot')
  const waitIdentity = resolveToolIdentity('terminal_session_wait_for_output')
  const writeIdentity = resolveToolIdentity('terminal_session_write')

  assert.equal(listIdentity.canonicalToolName, 'terminal_session_list')
  assert.equal(listIdentity.family, 'terminal_session')
  assert.equal(listIdentity.label, 'List Terminal Sessions')
  assert.equal(openIdentity.canonicalToolName, 'terminal_session_open')
  assert.equal(openIdentity.family, 'terminal_session')
  assert.equal(openIdentity.label, 'Open Terminal Session')
  assert.equal(readIdentity.canonicalToolName, 'terminal_session_read_snapshot')
  assert.equal(readIdentity.family, 'terminal_session')
  assert.equal(waitIdentity.canonicalToolName, 'terminal_session_wait_for_output')
  assert.equal(waitIdentity.family, 'terminal_session')
  assert.equal(writeIdentity.canonicalToolName, 'terminal_session_write')
  assert.equal(writeIdentity.family, 'terminal_session')
  assert.notEqual(writeIdentity.canonicalToolName, 'run_command')
})

test('terminal runtime gating removes explicit terminal tools and records the exclusion reason', () => {
  const addomTools = buildTools([
    'read_file',
    'run_command',
    'terminal_session_list',
    'terminal_session_open',
    'terminal_session_read_snapshot',
    'terminal_session_wait_for_output',
    'terminal_session_attach',
    'terminal_session_write',
  ])

  const gated = applyTerminalSessionRuntimeGating({
    tools: { ...addomTools },
    toolSurfaceKind: 'addom_native',
    toolSurfaceComponents: ['addom_native'],
    mixedToolSurfaceDetected: false,
    removedAddomToolNames: [],
    excludedToolsWithReasons: [],
    toolExecutionMap: {},
  }, {
    addomTools,
    terminalSessionRuntimeHealth: {
      status: 'failed',
      reason: 'pty_probe_failed',
    },
  })

  assert.equal(Boolean(gated.tools.terminal_session_list), false)
  assert.equal(Boolean(gated.tools.terminal_session_open), false)
  assert.equal(Boolean(gated.tools.terminal_session_read_snapshot), false)
  assert.equal(Boolean(gated.tools.terminal_session_wait_for_output), false)
  assert.equal(Boolean(gated.tools.terminal_session_attach), false)
  assert.equal(Boolean(gated.tools.terminal_session_write), false)
  assert.equal(Boolean(gated.tools.run_command), true)
  assert.deepEqual(gated.removedAddomToolNames.sort(), [
    'terminal_session_attach',
    'terminal_session_list',
    'terminal_session_open',
    'terminal_session_read_snapshot',
    'terminal_session_wait_for_output',
    'terminal_session_write',
  ])
  assert.equal(
    gated.excludedToolsWithReasons.some((row) => row.toolName === 'terminal_session_open' && row.reason === 'excluded_due_to_terminal_runtime_failed'),
    true,
  )
})

test('chat event bridge keeps terminal collaboration on the chat dock path without forcing retired terminal-page navigation', () => {
  const source = fs.readFileSync(path.resolve('src/renderer/components/chat/chat-event-bridge-terminal-collaboration.mjs'), 'utf8')

  assert.match(source, /noteModelSessionActivity\?\.\(\{/)
  assert.match(source, /setTerminalDockState\?\.\(\{/)
  assert.match(source, /requestSessionSurfaceFocus\?\.\(sessionId,\s*'chat_dock'\)/)
  assert.doesNotMatch(source, /setActivePanel\?\.\('terminal'\)/)
})

test('chat event bridge routes terminal memory suggestion tool results into archive refresh instead of the runbook lane', () => {
  const source = [
    fs.readFileSync(path.resolve('src/renderer/components/ChatEventBridge.jsx'), 'utf8'),
    fs.readFileSync(path.resolve('src/renderer/components/chat/chat-event-bridge-terminal-collaboration.mjs'), 'utf8'),
  ].join('\n')

  assert.match(source, /isTerminalMemorySuggestionToolResult/)
  assert.match(source, /refreshThreadSuggestionArchives\?\.\(\{/)
  assert.match(source, /bridgeRefreshArchivedSuggestionsForThread\(\{ threadId \}\)\s*\n\s*return/)
})
