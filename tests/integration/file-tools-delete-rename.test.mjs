import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import fsModule from 'node:fs'

import { deleteFile, editFile, renameFile, writeFile } from '../../src/main/tools/file-tools.mjs'

async function withTempProject(fn) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-file-tools-delete-rename-'))
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

test('deleteFile removes file and returns previous content', async () => {
  await withTempProject(async (projectRoot) => {
    writeRaw(projectRoot, 'src/remove-me.txt', 'legacy content')
    const result = await deleteFile(projectRoot, { path: 'src/remove-me.txt' })
    assert.match(String(result?.message || ''), /deleted successfully/i)
    assert.equal(result?.prevContent, 'legacy content')
    assert.equal(fs.existsSync(path.join(projectRoot, 'src/remove-me.txt')), false)
  })
})

test('renameFile moves file and preserves content', async () => {
  await withTempProject(async (projectRoot) => {
    writeRaw(projectRoot, 'docs/old-name.md', '# docs\n')
    const result = await renameFile(projectRoot, {
      old_path: 'docs/old-name.md',
      new_path: 'docs/new-name.md',
    })
    assert.match(String(result?.message || ''), /renamed successfully/i)
    assert.equal(String(result?.oldPath || ''), 'docs/old-name.md')
    assert.equal(String(result?.newPath || ''), 'docs/new-name.md')
    assert.equal(fs.existsSync(path.join(projectRoot, 'docs/old-name.md')), false)
    assert.equal(fs.existsSync(path.join(projectRoot, 'docs/new-name.md')), true)
    assert.equal(fs.readFileSync(path.join(projectRoot, 'docs/new-name.md'), 'utf8'), '# docs\n')
  })
})

test('renameFile rejects symlinked source paths', async (t) => {
  await withTempProject(async (projectRoot) => {
    writeRaw(projectRoot, 'real-src/original.txt', 'source content')
    const linkedSrc = path.join(projectRoot, 'linked-src')
    if (!tryCreateDirectoryLink(path.join(projectRoot, 'real-src'), linkedSrc)) {
      t.skip('symlink creation is unavailable in this environment')
      return
    }

    await assert.rejects(
      () => renameFile(projectRoot, {
        old_path: 'linked-src/original.txt',
        new_path: 'docs/renamed.txt',
      }),
      /symbolic link/i,
    )
  })
})

test('renameFile rejects symlinked destination paths', async (t) => {
  await withTempProject(async (projectRoot) => {
    writeRaw(projectRoot, 'docs/old-name.md', '# docs\n')
    fs.mkdirSync(path.join(projectRoot, 'real-dest'), { recursive: true })
    const linkedDest = path.join(projectRoot, 'linked-dest')
    if (!tryCreateDirectoryLink(path.join(projectRoot, 'real-dest'), linkedDest)) {
      t.skip('symlink creation is unavailable in this environment')
      return
    }

    await assert.rejects(
      () => renameFile(projectRoot, {
        old_path: 'docs/old-name.md',
        new_path: 'linked-dest/new-name.md',
      }),
      /symbolic link/i,
    )
  })
})

test('writeFile path-shape guard rejects excessive nesting', async () => {
  await withTempProject(async (projectRoot) => {
    const deepPath = new Array(45).fill('nested').join('/') + '/file.txt'
    await assert.rejects(
      () => writeFile(projectRoot, { path: deepPath, content: 'x' }),
      /too many nested segments/i,
    )
  })
})

test('editFile rejects ambiguous old_text matches with actionable guidance', async () => {
  await withTempProject(async (projectRoot) => {
    writeRaw(projectRoot, 'src/app.txt', 'needle\n...\nneedle\n')
    await assert.rejects(
      () => editFile(projectRoot, {
        path: 'src/app.txt',
        old_text: 'needle',
        new_text: 'updated',
      }),
      /appears 2 times|make the match unique/i,
    )
  })
})

test('editFile reports line-ending mismatch hints when old_text only matches after CRLF normalization', async () => {
  await withTempProject(async (projectRoot) => {
    writeRaw(projectRoot, 'src/windows-style.txt', 'line one\r\nline two\r\n')
    await assert.rejects(
      () => editFile(projectRoot, {
        path: 'src/windows-style.txt',
        old_text: 'line one\nline two\n',
        new_text: 'updated\n',
      }),
      /old_text not found|line-ending mismatch|file uses CRLF/i,
    )
  })
})

