import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveProviderModelAdapter } from '../../src/main/api-clients/provider-model-adapters.mjs'
import {
  TOOL_SURFACE_ACTIVATION_REASON,
  activateToolSurfaceCapability,
} from '../../src/main/chat/tool-surface-activation.mjs'
import { resolveRuntimeToolSurface } from '../../src/main/chat/runtime-tool-surface.mjs'
import { buildAgentTools } from '../../src/main/moa/agent-runtime-helpers.mjs'
import { toAISDKTools } from '../../src/main/tools/tool-definitions.mjs'

function buildTools(names = []) {
  return Object.fromEntries(
    names.map((name) => [name, { description: `${name} tool`, inputSchema: {} }]),
  )
}

test('runtime tool surface routes Codex-family OpenAI models to the native Codex-local harness without removing simpler file tools', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.3-codex',
    addomTools: buildTools(['read_file', 'apply_patch', 'write_file', 'edit_file', 'run_command', 'delegate_tasks', 'delegate_to_agents']),
    providerRuntimeSettings: {
      hostedToolsEnabled: true,
      enabledHostedTools: ['web_search', 'apply_patch', 'shell'],
    },
    vectorStoreIds: ['vs_123'],
    includeOpenAILocalRuntimeTools: true,
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.3-codex'),
  })

  assert.deepEqual(Object.keys(surface.providerSurfaceTools), [])
  assert.deepEqual(Object.keys(surface.resolvedToolSurface.tools).sort(), [
    'delegate_tasks',
    'edit_file',
    'read_file',
    'run_command',
    'write_file',
  ])
  assert.equal(surface.resolvedToolSurface.toolSurfaceKind, 'openai_codex_local')
  assert.deepEqual(surface.resolvedToolSurface.toolExecutionMap, {
    delegate_tasks: 'delegate_to_agents',
  })
  assert.deepEqual(surface.resolvedToolSurface.toolSurfaceHiddenFamilies, [
    'file_mutation_extra',
  ])
})

test('runtime tool surface keeps hosted general OpenAI models on the provider-hosted bundle path', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    addomTools: buildTools(['fetch_page', 'read_file', 'write_file', 'run_command', 'list_curated_skills', 'install_curated_skill']),
    providerRuntimeSettings: {
      hostedToolsEnabled: true,
      enabledHostedTools: ['web_search', 'shell'],
    },
    vectorStoreIds: [],
    includeOpenAILocalRuntimeTools: true,
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
  })

  assert.equal(Boolean(surface.providerSurfaceTools.web_search), true)
  assert.equal(Boolean(surface.providerSurfaceTools.shell), true)
  assert.equal(surface.resolvedToolSurface.toolSurfaceKind, 'openai_hosted')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.write_file), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.fetch_page), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.list_curated_skills), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.install_curated_skill), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.web_search), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.run_command), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.shell), false)
  assert.deepEqual(surface.resolvedToolSurface.toolExecutionMap, { fetch_page: 'web_search', run_command: 'shell' })
  assert.equal(surface.resolvedToolSurface.toolIdentityMap.run_command.canonicalToolName, 'run_command')
  assert.equal(surface.resolvedToolSurface.toolIdentityMap.run_command.executionRuntime, 'provider_hosted')
  assert.equal(surface.resolvedToolSurface.toolIdentityMap.run_command.backendToolName, 'shell')
  assert.equal(surface.resolvedToolSurface.toolIdentityMap.fetch_page.canonicalToolName, 'fetch_page')
  assert.equal(surface.resolvedToolSurface.toolIdentityMap.fetch_page.executionRuntime, 'provider_hosted')
  assert.equal(surface.resolvedToolSurface.toolIdentityMap.fetch_page.backendToolName, 'web_search')
})

