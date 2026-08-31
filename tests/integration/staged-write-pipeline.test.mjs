import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-staged-write-userdata-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

let ensureStagedState = null
let toStageError = null
let stageAgentWrite = null
let stageAgentPatch = null
let applyArtifactRevision = null
let closeDb = () => false
let importError = null

try {
  ;({ ensureStagedState, toStageError, stageAgentWrite, stageAgentPatch } = await import('../../src/main/moa/staged-write-pipeline.mjs'))
  ;({ applyArtifactRevision } = await import('../../src/main/tools/artifact-apply-tool.mjs'))
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

function createTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'addom-staged-write-project-'))
}

function createPolicy(overrides = {}) {
  return {
    maxAgentStagedBytesPerFile: 1024,
    maxAgentStagedFilesPerTask: 2,
    maxAgentStagedFilesPerDelegation: 4,
    maxAgentStagedTotalBytesPerDelegation: 4096,
    ...overrides,
  }
}

test.afterEach(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
})

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('ensureStagedState initializes runtime staging containers', (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  const runtime = {}
  const state = ensureStagedState(runtime)

  assert.equal(state.totalFiles, 0)
  assert.equal(state.totalBytes, 0)
  assert.ok(state.byTask instanceof Map)
  assert.ok(Array.isArray(runtime.stagedChanges))
})

test('toStageError attaches the provided code', (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  const error = toStageError('staged_limit', 'Limit reached')
  assert.equal(error.code, 'staged_limit')
  assert.equal(error.message, 'Limit reached')
})

test('stageAgentWrite records a staged artifact, updates runtime counters, and emits telemetry', (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  const projectFolder = createTempProject()
  const runtime = {}
  const emitted = []

  try {
    const existingFile = path.join(projectFolder, 'src', 'app.js')
    fs.mkdirSync(path.dirname(existingFile), { recursive: true })
    fs.writeFileSync(existingFile, 'const before = true\n', 'utf8')

    let staged
    try {
      staged = stageAgentWrite({
        projectFolder,
        taskId: 'task-1',
        roleId: 'role-1',
        role: 'Security Reviewer',
        delegationId: 'delegation-1',
        turnId: 'turn-1',
        threadId: 'thread-1',
        stepId: 'step-1',
        toolInput: {
          path: 'src/app.js',
          content: 'const after = true\nconst extra = true\n',
        },
        policy: createPolicy(),
        runtime,
        emit: (channel, payload) => emitted.push({ channel, payload }),
      })
    } catch (error) {
      if (isNativeDbLoadError(error)) {
        t.skip('better-sqlite3 native binding is unavailable for staged artifact persistence on this runtime')
        return
      }
      throw error
    }

    const state = ensureStagedState(runtime)
    assert.equal(staged.filePath, 'src/app.js')
    assert.ok(staged.revisionId)
    assert.equal(state.totalFiles, 1)
    assert.equal(state.byTask.get('task-1').files, 1)
    assert.equal(runtime.stagedChanges.length, 1)
    assert.equal(emitted.length, 1)
    assert.equal(emitted[0].channel, 'moa:agent-file-staged')
    assert.equal(emitted[0].payload.filePath, 'src/app.js')
    assert.equal(emitted[0].payload.status, 'staged')
  } finally {
    fs.rmSync(projectFolder, { recursive: true, force: true })
  }
})

test('stageAgentWrite rejects traversal paths and staged size limits', (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  const projectFolder = createTempProject()
  try {
    assert.throws(
      () => stageAgentWrite({
        projectFolder,
        taskId: 'task-1',
        roleId: 'role-1',
        role: 'Security Reviewer',
        delegationId: 'delegation-1',
        turnId: 'turn-1',
        threadId: 'thread-1',
        stepId: 'step-1',
        toolInput: { path: '../outside.js', content: 'blocked' },
        policy: createPolicy(),
        runtime: {},
        emit: () => {},
      }),
      /escapes the project root/i,
    )

    assert.throws(
      () => stageAgentWrite({
        projectFolder,
        taskId: 'task-1',
        roleId: 'role-1',
        role: 'Security Reviewer',
        delegationId: 'delegation-1',
        turnId: 'turn-1',
        threadId: 'thread-1',
        stepId: 'step-1',
        toolInput: { path: 'src/app.js', content: 'x'.repeat(2048) },
        policy: createPolicy({ maxAgentStagedBytesPerFile: 256 }),
        runtime: {},
        emit: () => {},
      }),
      /maxAgentStagedBytesPerFile/i,
    )
  } finally {
    fs.rmSync(projectFolder, { recursive: true, force: true })
  }
})

test('managed staged writes update only the isolated project view', (t) => {
  if (skipIfNativeDbUnavailable(t)) return
  const sourceProject = createTempProject()
  const isolatedProject = createTempProject()
  try {
    fs.writeFileSync(path.join(sourceProject, 'app.js'), 'source\n', 'utf8')
    fs.writeFileSync(path.join(isolatedProject, 'app.js'), 'source\n', 'utf8')
    const staged = stageAgentWrite({
      projectFolder: isolatedProject,
      taskId: 'task-isolated',
      roleId: 'role-isolated',
      role: 'Code Agent',
      delegationId: 'delegation-isolated',
      turnId: 'turn-isolated',
      threadId: 'thread-isolated',
      stepId: 'step-isolated',
      toolInput: { path: 'app.js', content: 'workspace\n' },
      policy: createPolicy(),
      runtime: {
        sourceProjectFolder: sourceProject,
        agentWorkspace: {
          id: 'workspace_isolated',
          mode: 'local_overlay',
        },
      },
      emit: () => {},
    })

    assert.equal(staged.filePath, 'app.js')
    assert.equal(fs.readFileSync(path.join(isolatedProject, 'app.js'), 'utf8'), 'workspace\n')
    assert.equal(fs.readFileSync(path.join(sourceProject, 'app.js'), 'utf8'), 'source\n')
  } finally {
    fs.rmSync(sourceProject, { recursive: true, force: true })
    fs.rmSync(isolatedProject, { recursive: true, force: true })
  }
})

