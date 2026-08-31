import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let buildActiveSettingsSections = null
let buildSettingsCategories = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/settings/SettingsPanelSections.jsx')
  buildActiveSettingsSections = mod?.buildActiveSettingsSections || null
  buildSettingsCategories = mod?.buildSettingsCategories || null
})

after(async () => {
  await closeViteSsrLoader()
})

function baseArgs(overrides = {}) {
  return {
    activeCategoryId: 'providers',
    providers: [],
    openaiRuntimeSettings: {
      hostedToolsEnabled: false,
      enabledHostedTools: [],
    },
    commandSafety: {
      installSandboxEnabled: false,
      showDeveloperOptions: false,
    },
    permissionMode: 'ask',
    ...overrides,
  }
}

test('settings providers section stays minimal', () => {
  assert.equal(typeof buildActiveSettingsSections, 'function')
  const sections = buildActiveSettingsSections(baseArgs({ activeCategoryId: 'providers' }))

  const ids = sections.map((section) => section.id)
  assert.deepEqual(ids, ['api-keys'])
})

test('settings providers section exposes Project knowledge only when advanced OpenAI file_search is enabled', () => {
  const sections = buildActiveSettingsSections(baseArgs({
    activeCategoryId: 'providers',
    openaiRuntimeSettings: {
      hostedToolsEnabled: true,
      enabledHostedTools: ['file_search'],
    },
  }))

  const ids = sections.map((section) => section.id)
  assert.deepEqual(ids, ['api-keys', 'openai-project-knowledge'])
})

test('settings categories keep unrelated controls out of General', () => {
  const sections = buildActiveSettingsSections(baseArgs({ activeCategoryId: 'general' }))
  const ids = sections.map((section) => section.id)
  assert.deepEqual(ids, [
    'instructions',
    'language',
    'updates',
    'about',
  ])
})

test('settings appearance, terminal, and agents categories preserve their existing controls', () => {
  assert.deepEqual(
    buildActiveSettingsSections(baseArgs({ activeCategoryId: 'appearance' })).map((section) => section.id),
    ['appearance-mode', 'background-tone', 'ui-scaling'],
  )
  assert.deepEqual(
    buildActiveSettingsSections(baseArgs({ activeCategoryId: 'terminal' })).map((section) => section.id),
    ['terminal'],
  )
  assert.deepEqual(
    buildActiveSettingsSections(baseArgs({ activeCategoryId: 'agents' })).map((section) => section.id),
    ['assistant-prompt', 'moa-agents'],
  )
})

test('settings shell exposes seven focused categories without dashboard badges', () => {
  const categories = buildSettingsCategories({
    projectFolder: '',
    updateStatus: null,
    providerRows: [],
    configuredProviderCount: 0,
    permissionMode: 'ask',
    commandSafety: {
      installSandboxEnabled: false,
      showDeveloperOptions: false,
    },
    memoryCompressionEnabled: true,
    memoryCompressionThreshold: 50,
    includeGlobalMemoryInContext: false,
    moaRoles: [],
    moaUserTier: 'basic',
    uiLocale: 'system',
    activeProjectId: '',
    activeThreadId: '',
    openaiRuntimeSettings: {
      hostedToolsEnabled: false,
      enabledHostedTools: [],
    },
  })

  assert.deepEqual(categories.map((row) => row.id), [
    'general',
    'appearance',
    'terminal',
    'agents',
    'providers',
    'tools_safety',
    'data_privacy',
  ])
  assert.deepEqual(categories.map((row) => row.label), [
    'General',
    'Appearance',
    'Terminal',
    'Agents',
    'Providers',
    'Safety',
    'Data',
  ])
  assert.ok(categories.every((row) => Array.isArray(row.badges) && row.badges.length === 0))
  assert.equal(categories.find((row) => row.id === 'general')?.sectionCount, 4)
})