test('runtime tool surface hides apply_patch under catalog-first budget unless explicitly requested', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    mode: 'execute',
    userMessage: 'Fix the handler and update the implementation.',
    addomTools: buildTools(['read_file', 'apply_patch', 'write_file', 'edit_file']),
    providerRuntimeSettings: {
      hostedToolsEnabled: true,
      enabledHostedTools: ['web_search'],
    },
    vectorStoreIds: [],
    includeOpenAILocalRuntimeTools: true,
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
  })

  assert.equal(surface.resolvedToolSurface.shadowIntent.intent, 'targeted_edit')
  assert.equal(surface.resolvedToolSurface.toolReliabilityProfile.patchExposure, 'normal')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.apply_patch), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.edit_file), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.write_file), true)
  assert.equal(
    surface.resolvedToolSurface.excludedToolsWithReasons.some((row) => row.toolName === 'apply_patch' && row.reason === 'excluded_due_to_catalog_first_prompt_budget'),
    true,
  )
})

test('runtime tool surface can force command turns fully tool-free even for hosted OpenAI models', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    addomTools: buildTools(['read_file', 'write_file', 'run_command']),
    disableAllTools: true,
    providerRuntimeSettings: {
      hostedToolsEnabled: true,
      enabledHostedTools: ['web_search', 'shell'],
    },
    vectorStoreIds: ['vs_123'],
    includeOpenAILocalRuntimeTools: true,
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
  })

  assert.deepEqual(surface.providerSurfaceTools, {})
  assert.deepEqual(surface.resolvedToolSurface.tools, {})
  assert.equal(surface.resolvedToolSurface.toolSurfaceKind, 'none')
  assert.deepEqual(surface.openaiHostedToolIds, [])
  assert.equal(surface.providerToolExecutionContext, null)
})

test('runtime tool surface scopes provider runtime settings maps before building OpenAI hosted tools', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    addomTools: buildTools(['read_file']),
    providerRuntimeSettings: {
      openai: {
        hostedToolsEnabled: true,
        enabledHostedTools: ['web_search', 'shell'],
      },
      gemini: {
        hostedToolsEnabled: true,
        enabledHostedTools: ['code_execution'],
      },
    },
    vectorStoreIds: [],
    includeOpenAILocalRuntimeTools: true,
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
  })

  assert.deepEqual(surface.openaiHostedToolIds, ['web_search', 'shell'])
  assert.equal(Boolean(surface.providerSurfaceTools.web_search), true)
  assert.equal(Boolean(surface.providerSurfaceTools.shell), true)
})

test('runtime tool surface keeps local curated-skill tools hidden until skill intent activates them', async () => {
  const input = {
    providerId: 'openai',
    modelId: 'gpt-5.4',
    addomTools: buildTools(['fetch_page', 'read_file', 'run_command', 'list_curated_skills', 'install_curated_skill']),
    providerRuntimeSettings: {
      openai: {
        hostedToolsEnabled: true,
        enabledHostedTools: ['web_search', 'file_search', 'mcp', 'shell'],
      },
    },
    vectorStoreIds: [],
  }

  const apiKeySurface = await resolveRuntimeToolSurface({
    ...input,
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4', { authMethod: 'api_key' }),
  })
  const accountSurface = await resolveRuntimeToolSurface({
    ...input,
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4', { authMethod: 'account' }),
  })

  assert.deepEqual(accountSurface.openaiHostedToolIds.sort(), apiKeySurface.openaiHostedToolIds.sort())
  assert.deepEqual(
    accountSurface.openaiDefaultSupportedToolIds.sort(),
    apiKeySurface.openaiDefaultSupportedToolIds.sort(),
  )
  assert.deepEqual(accountSurface.openaiExcludedToolReasons, apiKeySurface.openaiExcludedToolReasons)
  assert.deepEqual(
    accountSurface.notices.map((row) => row.meta),
    apiKeySurface.notices.map((row) => row.meta),
  )
  assert.equal(Boolean(apiKeySurface.resolvedToolSurface.tools.list_curated_skills), false)
  assert.equal(Boolean(apiKeySurface.resolvedToolSurface.tools.install_curated_skill), false)
  assert.equal(Boolean(accountSurface.resolvedToolSurface.tools.list_curated_skills), false)
  assert.equal(Boolean(accountSurface.resolvedToolSurface.tools.install_curated_skill), false)
  assert.deepEqual(
    Object.keys(accountSurface.resolvedToolSurface.tools).sort(),
    ['fetch_page', 'read_file', 'run_command'],
  )
})

