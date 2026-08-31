import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getUserDataPath } from '../platform/electron-app.mjs'

function resolveUserDataPath(userDataPath = '') {
  return path.resolve(String(userDataPath || getUserDataPath()).trim())
}

function atomicWriteJson(targetPath, value) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  const temporaryPath = `${targetPath}.${crypto.randomBytes(6).toString('hex')}.tmp`
  fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 })
  try {
    fs.renameSync(temporaryPath, targetPath)
  } finally {
    try { fs.rmSync(temporaryPath, { force: true }) } catch { /* best effort */ }
  }
}

export function resolveCursorAgentStoragePaths(userDataPath = '') {
  const basePath = resolveUserDataPath(userDataPath)
  const rootPath = path.join(basePath, 'cursor-agent')
  const profilePath = path.join(rootPath, 'profile')
  return {
    basePath,
    rootPath,
    profilePath,
    profileLocalAppDataPath: path.join(profilePath, 'AppData', 'Local'),
    profileRoamingAppDataPath: path.join(profilePath, 'AppData', 'Roaming'),
    runtimeRootPath: path.join(rootPath, 'runtime'),
    sessionsFilePath: path.join(rootPath, 'sessions.json'),
  }
}

export function ensureCursorAgentStorage(userDataPath = '') {
  const paths = resolveCursorAgentStoragePaths(userDataPath)
  for (const targetPath of [
    paths.rootPath,
    paths.profilePath,
    paths.profileLocalAppDataPath,
    paths.profileRoamingAppDataPath,
    paths.runtimeRootPath,
  ]) fs.mkdirSync(targetPath, { recursive: true })
  return paths
}

export function readCursorAgentSessionMap(userDataPath = '') {
  const { sessionsFilePath } = resolveCursorAgentStoragePaths(userDataPath)
  try {
    const parsed = JSON.parse(fs.readFileSync(sessionsFilePath, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function writeCursorAgentSessionMap(sessionMap = {}, userDataPath = '') {
  const { sessionsFilePath } = ensureCursorAgentStorage(userDataPath)
  const safeMap = sessionMap && typeof sessionMap === 'object' && !Array.isArray(sessionMap)
    ? sessionMap
    : {}
  atomicWriteJson(sessionsFilePath, safeMap)
  return safeMap
}

