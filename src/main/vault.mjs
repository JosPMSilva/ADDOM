/**
 * vault.mjs — BYOK key storage using Electron safeStorage.
 *
 * safeStorage encrypts data with OS-level credentials:
 *   - Windows: DPAPI (tied to the user account)
 *   - macOS:   Keychain
 *   - Linux:   libsecret / kwallet
 *
 * Keys are stored as encrypted buffers in a JSON file on disk.
 * The raw API key is NEVER written to disk in plaintext.
 *
 * Storage layout (in userData/vault.json):
 *   { "anthropic": "<base64 encrypted buffer>", "openai": "...", ... }
 */

import { createRequire } from 'module'
import { execFileSync } from 'child_process'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'path'
import fs from 'fs'
import { getUserDataPath } from './platform/electron-app.mjs'

const require = createRequire(import.meta.url)
let vaultFileCache = null
let vaultFileCacheMtimeMs = null
let vaultFileCachePath = ''
let vaultWriteQueue = Promise.resolve()
const SAFE_STORAGE_FALLBACK = Object.freeze({
  isEncryptionAvailable: () => false,
  encryptString: () => {
    throw new Error('OS encryption is not available on this system.')
  },
  decryptString: () => {
    throw new Error('OS encryption is not available on this system.')
  },
})

function resolveElectronSafeStorage() {
  try {
    const electronModule = require('electron')
    if (
      electronModule
      && typeof electronModule === 'object'
      && electronModule.safeStorage
      && typeof electronModule.safeStorage.isEncryptionAvailable === 'function'
    ) {
      return electronModule.safeStorage
    }
  } catch {
    // Non-Electron runtime.
  }
  return SAFE_STORAGE_FALLBACK
}

let safeStorageApi = resolveElectronSafeStorage()

function assertTestOnlyVaultAccess() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Test-only vault helper called in non-test environment.')
  }
  if (!process.env.ADDOM_USER_DATA_PATH && process.env.NODE_ENV !== 'test') {
    throw new Error('Test-only vault helper requires a test user-data path.')
  }
}

function getVaultFilePath() {
  return path.join(getUserDataPath(), 'vault.json')
}

function applyVaultFilePermissions() {
  const vaultFilePath = getVaultFilePath()
  if (process.platform === 'win32') {
    try {
      const username = os.userInfo().username
      if (username) {
        execFileSync('icacls', [vaultFilePath, '/inheritance:r', '/grant:r', `${username}:(R,W)`], {
          stdio: 'ignore',
          windowsHide: true,
        })
      }
    } catch {
      // Best-effort hardening only.
    }
    return
  }
  try {
    fs.chmodSync(vaultFilePath, 0o600)
  } catch {
    // Best-effort hardening only.
  }
}

function listVaultTempFiles() {
  const vaultFilePath = getVaultFilePath()
  const vaultDir = path.dirname(vaultFilePath)
  const vaultBase = path.basename(vaultFilePath)
  try {
    return fs.readdirSync(vaultDir)
      .filter((name) => name.startsWith(`${vaultBase}.`) && name.endsWith('.tmp'))
      .map((name) => path.join(vaultDir, name))
  } catch {
    return []
  }
}

function cleanupVaultTempFiles(exceptPath = '') {
  const keep = String(exceptPath || '')
  for (const tempPath of listVaultTempFiles()) {
    if (keep && tempPath === keep) continue
    try { fs.unlinkSync(tempPath) } catch { /* best-effort stale vault temp cleanup */ }
  }
}

function readVaultFile() {
  const vaultFilePath = getVaultFilePath()
  try {
    if (!fs.existsSync(vaultFilePath)) {
      vaultFileCache = {}
      vaultFileCacheMtimeMs = null
      vaultFileCachePath = vaultFilePath
      return {}
    }
    const stat = fs.statSync(vaultFilePath)
    const mtimeMs = Number(stat?.mtimeMs || 0) || 0
    if (
      vaultFileCache
      && typeof vaultFileCache === 'object'
      && vaultFileCachePath === vaultFilePath
      && vaultFileCacheMtimeMs === mtimeMs
    ) {
      return { ...vaultFileCache }
    }
    const parsed = JSON.parse(fs.readFileSync(vaultFilePath, 'utf8'))
    const safeParsed = parsed && typeof parsed === 'object' ? parsed : {}
    vaultFileCache = { ...safeParsed }
    vaultFileCacheMtimeMs = mtimeMs
    vaultFileCachePath = vaultFilePath
    return { ...safeParsed }
  } catch {
    vaultFileCache = {}
    vaultFileCacheMtimeMs = null
    vaultFileCachePath = vaultFilePath
    return {}
  }
}

