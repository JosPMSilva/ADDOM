import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-chat-tool-step-fidelity-userdata-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

let executeTool = null
let buildPreviewableUnifiedDiff = null
let resolveToolWriteArtifactMeta = null
let recordWrite = null
let getRevision = null
let closeDb = () => false
let importError = null

try {
  ;({ executeTool } = await import('../../src/main/tools/fs-tools.mjs'))
  ;({ buildPreviewableUnifiedDiff } = await import('../../src/main/tools/apply-patch-core.mjs'))
  ;({ resolveToolWriteArtifactMeta } = await import('../../src/main/chat/chat-tool-step.mjs'))
  ;({ recordWrite, getRevision } = await import('../../src/main/memory/artifact-store.mjs'))
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

async function withArtifactDb(t, fn) {
  try {
    return await fn()
  } catch (error) {
    if (isNativeDbLoadError(error)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return undefined
    }
    throw error
  }
}

async function withTempProject(fn) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-chat-tool-step-fidelity-project-'))
  try {
    return await fn(projectRoot)
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
}

function writeRaw(projectRoot, relPath, content = '') {
  const abs = path.join(projectRoot, relPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content, 'utf8')
}

function assertArtifactDbReady(projectRoot) {
  recordWrite({
    project: projectRoot,
    filePath: '__artifact-db-health__.txt',
    newContent: 'ok\n',
    prevContent: '',
    source: 'ai_write',
    note: 'artifact db health check',
  })
}

test.afterEach(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
})

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('resolveToolWriteArtifactMeta emits exact rollback_file diff, counts, and revisions', async (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  await withArtifactDb(t, async () => {
    await withTempProject(async (projectRoot) => {
      assertArtifactDbReady(projectRoot)
      writeRaw(projectRoot, 'src/restore.txt', 'current content\n')
      const { prevRevId } = recordWrite({
        project: projectRoot,
        filePath: 'src/restore.txt',
        newContent: 'current content\n',
        prevContent: 'baseline content\n',
        source: 'ai_write',
        note: 'rollback fidelity fixture',
      })

      const execResult = await executeTool(projectRoot, 'rollback_file', {
        path: 'src/restore.txt',
        revision_id: prevRevId,
      })

      const fileChange = await resolveToolWriteArtifactMeta({
        tc: { name: 'rollback_file' },
        projectFolder: projectRoot,
        toolInput: {
          path: 'src/restore.txt',
          revision_id: prevRevId,
        },
        execResult,
      })

      assert.equal(fileChange?.filePath, 'src/restore.txt')
      assert.equal(fileChange?.changeType, 'rolled_back')
      assert.equal(fileChange?.source, 'rollback')
      assert.equal(fileChange?.addedLines, 1)
      assert.equal(fileChange?.removedLines, 1)
      assert.equal(
        fileChange?.diffText,
        buildPreviewableUnifiedDiff({
          previousContent: 'current content\n',
          nextContent: 'baseline content\n',
        }),
      )
      assert.ok(String(fileChange?.newRevId || '').trim())
      assert.ok(String(fileChange?.prevRevId || '').trim())
      assert.equal(getRevision(fileChange.newRevId)?.content, 'baseline content\n')
      assert.equal(getRevision(fileChange.prevRevId)?.content, 'current content\n')
    })
  })
})

test('resolveToolWriteArtifactMeta makes pure rename_file path-only but revision-backed', async (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  await withArtifactDb(t, async () => {
    await withTempProject(async (projectRoot) => {
      assertArtifactDbReady(projectRoot)
      writeRaw(projectRoot, 'docs/old-name.md', '# docs\n')

      const execResult = await executeTool(projectRoot, 'rename_file', {
        old_path: 'docs/old-name.md',
        new_path: 'docs/new-name.md',
      })

      const fileChange = await resolveToolWriteArtifactMeta({
        tc: { name: 'rename_file' },
        projectFolder: projectRoot,
        toolInput: {
          old_path: 'docs/old-name.md',
          new_path: 'docs/new-name.md',
        },
        execResult,
      })

      assert.equal(fileChange?.filePath, 'docs/new-name.md')
      assert.equal(fileChange?.renamedFrom, 'docs/old-name.md')
      assert.equal(fileChange?.changeType, 'renamed')
      assert.equal(fileChange?.addedLines, 0)
      assert.equal(fileChange?.removedLines, 0)
      assert.equal(fileChange?.diffText, '')
      assert.ok(String(fileChange?.newRevId || '').trim())
      assert.ok(String(fileChange?.prevRevId || '').trim())
      assert.equal(getRevision(fileChange.newRevId)?.content, '# docs\n')
      assert.equal(getRevision(fileChange.prevRevId)?.content, '# docs\n')
    })
  })
})

test('resolveToolWriteArtifactMeta keeps rename_file preview exact when renamed content changes before metadata resolution', async (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  await withArtifactDb(t, async () => {
    await withTempProject(async (projectRoot) => {
      assertArtifactDbReady(projectRoot)
      writeRaw(projectRoot, 'docs/source.md', 'before rename\n')

      const execResult = await executeTool(projectRoot, 'rename_file', {
        old_path: 'docs/source.md',
        new_path: 'docs/renamed.md',
      })
      fs.writeFileSync(path.join(projectRoot, 'docs', 'renamed.md'), 'after rename\n', 'utf8')

      const fileChange = await resolveToolWriteArtifactMeta({
        tc: { name: 'rename_file' },
        projectFolder: projectRoot,
        toolInput: {
          old_path: 'docs/source.md',
          new_path: 'docs/renamed.md',
        },
        execResult,
      })

      assert.equal(fileChange?.filePath, 'docs/renamed.md')
      assert.equal(fileChange?.renamedFrom, 'docs/source.md')
      assert.equal(fileChange?.changeType, 'renamed')
      assert.equal(fileChange?.addedLines, 1)
      assert.equal(fileChange?.removedLines, 1)
      assert.equal(
        fileChange?.diffText,
        buildPreviewableUnifiedDiff({
          previousContent: 'before rename\n',
          nextContent: 'after rename\n',
        }),
      )
      assert.equal(getRevision(fileChange.newRevId)?.content, 'after rename\n')
      assert.equal(getRevision(fileChange.prevRevId)?.content, 'before rename\n')
    })
  })
})

test('resolveToolWriteArtifactMeta emits exact delete_file diff, counts, and revisions', async (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  await withArtifactDb(t, async () => {
    await withTempProject(async (projectRoot) => {
      assertArtifactDbReady(projectRoot)
      writeRaw(projectRoot, 'src/delete-me.txt', 'remove this line\n')

      const execResult = await executeTool(projectRoot, 'delete_file', {
        path: 'src/delete-me.txt',
      })

      const fileChange = await resolveToolWriteArtifactMeta({
        tc: { name: 'delete_file' },
        projectFolder: projectRoot,
        toolInput: {
          path: 'src/delete-me.txt',
        },
        execResult,
      })

      assert.equal(fileChange?.filePath, 'src/delete-me.txt')
      assert.equal(fileChange?.changeType, 'deleted')
      assert.equal(fileChange?.source, 'ai_write')
      assert.equal(fileChange?.addedLines, 0)
      assert.equal(fileChange?.removedLines, 1)
      assert.ok(String(fileChange?.newRevId || '').trim())
      assert.ok(String(fileChange?.prevRevId || '').trim())
      assert.equal(getRevision(fileChange.newRevId)?.content, '')
      assert.equal(getRevision(fileChange.prevRevId)?.content, 'remove this line\n')
    })
  })
})