test('runtime tool surface gives writable Codex-local MoA agents compact staged file tools by default', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.3-codex',
    addomTools: buildAgentTools(true),
    providerRuntimeSettings: {
      hostedToolsEnabled: true,
      enabledHostedTools: ['web_search', 'apply_patch', 'shell'],
    },
    vectorStoreIds: ['vs_123'],
    includeOpenAILocalRuntimeTools: false,
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.3-codex'),
  })

  assert.deepEqual(Object.keys(surface.providerSurfaceTools), [])
  assert.deepEqual(Object.keys(surface.resolvedToolSurface.tools).sort(), [
    'list_directory',
    'plan_read',
    'plan_update',
    'read_file',
    'search_code',
    'write_file',
  ])
  assert.equal(Boolean(surface.resolvedToolSurface.tools.write_file), true)
  assert.equal(surface.resolvedToolSurface.toolSurfaceKind, 'openai_codex_local')
})

test('runtime tool surface keeps compact semantic delegation visible for ambiguous turns', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    mode: 'execute',
    userMessage: 'Help with this task.',
    addomTools: buildTools([
      'read_file',
      'delegate_to_agents',
      'delegate_tasks',
    ]),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
  })

  assert.equal(surface.resolvedToolSurface.shadowIntent.intent, 'mixed')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_to_agents), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_tasks), true)
  assert.deepEqual(surface.resolvedToolSurface.toolExecutionMap, {
    delegate_tasks: 'delegate_to_agents',
  })
  assert.deepEqual(surface.resolvedToolSurface.toolSurfaceHiddenFamilies, [])
})

test('runtime tool surface keeps compact delegation visible when natural agent phrasing misses the shadow classifier', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.6-luna',
    mode: 'execute',
    userMessage: 'Run any agent, read only, to verify the files in the repo.',
    addomTools: toAISDKTools('ask', true),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.6-luna', { authMethod: 'account' }),
  })

  assert.equal(surface.resolvedToolSurface.shadowIntent.intent, 'mixed')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_tasks), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_to_agents), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.agent_catalog), true)
  assert.equal(surface.resolvedToolSurface.toolExecutionMap.delegate_tasks, 'delegate_to_agents')
})

test('runtime tool surface normalizes account auth auto delegation to the canonical ADDOM backend without hiding delegation entry points', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    mode: 'execute',
    userMessage: 'Use one agent if helpful.',
    addomTools: buildTools([
      'read_file',
      'delegate_to_agents',
      'delegate_tasks',
    ]),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4', { authMethod: 'account' }),
    providerRuntimeSettings: {
      openai: {
        delegationBackendPreference: 'auto',
        nativeCollaborationModeId: 'default',
      },
    },
  })

  assert.equal(surface.resolvedToolSurface.delegationBackend, 'addom_moa')
  assert.deepEqual(surface.resolvedToolSurface.delegationBackends.sort(), ['addom_moa', 'openai_native'])
  assert.equal(surface.resolvedToolSurface.delegationBackendPreference, 'auto')
  assert.equal(surface.resolvedToolSurface.delegationBackendReason, 'capability_default')
  assert.equal(surface.resolvedToolSurface.canonicalDelegationBackend, 'addom_moa')
  assert.equal(surface.resolvedToolSurface.nativeCollaborationBackend, 'openai_native')
  assert.equal(surface.resolvedToolSurface.delegationEntryPointPolicy, 'canonical_addom_delegation_entry_points')
  assert.equal(surface.resolvedToolSurface.delegationBackendSelectionSeparatedFromVisibility, true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_to_agents), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_tasks), true)
  assert.equal(
    surface.resolvedToolSurface.excludedToolsWithReasons.some((row) => row.toolName === 'delegate_to_agents' && row.reason === 'excluded_due_to_openai_native_delegation_backend'),
    false,
  )
})