function writeVaultFile(data) {
  const safeData = data && typeof data === 'object' ? data : {}
  const payload = JSON.stringify(safeData)
  const vaultFilePath = getVaultFilePath()
  const tempFile = `${vaultFilePath}.${crypto.randomBytes(8).toString('hex')}.tmp`
  fs.mkdirSync(path.dirname(vaultFilePath), { recursive: true })
  cleanupVaultTempFiles(tempFile)
  fs.writeFileSync(tempFile, payload, { encoding: 'utf8', mode: 0o600 })
  try {
    fs.renameSync(tempFile, vaultFilePath)
  } catch {
    fs.writeFileSync(vaultFilePath, payload, { encoding: 'utf8', mode: 0o600 })
  } finally {
    try { fs.unlinkSync(tempFile) } catch { /* best-effort vault temp cleanup */ }
    cleanupVaultTempFiles()
  }
  applyVaultFilePermissions()
  vaultFileCache = { ...safeData }
  vaultFileCachePath = vaultFilePath
  try {
    const stat = fs.statSync(vaultFilePath)
    vaultFileCacheMtimeMs = Number(stat?.mtimeMs || 0) || 0
  } catch {
    vaultFileCacheMtimeMs = null
  }
}

function queueVaultWrite(run) {
  const task = typeof run === 'function' ? run : () => {}
  const queued = vaultWriteQueue.then(task, task)
  vaultWriteQueue = queued.catch(() => {})
  return queued
}

export function setKey(providerId, apiKey) {
  const pid = String(providerId || '').trim()
  const key = String(apiKey || '')
  if (!pid) throw new Error('providerId is required')
  if (!key.trim()) throw new Error('apiKey is required')
  return queueVaultWrite(() => {
  if (!safeStorageApi.isEncryptionAvailable()) {
    throw new Error('OS encryption is not available on this system.')
  }
  const encrypted = safeStorageApi.encryptString(key)
  const vault = readVaultFile()
  vault[pid] = encrypted.toString('base64')
  writeVaultFile(vault)
  })
}

export function getKey(providerId) {
  if (!safeStorageApi.isEncryptionAvailable()) return null
  const vault = readVaultFile()
  const b64 = vault[providerId]
  if (!b64) return null
  try {
    return safeStorageApi.decryptString(Buffer.from(b64, 'base64'))
  } catch {
    return null
  }
}

export function deleteKey(providerId) {
  const pid = String(providerId || '').trim()
  if (!pid) return Promise.resolve()
  return queueVaultWrite(() => {
    const vault = readVaultFile()
    delete vault[pid]
    writeVaultFile(vault)
  })
}

export function setSecret(secretId, value) {
  const id = String(secretId || '').trim()
  if (!id) throw new Error('secretId is required')
  const payload = typeof value === 'string'
    ? value
    : JSON.stringify(value ?? null)
  return queueVaultWrite(() => {
    if (!safeStorageApi.isEncryptionAvailable()) {
      throw new Error('OS encryption is not available on this system.')
    }
    const encrypted = safeStorageApi.encryptString(payload)
    const vault = readVaultFile()
    vault[id] = encrypted.toString('base64')
    writeVaultFile(vault)
  })
}

export function getSecret(secretId) {
  const id = String(secretId || '').trim()
  if (!id || !safeStorageApi.isEncryptionAvailable()) return null
  const vault = readVaultFile()
  const b64 = vault[id]
  if (!b64) return null
  try {
    return safeStorageApi.decryptString(Buffer.from(b64, 'base64'))
  } catch {
    return null
  }
}

export function getSecretJson(secretId) {
  const raw = getSecret(secretId)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function deleteSecret(secretId) {
  return deleteKey(secretId)
}

export function listConfiguredProviders() {
  const vault = readVaultFile()
  const result = {}
  for (const id of Object.keys(vault)) {
    result[id] = true
  }
  return result
}

export function __setSafeStorageForTests(nextSafeStorage = null) {
  assertTestOnlyVaultAccess()
  safeStorageApi = nextSafeStorage && typeof nextSafeStorage === 'object'
    ? nextSafeStorage
    : resolveElectronSafeStorage()
}

export function __resetVaultStateForTests() {
  assertTestOnlyVaultAccess()
  vaultFileCache = null
  vaultFileCacheMtimeMs = null
  vaultFileCachePath = ''
  vaultWriteQueue = Promise.resolve()
}
