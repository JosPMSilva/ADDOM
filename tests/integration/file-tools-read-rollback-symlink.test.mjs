import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsModule from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  MAX_WRITE_FILE_BYTES,
  findFiles,
  grepFile,
  listDirectory,
  readFile,
  rollbackFile,
  searchCode,
  viewFileRange,
} from '../../src/main/tools/file-tools.mjs'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-file-tools-read-rollback-userdata-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

let recordWrite = null
let listRevisions = null
let closeDb = () => false
let importError = null

try {
  ;({ recordWrite, listRevisions } = await import('../../src/main/memory/artifact-store.mjs'))
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
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-file-tools-read-rollback-project-'))
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

function tryCreateDirectoryLink(targetPath, linkPath) {
  try {
    fs.symlinkSync(targetPath, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
    return true
  } catch {
    return false
  }
}

test.afterEach(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
})

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
})

test('direct read helpers reject paths that traverse symlinked directories', async (t) => {
  await withTempProject(async (projectRoot) => {
    writeRaw(projectRoot, 'real-files/note.txt', 'alpha\nbeta\nneedle\n')
    const linkedDir = path.join(projectRoot, 'linked-files')
    if (!tryCreateDirectoryLink(path.join(projectRoot, 'real-files'), linkedDir)) {
      t.skip('symlink creation is unavailable in this environment')
      return
    }

    await assert.rejects(
      () => readFile(projectRoot, { path: 'linked-files/note.txt' }),
      /symbolic link/i,
    )
    await assert.rejects(
      () => viewFileRange(projectRoot, { path: 'linked-files/note.txt', start_line: 1, end_line: 2 }),
      /symbolic link/i,
    )
    await assert.rejects(
      () => grepFile(projectRoot, { path: 'linked-files/note.txt', pattern: 'needle' }),
      /symbolic link/i,
    )
  })
})

test('recursive traversal helpers reject symlinked root paths', async (t) => {
  await withTempProject(async (projectRoot) => {
    writeRaw(projectRoot, 'real-search/app.txt', 'needle in a haystack\n')
    const linkedRoot = path.join(projectRoot, 'linked-root')
    if (!tryCreateDirectoryLink(path.join(projectRoot, 'real-search'), linkedRoot)) {
      t.skip('symlink creation is unavailable in this environment')
      return
    }

    await assert.rejects(
      () => listDirectory(projectRoot, { path: 'linked-root', depth: 2 }),
      /symbolic link/i,
    )
    await assert.rejects(
      () => searchCode(projectRoot, { path: 'linked-root', query: 'needle' }),
      /symbolic link/i,
    )
    await assert.rejects(
      () => findFiles(projectRoot, { path: 'linked-root', pattern: 'app' }),
      /symbolic link/i,
    )
  })
})

test('recursive traversal helpers skip symlink entries inside a normal tree', async (t) => {
  await withTempProject(async (projectRoot) => {
    writeRaw(projectRoot, 'src/visible.txt', 'safe content\n')
    writeRaw(projectRoot, 'real-linked/hidden.txt', 'needle hidden in symlinked dir\n')
    const linkedEntry = path.join(projectRoot, 'src', 'linked-dir')
    if (!tryCreateDirectoryLink(path.join(projectRoot, 'real-linked'), linkedEntry)) {
      t.skip('symlink creation is unavailable in this environment')
      return
    }

    const listing = await listDirectory(projectRoot, { path: 'src', depth: 3 })
    assert.doesNotMatch(listing, /linked-dir/)

    const searchResult = await searchCode(projectRoot, { path: 'src', query: 'needle' })
    assert.match(searchResult, /No matches found/i)

    const findResult = await findFiles(projectRoot, { path: 'src', pattern: 'hidden' })
    assert.match(findResult, /No matches found/i)
  })
})

test('read and traversal helpers can inspect host paths when full access is enabled', async () => {
  await withTempProject(async (projectRoot) => {
    const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-file-tools-host-read-'))
    const externalFile = path.join(externalDir, 'config.txt')
    fs.writeFileSync(externalFile, 'needle from host path\n', 'utf8')

    try {
      const content = await readFile(projectRoot, { path: externalFile }, { fileSystemHostFullAccess: true })
      assert.equal(content, 'needle from host path\n')

      const listing = await listDirectory(projectRoot, { path: externalDir, depth: 2 }, { fileSystemHostFullAccess: true })
      assert.match(listing, /config\.txt/i)

      const searchResult = await searchCode(
        projectRoot,
        { path: externalDir, query: 'needle' },
        { fileSystemHostFullAccess: true },
      )
      assert.match(String(searchResult), /config\.txt:1:/i)

      const findResult = await findFiles(
        projectRoot,
        { path: externalDir, pattern: 'config' },
        { fileSystemHostFullAccess: true },
      )
      assert.match(String(findResult), /config\.txt/i)
    } finally {
      fs.rmSync(externalDir, { recursive: true, force: true })
    }
  })
})