test('runtime tool surface keeps addom command, web, and file tools for account auth when no provider overlap is exposed', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    addomTools: buildTools(['read_file', 'fetch_page', 'run_command', 'write_file', 'edit_file', 'apply_patch']),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4', { authMethod: 'account' }),
  })

  assert.deepEqual(surface.providerSurfaceTools, {})
  assert.equal(surface.resolvedToolSurface.toolSurfaceKind, 'openai_codex_app_server')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.read_file), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.fetch_page), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.run_command), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.write_file), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.edit_file), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.apply_patch), false)
  assert.equal(
    surface.resolvedToolSurface.excludedToolsWithReasons.some((row) => row.toolName === 'apply_patch' && row.reason === 'excluded_due_to_catalog_first_prompt_budget'),
    true,
  )
})

test('runtime tool surface keeps question_user available on account auth once the bridge exists', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    addomTools: buildTools(['read_file', 'question_user']),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4', { authMethod: 'account' }),
  })

  assert.equal(surface.resolvedToolSurface.toolSurfaceKind, 'openai_codex_app_server')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.read_file), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.question_user), true)
  assert.equal(surface.resolvedToolSurface.excludedToolsWithReasons.some((row) => row.toolName === 'question_user'), false)
})

test('runtime tool surface keeps ADDOM delegation backend metadata separate from default visibility', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    mode: 'execute',
    userMessage: 'Split this into research and implementation.',
    addomTools: buildTools([
      'read_file',
      'delegate_to_agents',
      'delegate_tasks',
    ]),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4', { authMethod: 'account' }),
    providerRuntimeSettings: {
      openai: {
        delegationBackendPreference: 'auto',
        nativeCollaborationModeId: '',
      },
    },
  })

  assert.equal(surface.resolvedToolSurface.delegationBackend, 'addom_moa')
  assert.equal(surface.resolvedToolSurface.delegationBackendReason, 'capability_default')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_to_agents), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_tasks), true)
})

test('runtime tool surface keeps canonical delegation entry points visible when account auth explicitly selects native collaboration', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    mode: 'execute',
    userMessage: 'Use one agent if helpful.',
    addomTools: buildTools([
      'read_file',
      'delegate_to_agents',
      'delegate_tasks',
    ]),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4', { authMethod: 'account' }),
    providerRuntimeSettings: {
      openai: {
        delegationBackendPreference: 'openai_native',
        nativeCollaborationModeId: 'default',
      },
    },
  })

  assert.equal(surface.resolvedToolSurface.delegationBackend, 'openai_native')
  assert.equal(surface.resolvedToolSurface.delegationBackendReason, 'runtime_preference')
  assert.equal(surface.resolvedToolSurface.canonicalDelegationBackend, 'addom_moa')
  assert.equal(surface.resolvedToolSurface.nativeCollaborationBackend, 'openai_native')
  assert.equal(surface.resolvedToolSurface.delegationEntryPointPolicy, 'canonical_addom_delegation_entry_points')
  assert.equal(surface.resolvedToolSurface.delegationBackendSelectionSeparatedFromVisibility, true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_to_agents), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_tasks), true)
  assert.equal(
    surface.resolvedToolSurface.excludedToolsWithReasons.some((row) => row.toolName === 'delegate_to_agents' && row.reason === 'excluded_due_to_openai_native_delegation_backend'),
    false,
  )
})

