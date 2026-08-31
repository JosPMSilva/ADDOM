import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-settings-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const {
  getSettings,
  setSettingsPatch,
} = await import('../../src/main/settings.mjs')

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('openai runtime settings default to a safe hosted-tools-off state', () => {
  const settings = getSettings()
  assert.equal(settings.providerAuthSettings?.openai?.authMethod, 'account')
  assert.equal(settings.providerAuthSettings?.cursor?.authMethod, 'account')
  assert.deepEqual(settings.providerRuntimeSettings?.openai, {
    transportMode: 'responses_auto',
    delegationBackendPreference: 'auto',
    nativeCollaborationModeId: '',
    websocketFallbackToStream: true,
    websocketWarmupEnabled: false,
    hostedToolsEnabled: false,
    enabledHostedTools: [],
    backgroundJobPersistenceEnabled: true,
    backgroundRecoveryMode: 'auto_resume',
    reasoningSummary: 'auto',
    reasoningEffort: 'provider_default',
    textVerbosity: 'provider_default',
    serviceTier: 'auto',
    promptCachingEnabled: true,
    promptCacheRetention: 'in_memory',
    continuityMode: 'local_first_hybrid',
    usePreviousResponseId: true,
    useConversationState: false,
    useResponseCompaction: false,
    useServerSideCompaction: false,
    serverSideCompactionThresholdTokens: 0,
    providerTruncationSoftTriggerPercent: 85,
    defaultMaxOutputTokensOverride: 0,
    toolResultBudgetCharsOverride: 0,
    oldToolResultPruningEnabled: true,
    promptPreflightHardGuardEnabled: true,
    codexAutoThreadCompactionEnabled: true,
    codexAutoThreadCompactionTokenLimit: 0,
    codexAutoThreadCompactionInstructions: '',
    serverSideCompactionBackgroundParity: true,
    allowPromptCompactionCommands: false,
    allowPromptCompactionThresholdOverride: false,
    enableBackgroundMode: false,
    webSearchContextSize: 'medium',
    webSearchApproximateLocationEnabled: false,
    fileHandlingMode: 'persistent_reusable',
    autoCreateProjectVectorStore: true,
    autoAttachProjectVectorStore: true,
    fileSearchMaxNumResults: 8,
    imageGenerationOutputFormat: 'webp',
    imageGenerationQuality: 'medium',
    remoteDataWarningAcknowledgedAt: 0,
    hostedToolConfig: {
      mcp: {
        servers: [],
      },
      shell: {
        environmentType: 'container_auto',
        networkPolicy: 'provider_default',
        memoryLimit: 'provider_default',
      },
      local_shell: {
        enabled: false,
        requireApproval: 'always',
        workingDirectoryPolicy: 'workspace_only',
        allowEnvironmentOverrides: false,
      },
      apply_patch: {
        enabled: false,
        requireApproval: 'always',
        workspaceOnly: true,
      },
    },
  })
})

