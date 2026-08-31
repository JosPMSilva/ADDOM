import path from 'node:path'
import {
  readCursorAgentSessionMap,
  writeCursorAgentSessionMap,
} from './cursor-agent-storage.mjs'

function normalizeId(value = '') {
  return String(value || '').trim()
}

function normalizePath(value = '') {
  const raw = normalizeId(value)
  if (!raw) return ''
  const resolved = path.resolve(raw)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function sessionKey(projectId = '', threadId = '') {
  return JSON.stringify([normalizeId(projectId), normalizeId(threadId)])
}

export function createCursorAgentSessionRegistry({
  userDataPath = '',
  readSessionMap = () => readCursorAgentSessionMap(userDataPath),
  writeSessionMap = (value) => writeCursorAgentSessionMap(value, userDataPath),
} = {}) {
  const read = () => {
    const value = readSessionMap()
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  }
  const write = (value) => writeSessionMap(value)
  return {
    get({ projectId = '', threadId = '', projectPath = '' } = {}) {
      const project = normalizeId(projectId)
      const thread = normalizeId(threadId)
      const workspace = normalizePath(projectPath)
      if (!project || !thread || !workspace) return null
      const map = read()
      const key = sessionKey(project, thread)
      const row = map[key]
      if (!row || normalizePath(row.projectPath) !== workspace) {
        if (row) {
          delete map[key]
          write(map)
        }
        return null
      }
      return { ...row }
    },
    set({ projectId = '', threadId = '', projectPath = '', sessionId = '' } = {}) {
      const project = normalizeId(projectId)
      const thread = normalizeId(threadId)
      const rawWorkspace = normalizeId(projectPath)
      const workspace = rawWorkspace ? path.resolve(rawWorkspace) : ''
      const session = normalizeId(sessionId)
      if (!project || !thread || !workspace || !session) {
        throw new Error('Cursor session requires projectId, threadId, projectPath, and sessionId.')
      }
      const map = read()
      const row = {
        projectId: project,
        threadId: thread,
        projectPath: workspace,
        sessionId: session,
        updatedAt: Date.now(),
      }
      map[sessionKey(project, thread)] = row
      write(map)
      return { ...row }
    },
    deleteThread(threadId = '') {
      const thread = normalizeId(threadId)
      if (!thread) return 0
      const map = read()
      let removed = 0
      for (const [key, row] of Object.entries(map)) {
        if (normalizeId(row?.threadId) !== thread) continue
        delete map[key]
        removed += 1
      }
      if (removed) write(map)
      return removed
    },
    deleteProject(projectId = '') {
      const project = normalizeId(projectId)
      if (!project) return 0
      const map = read()
      let removed = 0
      for (const [key, row] of Object.entries(map)) {
        if (normalizeId(row?.projectId) !== project) continue
        delete map[key]
        removed += 1
      }
      if (removed) write(map)
      return removed
    },
  }
}

let singleton = null

export function getCursorAgentSessionRegistry() {
  if (!singleton) singleton = createCursorAgentSessionRegistry()
  return singleton
}

export function __resetCursorAgentSessionRegistryForTests() {
  singleton = null
}
