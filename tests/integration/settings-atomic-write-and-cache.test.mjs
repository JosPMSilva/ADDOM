import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-settings-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const settingsPath = path.join(userDataPath, 'settings.json')
const settingsSecurityAuditPath = path.join(userDataPath, 'settings-security-audit.json')
const {
  consumePendingSettingsSecurityWarning,
  getSettings,
  setSettingsPatch,
} = await import('../../src/main/settings.mjs')

test.after(() => {
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('settings writes atomically and persists the cleaned execution contract', async () => {
  const next = await setSettingsPatch({
    permissionMode: 'autonomy',
    riskyActionPolicy: 'prompt_first_risky_use',
    includeGlobalMemoryInContext: true,
  })

  assert.equal(next.permissionMode, 'autonomy')
  assert.equal(next.riskyActionPolicy, 'prompt_first_risky_use')
  assert.equal(next.includeGlobalMemoryInContext, true)

  const onDisk = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  assert.equal(onDisk.permissionMode, 'autonomy')
  assert.equal(onDisk.riskyActionPolicy, 'prompt_first_risky_use')
  assert.equal('commandAccessMode' in (onDisk.commandSafety || {}), false)
  assert.equal('runCommandEnabled' in onDisk, false)
  assert.equal('webBrowsingEnabled' in onDisk, false)
  assert.equal('toolPermissions' in onDisk, false)

  const leftovers = fs.readdirSync(userDataPath).filter((name) => name.includes('.tmp'))
  assert.equal(leftovers.length, 0)
})

test('settings patch writes are serialized for concurrent callers', async () => {
  await Promise.all([
    setSettingsPatch({ permissionMode: 'autonomy' }),
    setSettingsPatch({ chatMode: 'plan' }),
  ])
  const merged = getSettings()
  assert.equal(merged.permissionMode, 'autonomy')
  assert.equal(merged.chatMode, 'plan')
})

test('settings no-op patches do not rewrite settings.json', async () => {
  await setSettingsPatch({
    permissionMode: 'autonomy',
    chatMode: 'plan',
  })

  const before = fs.statSync(settingsPath).mtimeMs
  await new Promise((resolve) => setTimeout(resolve, 25))

  await setSettingsPatch({
    permissionMode: 'autonomy',
    chatMode: 'plan',
  })

  const after = fs.statSync(settingsPath).mtimeMs
  assert.equal(after, before)
})

test('settings cache invalidates when settings.json mtime changes', async () => {
  const first = getSettings()
  assert.match(first.permissionMode, /^(ask|autonomy|full_access)$/)

  await new Promise((resolve) => setTimeout(resolve, 25))
  const nextPermissionMode = first.permissionMode === 'ask' ? 'autonomy' : 'ask'
  const modified = {
    ...first,
    permissionMode: nextPermissionMode,
    chatMode: 'plan',
  }
  fs.writeFileSync(settingsPath, JSON.stringify(modified, null, 2), 'utf8')

  const afterExternalWrite = getSettings()
  assert.equal(afterExternalWrite.permissionMode, nextPermissionMode)
  assert.equal(afterExternalWrite.chatMode, 'plan')
})

test('settings follow the active user-data path when it changes after module import', async () => {
  const nextUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-settings-next-'))
  const nextSettingsPath = path.join(nextUserDataPath, 'settings.json')

  try {
    try { fs.rmSync(settingsPath, { force: true }) } catch { /* best-effort test cleanup */ }
    try { fs.rmSync(settingsSecurityAuditPath, { force: true }) } catch { /* best-effort test cleanup */ }
    process.env.ADDOM_USER_DATA_PATH = nextUserDataPath
    await setSettingsPatch({
      permissionMode: 'autonomy',
      chatMode: 'plan',
    })

    assert.equal(fs.existsSync(nextSettingsPath), true)
    assert.equal(fs.existsSync(settingsPath), false)

    const persisted = JSON.parse(fs.readFileSync(nextSettingsPath, 'utf8'))
    assert.equal(persisted.permissionMode, 'autonomy')
    assert.equal(persisted.chatMode, 'plan')
  } finally {
    process.env.ADDOM_USER_DATA_PATH = userDataPath
    try { fs.rmSync(nextUserDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('settings writes a security audit file for permission and guardrail state', async () => {
  await setSettingsPatch({
    permissionMode: 'autonomy',
    commandSafety: {
      showDeveloperOptions: true,
    },
  })

  const audit = JSON.parse(fs.readFileSync(settingsSecurityAuditPath, 'utf8'))
  assert.equal(audit.schemaVersion, 1)
  assert.equal(typeof audit.securityHash, 'string')
  assert.equal(audit.securityFields.permissionMode, 'autonomy')
  assert.equal(audit.securityFields.riskyActionPolicy, 'prompt_first_risky_use')
  assert.equal('commandAccessMode' in audit.securityFields.commandSafety, false)
  assert.equal(audit.securityFields.commandSafety.showDeveloperOptions, true)
})

test('settings silently refreshes legacy security audits that normalize to the current guarded state', async () => {
  const isolatedUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-settings-legacy-audit-'))
  const isolatedSettingsPath = path.join(isolatedUserDataPath, 'settings.json')
  const isolatedAuditPath = path.join(isolatedUserDataPath, 'settings-security-audit.json')
  const previousUserDataPath = process.env.ADDOM_USER_DATA_PATH

  try {
    fs.writeFileSync(isolatedSettingsPath, JSON.stringify({
      runCommandEnabled: true,
      webBrowsingEnabled: false,
      toolPermissions: {
        readFileEnabled: true,
        writeFileEnabled: true,
        gitWriteEnabled: false,
      },
      commandSafety: {
        commandAccessMode: 'full_permissions',
        showDeveloperOptions: true,
        approvalRules: [],
        trustedWorkspaceRoots: ['C:\\legacy\\workspace'],
        defaultExecutionProfile: 'workspace_safe',
        installSandboxEnabled: true,
        allowHostInstalls: true,
        preferredBackend: 'auto',
        sandboxNetworkEnforcementMode: 'strict',
        registryAllowlist: [],
        cacheDirs: [],
      },
    }, null, 2), 'utf8')

    fs.writeFileSync(isolatedAuditPath, JSON.stringify({
      schemaVersion: 1,
      updatedAt: Date.now() - 1_000,
      securityHash: 'legacy_hash_that_should_be_rewritten',
      securityFields: {
        runCommandEnabled: true,
        webBrowsingEnabled: false,
        toolPermissions: {
          readFileEnabled: true,
          writeFileEnabled: true,
          gitWriteEnabled: false,
        },
        commandSafety: {
          commandAccessMode: 'full_permissions',
          showDeveloperOptions: true,
          approvalRules: [],
          trustedWorkspaceRoots: ['C:\\legacy\\workspace'],
          defaultExecutionProfile: 'workspace_safe',
          installSandboxEnabled: true,
          allowHostInstalls: true,
          preferredBackend: 'auto',
          sandboxNetworkEnforcementMode: 'strict',
          registryAllowlist: [],
          cacheDirs: [],
        },
      },
    }, null, 2), 'utf8')

    process.env.ADDOM_USER_DATA_PATH = isolatedUserDataPath
    const isolatedSettingsModuleBaseUrl = pathToFileURL(path.join(process.cwd(), 'src/main/settings.mjs')).href
    const isolatedSettingsModule = await import(`${isolatedSettingsModuleBaseUrl}?legacy-audit-refresh=${Date.now()}`)
    const reloaded = isolatedSettingsModule.getSettings()
    assert.equal(reloaded.permissionMode, 'ask')
    assert.equal(reloaded.commandSafety.showDeveloperOptions, true)
    assert.equal(isolatedSettingsModule.consumePendingSettingsSecurityWarning(), null)

    const refreshedAudit = JSON.parse(fs.readFileSync(isolatedAuditPath, 'utf8'))
    assert.equal(refreshedAudit.securityFields.permissionMode, 'ask')
    assert.equal(refreshedAudit.securityFields.riskyActionPolicy, 'prompt_first_risky_use')
    assert.equal('runCommandEnabled' in refreshedAudit.securityFields, false)
    assert.equal('webBrowsingEnabled' in refreshedAudit.securityFields, false)
    assert.equal('toolPermissions' in refreshedAudit.securityFields, false)
    assert.equal('commandAccessMode' in refreshedAudit.securityFields.commandSafety, false)
    assert.equal('approvalRules' in refreshedAudit.securityFields.commandSafety, false)
    assert.equal('trustedWorkspaceRoots' in refreshedAudit.securityFields.commandSafety, false)
  } finally {
    process.env.ADDOM_USER_DATA_PATH = previousUserDataPath
    try { fs.rmSync(isolatedUserDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('settings emits a warning when security-sensitive fields change outside the managed write flow', async () => {
  consumePendingSettingsSecurityWarning()
  await setSettingsPatch({
    permissionMode: 'ask',
    commandSafety: {
      showDeveloperOptions: false,
    },
  })

  await new Promise((resolve) => setTimeout(resolve, 25))
  const externallyModified = {
    ...getSettings(),
    permissionMode: 'autonomy',
    commandSafety: {
      ...getSettings().commandSafety,
      showDeveloperOptions: true,
    },
  }
  fs.writeFileSync(settingsPath, JSON.stringify(externallyModified, null, 2), 'utf8')

  const reloaded = getSettings()
  assert.equal(reloaded.permissionMode, 'autonomy')
  assert.equal(reloaded.commandSafety.showDeveloperOptions, true)

  const warning = consumePendingSettingsSecurityWarning()
  assert.ok(warning)
  assert.equal(warning.reason, 'settings_integrity_mismatch')
  assert.ok(Array.isArray(warning.changedFields))
  assert.ok(warning.changedFields.includes('permissionMode'))
  assert.ok(warning.changedFields.includes('commandSafety'))

  assert.equal(consumePendingSettingsSecurityWarning(), null)
})

test('settings source uses cryptographically random temp names for atomic writes', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/main/settings.mjs'), 'utf8')
  assert.match(source, /import\s+crypto\s+from\s+'node:crypto'/)
  assert.match(source, /crypto\.randomBytes\(8\)\.toString\('hex'\)/)
  assert.doesNotMatch(source, /`\$\{safeTargetPath\}\.\$\{process\.pid\}\.tmp`/)
})
