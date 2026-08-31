import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-file-save-artifacts-userdata-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

let registerFileHandlers = null
let registerArtifactHandlers = null
let closeDb = () => false
let importError = null

try {
  ;({ registerFileHandlers } = await import('../../src/main/ipc-handlers/file.mjs'))
  ;({ registerArtifactHandlers } = await import('../../src/main/ipc-handlers/artifacts.mjs'))
  ;({ closeDb } = await import('../../src/main/memory/db.mjs'))
} catch (error) {
  importError = error
}

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

function skipIfNativeDbUnavailable(t) {
  if (!importError) return false
  if (isNativeDbLoadError(importError)) {
    t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
    return true
  }
  throw importError
}

function createIpcMainHarness() {
  const handlers = new Map()
  return {
    ipcMain: {
      handle(channel, listener) {
        handlers.set(String(channel), listener)
      },
    },
    async invoke(channel, event = {}, payload) {
      const handler = handlers.get(String(channel))
      if (!handler) throw new Error(`No handler registered for ${channel}`)
      return handler(event, payload)
    },
  }
}

class FakeSender {
  constructor() {
    this.sent = []
    this.destroyed = false
  }

  send(channel, payload) {
    this.sent.push({ channel, payload })
  }

  isDestroyed() {
    return this.destroyed === true
  }
}

function createTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'addom-file-save-artifacts-project-'))
}

function writeProjectFile(projectRoot, relPath, content) {
  const absPath = path.join(projectRoot, relPath)
  fs.mkdirSync(path.dirname(absPath), { recursive: true })
  fs.writeFileSync(absPath, content, 'utf8')
}

function readProjectFile(projectRoot, relPath) {
  return fs.readFileSync(path.join(projectRoot, relPath), 'utf8')
}

function takeSent(sender) {
  const events = [...sender.sent]
  sender.sent.length = 0
  return events
}

function registeredProjects(projectRoot) {
  return () => [{ path: projectRoot }]
}

