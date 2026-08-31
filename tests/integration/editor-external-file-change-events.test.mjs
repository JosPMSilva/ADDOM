import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createWorkspaceFileWatcher } from '../../src/main/workspace/file-watcher.mjs'

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(predicate, timeoutMs = 3000, stepMs = 40) {
  const start = Date.now()
  while ((Date.now() - start) < timeoutMs) {
    if (predicate()) return true
    await wait(stepMs)
  }
  return false
}

test('workspace file watcher emits file:external-change payload for active project files', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-watch-'))
  const srcDir = path.join(root, 'src')
  const fileAbsPath = path.join(srcDir, 'index.js')
  fs.mkdirSync(srcDir, { recursive: true })
  fs.writeFileSync(fileAbsPath, 'export const x = 1\n', 'utf8')

  const events = []
  const watcher = createWorkspaceFileWatcher({
    allowRecursive: false,
    onChange: (payload) => events.push(payload),
  })
  t.after(async () => {
    await watcher.dispose()
    fs.rmSync(root, { recursive: true, force: true })
  })

  watcher.setProjectPath(root)
  assert.equal(watcher.getProjectPath(), fs.realpathSync.native(root))
  const ready = await waitFor(() => {
    const status = watcher.getStatus()
    return String(status.mode || '') === 'directory' && status.isScanning === false
  })
  assert.equal(ready, true, 'expected watcher to finish directory scan before file change assertion')

  fs.writeFileSync(fileAbsPath, 'export const x = 2\n', 'utf8')

  const seen = await waitFor(() => events.some((row) => row?.filePath === 'src/index.js'))
  assert.equal(seen, true, 'expected watcher to emit src/index.js change event')
  const payload = events.find((row) => row?.filePath === 'src/index.js')
  assert.equal(payload.projectPath, watcher.getProjectPath())
  assert.equal(payload.source, 'watcher')
  assert.ok(Number(payload.changedAt) > 0)
})

test('workspace file watcher ignores node_modules changes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-watch-ignore-'))
  const ignoredDir = path.join(root, 'node_modules', 'dep')
  const ignoredFile = path.join(ignoredDir, 'index.js')
  fs.mkdirSync(ignoredDir, { recursive: true })
  fs.writeFileSync(ignoredFile, 'module.exports = 1\n', 'utf8')

  const events = []
  const watcher = createWorkspaceFileWatcher({
    allowRecursive: false,
    onChange: (payload) => events.push(payload),
  })
  t.after(async () => {
    await watcher.dispose()
    fs.rmSync(root, { recursive: true, force: true })
  })

  watcher.setProjectPath(root)
  assert.equal(watcher.getProjectPath(), fs.realpathSync.native(root))
  const ready = await waitFor(() => {
    const status = watcher.getStatus()
    return String(status.mode || '') === 'directory' && status.isScanning === false
  })
  assert.equal(ready, true, 'expected watcher to finish directory scan before ignore assertion')

  fs.writeFileSync(ignoredFile, 'module.exports = 2\n', 'utf8')
  await wait(350)

  assert.equal(
    events.some((row) => String(row?.filePath || '').includes('node_modules')),
    false,
    'node_modules changes should be ignored',
  )
})

test('workspace file watcher emits capped status in directory mode when maxDirectories is reached', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-watch-cap-'))
  for (let i = 0; i < 140; i += 1) {
    fs.mkdirSync(path.join(root, `dir_${i}`, 'nested'), { recursive: true })
  }

  const statuses = []
  const watcher = createWorkspaceFileWatcher({
    allowRecursive: false,
    maxDirectories: 100,
    onStatus: (payload) => statuses.push(payload),
  })
  t.after(async () => {
    await watcher.dispose()
    fs.rmSync(root, { recursive: true, force: true })
  })

  const status = watcher.setProjectPath(root)
  assert.equal(watcher.getProjectPath(), fs.realpathSync.native(root))
  assert.equal(String(status.mode || ''), 'directory')
  assert.equal(status.isScanning, true)

  const ready = await waitFor(() => {
    const nextStatus = watcher.getStatus()
    return String(nextStatus.mode || '') === 'directory' && nextStatus.isScanning === false
  })
  assert.equal(ready, true, 'expected watcher to finish directory scan')

  const finalStatus = watcher.getStatus()
  assert.equal(String(finalStatus.mode || ''), 'directory')
  assert.equal(finalStatus.isScanning, false)
  assert.equal(!!finalStatus.capped, true, 'expected watcher to report capped directory coverage')
  assert.ok(Number(finalStatus.watchedCount || 0) <= 100)
  assert.equal(Number(finalStatus.maxDirectories || 0), 100)
  assert.equal(finalStatus.projectPath, watcher.getProjectPath())

  const emittedScanning = statuses.some((row) => row && row.isScanning === true && String(row.mode || '') === 'directory')
  assert.equal(emittedScanning, true, 'expected onStatus callback to receive a scan-in-progress directory payload')
  const emittedCapped = statuses.some((row) => row && row.capped === true && row.isScanning === false && String(row.mode || '') === 'directory')
  assert.equal(emittedCapped, true, 'expected onStatus callback to receive a capped directory-mode payload')
})
