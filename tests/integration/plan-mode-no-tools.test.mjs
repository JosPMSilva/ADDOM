import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeChatMode,
  resolveTurnTools,
  buildModeSystemPrompt,
  resolveModeCapability,
} from '../../src/main/chat/turn-mode.mjs'

test('chat mode normalization accepts thinking and defaults unknown to execute', () => {
  assert.equal(normalizeChatMode('execute'), 'execute')
  assert.equal(normalizeChatMode('plan'), 'plan')
  assert.equal(normalizeChatMode('thinking'), 'thinking')
  assert.equal(normalizeChatMode('unknown'), 'execute')
})

test('Thinking and Plan expose only their canonical capability ceilings', () => {
  const tools = resolveTurnTools('thinking', 'full_access', true, () => ({
    read_file: { description: 'read', inputSchema: {} },
    fetch_page: { description: 'web', inputSchema: {} },
    question_user: { description: 'question', inputSchema: {} },
    plan_read: { description: 'plan read', inputSchema: {} },
    plan_update: { description: 'plan update', inputSchema: {} },
    write_file: { description: 'write', inputSchema: {} },
    run_command: { description: 'command', inputSchema: {} },
  }))
  assert.deepEqual(Object.keys(tools).sort(), ['fetch_page', 'plan_read', 'question_user', 'read_file'])

  const planTools = resolveTurnTools('plan', 'full_access', true, () => ({
    ...tools,
    plan_update: { description: 'plan update', inputSchema: {} },
    plan_document_write: { description: 'plan document', inputSchema: {} },
    write_file: { description: 'write', inputSchema: {} },
  }))
  assert.deepEqual(Object.keys(planTools).sort(), [
    'fetch_page', 'plan_document_write', 'plan_read', 'plan_update', 'question_user', 'read_file',
  ])
})

test('canonical capability policy defaults unknown tools to denied outside Execute', () => {
  const cases = [
    ['thinking', 'read_file', true],
    ['thinking', 'webSearch', true],
    ['thinking', 'imageView', true],
    ['thinking', 'plan_update', false],
    ['plan', 'plan_update', true],
    ['plan', 'plan_document_write', true],
    ['plan', 'fileChange', false],
    ['plan', 'commandExecution', false],
    ['plan', 'unknown_dynamic_tool', false],
    ['thinking', 'mcp_read_only', true, { trustedReadOnly: true }],
    ['thinking', 'mcp_unknown', false],
    ['execute', 'unknown_dynamic_tool', true],
  ]
  for (const [mode, toolName, allowed, metadata] of cases) {
    const result = resolveModeCapability(toolName, mode, metadata)
    assert.equal(result.allowed, allowed, `${mode}:${toolName}`)
  }
})

test('execute mode delegates to tools factory with permission mode', () => {
  let receivedPermissionMode = null
  let receivedDelegationAvailability = null
  const tools = resolveTurnTools('execute', 'autonomy', true, (permissionMode, delegationAvailable) => {
    receivedPermissionMode = permissionMode
    receivedDelegationAvailability = delegationAvailable
    return {
      read_file: { description: 'read', inputSchema: {} },
    }
  })

  assert.equal(receivedPermissionMode, 'autonomy')
  assert.equal(receivedDelegationAvailability, true)
  assert.ok(tools.read_file)
})

test('mode prompt appends plan/thinking prompts only in matching modes', () => {
  const base = 'BASE'
  const planPrompt = 'PLAN'
  const thinkingPrompt = 'THINKING'

  assert.equal(
    buildModeSystemPrompt(base, { plan: planPrompt, thinking: thinkingPrompt }, 'plan'),
    'BASE\n\nPLAN',
  )
  assert.equal(
    buildModeSystemPrompt(base, { plan: planPrompt, thinking: thinkingPrompt }, 'thinking'),
    'BASE\n\nTHINKING',
  )
  assert.equal(
    buildModeSystemPrompt(base, { plan: planPrompt, thinking: thinkingPrompt }, 'execute'),
    'BASE',
  )
})
