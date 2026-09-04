import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { revealManagedPlan, saveManagedPlanCopy } from '../../src/main/documents/managed-plan-file-actions.mjs'
import { savePlanDirection, selectPlanAuthoringProfile, writeManagedPlanDocument, readPlanState } from '../../src/main/chat/plan-runtime-state.mjs'

async function fixture() {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-plan-export-'))
  const projectRoot = path.join(userDataPath, 'project')
  await fs.mkdir(projectRoot)
  const options = { userDataPath, threadId: 'thread-one' }
  const direction = savePlanDirection(projectRoot, { summary: 'Do the work.', expected_revision: 0 }, options)
  const selected = selectPlanAuthoringProfile(projectRoot, {
    selected_profile: 'implementation', expected_revision: direction.plan.revision,
    expected_direction_revision: direction.plan.direction.revision,
  }, options)
  const written = writeManagedPlanDocument(projectRoot, {
    content: '# Plan\n\nThe accepted direction.', expected_revision: selected.plan.revision,
  }, options)
  const payload = { projectRoot, threadId: options.threadId, planId: written.plan.planId, expectedRevision: written.plan.revision }
  return { userDataPath, projectRoot, options, written, payload }
}

test('reveal resolves the actual managed file from plan identity', async () => {
  const f = await fixture()
  let revealed = ''
  const result = await revealManagedPlan({ ...f.payload, filePath: 'ignored.md' }, {
    userDataPath: f.userDataPath, showItemInFolder: (filePath) => { revealed = filePath },
  })
  assert.equal(result.ok, true)
  assert.equal(revealed, f.written.document.filePath)
})

test('save copy exports exact Markdown to the chosen path without changing the managed plan', async () => {
  const f = await fixture()
  const destination = path.join(f.projectRoot, 'Implementation.md')
  const before = readPlanState(f.projectRoot, f.options).plan
  const result = await saveManagedPlanCopy({ ...f.payload, content: 'ignore renderer content' }, {
    userDataPath: f.userDataPath,
    showSaveDialog: async (options) => {
      assert.equal(options.defaultPath, path.join(f.projectRoot, 'Plan.md'))
      return { canceled: false, filePath: destination }
    },
  })
  assert.equal(result.filePath, destination)
  assert.equal(await fs.readFile(destination, 'utf8'), await fs.readFile(f.written.document.filePath, 'utf8'))
  assert.deepEqual(readPlanState(f.projectRoot, f.options).plan, before)
})

test('cancelled export writes nothing, stale revisions and managed-storage destinations are rejected', async () => {
  const f = await fixture()
  const deps = { userDataPath: f.userDataPath, showSaveDialog: async () => ({ canceled: true }) }
  assert.deepEqual(await saveManagedPlanCopy(f.payload, deps), { ok: false, cancelled: true })
  assert.deepEqual(await fs.readdir(f.projectRoot), [])
  assert.equal((await saveManagedPlanCopy({ ...f.payload, expectedRevision: 0 }, deps)).error, 'plan_revision_conflict')
  const original = await fs.readFile(f.written.document.filePath, 'utf8')
  assert.equal((await saveManagedPlanCopy(f.payload, {
    ...deps, showSaveDialog: async () => ({ filePath: f.written.document.filePath }),
  })).error, 'managed_plan_destination')
  assert.equal(await fs.readFile(f.written.document.filePath, 'utf8'), original)
})

test('save copy rejects a plan revision that changes while the native dialog is open', async () => {
  const f = await fixture()
  const destination = path.join(f.projectRoot, 'Stale.md')
  const result = await saveManagedPlanCopy(f.payload, {
    userDataPath: f.userDataPath,
    showSaveDialog: async () => {
      writeManagedPlanDocument(f.projectRoot, {
        content: '# Revised plan\n\nA newer revision.',
        expected_revision: f.written.plan.revision,
      }, { ...f.options, allowReadyForReviewRevision: true })
      return { canceled: false, filePath: destination }
    },
  })
  assert.equal(result.error, 'plan_revision_conflict')
  await assert.rejects(fs.stat(destination), { code: 'ENOENT' })
})
