import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { getElectronApp, getUserDataPath } from '../platform/electron-app.mjs'
import { closeDb } from '../memory/db.mjs'
import { getAttachmentCacheRoot } from '../attachments/attachment-cache.mjs'
import {
  clearOpenAIAccountStorage,
  hasOpenAIAccountStorageData,
  resolveOpenAIAccountStoragePaths,
} from '../openai-account/openai-account-storage.mjs'
import {
  cleanupProviderBudgetProfiles,
  resetProviderBudgetProfiles,
  summarizeProviderBudgetProfiles,
} from '../api-clients/provider-budget-store.mjs'
import {
  cleanupToolResultSpillover,
  resetToolResultSpillover,
  summarizeToolResultSpillover,
} from '../tools/tool-result-spillover.mjs'
import { listConfiguredProviders } from '../vault.mjs'

const require = createRequire(import.meta.url)
const VAULT_FILE_NAME = 'vault.json'
const SETTINGS_FILE_NAME = 'settings.json'
const SETTINGS_SECURITY_AUDIT_FILE_NAME = 'settings-security-audit.json'
const MEMORY_DB_FILE_BASENAME = 'memory.db'
const MIGRATION_BACKUP_DIR_NAME = 'migration-backups'
const MODELS_DIR_NAME = 'models'
const ATTACHMENT_TEMP_DIR_NAME = 'addom-attachments'
let packageMetadataCache = null

function resolveProfileKind() {
  if (process.env.NODE_ENV === 'test') return 'test'
  const app = getElectronApp()
  if (!app) return 'test'
  const isDev = process.env.ADDOM_DEV === '1' || (!app.isPackaged && process.env.ADDOM_DEV !== '0')
  return isDev ? 'dev' : 'packaged'
}

function resolveTempAttachmentPath(overridePath = '') {
  const value = String(overridePath || '').trim()
  if (value) return path.resolve(value)
  return path.join(os.tmpdir(), ATTACHMENT_TEMP_DIR_NAME)
}

function readPackageMetadata() {
  if (packageMetadataCache) return packageMetadataCache
  try {
    packageMetadataCache = require('../../../package.json')
  } catch {
    packageMetadataCache = {}
  }
  return packageMetadataCache
}

function resolveKnownProfileRoots(userDataPath = '') {
  const currentUserDataPath = String(userDataPath || getUserDataPath()).trim()
  if (!currentUserDataPath) return []

  const roots = new Set([path.resolve(currentUserDataPath)])
  const parentDir = path.dirname(currentUserDataPath)
  const currentBaseName = String(path.basename(currentUserDataPath) || '').trim()
  const packageMetadata = readPackageMetadata()
  const packageName = String(packageMetadata?.name || '').trim()
  const productName = String(packageMetadata?.productName || packageMetadata?.build?.productName || '').trim()
  const baseNames = new Set(
    [currentBaseName, packageName, productName]
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )

  for (const baseName of Array.from(baseNames)) {
    const normalizedBaseName = baseName.replace(/-dev$/i, '')
    if (normalizedBaseName) {
      baseNames.add(normalizedBaseName)
      baseNames.add(`${normalizedBaseName}-dev`)
    }
  }

  for (const baseName of baseNames) {
    roots.add(path.resolve(parentDir, baseName))
  }

  return Array.from(roots)
}

function resolveVaultTempFilePaths(vaultFilePath = '') {
  const normalizedPath = String(vaultFilePath || '').trim()
  if (!normalizedPath) return []
  const vaultDir = path.dirname(normalizedPath)
  const vaultBase = path.basename(normalizedPath)
  try {
    return fs.readdirSync(vaultDir)
      .filter((name) => name.startsWith(`${vaultBase}.`) && name.endsWith('.tmp'))
      .map((name) => path.join(vaultDir, name))
  } catch {
    return []
  }
}

function pathExists(targetPath = '') {
  const normalizedPath = String(targetPath || '').trim()
  if (!normalizedPath) return false
  try {
    return fs.existsSync(normalizedPath)
  } catch {
    return false
  }
}

function directoryHasEntries(targetPath = '') {
  const normalizedPath = String(targetPath || '').trim()
  if (!normalizedPath) return false
  try {
    const stat = fs.statSync(normalizedPath)
    if (!stat.isDirectory()) return false
    return fs.readdirSync(normalizedPath).length > 0
  } catch {
    return false
  }
}