test('runtime tool surface honors explicit addom MoA backend preference without forcing visibility', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    mode: 'execute',
    userMessage: 'Help with this task.',
    addomTools: buildTools([
      'read_file',
      'delegate_to_agents',
      'delegate_tasks',
    ]),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4', { authMethod: 'account' }),
    providerRuntimeSettings: {
      openai: {
        delegationBackendPreference: 'addom_moa',
      },
    },
  })

  assert.equal(surface.resolvedToolSurface.delegationBackend, 'addom_moa')
  assert.equal(surface.resolvedToolSurface.delegationBackendPreference, 'addom_moa')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_tasks), true)
  assert.deepEqual(surface.resolvedToolSurface.toolExecutionMap, {
    delegate_tasks: 'delegate_to_agents',
  })
})

test('runtime tool surface keeps parallel semantic delegation on the compact dispatcher', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    mode: 'execute',
    userMessage: 'Split this into parallel subagents and fan out the work.',
    addomTools: buildTools([
      'read_file',
      'delegate_to_agents',
      'delegate_tasks',
    ]),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
  })

  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_to_agents), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_tasks), true)
  assert.deepEqual(surface.resolvedToolSurface.toolExecutionMap, {
    delegate_tasks: 'delegate_to_agents',
  })
})

test('runtime tool surface keeps explicit role delegation on the universal dispatcher', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.6-luna',
    mode: 'execute',
    userMessage: [
      'Call delegate_to_agents exactly once.',
      'Ask the agent to perform a read-only check.',
      'Do not edit files.',
    ].join(' '),
    addomTools: buildTools([
      'read_file',
      'write_file',
      'edit_file',
      'delegate_to_agents',
      'delegate_tasks',
    ]),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.6-luna', { authMethod: 'account' }),
  })

  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_to_agents), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_tasks), true)
})

test('runtime tool surface keeps delegation hidden for broad continuation without explicit agent intent', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    mode: 'execute',
    userMessage: 'Continue with the remaining implementation tasks.',
    addomTools: buildTools([
      'read_file',
      'delegate_to_agents',
      'delegate_tasks',
    ]),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
  })

  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_to_agents), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_tasks), true)
})

test('runtime tool surface keeps core write and shell tools visible for exploration turns', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    mode: 'execute',
    userMessage: 'Explain the auth flow and inspect the related files.',
    addomTools: buildTools([
      'read_file',
      'search_code',
      'write_file',
      'edit_file',
      'run_command',
      'delegate_tasks',
    ]),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
  })

  assert.equal(surface.resolvedToolSurface.shadowIntent.intent, 'exploration_only')
  assert.equal(surface.resolvedToolSurface.shadowIntent.confidence, 'medium')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.read_file), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.search_code), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.write_file), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.edit_file), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.run_command), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_tasks), true)
})

test('runtime tool surface keeps core tools visible for vague continuation prompts', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    mode: 'execute',
    userMessage: 'Continue work and implement that phase.',
    addomTools: buildTools([
      'read_file',
      'search_code',
      'write_file',
      'edit_file',
      'run_command',
      'apply_patch',
    ]),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
  })

  assert.equal(surface.resolvedToolSurface.shadowIntent.intent, 'targeted_edit')
  assert.equal(surface.resolvedToolSurface.shadowIntent.confidence, 'medium')
  assert.equal(surface.resolvedToolSurface.toolReliabilityProfile.patchExposure, 'restricted')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.read_file), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.write_file), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.edit_file), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.run_command), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.apply_patch), false)
})

test('runtime tool surface keeps write tools visible for live-session debugging turns', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    mode: 'execute',
    userMessage: "Inspect the live session and debug why the model says it doesn't have file write tools to use.",
    addomTools: buildTools([
      'read_file',
      'search_code',
      'write_file',
      'edit_file',
      'apply_patch',
      'run_command',
    ]),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
  })

  assert.equal(surface.resolvedToolSurface.shadowIntent.intent, 'targeted_edit')
  assert.equal(surface.resolvedToolSurface.toolReliabilityProfile.patchExposure, 'restricted')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.read_file), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.write_file), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.edit_file), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.apply_patch), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.run_command), true)
})

