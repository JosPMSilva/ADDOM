import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_IGNORED_DIR_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'dist-electron',
  '.next',
  '.nuxt',
  '.cache',
  '.turbo',
  '.idea',
  '.vscode',
])

const EVENT_DEDUPE_MS = 100
const DIR_RESCAN_DEBOUNCE_MS = 250
const MAX_RECENT_EVENTS = 2400
const DEFAULT_MAX_DIRECTORIES = 3500
const DIRECTORY_SCAN_YIELD_INTERVAL = 48

function normalizeProjectPath(projectPath = '') {
  const raw = String(projectPath || '').trim()
  if (!raw) return ''
  const resolved = path.resolve(raw)
  try {
    return fs.realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

function normalizeRelativePath(value = '') {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
}

function pathInsideProject(projectRoot = '', absolutePath = '') {
  if (!projectRoot || !absolutePath) return false
  const rel = path.relative(projectRoot, absolutePath)
  if (!rel || rel === '.') return false
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false
  return true
}

function isIgnoredRelativePath(relativePath = '', ignoredDirNames = DEFAULT_IGNORED_DIR_NAMES) {
  const normalized = normalizeRelativePath(relativePath)
  if (!normalized) return false
  const segments = normalized.split('/').filter(Boolean)
  return segments.some((segment) => ignoredDirNames.has(String(segment || '').trim().toLowerCase()))
}

function isRecursiveWatchSupported() {
  return process.platform === 'win32' || process.platform === 'darwin'
}

export function createWorkspaceFileWatcher({
  onChange = () => {},
  onStatus = () => {},
  ignoredDirNames = DEFAULT_IGNORED_DIR_NAMES,
  maxDirectories = DEFAULT_MAX_DIRECTORIES,
  allowRecursive = true,
} = {}) {
  const safeOnChange = typeof onChange === 'function' ? onChange : () => {}
  const safeOnStatus = typeof onStatus === 'function' ? onStatus : () => {}
  const ignored = new Set(
    Array.from(ignoredDirNames || DEFAULT_IGNORED_DIR_NAMES)
      .map((name) => String(name || '').trim().toLowerCase())
      .filter(Boolean),
  )

  let activeProjectPath = ''
  let mode = 'idle' // idle | recursive | directory
  let disposed = false
  let recursiveWatcher = null
  const directoryWatchers = new Map()
  const recentEvents = new Map()
  let directoryRescanTimer = null
  let directoryScanGeneration = 0
  let watcherStatus = {
    projectPath: '',
    mode: 'idle',
    capped: false,
    watchedCount: 0,
    maxDirectories: Math.max(100, Number(maxDirectories || DEFAULT_MAX_DIRECTORIES) || DEFAULT_MAX_DIRECTORIES),
    scannedDirectories: 0,
    isScanning: false,
    changedAt: Date.now(),
  }

  function emitStatus(patch = {}) {
    watcherStatus = {
      ...watcherStatus,
      ...patch,
      changedAt: Date.now(),
    }
    try {
      safeOnStatus({ ...watcherStatus })
    } catch {
      // Non-fatal callback error.
    }
  }

  function clearRecentEvents(nowTs = Date.now()) {
    if (recentEvents.size <= MAX_RECENT_EVENTS) return
    for (const [key, ts] of recentEvents.entries()) {
      if ((nowTs - Number(ts || 0)) > EVENT_DEDUPE_MS * 20) {
        recentEvents.delete(key)
      }
    }
    while (recentEvents.size > MAX_RECENT_EVENTS) {
      const firstKey = recentEvents.keys().next().value
      if (firstKey == null) break
      recentEvents.delete(firstKey)
    }
  }

  function closeRecursiveWatcher() {
    if (!recursiveWatcher) return Promise.resolve()
    const watcher = recursiveWatcher
    recursiveWatcher = null
    return closeWatcher(watcher)
  }

  function closeDirectoryWatchers() {
    const watchers = [...directoryWatchers.values()]
    directoryWatchers.clear()
    return Promise.allSettled(watchers.map((watcher) => closeWatcher(watcher)))
  }

  function closeWatcher(watcher) {
    return new Promise((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      watcher.once('close', finish)
      try {
        watcher.close()
      } catch {
        finish()
      }
    })
  }

  function clearDirectoryRescanTimer() {
    if (!directoryRescanTimer) return
    clearTimeout(directoryRescanTimer)
    directoryRescanTimer = null
  }

  function closeAllWatchers() {
    directoryScanGeneration += 1
    clearDirectoryRescanTimer()
    const closePromise = Promise.allSettled([
      closeRecursiveWatcher(),
      closeDirectoryWatchers(),
    ])
    mode = 'idle'
    emitStatus({
      projectPath: activeProjectPath,
      mode,
      capped: false,
      watchedCount: 0,
      scannedDirectories: 0,
      isScanning: false,
    })
    return closePromise
  }

  function emitFileChange(absolutePath, eventType = 'change') {
    if (disposed) return
    const abs = String(absolutePath || '').trim()
    if (!activeProjectPath || !abs) return
    if (!pathInsideProject(activeProjectPath, abs)) return
    const relative = normalizeRelativePath(path.relative(activeProjectPath, abs))
    if (!relative) return
    if (isIgnoredRelativePath(relative, ignored)) return

    const nowTs = Date.now()
    const dedupeKey = `${String(eventType || 'change').toLowerCase()}:${relative.toLowerCase()}`
    const prevTs = Number(recentEvents.get(dedupeKey) || 0) || 0
    if (prevTs > 0 && (nowTs - prevTs) < EVENT_DEDUPE_MS) return
    recentEvents.set(dedupeKey, nowTs)
    clearRecentEvents(nowTs)

    try {
      safeOnChange({
        projectPath: activeProjectPath,
        filePath: relative,
        eventType: String(eventType || 'change'),
        changedAt: nowTs,
        source: 'watcher',
      })
    } catch (error) {
      console.warn('[workspace:file-watcher] change callback failed:', error?.message || error)
    }
  }

  function scheduleDirectoryRescan() {
    if (disposed || !activeProjectPath || mode !== 'directory') return
    if (directoryRescanTimer) return
    directoryRescanTimer = setTimeout(() => {
      directoryRescanTimer = null
      if (!disposed && activeProjectPath && mode === 'directory') {
        void startDirectoryWatchers()
      }
    }, DIR_RESCAN_DEBOUNCE_MS)
  }

  function attachDirectoryWatcher(dirPath) {
    const normalizedDir = String(dirPath || '').trim()
    if (!normalizedDir || directoryWatchers.has(normalizedDir)) return
    let watcher = null
    try {
      watcher = fs.watch(normalizedDir, { persistent: false }, (eventType, filename) => {
        const fileNameText = String(filename || '').trim()
        if (!fileNameText) return
        const targetAbsPath = path.resolve(normalizedDir, fileNameText)
        emitFileChange(targetAbsPath, eventType)
        if (String(eventType || '').toLowerCase() === 'rename') {
          scheduleDirectoryRescan()
        }
      })
    } catch {
      return
    }
    watcher.on('error', () => {
      const current = directoryWatchers.get(normalizedDir)
      if (current !== watcher) return
      try { watcher.close() } catch { /* best-effort watcher cleanup after error */ }
      directoryWatchers.delete(normalizedDir)
      scheduleDirectoryRescan()
    })
    directoryWatchers.set(normalizedDir, watcher)
  }

  async function startDirectoryWatchers() {
    closeDirectoryWatchers()
    if (!activeProjectPath) {
      mode = 'idle'
      emitStatus({
        projectPath: '',
        mode,
        capped: false,
        watchedCount: 0,
        scannedDirectories: 0,
        isScanning: false,
      })
      return false
    }

    const scanGeneration = ++directoryScanGeneration
    const projectPath = activeProjectPath
    const maxDirs = Math.max(100, Number(maxDirectories || DEFAULT_MAX_DIRECTORIES) || DEFAULT_MAX_DIRECTORIES)
    const stack = [projectPath]
    const watchedDirectories = []
    let watchedCount = 0
    let scannedDirectories = 0

    mode = 'directory'
    emitStatus({
      projectPath,
      mode,
      capped: false,
      watchedCount: 0,
      maxDirectories: maxDirs,
      scannedDirectories: 0,
      isScanning: true,
    })

    while (stack.length > 0 && watchedCount < maxDirs) {
      if (disposed || scanGeneration !== directoryScanGeneration || activeProjectPath !== projectPath) {
        return false
      }
      const currentDir = stack.pop()
      if (!currentDir) continue
      let stat = null
      try {
        stat = await fs.promises.stat(currentDir)
      } catch {
        continue
      }
      if (!stat?.isDirectory?.()) continue
      const relDir = normalizeRelativePath(path.relative(projectPath, currentDir))
      if (relDir && isIgnoredRelativePath(relDir, ignored)) continue
      scannedDirectories += 1
      if ((scannedDirectories % DIRECTORY_SCAN_YIELD_INTERVAL) === 0) {
        await new Promise((resolve) => setImmediate(resolve))
      }

      watchedDirectories.push(currentDir)
      watchedCount += 1

      let entries = []
      try {
        entries = await fs.promises.readdir(currentDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (!entry?.isDirectory?.() || entry?.isSymbolicLink?.()) continue
        const child = path.join(currentDir, entry.name)
        const relChild = normalizeRelativePath(path.relative(projectPath, child))
        if (isIgnoredRelativePath(relChild, ignored)) continue
        stack.push(child)
      }
    }

    if (disposed || scanGeneration !== directoryScanGeneration || activeProjectPath !== projectPath) {
      return false
    }

    for (const dirPath of watchedDirectories) {
      if (disposed || scanGeneration !== directoryScanGeneration || activeProjectPath !== projectPath) {
        closeDirectoryWatchers()
        return false
      }
      attachDirectoryWatcher(dirPath)
    }

    const capped = stack.length > 0
    mode = 'directory'
    emitStatus({
      projectPath,
      mode,
      capped,
      watchedCount: directoryWatchers.size,
      maxDirectories: maxDirs,
      scannedDirectories,
      isScanning: false,
    })
    return directoryWatchers.size > 0
  }

  function startRecursiveWatcher() {
    if (!allowRecursive || !activeProjectPath || !isRecursiveWatchSupported()) return false
    closeRecursiveWatcher()
    try {
      const watcher = fs.watch(activeProjectPath, { recursive: true, persistent: false }, (eventType, filename) => {
        const fileNameText = String(filename || '').trim()
        if (!fileNameText) return
        const targetAbsPath = path.resolve(activeProjectPath, fileNameText)
        emitFileChange(targetAbsPath, eventType)
      })
      watcher.on('error', () => {
        const activeWatcher = recursiveWatcher
        if (activeWatcher !== watcher) return
        closeRecursiveWatcher()
        if (!disposed && activeProjectPath) {
          void startDirectoryWatchers()
        }
      })
      recursiveWatcher = watcher
      mode = 'recursive'
      emitStatus({
        projectPath: activeProjectPath,
        mode,
        capped: false,
        watchedCount: 1,
        scannedDirectories: 0,
        isScanning: false,
      })
      return true
    } catch {
      return false
    }
  }

  function startWatchersForActiveProject() {
    if (!activeProjectPath) {
      mode = 'idle'
      return
    }
    const recursiveStarted = startRecursiveWatcher()
    if (recursiveStarted) return
    void startDirectoryWatchers()
  }

  function setProjectPath(projectPath = '') {
    if (disposed) return { projectPath: activeProjectPath, mode }
    const nextPath = normalizeProjectPath(projectPath)
    if (nextPath === activeProjectPath) return { ...watcherStatus }
    closeAllWatchers()
    activeProjectPath = nextPath
    recentEvents.clear()
    if (!activeProjectPath) {
      mode = 'idle'
      emitStatus({
        projectPath: '',
        mode,
        capped: false,
        watchedCount: 0,
        scannedDirectories: 0,
        isScanning: false,
      })
      return { ...watcherStatus }
    }
    startWatchersForActiveProject()
    return { ...watcherStatus }
  }

  function getProjectPath() {
    return activeProjectPath
  }

  function dispose() {
    disposed = true
    activeProjectPath = ''
    recentEvents.clear()
    return closeAllWatchers()
  }

  function getStatus() {
    return { ...watcherStatus }
  }

  return {
    setProjectPath,
    getProjectPath,
    getStatus,
    dispose,
  }
}