test('openai runtime settings normalize hosted tools and preserve unrelated values', async () => {
  const first = await setSettingsPatch({
    permissionMode: 'autonomy',
    providerRuntimeSettings: {
      openai: {
        transportMode: 'RESPONSES_WEBSOCKET_EXPERIMENTAL',
        delegationBackendPreference: 'ADDOM_MOA',
        nativeCollaborationModeId: 'review_mode',
        websocketFallbackToStream: false,
        websocketWarmupEnabled: true,
        hostedToolsEnabled: true,
        enabledHostedTools: [
          'web_search',
          'WEB_SEARCH',
          'code_interpreter',
          'unsupported_tool',
          'image_generation',
        ],
        reasoningSummary: 'AUTO',
        reasoningEffort: 'MAX',
        textVerbosity: 'HIGH',
        serviceTier: 'priority',
        providerTruncationSoftTriggerPercent: '50',
        defaultMaxOutputTokensOverride: '12000',
        toolResultBudgetCharsOverride: '32000',
        oldToolResultPruningEnabled: false,
        promptPreflightHardGuardEnabled: false,
        codexAutoThreadCompactionEnabled: true,
        codexAutoThreadCompactionTokenLimit: '262144',
        codexAutoThreadCompactionInstructions: 'Keep the active plan intact.',
        promptCacheRetention: '24h',
        webSearchContextSize: 'HIGH',
        fileSearchMaxNumResults: '22',
        imageGenerationOutputFormat: 'PNG',
        imageGenerationQuality: 'HIGH',
        remoteDataWarningAcknowledgedAt: '5678',
      },
    },
  })

  assert.equal(first.permissionMode, 'autonomy')
  assert.deepEqual(first.providerRuntimeSettings.openai, {
    transportMode: 'responses_websocket_experimental',
    delegationBackendPreference: 'addom_moa',
    nativeCollaborationModeId: 'review_mode',
    websocketFallbackToStream: false,
    websocketWarmupEnabled: true,
    hostedToolsEnabled: true,
    enabledHostedTools: [
      'web_search',
      'code_interpreter',
      'image_generation',
    ],
    backgroundJobPersistenceEnabled: true,
    backgroundRecoveryMode: 'auto_resume',
    reasoningSummary: 'auto',
    reasoningEffort: 'max',
    textVerbosity: 'high',
    serviceTier: 'priority',
    promptCachingEnabled: true,
    promptCacheRetention: '24h',
    continuityMode: 'local_first_hybrid',
    usePreviousResponseId: true,
    useConversationState: false,
    useResponseCompaction: false,
    useServerSideCompaction: false,
    serverSideCompactionThresholdTokens: 0,
    providerTruncationSoftTriggerPercent: 50,
    defaultMaxOutputTokensOverride: 12_000,
    toolResultBudgetCharsOverride: 32_000,
    oldToolResultPruningEnabled: false,
    promptPreflightHardGuardEnabled: false,
    codexAutoThreadCompactionEnabled: true,
    codexAutoThreadCompactionTokenLimit: 262144,
    codexAutoThreadCompactionInstructions: 'Keep the active plan intact.',
    serverSideCompactionBackgroundParity: true,
    allowPromptCompactionCommands: false,
    allowPromptCompactionThresholdOverride: false,
    enableBackgroundMode: false,
    webSearchContextSize: 'high',
    webSearchApproximateLocationEnabled: false,
    fileHandlingMode: 'persistent_reusable',
    autoCreateProjectVectorStore: true,
    autoAttachProjectVectorStore: true,
    fileSearchMaxNumResults: 22,
    imageGenerationOutputFormat: 'png',
    imageGenerationQuality: 'high',
    remoteDataWarningAcknowledgedAt: 5678,
    hostedToolConfig: {
      mcp: {
        servers: [],
      },
      shell: {
        environmentType: 'container_auto',
        networkPolicy: 'provider_default',
        memoryLimit: 'provider_default',
      },
      local_shell: {
        enabled: false,
        requireApproval: 'always',
        workingDirectoryPolicy: 'workspace_only',
        allowEnvironmentOverrides: false,
      },
      apply_patch: {
        enabled: false,
        requireApproval: 'always',
        workspaceOnly: true,
      },
    },
  })

  const second = await setSettingsPatch({
    permissionMode: 'ask',
    providerRuntimeSettings: {
      openai: {
        enabledHostedTools: ['file_search', 'file_search'],
        serviceTier: 'invalid',
        providerTruncationSoftTriggerPercent: 0,
        defaultMaxOutputTokensOverride: -1,
        toolResultBudgetCharsOverride: 0,
        oldToolResultPruningEnabled: 'invalid',
        promptPreflightHardGuardEnabled: 'invalid',
        codexAutoThreadCompactionTokenLimit: 0,
      },
    },
  })

  assert.equal(second.permissionMode, 'ask')
  assert.equal(second.providerRuntimeSettings.openai.hostedToolsEnabled, true)
  assert.equal(second.providerRuntimeSettings.openai.transportMode, 'responses_websocket_experimental')
  assert.equal(second.providerRuntimeSettings.openai.delegationBackendPreference, 'addom_moa')
  assert.equal(second.providerRuntimeSettings.openai.nativeCollaborationModeId, 'review_mode')
  assert.equal(second.providerRuntimeSettings.openai.websocketFallbackToStream, false)
  assert.equal(second.providerRuntimeSettings.openai.websocketWarmupEnabled, true)
  assert.deepEqual(second.providerRuntimeSettings.openai.enabledHostedTools, ['file_search'])
  assert.equal(second.providerRuntimeSettings.openai.serviceTier, 'auto')
  assert.equal(second.providerRuntimeSettings.openai.providerTruncationSoftTriggerPercent, 85)
  assert.equal(second.providerRuntimeSettings.openai.defaultMaxOutputTokensOverride, 0)
  assert.equal(second.providerRuntimeSettings.openai.toolResultBudgetCharsOverride, 0)
  assert.equal(second.providerRuntimeSettings.openai.oldToolResultPruningEnabled, true)
  assert.equal(second.providerRuntimeSettings.openai.promptPreflightHardGuardEnabled, true)
  assert.equal(second.providerRuntimeSettings.openai.codexAutoThreadCompactionEnabled, true)
  assert.equal(second.providerRuntimeSettings.openai.codexAutoThreadCompactionTokenLimit, 0)
  assert.equal(second.providerRuntimeSettings.openai.codexAutoThreadCompactionInstructions, 'Keep the active plan intact.')
  assert.equal(second.providerRuntimeSettings.openai.allowPromptCompactionCommands, false)
  assert.equal(second.providerRuntimeSettings.openai.allowPromptCompactionThresholdOverride, false)
  assert.equal(second.providerRuntimeSettings.openai.remoteDataWarningAcknowledgedAt, 5678)
})

