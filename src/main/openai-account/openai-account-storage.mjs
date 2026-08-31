import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getUserDataPath } from '../platform/electron-app.mjs'

const OPENAI_ACCOUNT_DIR_NAME = 'openai-account'
const SESSION_SUMMARY_FILE_NAME = 'session-summary.json'
const ACTIVE_LOGIN_FILE_NAME = 'active-login.json'
const CODEX_HOME_DIR_NAME = 'codex-home'
const LOGS_DIR_NAME = 'logs'
const SESSIONS_DIR_NAME = 'sessions'
const RUNTIME_DIR_NAME = 'runtime'

function resolveBaseUserDataPath(userDataPath = '') {
  const normalized = String(userDataPath || getUserDataPath()).trim()
  return path.resolve(normalized)
}

function atomicWriteJsonFile(targetPath, value) {
  const safeTargetPath = String(targetPath || '').trim()
  if (!safeTargetPath) return
  const tempPath = `${safeTargetPath}.${crypto.randomBytes(8).toString('hex')}.tmp`
  fs.mkdirSync(path.dirname(safeTargetPath), { recursive: true })
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 })
  try {
    fs.renameSync(tempPath, safeTargetPath)
  } catch {
    fs.writeFileSync(safeTargetPath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 })
  } finally {
    try { fs.unlinkSync(tempPath) } catch { /* best-effort temp cleanup */ }
  }
}

function readJsonFile(targetPath = '') {
  const safeTargetPath = String(targetPath || '').trim()
  if (!safeTargetPath || !fs.existsSync(safeTargetPath)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(safeTargetPath, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function pathExists(targetPath = '') {
  const safeTargetPath = String(targetPath || '').trim()
  if (!safeTargetPath) return false
  try {
    return fs.existsSync(safeTargetPath)
  } catch {
    return false
  }
}

function directoryHasEntries(targetPath = '') {
  const safeTargetPath = String(targetPath || '').trim()
  if (!safeTargetPath) return false
  try {
    const stat = fs.statSync(safeTargetPath)
    if (!stat.isDirectory()) return false
    return fs.readdirSync(safeTargetPath).length > 0
  } catch {
    return false
  }
}

export function resolveOpenAIAccountStoragePaths(userDataPath = '') {
  const baseUserDataPath = resolveBaseUserDataPath(userDataPath)
  const rootPath = path.join(baseUserDataPath, OPENAI_ACCOUNT_DIR_NAME)
  return {
    userDataPath: baseUserDataPath,
    rootPath,
    sessionSummaryFilePath: path.join(rootPath, SESSION_SUMMARY_FILE_NAME),
    activeLoginFilePath: path.join(rootPath, ACTIVE_LOGIN_FILE_NAME),
    codexHomePath: path.join(rootPath, CODEX_HOME_DIR_NAME),
    logsPath: path.join(rootPath, LOGS_DIR_NAME),
    sessionsPath: path.join(rootPath, SESSIONS_DIR_NAME),
    runtimeRootPath: path.join(rootPath, RUNTIME_DIR_NAME),
  }
}

export function ensureOpenAIAccountStorage(userDataPath = '') {
  const paths = resolveOpenAIAccountStoragePaths(userDataPath)
  fs.mkdirSync(paths.rootPath, { recursive: true })
  fs.mkdirSync(paths.codexHomePath, { recursive: true })
  fs.mkdirSync(paths.logsPath, { recursive: true })
  fs.mkdirSync(paths.sessionsPath, { recursive: true })
  fs.mkdirSync(paths.runtimeRootPath, { recursive: true })
  return paths
}

export function readOpenAIAccountSessionSummary(userDataPath = '') {
  const paths = resolveOpenAIAccountStoragePaths(userDataPath)
  return readJsonFile(paths.sessionSummaryFilePath)
}

export function writeOpenAIAccountSessionSummary(summary = null, userDataPath = '') {
  const paths = ensureOpenAIAccountStorage(userDataPath)
  if (!summary || typeof summary !== 'object') {
    try { fs.rmSync(paths.sessionSummaryFilePath, { force: true }) } catch { /* best-effort cleanup */ }
    return paths
  }
  atomicWriteJsonFile(paths.sessionSummaryFilePath, summary)
  return paths
}

export function readOpenAIAccountActiveLogin(userDataPath = '') {
  const paths = resolveOpenAIAccountStoragePaths(userDataPath)
  return readJsonFile(paths.activeLoginFilePath)
}

export function writeOpenAIAccountActiveLogin(login = null, userDataPath = '') {
  const paths = ensureOpenAIAccountStorage(userDataPath)
  if (!login || typeof login !== 'object') {
    try { fs.rmSync(paths.activeLoginFilePath, { force: true }) } catch { /* best-effort cleanup */ }
    return paths
  }
  atomicWriteJsonFile(paths.activeLoginFilePath, login)
  return paths
}

export function hasOpenAIAccountStorageData(userDataPath = '') {
  const paths = resolveOpenAIAccountStoragePaths(userDataPath)
  return (
    pathExists(paths.sessionSummaryFilePath)
    || pathExists(paths.activeLoginFilePath)
    || directoryHasEntries(paths.codexHomePath)
    || directoryHasEntries(paths.logsPath)
    || directoryHasEntries(paths.sessionsPath)
    || directoryHasEntries(paths.runtimeRootPath)
  )
}

export function clearOpenAIAccountStorage(userDataPath = '') {
  const paths = resolveOpenAIAccountStoragePaths(userDataPath)
  if (!pathExists(paths.rootPath)) {
    return {
      ok: true,
      removedRootPath: false,
      paths,
    }
  }
  try {
    fs.rmSync(paths.rootPath, { recursive: true, force: true })
    return {
      ok: true,
      removedRootPath: true,
      paths,
    }
  } catch {
    return {
      ok: false,
      removedRootPath: false,
      paths,
    }
  }
}

export function clearOpenAIAccountSessionData(userDataPath = '') {
  const paths = resolveOpenAIAccountStoragePaths(userDataPath)
  const targets = [
    paths.sessionSummaryFilePath,
    paths.activeLoginFilePath,
    paths.codexHomePath,
    paths.logsPath,
    paths.sessionsPath,
  ]
  let ok = true
  for (const targetPath of targets) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true })
    } catch {
      ok = false
    }
  }
  return {
    ok,
    paths,
  }
}
