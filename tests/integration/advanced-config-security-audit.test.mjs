import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

function makeUserData() {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-advanced-config-audit-'))
  process.env.ADDOM_USER_DATA_PATH = userDataPath
  return userDataPath
}

async function importAdvancedModules(tag) {
  const advancedUrl = pathToFileURL(path.resolve('src/main/advanced-config.mjs')).href
  const auditUrl = pathToFileURL(path.resolve('src/main/advanced-config-security-audit.mjs')).href
  return {
    advanced: await import(`${advancedUrl}?${tag}-${Date.now()}-${Math.random()}`),
    audit: await import(auditUrl),
  }
}

test('advanced config writes a separate security audit for safety-sensitive overlay keys', async () => {
  const userDataPath = makeUserData()
  try {
    fs.writeFileSync(path.join(userDataPath, 'advanced.toml'), [
      '[command_safety.install_sandbox]',
      'enabled = true',
      'preferred_backend = "docker"',
      '',
      '[providers.openai.hosted_tools]',
      'enabled = true',
      'enabled_tools = ["web_search"]',
      '',
      '[providers.moonshot.runtime]',
      'remote_tools_enabled = true',
      '',
      '[agents]',
      'default_profile = "high"',
      'max_live_agents = 24',
    ].join('\n'), 'utf8')

    const { advanced } = await importAdvancedModules('audit-write')
    const result = advanced.getAdvancedConfig()
    const auditPath = path.join(userDataPath, 'advanced-config-security-audit.json')
    const persistedAudit = JSON.parse(fs.readFileSync(auditPath, 'utf8'))

    assert.equal(result.diagnostics.ok, true)
    assert.equal(result.diagnostics.securityAudit.auditPath, auditPath)
    assert.equal(persistedAudit.schemaVersion, 1)
    assert.equal(persistedAudit.source, 'advanced.toml')
    assert.equal(typeof persistedAudit.securityHash, 'string')
    assert.equal(persistedAudit.securityFields.commandSafety.installSandboxEnabled, true)
    assert.equal(persistedAudit.securityFields.providerRuntimeSettings.openai.hostedToolsEnabled, true)
    assert.deepEqual(persistedAudit.securityFields.providerRuntimeSettings.openai.enabledHostedTools, ['web_search'])
    assert.equal(persistedAudit.securityFields.providerRuntimeSettings.moonshot.remoteToolsEnabled, true)
    assert.equal(persistedAudit.securityFields.agentSettings.defaultProfile, 'high')
    assert.equal(persistedAudit.securityFields.agentSettings.limits.maxLiveAgents, 24)
  } finally {
    try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('invalid advanced config does not erase the previous security audit baseline', async () => {
  const userDataPath = makeUserData()
  try {
    const advancedTomlPath = path.join(userDataPath, 'advanced.toml')
    const auditPath = path.join(userDataPath, 'advanced-config-security-audit.json')
    fs.writeFileSync(advancedTomlPath, [
      '[command_safety.install_sandbox]',
      'enabled = true',
    ].join('\n'), 'utf8')

    const { advanced } = await importAdvancedModules('audit-invalid')
    const first = advanced.getAdvancedConfig()
    const firstAudit = JSON.parse(fs.readFileSync(auditPath, 'utf8'))

    fs.writeFileSync(advancedTomlPath, [
      '[command_safety.install_sandbox]',
      'enabled = "not-a-bool"',
    ].join('\n'), 'utf8')
    const invalid = advanced.reloadAdvancedConfig()
    const afterInvalidAudit = JSON.parse(fs.readFileSync(auditPath, 'utf8'))

    assert.equal(first.diagnostics.ok, true)
    assert.equal(invalid.diagnostics.ok, false)
    assert.deepEqual(invalid.overlay, {})
    assert.equal(afterInvalidAudit.securityHash, firstAudit.securityHash)
    assert.equal(afterInvalidAudit.securityFields.commandSafety.installSandboxEnabled, true)
  } finally {
    try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('advanced config queues a security warning when audited keys change externally', async () => {
  const userDataPath = makeUserData()
  try {
    const advancedTomlPath = path.join(userDataPath, 'advanced.toml')
    fs.writeFileSync(advancedTomlPath, [
      '[command_safety.install_sandbox]',
      'enabled = false',
    ].join('\n'), 'utf8')

    const { advanced, audit } = await importAdvancedModules('audit-warning')
    advanced.getAdvancedConfig()
    audit.consumePendingAdvancedConfigSecurityWarning()

    await new Promise((resolve) => setTimeout(resolve, 25))
    fs.writeFileSync(advancedTomlPath, [
      '[command_safety.install_sandbox]',
      'enabled = true',
      '',
      '[providers.openai.hosted_tools]',
      'enabled = true',
      'enabled_tools = ["web_search"]',
    ].join('\n'), 'utf8')
    advanced.reloadAdvancedConfig()

    const warning = audit.consumePendingAdvancedConfigSecurityWarning()
    assert.ok(warning)
    assert.equal(warning.reason, 'unexpected_advanced_config_security_change')
    assert.ok(warning.changedFields.includes('commandSafety'))
    assert.ok(warning.changedFields.includes('providerRuntimeSettings'))
    assert.equal(audit.consumePendingAdvancedConfigSecurityWarning(), null)
  } finally {
    try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})