test('openai runtime settings accept auto transport mode and keep it as the default fallback', async () => {
  const next = await setSettingsPatch({
    providerRuntimeSettings: {
      openai: {
        transportMode: 'RESPONSES_AUTO',
      },
    },
  })

  assert.equal(next.providerRuntimeSettings.openai.transportMode, 'responses_auto')

  const fallback = await setSettingsPatch({
    providerRuntimeSettings: {
      openai: {
        transportMode: 'unknown_mode',
      },
    },
  })

  assert.equal(fallback.providerRuntimeSettings.openai.transportMode, 'responses_auto')

  const fallbackDelegationPreference = await setSettingsPatch({
    providerRuntimeSettings: {
      openai: {
        delegationBackendPreference: 'unsupported_backend',
      },
    },
  })

  assert.equal(fallbackDelegationPreference.providerRuntimeSettings.openai.delegationBackendPreference, 'auto')

  const normalizedNativeMode = await setSettingsPatch({
    providerRuntimeSettings: {
      openai: {
        nativeCollaborationModeId: '  plan_mode  ',
      },
    },
  })

  assert.equal(normalizedNativeMode.providerRuntimeSettings.openai.nativeCollaborationModeId, 'plan_mode')
})

test('openai background mode persists even when diagnostics visibility is off', async () => {
  const next = await setSettingsPatch({
    commandSafety: {
      showDeveloperOptions: false,
    },
    providerRuntimeSettings: {
      openai: {
        enableBackgroundMode: true,
      },
    },
  })

  assert.equal(next.commandSafety.showDeveloperOptions, false)
  assert.equal(next.providerRuntimeSettings.openai.enableBackgroundMode, true)
})

test('openai background mode also persists when diagnostics visibility is on', async () => {
  const next = await setSettingsPatch({
    commandSafety: {
      showDeveloperOptions: true,
    },
    providerRuntimeSettings: {
      openai: {
        enableBackgroundMode: true,
      },
    },
  })

  assert.equal(next.commandSafety.showDeveloperOptions, true)
  assert.equal(next.providerRuntimeSettings.openai.enableBackgroundMode, true)
})