function removeOwnedPath(targetPath = '') {
  const normalizedPath = String(targetPath || '').trim()
  if (!normalizedPath || !pathExists(normalizedPath)) return false
  try {
    fs.rmSync(normalizedPath, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

function resolveLocalDataPaths({ tempAttachmentPath = '' } = {}) {
  const userDataPath = getUserDataPath()
  const vaultFilePath = path.join(userDataPath, VAULT_FILE_NAME)
  return {
    userDataPath,
    vaultFilePath,
    vaultTempFilePaths: resolveVaultTempFilePaths(vaultFilePath),
    settingsFilePath: path.join(userDataPath, SETTINGS_FILE_NAME),
    settingsSecurityAuditFilePath: path.join(userDataPath, SETTINGS_SECURITY_AUDIT_FILE_NAME),
    memoryDbPath: path.join(userDataPath, MEMORY_DB_FILE_BASENAME),
    memoryWalPath: path.join(userDataPath, `${MEMORY_DB_FILE_BASENAME}-wal`),
    memoryShmPath: path.join(userDataPath, `${MEMORY_DB_FILE_BASENAME}-shm`),
    migrationBackupRoot: path.join(userDataPath, MIGRATION_BACKUP_DIR_NAME),
    attachmentCacheRoot: getAttachmentCacheRoot(),
    modelCacheRoot: path.join(userDataPath, MODELS_DIR_NAME),
    tempAttachmentPath: resolveTempAttachmentPath(tempAttachmentPath),
    openAIAccountStorage: resolveOpenAIAccountStoragePaths(userDataPath),
  }
}

function resolveProfileDataPresence(profileRoot = '') {
  const normalizedProfileRoot = String(profileRoot || '').trim()
  if (!normalizedProfileRoot) {
    return {
      workspaceDataPresent: false,
      settingsPresent: false,
      vaultPresent: false,
      openAIAccountDataPresent: false,
      anyDataPresent: false,
    }
  }

  const vaultPresent = (
    pathExists(path.join(normalizedProfileRoot, VAULT_FILE_NAME))
    || resolveVaultTempFilePaths(path.join(normalizedProfileRoot, VAULT_FILE_NAME)).length > 0
  )
  const settingsPresent = (
    pathExists(path.join(normalizedProfileRoot, SETTINGS_FILE_NAME))
    || pathExists(path.join(normalizedProfileRoot, SETTINGS_SECURITY_AUDIT_FILE_NAME))
  )
  const workspaceDataPresent = (
    pathExists(path.join(normalizedProfileRoot, MEMORY_DB_FILE_BASENAME))
    || pathExists(path.join(normalizedProfileRoot, `${MEMORY_DB_FILE_BASENAME}-wal`))
    || pathExists(path.join(normalizedProfileRoot, `${MEMORY_DB_FILE_BASENAME}-shm`))
    || directoryHasEntries(path.join(normalizedProfileRoot, MIGRATION_BACKUP_DIR_NAME))
  )
  const openAIAccountDataPresent = hasOpenAIAccountStorageData(normalizedProfileRoot)

  return {
    workspaceDataPresent,
    settingsPresent,
    vaultPresent,
    openAIAccountDataPresent,
    anyDataPresent: !!(workspaceDataPresent || settingsPresent || vaultPresent || openAIAccountDataPresent),
  }
}

async function clearElectronSessionStorage(electronSession = null) {
  if (!electronSession || typeof electronSession !== 'object') return
  try {
    if (typeof electronSession.clearStorageData === 'function') {
      await electronSession.clearStorageData({
        storages: [
          'appcache',
          'cookies',
          'filesystem',
          'indexdb',
          'localstorage',
          'serviceworkers',
          'shadercache',
          'websql',
        ],
      })
    }
  } catch {
    // Best-effort only.
  }
  try {
    if (typeof electronSession.clearCache === 'function') {
      await electronSession.clearCache()
    }
  } catch {
    // Best-effort only.
  }
}

export function resolveLocalDataSummary({ tempAttachmentPath = '' } = {}) {
  const paths = resolveLocalDataPaths({ tempAttachmentPath })
  const configuredProviderCount = Object.keys(listConfiguredProviders()).length
  const currentProfileRoot = path.resolve(paths.userDataPath)
  const otherKnownProfileDataPresent = resolveKnownProfileRoots(paths.userDataPath)
    .map((profileRoot) => path.resolve(profileRoot))
    .filter((profileRoot) => profileRoot !== currentProfileRoot)
    .some((profileRoot) => resolveProfileDataPresence(profileRoot).anyDataPresent)
  return {
    profileKind: resolveProfileKind(),
    userDataPath: paths.userDataPath,
    tempAttachmentPath: paths.tempAttachmentPath,
    configuredProviderCount,
    workspaceDataPresent: (
      pathExists(paths.memoryDbPath)
      || pathExists(paths.memoryWalPath)
      || pathExists(paths.memoryShmPath)
      || directoryHasEntries(paths.migrationBackupRoot)
    ),
    settingsPresent: (
      pathExists(paths.settingsFilePath)
      || pathExists(paths.settingsSecurityAuditFilePath)
    ),
    modelCachePresent: directoryHasEntries(paths.modelCacheRoot),
    attachmentCachePresent: directoryHasEntries(paths.attachmentCacheRoot),
    openAIAccountDataPresent: hasOpenAIAccountStorageData(paths.userDataPath),
    otherKnownProfileDataPresent,
  }
}

export function deleteAllApiKeys() {
  const paths = resolveLocalDataPaths()
  let deletedFiles = 0

  for (const profileRoot of resolveKnownProfileRoots(paths.userDataPath)) {
    const vaultFilePath = path.join(profileRoot, VAULT_FILE_NAME)
    if (removeOwnedPath(vaultFilePath)) deletedFiles += 1
    for (const tempPath of resolveVaultTempFilePaths(vaultFilePath)) {
      if (removeOwnedPath(tempPath)) deletedFiles += 1
    }
  }

  return {
    ok: true,
    deletedFiles,
  }
}

export function resolveProviderBudgetSummary({ nowMs } = {}) {
  return summarizeProviderBudgetProfiles({ nowMs })
}

export function cleanupProviderBudgetProfileData({ nowMs } = {}) {
  const result = cleanupProviderBudgetProfiles({ nowMs })
  return {
    ok: true,
    ...result,
    summary: resolveProviderBudgetSummary({ nowMs }),
  }
}

export function resetProviderBudgetProfileData({ nowMs } = {}) {
  const deletedCount = resetProviderBudgetProfiles()
  return {
    ok: true,
    deletedCount,
    summary: resolveProviderBudgetSummary({ nowMs }),
  }
}

export function resolveToolResultSpilloverSummary() {
  return summarizeToolResultSpillover()
}

export function cleanupToolResultSpilloverData({ nowMs } = {}) {
  return cleanupToolResultSpillover({ now: nowMs })
}

export function resetToolResultSpilloverData({ nowMs } = {}) {
  return resetToolResultSpillover({ now: nowMs })
}

export async function resetCurrentProfileAndRestart({
  electronSession = null,
  tempAttachmentPath = '',
  beforeReset = null,
  appOverride = null,
} = {}) {
  const paths = resolveLocalDataPaths({ tempAttachmentPath })
  const app = appOverride || getElectronApp()

  try {
    if (typeof beforeReset === 'function') {
      await beforeReset()
    } else {
      closeDb()
    }
  } catch {
    // Best-effort shutdown only.
  }

  let deletedFiles = 0
  let deletedDirectories = 0
  const fileTargets = [
    paths.vaultFilePath,
    ...paths.vaultTempFilePaths,
    paths.settingsFilePath,
    paths.settingsSecurityAuditFilePath,
    paths.memoryDbPath,
    paths.memoryWalPath,
    paths.memoryShmPath,
  ]
  const dirTargets = [
    paths.attachmentCacheRoot,
    paths.migrationBackupRoot,
    paths.modelCacheRoot,
    paths.tempAttachmentPath,
  ]

  for (const filePath of fileTargets) {
    if (removeOwnedPath(filePath)) deletedFiles += 1
  }
  for (const dirPath of dirTargets) {
    if (removeOwnedPath(dirPath)) deletedDirectories += 1
  }
  const openAIAccountCleanup = clearOpenAIAccountStorage(paths.userDataPath)
  if (openAIAccountCleanup?.removedRootPath) deletedDirectories += 1

  await clearElectronSessionStorage(electronSession)

  if (app && typeof app.relaunch === 'function') {
    try {
      app.relaunch()
    } catch {
      // Best-effort only.
    }
  }
  if (app && typeof app.exit === 'function') {
    app.exit(0)
  }

  return {
    ok: true,
    deletedFiles,
    deletedDirectories,
  }
}