test('rollbackFile rejects path-shape violations before artifact access', async () => {
  await withTempProject(async (projectRoot) => {
    const deepPath = new Array(45).fill('nested').join('/') + '/file.txt'
    await assert.rejects(
      () => rollbackFile(projectRoot, { path: deepPath, revision_id: 'rev_1' }),
      /too many nested segments/i,
    )
  })
})

test('rollbackFile rejects oversized revision content', async (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  await withArtifactDb(t, async () => {
    await withTempProject(async (projectRoot) => {
      const { newRevId } = recordWrite({
        project: projectRoot,
        filePath: 'src/oversized.txt',
        newContent: 'x'.repeat(MAX_WRITE_FILE_BYTES + 1),
        prevContent: '',
        source: 'ai_write',
        note: 'oversized rollback fixture',
      })

      await assert.rejects(
        () => rollbackFile(projectRoot, { path: 'src/oversized.txt', revision_id: newRevId }),
        /oversized rollback_file result/i,
      )
    })
  })
})

test('rollbackFile rejects symlinked target paths', async (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  await withArtifactDb(t, async () => {
    await withTempProject(async (projectRoot) => {
      writeRaw(projectRoot, 'real-restore/item.txt', 'current content\n')
      const linkedDir = path.join(projectRoot, 'linked-restore')
      if (!tryCreateDirectoryLink(path.join(projectRoot, 'real-restore'), linkedDir)) {
        t.skip('symlink creation is unavailable in this environment')
        return
      }

      const { newRevId } = recordWrite({
        project: projectRoot,
        filePath: 'linked-restore/item.txt',
        newContent: 'restored content\n',
        prevContent: '',
        source: 'ai_write',
        note: 'symlink rollback fixture',
      })

      await assert.rejects(
        () => rollbackFile(projectRoot, { path: 'linked-restore/item.txt', revision_id: newRevId }),
        /symbolic link/i,
      )
    })
  })
})

test('rollbackFile restores content and records a new rollback revision', async (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  await withArtifactDb(t, async () => {
    await withTempProject(async (projectRoot) => {
      writeRaw(projectRoot, 'src/restore.txt', 'current content\n')
      const { prevRevId } = recordWrite({
        project: projectRoot,
        filePath: 'src/restore.txt',
        newContent: 'current content\n',
        prevContent: 'baseline content\n',
        source: 'ai_write',
        note: 'fixture current revision',
      })

      const result = await rollbackFile(projectRoot, {
        path: 'src/restore.txt',
        revision_id: prevRevId,
      })

      assert.match(String(result?.message || ''), /rolled back/i)
      assert.equal(result?.prevContent, 'current content\n')
      assert.equal(fs.readFileSync(path.join(projectRoot, 'src', 'restore.txt'), 'utf8'), 'baseline content\n')

      const revisions = listRevisions(projectRoot, 'src/restore.txt')
      assert.equal(revisions.length, 3)
      assert.equal(Number(revisions[0]?.rev || 0), 2)
      assert.match(String(revisions[0]?.note || ''), /Rolled back to revision/i)
    })
  })
})

test('rollbackFile removes staged temp files when atomic rename fails', async (t) => {
  if (skipIfNativeDbUnavailable(t)) return

  await withArtifactDb(t, async () => {
    await withTempProject(async (projectRoot) => {
      writeRaw(projectRoot, 'src/rollback-failure.txt', 'current content\n')
      const { prevRevId } = recordWrite({
        project: projectRoot,
        filePath: 'src/rollback-failure.txt',
        newContent: 'current content\n',
        prevContent: 'baseline content\n',
        source: 'ai_write',
        note: 'fixture rollback failure revision',
      })

      const originalRename = fsModule.promises.rename
      fsModule.promises.rename = async () => {
        const error = new Error('rename_failed_for_test')
        error.code = 'EPERM'
        throw error
      }

      try {
        await assert.rejects(
          () => rollbackFile(projectRoot, {
            path: 'src/rollback-failure.txt',
            revision_id: prevRevId,
          }),
          /rename_failed_for_test|EPERM/i,
        )
      } finally {
        fsModule.promises.rename = originalRename
      }

      const srcDir = path.join(projectRoot, 'src')
      const names = fs.readdirSync(srcDir)
      assert.deepEqual(names.filter((name) => name.includes('.addom-tmp-')), [])
      assert.equal(fs.readFileSync(path.join(srcDir, 'rollback-failure.txt'), 'utf8'), 'current content\n')
    })
  })
})