test('runtime tool surface keeps curated OpenRouter ADDOM-native routes on safer write paths', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openrouter',
    modelId: 'openai/gpt-5.1-codex-max',
    mode: 'execute',
    userMessage: 'Fix the failing handler in this file.',
    addomTools: buildTools([
      'read_file',
      'search_code',
      'write_file',
      'edit_file',
      'apply_patch',
      'run_command',
    ]),
    adapterProfile: resolveProviderModelAdapter('openrouter', 'openai/gpt-5.1-codex-max'),
  })

  assert.equal(surface.resolvedToolSurface.toolSurfaceKind, 'addom_native')
  assert.equal(surface.resolvedToolSurface.toolReliabilityProfile.profileId, 'curated_addom_native')
  assert.equal(surface.resolvedToolSurface.toolReliabilityProfile.patchExposure, 'restricted')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.edit_file), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.write_file), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.apply_patch), false)
})

test('runtime tool surface preserves apply_patch when the user explicitly asks for it on a restricted route', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openrouter',
    modelId: 'openai/gpt-5.1-codex-max',
    mode: 'execute',
    userMessage: 'Using apply_patch, edit one of the files of the repo.',
    addomTools: buildTools([
      'read_file',
      'search_code',
      'write_file',
      'edit_file',
      'apply_patch',
      'run_command',
    ]),
    adapterProfile: resolveProviderModelAdapter('openrouter', 'openai/gpt-5.1-codex-max'),
  })

  assert.equal(surface.resolvedToolSurface.toolSurfaceKind, 'addom_native')
  assert.equal(surface.resolvedToolSurface.toolReliabilityProfile.patchExposure, 'restricted')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.apply_patch), true)
  assert.equal(
    surface.resolvedToolSurface.excludedToolsWithReasons.some((row) => row.toolName === 'apply_patch' && row.reason === 'excluded_due_to_reliability_weighted_patch_gating'),
    false,
  )
})
test('runtime tool surface narrows high-confidence web research turns to fetch without browser or delegation overlap', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    mode: 'execute',
    userMessage: 'Look up the latest React docs for suspense boundaries.',
    addomTools: buildTools([
      'fetch_page',
      'browser_action',
      'delegate_tasks',
    ]),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
  })

  assert.equal(surface.resolvedToolSurface.shadowIntent.intent, 'web_research')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.fetch_page), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.browser_action), false)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_tasks), true)
})

test('runtime tool surface narrows high-confidence browser turns to browser_action', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    mode: 'execute',
    userMessage: 'Open the localhost app, click login, and capture the result.',
    addomTools: buildTools([
      'fetch_page',
      'browser_action',
      'delegate_tasks',
    ]),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
  })

  assert.equal(surface.resolvedToolSurface.shadowIntent.intent, 'browser_interaction')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.browser_action), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.fetch_page), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_tasks), true)
})

test('runtime tool surface restores activated catalog families before identity maps are built', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openrouter',
    modelId: 'openai/gpt-5.1-codex-max',
    mode: 'execute',
    userMessage: 'Inspect this project.',
    addomTools: buildTools([
      'read_file',
      'search_code',
      'fetch_page',
      'browser_action',
    ]),
    adapterProfile: resolveProviderModelAdapter('openrouter', 'openai/gpt-5.1-codex-max'),
    toolSurfaceActivations: [
      activateToolSurfaceCapability(null, {
        capabilityId: 'builtins.browser',
        reason: TOOL_SURFACE_ACTIVATION_REASON.CATALOG_READ,
      }),
    ],
  })

  assert.equal(Boolean(surface.resolvedToolSurface.tools.browser_action), true)
  assert.equal(surface.resolvedToolSurface.toolIdentityMap.browser_action.family, 'browser')
  assert.equal(surface.resolvedToolSurface.toolIdentityMap.browser_action.executionRuntime, 'addom_native')
  assert.deepEqual(surface.resolvedToolSurface.toolSurfaceActivatedCapabilities, ['builtins.browser'])
  assert.deepEqual(surface.resolvedToolSurface.toolSurfaceActivationIncludedTools, ['browser_action'])
})