test.afterEach(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
})

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('editor save records manual_edit revisions, emits refresh events, and keeps rollback working', async (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  const projectRoot = createTempProject()
  const harness = createIpcMainHarness()
  const sender = new FakeSender()
  try {
    registerFileHandlers({ ipcMain: harness.ipcMain, listProjectsImpl: registeredProjects(projectRoot) })
    registerArtifactHandlers({ ipcMain: harness.ipcMain })
    writeProjectFile(projectRoot, 'src/example.txt', 'before save\n')

    const emptyFiles = await harness.invoke('v1:artifacts:listFiles', {}, {
      project: projectRoot,
    })
    assert.deepEqual(emptyFiles, [])

    const saved = await harness.invoke('v1:file:saveFile', { sender }, {
      project: projectRoot,
      filePath: 'src/example.txt',
      content: 'after save\n',
      encoding: 'utf8',
    })

    assert.equal(saved?.ok, true)
    assert.equal(saved?.source, 'manual_edit')
    assert.equal(saved?.artifactRecorded, true)
    assert.equal(saved?.unchanged, false)
    assert.equal(saved?.rev, 1)
    assert.match(String(saved?.prevRevId || ''), /^a_/)
    assert.match(String(saved?.newRevId || ''), /^a_/)
    assert.equal(readProjectFile(projectRoot, 'src/example.txt'), 'after save\n')

    const saveEvents = takeSent(sender)
    assert.deepEqual(
      saveEvents.map((entry) => entry.channel),
      ['v1:artifacts:updated', 'v1:file:tree-changed'],
    )
    assert.deepEqual(saveEvents[0].payload, { filePath: 'src/example.txt' })
    assert.equal(saveEvents[1]?.payload?.filePath, 'src/example.txt')
    assert.equal(saveEvents[1]?.payload?.source, 'editor-save')

    const revisions = await harness.invoke('v1:artifacts:listRevisions', {}, {
      project: projectRoot,
      filePath: 'src/example.txt',
    })
    assert.equal(revisions.length, 2)
    assert.equal(revisions[0]?.rev, 1)
    assert.equal(revisions[0]?.source, 'manual_edit')
    assert.equal(revisions[0]?.note, 'Saved from editor')
    assert.equal(revisions[1]?.rev, 0)
    assert.equal(revisions[1]?.source, 'baseline')
    assert.equal(revisions[1]?.note, 'Pre-manual-edit baseline')

    const filesAfterSave = await harness.invoke('v1:artifacts:listFiles', {}, {
      project: projectRoot,
    })
    assert.equal(filesAfterSave.length, 1)
    assert.equal(filesAfterSave[0]?.file_path, 'src/example.txt')
    assert.equal(filesAfterSave[0]?.latest_rev, 1)
    assert.equal(filesAfterSave[0]?.latest_source, 'manual_edit')
    assert.equal(filesAfterSave[0]?.total_revisions, 2)

    const rolledBack = await harness.invoke('v1:artifacts:rollback', { sender }, {
      project: projectRoot,
      filePath: 'src/example.txt',
      revId: saved.prevRevId,
    })

    assert.equal(rolledBack?.ok, true)
    assert.equal(rolledBack?.mode, 'rollback')
    assert.equal(readProjectFile(projectRoot, 'src/example.txt'), 'before save\n')

    const rollbackEvents = takeSent(sender)
    assert.deepEqual(
      rollbackEvents.map((entry) => entry.channel),
      ['v1:artifacts:updated', 'v1:file:tree-changed'],
    )

    const revisionsAfterRollback = await harness.invoke('v1:artifacts:listRevisions', {}, {
      project: projectRoot,
      filePath: 'src/example.txt',
    })
    assert.equal(revisionsAfterRollback.length, 3)
    assert.equal(revisionsAfterRollback[0]?.source, 'manual_rollback')
    assert.equal(revisionsAfterRollback[0]?.rev, 2)

    const filesAfterRollback = await harness.invoke('v1:artifacts:listFiles', {}, {
      project: projectRoot,
    })
    assert.equal(filesAfterRollback.length, 1)
    assert.equal(filesAfterRollback[0]?.file_path, 'src/example.txt')
    assert.equal(filesAfterRollback[0]?.latest_rev, 2)
    assert.equal(filesAfterRollback[0]?.latest_source, 'manual_rollback')
    assert.equal(filesAfterRollback[0]?.total_revisions, 3)
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('editor save skips unchanged content so repeated saves do not spam artifact history', async (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  const projectRoot = createTempProject()
  const harness = createIpcMainHarness()
  const sender = new FakeSender()
  try {
    registerFileHandlers({ ipcMain: harness.ipcMain, listProjectsImpl: registeredProjects(projectRoot) })
    registerArtifactHandlers({ ipcMain: harness.ipcMain })
    writeProjectFile(projectRoot, 'src/noop.txt', 'same content\n')

    const firstSave = await harness.invoke('v1:file:saveFile', { sender }, {
      project: projectRoot,
      filePath: 'src/noop.txt',
      content: 'same content\n',
      encoding: 'utf8',
    })

    assert.equal(firstSave?.ok, true)
    assert.equal(firstSave?.artifactRecorded, false)
    assert.equal(firstSave?.unchanged, true)
    assert.equal(firstSave?.rev, 0)
    assert.equal(takeSent(sender).length, 0)

    const revisionsAfterNoop = await harness.invoke('v1:artifacts:listRevisions', {}, {
      project: projectRoot,
      filePath: 'src/noop.txt',
    })
    assert.equal(revisionsAfterNoop.length, 0)

    const changedSave = await harness.invoke('v1:file:saveFile', { sender }, {
      project: projectRoot,
      filePath: 'src/noop.txt',
      content: 'changed once\n',
      encoding: 'utf8',
    })

    assert.equal(changedSave?.ok, true)
    assert.equal(changedSave?.artifactRecorded, true)
    assert.equal(changedSave?.unchanged, false)
    assert.equal(changedSave?.rev, 1)
    assert.equal(takeSent(sender).length, 2)

    const repeatedNoopSave = await harness.invoke('v1:file:saveFile', { sender }, {
      project: projectRoot,
      filePath: 'src/noop.txt',
      content: 'changed once\n',
      encoding: 'utf8',
    })

    assert.equal(repeatedNoopSave?.ok, true)
    assert.equal(repeatedNoopSave?.artifactRecorded, false)
    assert.equal(repeatedNoopSave?.unchanged, true)
    assert.equal(repeatedNoopSave?.newRevId, changedSave?.newRevId)
    assert.equal(repeatedNoopSave?.rev, changedSave?.rev)
    assert.equal(takeSent(sender).length, 0)

    const revisionsAfterRepeat = await harness.invoke('v1:artifacts:listRevisions', {}, {
      project: projectRoot,
      filePath: 'src/noop.txt',
    })
    assert.equal(revisionsAfterRepeat.length, 2)
    assert.equal(revisionsAfterRepeat[0]?.source, 'manual_edit')
    assert.equal(revisionsAfterRepeat[0]?.rev, 1)
    assert.equal(revisionsAfterRepeat[1]?.source, 'baseline')
    assert.equal(revisionsAfterRepeat[1]?.note, 'Pre-manual-edit baseline')
    assert.equal(readProjectFile(projectRoot, 'src/noop.txt'), 'changed once\n')
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('artifact project keys are normalized across slash variants', async (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  const projectRoot = createTempProject()
  const harness = createIpcMainHarness()
  const sender = new FakeSender()
  try {
    registerFileHandlers({ ipcMain: harness.ipcMain, listProjectsImpl: registeredProjects(projectRoot) })
    registerArtifactHandlers({ ipcMain: harness.ipcMain })

    const slashProject = projectRoot.replace(/\\/g, '/')
    const backslashProject = projectRoot.replace(/\//g, '\\')

    const saved = await harness.invoke('v1:file:saveFile', { sender }, {
      project: slashProject,
      filePath: 'src/path-key.txt',
      content: 'path key normalized\n',
      encoding: 'utf8',
    })

    assert.equal(saved?.ok, true)
    assert.equal(saved?.artifactRecorded, true)

    const filesFromBackslashProject = await harness.invoke('v1:artifacts:listFiles', {}, {
      project: backslashProject,
    })
    assert.equal(filesFromBackslashProject.length, 1)
    assert.equal(filesFromBackslashProject[0]?.file_path, 'src/path-key.txt')

    const revisionsFromBackslashProject = await harness.invoke('v1:artifacts:listRevisions', {}, {
      project: backslashProject,
      filePath: 'src/path-key.txt',
    })
    assert.equal(revisionsFromBackslashProject.length, 1)
    assert.equal(revisionsFromBackslashProject[0]?.source, 'manual_edit')
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('editor file IPC rejects renderer-supplied roots that are not registered projects', async (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  const registeredRoot = createTempProject()
  const unregisteredRoot = createTempProject()
  const harness = createIpcMainHarness()
  try {
    writeProjectFile(unregisteredRoot, 'private.txt', 'not renderer-readable\n')
    registerFileHandlers({
      ipcMain: harness.ipcMain,
      listProjectsImpl: registeredProjects(registeredRoot),
    })

    assert.deepEqual(
      await harness.invoke('v1:file:listTree', {}, { project: unregisteredRoot }),
      [],
    )
    assert.deepEqual(
      await harness.invoke('v1:file:readFile', {}, { project: unregisteredRoot, filePath: 'private.txt' }),
      { ok: false, error: 'project_not_registered' },
    )
    assert.deepEqual(
      await harness.invoke('v1:file:saveFile', {}, {
        project: unregisteredRoot,
        filePath: 'private.txt',
        content: 'blocked\n',
      }),
      { ok: false, error: 'project_not_registered' },
    )
    assert.equal(readProjectFile(unregisteredRoot, 'private.txt'), 'not renderer-readable\n')

    const junctionPath = path.join(registeredRoot, 'linked-outside')
    fs.symlinkSync(unregisteredRoot, junctionPath, 'junction')
    const linkedRead = await harness.invoke('v1:file:readFile', {}, {
      project: registeredRoot,
      filePath: 'linked-outside/private.txt',
    })
    assert.equal(linkedRead?.ok, false)
    assert.match(String(linkedRead?.error || ''), /escapes the project root/i)

    const linkedWrite = await harness.invoke('v1:file:saveFile', {}, {
      project: registeredRoot,
      filePath: 'linked-outside/private.txt',
      content: 'blocked through junction\n',
    })
    assert.equal(linkedWrite?.ok, false)
    assert.match(String(linkedWrite?.error || ''), /escapes the project root/i)
    assert.equal(readProjectFile(unregisteredRoot, 'private.txt'), 'not renderer-readable\n')
  } finally {
    fs.rmSync(registeredRoot, { recursive: true, force: true })
    fs.rmSync(unregisteredRoot, { recursive: true, force: true })
  }
})
