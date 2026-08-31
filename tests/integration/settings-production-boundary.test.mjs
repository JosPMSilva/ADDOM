import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-settings-production-boundary-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const settingsPath = path.join(userDataPath, 'settings.json')
const {
  getEffectiveSettingsDiagnostics,
  getSettings,
  getPersistedSettings,
  setSettingsPatch,
} = await import('../../src/main/settings.mjs')

const NORMAL_SETTINGS_PATHS = Object.freeze([
  'uiLocale',
  'permissionMode',
  'riskyActionPolicy',
  'chatMode',
  'systemPromptAppendix',
  'uiScaling.mode',
  'uiScaling.scale',
  'appearance.mode',
  'backgroundTone.tone',
  'chatTypography.scale',
  'terminal.fontSize',
  'terminal.fontFamily',
  'terminal.defaultShell',
  'terminal.defaultCwdBehavior',
  'terminal.copyOnSelection',
  'attachmentTextExtraction.enabled',
])

const ADVANCED_TOML_PATHS = Object.freeze([
  'memoryCompressionThreshold',
  'memoryCompressionCooldownMs',
  'includeGlobalMemoryInContext',
  'commandSafety.installSandboxEnabled',
  'commandSafety.preferredBackend',
  'commandSafety.sandboxNetworkEnforcementMode',
  'continuityPolicy.providerChainCompactionEnabled',
  'continuityPolicy.providerTruncationEnabled',
  'providerRuntimeSettings.openai.useServerSideCompaction',
  'providerRuntimeSettings.openai.codexAutoThreadCompactionEnabled',
  'providerRuntimeSettings.openai.codexAutoThreadCompactionTokenLimit',
  'providerRuntimeSettings.openai.allowPromptCompactionCommands',
  'providerRuntimeSettings.anthropic.useContextManagementCompaction',
  'providerRuntimeSettings.anthropic.contextManagementCompactionThresholdTokens',
  'providerRuntimeSettings.moonshot.remoteToolsEnabled',
  'moaPolicy.agentWriteAccessEnabled',
  'moaPolicy.maxTasksPerDelegation',
  'moaBudgetPolicy.highCostConfirmTokenThreshold',
  'moaBudgetPolicy.softUsdWarnThreshold',
  'attachmentTextExtraction.engine',
  'attachmentTextExtraction.maxCharsPerAttachment',
])

const NEVER_TOML_PATHS = Object.freeze([
  'providerAuthSettings.openai.authMethod',
  'providerTermsAcknowledgements',
  'providerRuntimeSettings.openai.remoteDataWarningAcknowledgedAt',
  'providerRuntimeSettings.moonshot.remoteToolWarningAcknowledgedAt',
])

const DEDICATED_STORE_CANDIDATE_PATHS = Object.freeze([
  'moaRoles',
  'customPipelines',
  'providerRuntimeSettings.openai.hostedToolConfig.mcp.servers',
])

function getPathValue(source, dottedPath) {
  return String(dottedPath || '')
    .split('.')
    .filter(Boolean)
    .reduce((current, key) => (current == null ? undefined : current[key]), source)
}

function collectDuplicates(groups) {
  const seen = new Set()
  const duplicates = new Set()
  for (const paths of groups) {
    for (const dottedPath of paths) {
      if (seen.has(dottedPath)) duplicates.add(dottedPath)
      seen.add(dottedPath)
    }
  }
  return [...duplicates]
}

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('settings production boundary catalog stays explicit and non-overlapping for phase 0', () => {
  const settings = getSettings()
  assert.equal(Object.prototype.hasOwnProperty.call(settings, 'moaEnabled'), false)
  const duplicates = collectDuplicates([
    NORMAL_SETTINGS_PATHS,
    ADVANCED_TOML_PATHS,
    NEVER_TOML_PATHS,
    DEDICATED_STORE_CANDIDATE_PATHS,
  ])

  assert.deepEqual(duplicates, [])

  for (const dottedPath of [
    ...NORMAL_SETTINGS_PATHS,
    ...ADVANCED_TOML_PATHS,
    ...NEVER_TOML_PATHS,
    ...DEDICATED_STORE_CANDIDATE_PATHS,
  ]) {
    assert.notEqual(
      getPathValue(settings, dottedPath),
      undefined,
      `Expected current settings shape to include ${dottedPath}`,
    )
  }
})

