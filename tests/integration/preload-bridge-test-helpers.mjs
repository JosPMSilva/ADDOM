import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export async function createPreloadHarness({
  invokeBehavior = async (channel, payload) => ({ channel, payload }),
  npmPackageVersion = '1.0.0-test',
  processArgv = ['--addom-app-version=1.0.0'],
} = {}) {
  const preloadPath = path.resolve('src/preload/index.mjs')
  const preloadSource = fs.readFileSync(preloadPath, 'utf8')
  const preloadDir = path.dirname(preloadPath)
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-preload-test-'))
  const preloadUnderTestPath = path.join(tempRoot, 'preload-under-test.cjs')
  const electronMockDir = path.join(tempRoot, 'node_modules', 'electron')

  const sent = []
  const invokeCalls = []
  const listeners = new Map()
  const exposed = {}

  const ipcRenderer = {
    send(channel, payload) {
      sent.push({ channel, payload })
    },
    async invoke(channel, payload) {
      invokeCalls.push({ channel, payload })
      return invokeBehavior(channel, payload)
    },
    on(channel, handler) {
      const key = String(channel || '')
      const rows = listeners.get(key) || []
      rows.push(handler)
      listeners.set(key, rows)
    },
    removeListener(channel, handler) {
      const key = String(channel || '')
      const rows = listeners.get(key) || []
      listeners.set(key, rows.filter((row) => row !== handler))
    },
  }

  const contextBridge = {
    exposeInMainWorld(key, value) {
      exposed[String(key || '')] = value
    },
  }

  fs.mkdirSync(electronMockDir, { recursive: true })
  fs.writeFileSync(
    path.join(electronMockDir, 'package.json'),
    JSON.stringify({ name: 'electron', main: 'index.js' }, null, 2),
    'utf8',
  )
  fs.writeFileSync(
    path.join(electronMockDir, 'index.js'),
    [
      'const mock = globalThis.__addomElectronMock',
      'module.exports = {',
      '  contextBridge: mock.contextBridge,',
      '  ipcRenderer: mock.ipcRenderer,',
      '}',
      '',
    ].join('\n'),
    'utf8',
  )
  fs.writeFileSync(preloadUnderTestPath, preloadSource, 'utf8')
  for (const entry of fs.readdirSync(preloadDir)) {
    if (!entry.endsWith('.cjs')) continue
    fs.copyFileSync(path.join(preloadDir, entry), path.join(tempRoot, entry))
  }

  const originalVersion = process.env.npm_package_version
  const originalArgv = process.argv
  globalThis.__addomElectronMock = { contextBridge, ipcRenderer }
  if (typeof npmPackageVersion === 'string') process.env.npm_package_version = npmPackageVersion
  else delete process.env.npm_package_version
  process.argv = Array.isArray(processArgv) ? [...processArgv] : []
  try {
    await import(`${pathToFileURL(preloadUnderTestPath).href}?cacheBust=${Date.now()}_${Math.random()}`)
  } finally {
    delete globalThis.__addomElectronMock
    if (typeof originalVersion === 'string') process.env.npm_package_version = originalVersion
    else delete process.env.npm_package_version
    process.argv = originalArgv
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }

  return {
    addom: exposed.addom,
    sent,
    invokeCalls,
    listenerCount(channel) {
      return (listeners.get(String(channel || '')) || []).length
    },
    emit(channel, payload) {
      const rows = listeners.get(String(channel || '')) || []
      for (const handler of rows) {
        handler({}, payload)
      }
    },
  }
}
