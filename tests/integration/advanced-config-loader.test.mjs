import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse as parseToml } from 'smol-toml'

import { validateAdvancedConfigTomlObject } from '../../src/main/advanced-config-schema.mjs'

function makeUserData() {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-advanced-config-'))
  process.env.ADDOM_USER_DATA_PATH = userDataPath
  return userDataPath
}

async function importAdvancedConfig(tag) {
  const url = pathToFileURL(path.resolve('src/main/advanced-config.mjs')).href
  return await import(`${url}?${tag}-${Date.now()}-${Math.random()}`)
}

test('shipped advanced example stays aligned with the strict schema', () => {
  const exampleToml = fs.readFileSync(path.resolve('build/advanced/advanced.example.toml'), 'utf8')
  const parsed = parseToml(exampleToml)
  const result = validateAdvancedConfigTomlObject(parsed)

  assert.deepEqual(result.errors, [])
})

test('advanced config bootstrap creates a commented default file without producing an overlay', async () => {
  const userDataPath = makeUserData()
  try {
    const advanced = await importAdvancedConfig('bootstrap')
    const result = advanced.getAdvancedConfig()
    const advancedTomlPath = path.join(userDataPath, 'advanced.toml')
    const diagnosticsPath = path.join(userDataPath, 'advanced-config-diagnostics.json')

    assert.equal(fs.existsSync(advancedTomlPath), true)
    assert.equal(fs.existsSync(diagnosticsPath), true)
    assert.equal(result.diagnostics.ok, true)
    assert.equal(result.diagnostics.status, 'created')
    assert.equal(result.diagnostics.created, true)
    assert.deepEqual(result.overlay, {})
    assert.match(fs.readFileSync(advancedTomlPath, 'utf8'), /\[providers\.openai\.runtime\]/)

    const persistedDiagnostics = JSON.parse(fs.readFileSync(diagnosticsPath, 'utf8'))
    assert.equal(persistedDiagnostics.status, 'created')
    assert.deepEqual(persistedDiagnostics.overlayKeys, [])
  } finally {
    try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('advanced config maps valid TOML snake_case keys to a camelCase overlay', async () => {
  const userDataPath = makeUserData()
  try {
    fs.writeFileSync(path.join(userDataPath, 'advanced.toml'), [
      '[runtime]',
      'live_execution_stream_enabled = false',
      '',
      '[memory]',
      'compression_threshold = 80',
      '',
      '[terminal]',
      'scrollback = 12000',
      '',
      '[command_safety.install_sandbox]',
      'enabled = true',
      'preferred_backend = "docker"',
      'network_enforcement_mode = "strict"',
      'cache_dirs = ["C:/cache/npm"]',
      '',
      '[providers.openai.runtime]',
      'transport_mode = "responses_stream"',
      'use_server_side_compaction = true',
      'server_side_compaction_threshold_tokens = 120000',
      'web_search_context_size = "high"',
      '',
      '[providers.openai.hosted_tools]',
      'enabled = true',
      'enabled_tools = ["web_search", "file_search"]',
      '',
      '[providers.anthropic.runtime]',
      'use_context_management_compaction = false',
      '',
      '[providers.moonshot.runtime]',
      'remote_tools_enabled = true',
      '',
      '[model_catalog.openrouter.filters]',
      'reviewed_only = true',
      '',
      '[agents]',
      'enabled = true',
      'default_profile = "high"',
      'fanout_confirmation_threshold = 12',
      'max_live_agents = 24',
      'max_depth = 6',
    ].join('\n'), 'utf8')

    const advanced = await importAdvancedConfig('valid')
    const result = advanced.getAdvancedConfig()

    assert.equal(result.diagnostics.ok, true)
    assert.equal(result.diagnostics.status, 'valid')
    assert.equal(result.overlay.liveExecutionStreamEnabled, false)
    assert.equal(result.overlay.memoryCompressionThreshold, 80)
    assert.equal(result.overlay.terminal.scrollback, 12000)
    assert.equal(result.overlay.commandSafety.installSandboxEnabled, true)
    assert.equal(result.overlay.commandSafety.preferredBackend, 'docker')
    assert.deepEqual(result.overlay.commandSafety.cacheDirs, ['C:/cache/npm'])
    assert.equal(result.overlay.providerRuntimeSettings.openai.transportMode, 'responses_stream')
    assert.equal(result.overlay.providerRuntimeSettings.openai.useServerSideCompaction, true)
    assert.deepEqual(result.overlay.providerRuntimeSettings.openai.enabledHostedTools, ['web_search', 'file_search'])
    assert.equal(result.overlay.providerRuntimeSettings.anthropic.useContextManagementCompaction, false)
    assert.equal(result.overlay.providerRuntimeSettings.moonshot.remoteToolsEnabled, true)
    assert.equal(result.overlay.modelCatalogVisibility.openrouter.filters.reviewedOnly, true)
    assert.equal(result.overlay.agentSettings.enabled, true)
    assert.equal(result.overlay.agentSettings.defaultProfile, 'high')
    assert.equal(result.overlay.agentSettings.fanoutConfirmationThreshold, 12)
    assert.equal(result.overlay.agentSettings.limits.maxLiveAgents, 24)
    assert.equal(result.overlay.agentSettings.limits.maxDepth, 6)
  } finally {
    try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('advanced config rejects unknown keys and ignores the whole overlay', async () => {
  const userDataPath = makeUserData()
  try {
    fs.writeFileSync(path.join(userDataPath, 'advanced.toml'), [
      '[memory]',
      'compression_threshold = 80',
      'surprise_knob = true',
    ].join('\n'), 'utf8')

    const advanced = await importAdvancedConfig('unknown')
    const result = advanced.getAdvancedConfig()

    assert.equal(result.diagnostics.ok, false)
    assert.equal(result.diagnostics.status, 'invalid')
    assert.deepEqual(result.overlay, {})
    assert.ok(result.diagnostics.errors.some((error) => error.path === 'memory.surprise_knob' && error.code === 'unknown_key'))
    assert.ok(result.diagnostics.warnings.some((warning) => warning.code === 'overlay_ignored'))
  } finally {
    try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('advanced config rejects auth, consent, secret, destructive, and hard-bypass TOML keys', async () => {
  const userDataPath = makeUserData()
  try {
    fs.writeFileSync(path.join(userDataPath, 'advanced.toml'), [
      '[providers.openai.auth]',
      'auth_method = "account"',
      '',
      '[providers.openai.runtime]',
      'remote_data_warning_acknowledged_at = 123',
      'auth_secret_ref = "openai:mcp:docs"',
      '',
      '[providers.moonshot.runtime]',
      'remote_tool_warning_acknowledged_at = 123',
      '',
      '[command_safety]',
      'allow_global_system_installs = true',
      '',
      '[destructive_actions]',
      'delete_history = true',
      '',
      '[secrets]',
      'openai_api_key = "sk-nope"',
    ].join('\n'), 'utf8')

    const advanced = await importAdvancedConfig('rejected')
    const result = advanced.getAdvancedConfig()
    const rejectedPaths = result.diagnostics.errors
      .filter((error) => error.code === 'rejected_key')
      .map((error) => error.path)

    assert.equal(result.diagnostics.ok, false)
    assert.deepEqual(result.overlay, {})
    assert.ok(rejectedPaths.includes('providers.openai.auth.auth_method'))
    assert.ok(rejectedPaths.includes('providers.openai.runtime.remote_data_warning_acknowledged_at'))
    assert.ok(rejectedPaths.includes('providers.openai.runtime.auth_secret_ref'))
    assert.ok(rejectedPaths.includes('providers.moonshot.runtime.remote_tool_warning_acknowledged_at'))
    assert.ok(rejectedPaths.includes('command_safety.allow_global_system_installs'))
    assert.ok(rejectedPaths.includes('destructive_actions.delete_history'))
    assert.ok(rejectedPaths.includes('secrets.openai_api_key'))
  } finally {
    try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('advanced config reload is read-only and does not write effective values into settings.json', async () => {
  const userDataPath = makeUserData()
  try {
    const settingsPath = path.join(userDataPath, 'settings.json')
    fs.writeFileSync(settingsPath, JSON.stringify({ memoryCompressionThreshold: 35 }, null, 2), 'utf8')
    fs.writeFileSync(path.join(userDataPath, 'advanced.toml'), [
      '[memory]',
      'compression_threshold = 90',
    ].join('\n'), 'utf8')

    const advanced = await importAdvancedConfig('readonly')
    const result = advanced.reloadAdvancedConfig()

    assert.equal(result.overlay.memoryCompressionThreshold, 90)
    assert.equal(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).memoryCompressionThreshold, 35)
  } finally {
    try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('advanced config IPC exposes diagnostics and reload without a write channel', async () => {
  const userDataPath = makeUserData()
  const handlers = new Map()
  const ipcMain = {
    handle(channel, handler) {
      handlers.set(channel, handler)
    },
  }
  try {
    fs.writeFileSync(path.join(userDataPath, 'advanced.toml'), [
      '[memory]',
      'compression_threshold = 75',
    ].join('\n'), 'utf8')
    globalThis.__ADDOM_TEST_ELECTRON__ = { ipcMain }

    const handlerUrl = pathToFileURL(path.resolve('src/main/ipc-handlers/advanced-config.mjs')).href
    const { registerAdvancedConfigHandlers } = await import(`${handlerUrl}?ipc-${Date.now()}-${Math.random()}`)
    registerAdvancedConfigHandlers()

    assert.equal(handlers.has('v1:advanced-config:get-diagnostics'), true)
    assert.equal(handlers.has('v1:advanced-config:reload'), true)
    assert.equal(handlers.has('v1:advanced-config:security-warning'), true)
    assert.equal([...handlers.keys()].some((channel) => channel.includes(':set')), false)

    const diagnostics = handlers.get('v1:advanced-config:get-diagnostics')()
    const reloaded = handlers.get('v1:advanced-config:reload')()

    assert.equal(diagnostics.ok, true)
    assert.equal(reloaded.ok, true)
    assert.ok(reloaded.overlayKeys.includes('memoryCompressionThreshold'))
  } finally {
    try { delete globalThis.__ADDOM_TEST_ELECTRON__ } catch { /* best-effort test cleanup */ }
    try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})