test('runtime tool surface activation visibility does not bypass provider execution routing', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'openai',
    modelId: 'gpt-5.4',
    mode: 'execute',
    userMessage: 'Use delegated review.',
    addomTools: buildTools([
      'read_file',
      'delegate_to_agents',
      'delegate_tasks',
    ]),
    adapterProfile: resolveProviderModelAdapter('openai', 'gpt-5.4'),
    toolSurfaceActivations: [
      activateToolSurfaceCapability(null, {
        capabilityId: 'builtins.delegation',
        reason: TOOL_SURFACE_ACTIVATION_REASON.EXPLICIT_REQUEST,
      }),
    ],
  })

  assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_tasks), true)
  assert.equal(surface.resolvedToolSurface.toolExecutionMap.delegate_tasks, 'delegate_to_agents')
  assert.equal(surface.resolvedToolSurface.toolIdentityMap.delegate_tasks.backendToolName, 'delegate_to_agents')
})

test('runtime tool surface builds a Moonshot Formula bundle from the provider-native runtime descriptor', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'moonshot',
    modelId: 'kimi-k2.6',
    apiKey: 'moonshot-secret',
    addomTools: buildTools(['fetch_page', 'read_file', 'run_command']),
    providerRuntimeSettings: {
      moonshot: {
        remoteToolsEnabled: true,
        enabledFormulaUris: ['moonshot/web-search:latest'],
      },
    },
    adapterProfile: resolveProviderModelAdapter('moonshot', 'kimi-k2.6'),
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        tools: [{
          type: 'function',
          function: {
            name: 'search',
            description: 'Search the web',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
              required: ['query'],
            },
          },
        }],
      }),
    }),
  })

  assert.equal(Boolean(surface.providerSurfaceTools.moonshot_formula__web_search__search), true)
  assert.equal(surface.resolvedToolSurface.toolSurfaceKind, 'moonshot_formula')
  assert.equal(surface.providerToolExecutionContext?.family, 'moonshot_formula')
  assert.equal(Boolean(surface.resolvedToolSurface.tools.fetch_page), true)
  assert.equal(Boolean(surface.resolvedToolSurface.tools.moonshot_formula__web_search__search), false)
  assert.deepEqual(surface.resolvedToolSurface.toolExecutionMap, { fetch_page: 'moonshot_formula__web_search__search' })
  assert.equal(
    surface.resolvedToolSurface.toolIdentityMap.fetch_page.canonicalToolName,
    'fetch_page',
  )
  assert.equal(surface.resolvedToolSurface.toolIdentityMap.fetch_page.executionRuntime, 'provider_native')
  assert.equal(surface.resolvedToolSurface.toolIdentityMap.fetch_page.backendToolName, 'moonshot_formula__web_search__search')
  assert.equal(
    surface.providerToolExecutionContext?.toolMap?.get('moonshot_formula__web_search__search')?.formulaUri,
    'moonshot/web-search:latest',
  )
})

test('runtime tool surface follows explicit adapter surface mode instead of family-specific bundle branching', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'moonshot',
    modelId: 'kimi-k2.6',
    apiKey: 'moonshot-secret',
    addomTools: buildTools(['read_file']),
    providerRuntimeSettings: {
      moonshot: {
        remoteToolsEnabled: true,
        enabledFormulaUris: ['moonshot/web-search:latest'],
      },
    },
    adapterProfile: {
      ...resolveProviderModelAdapter('moonshot', 'kimi-k2.6'),
      toolFamily: 'custom_remote_bundle',
      providerNativeRuntime: {
        supported: true,
        family: 'moonshot_formula',
        surfaces: ['formula'],
        mode: 'remote_tool_bundle',
      },
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        tools: [{
          type: 'function',
          function: {
            name: 'search',
            description: 'Search the web',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string' },
              },
              required: ['query'],
            },
          },
        }],
      }),
    }),
  })

  assert.equal(Boolean(surface.providerSurfaceTools.moonshot_formula__web_search__search), true)
  assert.equal(surface.providerToolExecutionContext?.family, 'moonshot_formula')
  assert.equal(surface.resolvedToolSurface.toolSurfaceKind, 'custom_remote_bundle')
})