test('writeFile removes staged temp files when atomic rename fails', async () => {
  await withTempProject(async (projectRoot) => {
    const originalRename = fsModule.promises.rename
    fsModule.promises.rename = async () => {
      const error = new Error('rename_failed_for_test')
      error.code = 'EPERM'
      throw error
    }

    try {
      await assert.rejects(
        () => writeFile(projectRoot, { path: 'src/failure.txt', content: 'next content' }),
        /rename_failed_for_test|EPERM/i,
      )
    } finally {
      fsModule.promises.rename = originalRename
    }

    const srcDir = path.join(projectRoot, 'src')
    const names = fs.existsSync(srcDir) ? fs.readdirSync(srcDir) : []
    assert.deepEqual(names.filter((name) => name.includes('.addom-tmp-')), [])
    assert.equal(fs.existsSync(path.join(srcDir, 'failure.txt')), false)
  })
})

test('editFile keeps original content and removes staged temp files when atomic rename fails', async () => {
  await withTempProject(async (projectRoot) => {
    writeRaw(projectRoot, 'src/edit-me.txt', 'before value\n')
    const originalRename = fsModule.promises.rename
    fsModule.promises.rename = async () => {
      const error = new Error('rename_failed_for_test')
      error.code = 'EPERM'
      throw error
    }

    try {
      await assert.rejects(
        () => editFile(projectRoot, {
          path: 'src/edit-me.txt',
          old_text: 'before value',
          new_text: 'after value',
        }),
        /rename_failed_for_test|EPERM/i,
      )
    } finally {
      fsModule.promises.rename = originalRename
    }

    const srcDir = path.join(projectRoot, 'src')
    const names = fs.readdirSync(srcDir)
    assert.deepEqual(names.filter((name) => name.includes('.addom-tmp-')), [])
    assert.equal(fs.readFileSync(path.join(srcDir, 'edit-me.txt'), 'utf8'), 'before value\n')
  })
})

test('writeFile can target an absolute host path when full access is enabled', async () => {
  await withTempProject(async (projectRoot) => {
    const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-file-tools-host-write-'))
    const externalFile = path.join(externalDir, 'host-write.txt')
    try {
      const result = await writeFile(
        projectRoot,
        { path: externalFile, content: 'host level write\n' },
        { fileSystemHostFullAccess: true },
      )

      assert.match(String(result?.message || ''), /written successfully/i)
      assert.equal(fs.readFileSync(externalFile, 'utf8'), 'host level write\n')
    } finally {
      fs.rmSync(externalDir, { recursive: true, force: true })
    }
  })
})

test('renameFile can move files across host paths when full access is enabled', async () => {
  await withTempProject(async (projectRoot) => {
    const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-file-tools-host-rename-'))
    const sourceFile = path.join(externalDir, 'before.txt')
    const targetFile = path.join(externalDir, 'after.txt')
    fs.writeFileSync(sourceFile, 'host rename\n', 'utf8')

    try {
      const result = await renameFile(
        projectRoot,
        { old_path: sourceFile, new_path: targetFile },
        { fileSystemHostFullAccess: true },
      )

      assert.match(String(result?.message || ''), /renamed successfully/i)
      assert.equal(fs.existsSync(sourceFile), false)
      assert.equal(fs.readFileSync(targetFile, 'utf8'), 'host rename\n')
    } finally {
      fs.rmSync(externalDir, { recursive: true, force: true })
    }
  })
})

test('deleteFile can remove an absolute host path when full access is enabled', async () => {
  await withTempProject(async (projectRoot) => {
    const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-file-tools-host-delete-'))
    const targetFile = path.join(externalDir, 'delete-me.txt')
    fs.writeFileSync(targetFile, 'host delete\n', 'utf8')

    try {
      const result = await deleteFile(
        projectRoot,
        { path: targetFile },
        { fileSystemHostFullAccess: true },
      )

      assert.match(String(result?.message || ''), /deleted successfully/i)
      assert.equal(result?.prevContent, 'host delete\n')
      assert.equal(fs.existsSync(targetFile), false)
    } finally {
      fs.rmSync(externalDir, { recursive: true, force: true })
    }
  })
})