test('settings safety section hides sandbox and developer diagnostics dashboards', () => {
  const toolSections = buildActiveSettingsSections(baseArgs({
    activeCategoryId: 'tools_safety',
    permissionMode: 'autonomy',
    commandSafety: {
      installSandboxEnabled: true,
      showDeveloperOptions: true,
    },
    permissionModeChangePending: false,
    handlePermissionModeChange: () => {},
    projectFolder: String.raw`C:\Users\example\Documents\ADDOM`,
    sandboxBackendStatus: { backend: 'docker', available: true, reason: '' },
    commandSafetyStartupProbe: null,
    sandboxStatusLoading: false,
    commandSafetyTelemetry: null,
    commandSafetyTelemetryLoading: false,
    refreshSandboxBackendStatus: () => {},
    refreshCommandSafetyTelemetry: () => {},
    handleApplyCommandSafetyTemplate: () => {},
    handleToggleShowDeveloperOptions: () => {},
  }))

  const toolIds = toolSections.map((section) => section.id)
  assert.deepEqual(toolIds, ['execution-mode', 'command-safety'])
})

test('settings category counts reflect the production safety surface', () => {
  assert.equal(typeof buildSettingsCategories, 'function')

  const categories = buildSettingsCategories({
    projectFolder: '',
    updateStatus: null,
    providerRows: [],
    configuredProviderCount: 0,
    permissionMode: 'ask',
    commandSafety: {
      installSandboxEnabled: false,
      showDeveloperOptions: false,
    },
    memoryCompressionEnabled: true,
    memoryCompressionThreshold: 50,
    includeGlobalMemoryInContext: false,
    moaRoles: [],
    moaUserTier: 'basic',
    activeProjectId: '',
    activeThreadId: '',
    openaiRuntimeSettings: {
      hostedToolsEnabled: false,
      enabledHostedTools: [],
    },
  })
  const tools = categories.find((row) => row.id === 'tools_safety')

  assert.equal(tools?.sectionCount, 2)
  assert.ok(Array.isArray(tools?.badges) && tools.badges.length === 0)
})

test('settings provider category count stays compact by default', () => {
  const categories = buildSettingsCategories({
    projectFolder: '',
    updateStatus: null,
    providerRows: [],
    configuredProviderCount: 0,
    permissionMode: 'ask',
    commandSafety: {
      installSandboxEnabled: false,
      showDeveloperOptions: false,
    },
    memoryCompressionEnabled: true,
    memoryCompressionThreshold: 50,
    includeGlobalMemoryInContext: false,
    moaRoles: [],
    moaUserTier: 'basic',
    activeProjectId: '',
    activeThreadId: '',
    openaiRuntimeSettings: {
      hostedToolsEnabled: false,
      enabledHostedTools: [],
    },
  })
  const providers = categories.find((row) => row.id === 'providers')

  assert.equal(providers?.sectionCount, 1)
  assert.ok(Array.isArray(providers?.badges) && providers.badges.length === 0)
})

test('settings provider category count grows when Project knowledge is enabled', () => {
  const categories = buildSettingsCategories({
    projectFolder: '',
    updateStatus: null,
    providerRows: [],
    configuredProviderCount: 0,
    permissionMode: 'ask',
    commandSafety: {
      installSandboxEnabled: false,
      showDeveloperOptions: false,
    },
    memoryCompressionEnabled: true,
    memoryCompressionThreshold: 50,
    includeGlobalMemoryInContext: false,
    moaRoles: [],
    moaUserTier: 'basic',
    activeProjectId: '',
    activeThreadId: '',
    openaiRuntimeSettings: {
      hostedToolsEnabled: true,
      enabledHostedTools: ['file_search'],
    },
  })
  const providers = categories.find((row) => row.id === 'providers')

  assert.equal(providers?.sectionCount, 2)
  assert.ok(Array.isArray(providers?.badges) && providers.badges.length === 0)
})