test('runtime tool surface can force command turns tool-free even for provider-native remote bundles', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'moonshot',
    modelId: 'kimi-k2.6',
    apiKey: 'moonshot-secret',
    addomTools: buildTools(['read_file', 'run_command']),
    disableAllTools: true,
    providerRuntimeSettings: {
      moonshot: {
        remoteToolsEnabled: true,
        enabledFormulaUris: ['moonshot/web-search:latest'],
      },
    },
    adapterProfile: resolveProviderModelAdapter('moonshot', 'kimi-k2.6'),
    fetchImpl: async () => {
      throw new Error('provider bundle fetch should be skipped when tools are disabled')
    },
  })

  assert.deepEqual(surface.providerSurfaceTools, {})
  assert.deepEqual(surface.resolvedToolSurface.tools, {})
  assert.equal(surface.resolvedToolSurface.toolSurfaceKind, 'none')
  assert.equal(surface.providerToolExecutionContext, null)
})

test('runtime tool surface keeps Perplexity on explicit provider-owned search semantics without building provider tools', async () => {
  const surface = await resolveRuntimeToolSurface({
    providerId: 'perplexity',
    modelId: 'sonar-pro',
    addomTools: buildTools(['read_file', 'run_command']),
    providerRuntimeSettings: {
      perplexity: {
        return_images: true,
      },
    },
    adapterProfile: resolveProviderModelAdapter('perplexity', 'sonar-pro'),
  })

  assert.deepEqual(Object.keys(surface.providerSurfaceTools), [])
  assert.equal(surface.providerToolExecutionContext, null)
  assert.deepEqual(Object.keys(surface.resolvedToolSurface.tools).sort(), [
    'read_file',
    'run_command',
  ])
  assert.equal(surface.resolvedToolSurface.toolSurfaceKind, 'perplexity_search')
  assert.deepEqual(surface.resolvedToolSurface.toolSurfaceComponents, ['perplexity_search'])
})

test('runtime tool surface keeps fresh generic schema budgets under the catalog-first target', async () => {
  const addomTools = toAISDKTools('ask', true)
  const rows = [
    ['openai', 'gpt-5.4'],
    ['openrouter', 'openai/gpt-5.1-codex-max'],
    ['ollama', 'qwen2.5-coder:latest'],
    ['groq', 'llama-4-maverick'],
  ]

  for (const [providerId, modelId] of rows) {
    const surface = await resolveRuntimeToolSurface({
      providerId,
      modelId,
      mode: 'execute',
      userMessage: 'Inspect this codebase.',
      addomTools,
      adapterProfile: resolveProviderModelAdapter(providerId, modelId),
    })
    const schemaChars = JSON.stringify(surface.resolvedToolSurface.tools).length
    const roughSchemaTokens = Math.ceil(schemaChars / 4)
    assert.equal(Boolean(surface.resolvedToolSurface.tools.git_status), true, `${providerId} keeps git_status`)
    assert.equal(Boolean(surface.resolvedToolSurface.tools.read_file), true, `${providerId} keeps read_file`)
    assert.equal(Boolean(surface.resolvedToolSurface.tools.search_code), true, `${providerId} keeps search_code`)
    assert.equal(Boolean(surface.resolvedToolSurface.tools.browser_action), false, `${providerId} hides browser schema`)
    assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_tasks), true, `${providerId} keeps compact delegation`)
    assert.equal(Boolean(surface.resolvedToolSurface.tools.delegate_to_agents), false, `${providerId} hides raw delegation schema`)
    assert.ok(roughSchemaTokens <= 5_000, `${providerId}/${modelId} rough schema tokens ${roughSchemaTokens}`)
  }
})