test('stageAgentPatch stages create, move, and delete operations as artifact-backed suggestions', async (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  const projectFolder = createTempProject()
  const runtime = {}
  const emitted = []

  try {
    fs.mkdirSync(path.join(projectFolder, 'src'), { recursive: true })
    fs.writeFileSync(path.join(projectFolder, 'src', 'before.js'), 'const value = 1\n', 'utf8')

    let createChange
    let moveChange
    let deleteChange
    try {
      createChange = stageAgentPatch({
        projectFolder,
        taskId: 'task-patch-1',
        roleId: 'role-1',
        role: 'Code Agent',
        delegationId: 'delegation-1',
        turnId: 'turn-1',
        threadId: 'thread-1',
        stepId: 'step-1',
        toolInput: {
          patch: [
            '*** Begin Patch',
            '*** Add File: src/created.js',
            '+export const created = true',
            '*** End Patch',
          ].join('\n'),
        },
        policy: createPolicy(),
        runtime,
        emit: (channel, payload) => emitted.push({ channel, payload }),
      })
    } catch (error) {
      if (isNativeDbLoadError(error)) {
        t.skip('better-sqlite3 native binding is unavailable for staged patch persistence on this runtime')
        return
      }
      throw error
    }
    assert.equal(createChange.filePath, 'src/created.js')
    assert.ok(createChange.revisionId)

    moveChange = stageAgentPatch({
      projectFolder,
      taskId: 'task-patch-2',
      roleId: 'role-1',
      role: 'Code Agent',
      delegationId: 'delegation-1',
      turnId: 'turn-1',
      threadId: 'thread-1',
      stepId: 'step-2',
      toolInput: {
        patch: [
          '*** Begin Patch',
          '*** Update File: src/before.js',
          '*** Move to: src/after.js',
          '@@ -1,1 +1,1 @@',
          '-const value = 1',
          '+const value = 1',
          '*** End Patch',
        ].join('\n'),
      },
      policy: createPolicy(),
      runtime,
      emit: (channel, payload) => emitted.push({ channel, payload }),
    })
    assert.equal(moveChange.filePath, 'src/after.js')
    assert.equal(moveChange.renamedFrom, 'src/before.js')
    let moveApply
    try {
      moveApply = await applyArtifactRevision(projectFolder, { revision_id: moveChange.revisionId })
    } catch (error) {
      if (isNativeDbLoadError(error)) {
        t.skip('better-sqlite3 native binding is unavailable for staged patch apply on this runtime')
        return
      }
      throw error
    }
    assert.match(String(moveApply.message || ''), /moved src\/before\.js -> src\/after\.js/i)
    assert.equal(fs.existsSync(path.join(projectFolder, 'src', 'before.js')), false)
    assert.equal(fs.readFileSync(path.join(projectFolder, 'src', 'after.js'), 'utf8'), 'const value = 1\n')

    deleteChange = stageAgentPatch({
      projectFolder,
      taskId: 'task-patch-3',
      roleId: 'role-1',
      role: 'Code Agent',
      delegationId: 'delegation-1',
      turnId: 'turn-1',
      threadId: 'thread-1',
      stepId: 'step-3',
      toolInput: {
        patch: [
          '*** Begin Patch',
          '*** Delete File: src/before.js',
          '*** End Patch',
        ].join('\n'),
      },
      policy: createPolicy(),
      runtime,
      emit: (channel, payload) => emitted.push({ channel, payload }),
    })
    assert.equal(deleteChange.filePath, 'src/before.js')
    assert.equal(deleteChange.changeType, 'delete_file')
    fs.writeFileSync(path.join(projectFolder, 'src', 'before.js'), 'const doomed = true\n', 'utf8')
    const deleteApply = await applyArtifactRevision(projectFolder, { revision_id: deleteChange.revisionId })
    assert.match(String(deleteApply.message || ''), /deleted src\/before\.js/i)
    assert.equal(fs.existsSync(path.join(projectFolder, 'src', 'before.js')), false)
    assert.equal(emitted.filter((row) => row.channel === 'moa:agent-file-staged').length, 3)
  } finally {
    fs.rmSync(projectFolder, { recursive: true, force: true })
  }
})

test('stageAgentWrite enforces per-task staged file limits before writing artifacts', (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  const projectFolder = createTempProject()
  try {
    const runtime = {
      stagedState: {
        totalFiles: 1,
        totalBytes: 10,
        byTask: new Map([
          ['task-1', { files: 1, bytes: 10 }],
        ]),
      },
      stagedChanges: [],
    }

    assert.throws(
      () => stageAgentWrite({
        projectFolder,
        taskId: 'task-1',
        roleId: 'role-1',
        role: 'Security Reviewer',
        delegationId: 'delegation-1',
        turnId: 'turn-1',
        threadId: 'thread-1',
        stepId: 'step-1',
        toolInput: { path: 'src/app.js', content: 'const ok = true\n' },
        policy: createPolicy({ maxAgentStagedFilesPerTask: 1 }),
        runtime,
        emit: () => {},
      }),
      /maxAgentStagedFilesPerTask/i,
    )
  } finally {
    fs.rmSync(projectFolder, { recursive: true, force: true })
  }
})
