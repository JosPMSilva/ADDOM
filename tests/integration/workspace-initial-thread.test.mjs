import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.ADDOM_USER_DATA_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-initial-thread-'))
const { registerProject, createThread, listThreads, renameThread } = await import('../../src/main/workspace/workspace-store.mjs')
const { closeDb } = await import('../../src/main/memory/db.mjs')
test.after(() => closeDb())

test('project registration creates one New Thread and reopening preserves its identity and title', () => {
  const projectPath = path.join(process.env.ADDOM_USER_DATA_PATH, 'project')
  const opened = registerProject(projectPath)
  assert.deepEqual(listThreads(opened.project.id).map((thread) => thread.title), ['New Thread'])
  renameThread(opened.project.id, opened.activeThread.id, 'My work')
  const reopened = registerProject(projectPath)
  assert.equal(reopened.activeThread.id, opened.activeThread.id)
  assert.deepEqual(listThreads(opened.project.id).map((thread) => thread.title), ['My work'])
  createThread(opened.project.id)
  assert.equal(listThreads(opened.project.id).length, 2)
})
