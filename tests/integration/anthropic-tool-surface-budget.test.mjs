import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'
import { resolveRuntimeToolSurface } from '../../src/main/chat/runtime-tool-surface.mjs'
import { toAISDKTools } from '../../src/main/tools/tool-definitions.mjs'

const ANTHROPIC_CORE_TOOLS = [
  'agent_catalog',
  'delegate_tasks',
  'edit_file',
  'fetch_page',
  'find_files',
  'git_status',
  'grep_file',
  'list_directory',
  'plan_read',
  'plan_update',
  'question_user',
  'read_file',
  'run_command',
  'search_code',
  'view_file_range',
  'write_file',
]

function allAddomTools({ includeTerminalSessionTools = true } = {}) {
  return toAISDKTools('ask', true, { includeTerminalSessionTools })
}

function sortedToolNames(surface) {
  return Object.keys(surface?.resolvedToolSurface?.tools || {}).sort()
}

async function resolveAnthropicSurface({
  userMessage = 'Help with this task.',
  includeTerminalSessionTools = true,
  terminalSessionRuntimeHealth = null,
} = {}) {
  return resolveRuntimeToolSurface({
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    mode: 'execute',
    userMessage,
    addomTools: allAddomTools({ includeTerminalSessionTools }),
    adapterProfile: resolveProviderModelAdapter('anthropic', 'claude-sonnet-4-6'),
    terminalSessionRuntimeHealth,
  })
}

test('Anthropic default tool surface uses the strict core budget when terminal runtime is disabled', async () => {
  const surface = await resolveAnthropicSurface({
    includeTerminalSessionTools: false,
    terminalSessionRuntimeHealth: null,
  })

  assert.deepEqual(sortedToolNames(surface), ANTHROPIC_CORE_TOOLS)
  assert.equal(surface.resolvedToolSurface.promptBudgetProfile.id, 'anthropic_strict')
  assert.equal(surface.resolvedToolSurface.toolSurfaceBudgetProfile, 'anthropic_strict')
  assert.equal(surface.resolvedToolSurface.toolSurfaceVisibleCount, ANTHROPIC_CORE_TOOLS.length)
  assert.equal(surface.resolvedToolSurface.toolSurfaceHiddenFamilies.includes('terminal_session'), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.run_command), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.browser_action), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.git_status), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_tasks), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.list_curated_skills), false)
})

test('Anthropic terminal runtime support alone does not expose terminal session tools', async () => {
  const surface = await resolveAnthropicSurface({
    includeTerminalSessionTools: true,
    terminalSessionRuntimeHealth: { status: 'supported' },
  })

  assert.deepEqual(sortedToolNames(surface), ANTHROPIC_CORE_TOOLS)
  assert.equal(surface.resolvedToolSurface.toolSurfaceVisibleCount, ANTHROPIC_CORE_TOOLS.length)
  assert.equal(surface.resolvedToolSurface.toolSurfaceHiddenFamilies.includes('terminal_session'), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.terminal_session_open), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.terminal_session_read_snapshot), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.run_command), true)
})

test('Anthropic exposes shell and terminal session tools for explicit interactive terminal intent', async () => {
  const surface = await resolveAnthropicSurface({
    userMessage: 'Open an interactive terminal session and run the TUI.',
    includeTerminalSessionTools: true,
    terminalSessionRuntimeHealth: { status: 'supported' },
  })

  assert.equal(Boolean(surface.resolvedToolSurface.tools.run_command), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.terminal_session_list), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.terminal_session_open), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.terminal_session_write), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.terminal_session_read_snapshot), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.terminal_session_wait_for_output), true)
  assert.equal(surface.resolvedToolSurface.toolSurfaceHiddenFamilies.includes('terminal_session'), false)
})

test('Anthropic retry turns inherit prior command intent instead of dropping shell access', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'anthropic',
    modelId: 'claude-haiku-4-5',
    mode: 'execute',
    userMessage: 'retry',
    history: [
      { role: 'user', content: 'Run npm start in the terminal and wait for the dev server output.' },
      { role: 'assistant', content: 'I will retry that now.' },
    ],
    addomTools: allAddomTools({ includeTerminalSessionTools: true }),
    adapterProfile: resolveProviderModelAdapter('anthropic', 'claude-haiku-4-5'),
    terminalSessionRuntimeHealth: { status: 'supported' },
  })

  assert.equal(surface.resolvedToolSurface.shadowIntent.intent, 'command_execution')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.run_command), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.terminal_session_open), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.terminal_session_write), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.terminal_session_wait_for_output), true)
})

test('Anthropic exposes browser and git tools for explicit matching intents', async () => {
  const surface = await resolveAnthropicSurface({
    userMessage: 'Open localhost:5173 in the browser, click login, then check git status.',
    includeTerminalSessionTools: true,
    terminalSessionRuntimeHealth: { status: 'supported' },
  })

  assert.equal(Boolean(surface.resolvedToolSurface.tools.browser_action), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.fetch_page), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.git_status), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.git_diff), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.run_command), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.terminal_session_open), false)
})

test('Anthropic exposes delegation tools for MoA agent phrasing', async () => {
  const surface = await resolveAnthropicSurface({
    userMessage: "Ask an agent of MoA to check how's your work.",
    includeTerminalSessionTools: true,
    terminalSessionRuntimeHealth: { status: 'supported' },
  })

  assert.equal(surface.resolvedToolSurface.shadowIntent.intent, 'delegation')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_tasks), true)
  assert.equal(surface.resolvedToolSurface.toolExecutionMap.delegate_tasks, 'delegate_to_agents')
})

test('Anthropic skill-install phrasing exposes skill tools without widening to shell', async () => {
  const surface = await resolveAnthropicSurface({
    userMessage: 'Install a curated skill for this repo.',
    includeTerminalSessionTools: true,
    terminalSessionRuntimeHealth: { status: 'supported' },
  })

  assert.equal(Boolean(surface.resolvedToolSurface.tools.list_curated_skills), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.install_curated_skill), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.run_command), true)
})

test('OpenAI hosted local skill gating remains outside the Anthropic budget gate', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    mode: 'execute',
    userMessage: 'Help with this task.',
    addomTools: allAddomTools({ includeTerminalSessionTools: true }),
    includeOpenAILocalRuntimeTools: true,
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4', { authMethod: 'api_key' }),
    terminalSessionRuntimeHealth: { status: 'supported' },
  })

  assert.equal(surface.resolvedToolSurface.toolSurfaceKind, 'addom_native')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.run_command), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.browser_action), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.git_status), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.list_curated_skills), false)
  assert.equal(Boolean(surface.resolvedToolSurface.toolSurfaceBudgetProfile), true)
  assert.equal(surface.resolvedToolSurface.promptBudgetProfile.id, 'openai_moderate')
})