test('settings production boundary keeps auth choices and consent ledgers distinct from advanced runtime knobs', async () => {
  const next = await setSettingsPatch({
    providerAuthSettings: {
      openai: {
        authMethod: 'account',
      },
    },
    providerTermsAcknowledgements: {
      openai: {
        termsVersion: '2026-04-25',
        acceptedAt: 1_745_532_800_000,
        providerName: 'OpenAI',
      },
    },
    providerRuntimeSettings: {
      openai: {
        codexAutoThreadCompactionEnabled: true,
        remoteDataWarningAcknowledgedAt: 5678,
      },
      moonshot: {
        remoteToolsEnabled: true,
        remoteToolWarningAcknowledgedAt: 1234,
      },
    },
  })

  assert.equal(next.providerAuthSettings.openai.authMethod, 'account')
  assert.equal(next.providerTermsAcknowledgements.openai.termsVersion, '2026-04-25')
  assert.equal(next.providerRuntimeSettings.openai.codexAutoThreadCompactionEnabled, true)
  assert.equal(next.providerRuntimeSettings.openai.remoteDataWarningAcknowledgedAt, 5678)
  assert.equal(next.providerRuntimeSettings.moonshot.remoteToolsEnabled, true)
  assert.equal(next.providerRuntimeSettings.moonshot.remoteToolWarningAcknowledgedAt, 1234)

  const onDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  assert.equal(onDisk.providerAuthSettings.openai.authMethod, 'account')
  assert.equal(onDisk.providerTermsAcknowledgements.openai.termsVersion, '2026-04-25')
  assert.equal(onDisk.providerRuntimeSettings.openai.codexAutoThreadCompactionEnabled, true)
  assert.equal(onDisk.providerRuntimeSettings.openai.remoteDataWarningAcknowledgedAt, 5678)
  assert.equal(onDisk.providerRuntimeSettings.moonshot.remoteToolsEnabled, true)
  assert.equal(onDisk.providerRuntimeSettings.moonshot.remoteToolWarningAcknowledgedAt, 1234)
})

test('settings production boundary keeps roles but shadows custom pipelines by default', async () => {
  const next = await setSettingsPatch({
    moaRoles: [{
      id: 'role_docs',
      name: 'Docs Reviewer',
      providerId: 'openai',
      model: 'gpt-5.4',
      canWriteFiles: false,
    }],
    customPipelines: [{
      id: 'pipeline_docs',
      name: 'Docs Review',
      description: 'Review documentation changes.',
      steps: [{
        stepId: 'review',
        roleId: 'role_docs',
        instruction: 'Review the docs patch.',
        expected_output_format: 'Findings',
      }],
    }],
    providerRuntimeSettings: {
      openai: {
        hostedToolConfig: {
          mcp: {
            servers: [{
              id: 'docs_server',
              label: 'Docs Server',
              enabled: true,
              serverUrl: 'https://example.com/mcp',
              serverDescription: 'Docs MCP endpoint',
              allowedTools: ['search_docs'],
              requireApproval: 'always',
              authSecretRef: 'openai:mcp:docs_server',
            }],
          },
        },
      },
    },
  })

  assert.equal(next.moaRoles.length, 1)
  assert.equal(next.moaRoles[0].id, 'role_docs')
  assert.equal(next.customPipelines.length, 0)
  assert.equal(next.providerRuntimeSettings.openai.hostedToolConfig.mcp.servers.length, 1)
  assert.equal(next.providerRuntimeSettings.openai.hostedToolConfig.mcp.servers[0].authSecretRef, 'openai:mcp:docs_server')

  const onDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  assert.equal(onDisk.moaRoles.length, 1)
  assert.equal(onDisk.customPipelines.length, 0)
  assert.equal(onDisk.providerRuntimeSettings.openai.hostedToolConfig.mcp.servers.length, 1)
  assert.equal(onDisk.providerRuntimeSettings.openai.hostedToolConfig.mcp.servers[0].authSecretRef, 'openai:mcp:docs_server')
  assert.equal('bearerToken' in onDisk.providerRuntimeSettings.openai.hostedToolConfig.mcp.servers[0], false)
})

test('advanced.toml overlay changes effective settings without writing back to settings.json', async () => {
  await setSettingsPatch({
    memoryCompressionThreshold: 42,
    providerAuthSettings: {
      openai: {
        authMethod: 'account',
      },
    },
    providerRuntimeSettings: {
      openai: {
        useServerSideCompaction: false,
        hostedToolConfig: {
          mcp: {
            servers: [{
              id: 'overlay_safe_server',
              label: 'Overlay Safe Server',
              enabled: true,
              serverUrl: 'https://example.com/overlay-mcp',
              authSecretRef: 'openai:mcp:overlay_safe_server',
            }],
          },
        },
      },
    },
  })

  fs.writeFileSync(path.join(userDataPath, 'advanced.toml'), `
[memory]
compression_threshold = 88

[providers.openai.runtime]
use_server_side_compaction = true
`, 'utf8')

  const effective = getSettings()
  const persisted = getPersistedSettings()
  const diagnostics = getEffectiveSettingsDiagnostics()

  assert.equal(effective.memoryCompressionThreshold, 88)
  assert.equal(effective.providerRuntimeSettings.openai.useServerSideCompaction, true)
  assert.equal(effective.providerAuthSettings.openai.authMethod, 'account')
  assert.equal(effective.providerRuntimeSettings.openai.hostedToolConfig.mcp.servers[0].authSecretRef, 'openai:mcp:overlay_safe_server')

  assert.equal(persisted.memoryCompressionThreshold, 42)
  assert.equal(persisted.providerRuntimeSettings.openai.useServerSideCompaction, false)
  assert.equal(diagnostics.advancedOverlayApplied, true)
  assert.ok(diagnostics.shadowedSettingsJsonPaths.includes('memoryCompressionThreshold'))
  assert.ok(diagnostics.shadowedSettingsJsonPaths.includes('providerRuntimeSettings.openai.useServerSideCompaction'))

  const onDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  assert.equal(onDisk.memoryCompressionThreshold, 42)
  assert.equal(onDisk.providerRuntimeSettings.openai.useServerSideCompaction, false)
})
