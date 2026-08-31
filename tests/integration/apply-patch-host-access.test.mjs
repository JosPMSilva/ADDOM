import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  executeApplyPatchOperation,
  resolveApplyPatchPreview,
  resolveApplyPatchTargetPaths,
} from '../../src/main/tools/apply-patch-core.mjs'

async function withTempProject(fn) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-apply-patch-project-'))
  try {
    return await fn(projectRoot)
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
}

function toPatchPath(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/')
}

test('apply_patch rejects host paths without full access', async () => {
  await withTempProject(async (projectRoot) => {
    const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-apply-patch-host-'))
    const externalFile = path.join(externalDir, 'note.txt')
    fs.writeFileSync(externalFile, 'old\n', 'utf8')

    try {
      const patch = [
        '*** Begin Patch',
        `*** Update File: ${toPatchPath(externalFile)}`,
        '@@',
        '-old',
        '+new',
        '*** End Patch',
      ].join('\n')

      assert.throws(
        () => resolveApplyPatchPreview({
          projectRoot,
          toolInput: { patch },
        }),
        /inside the active workspace/i,
      )
    } finally {
      fs.rmSync(externalDir, { recursive: true, force: true })
    }
  })
})

test('apply_patch can preview and execute host paths in full access mode', async () => {
  await withTempProject(async (projectRoot) => {
    const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-apply-patch-host-'))
    const externalFile = path.join(externalDir, 'note.txt')
    fs.writeFileSync(externalFile, 'old\n', 'utf8')

    try {
      const patch = [
        '*** Begin Patch',
        `*** Update File: ${toPatchPath(externalFile)}`,
        '@@',
        '-old',
        '+new',
        '*** End Patch',
      ].join('\n')

      const preview = resolveApplyPatchPreview({
        projectRoot,
        toolInput: { patch },
        fileSystemHostFullAccess: true,
      })
      assert.equal(preview.previousContent, 'old\n')
      assert.equal(preview.nextContent, 'new\n')

      const targetPaths = resolveApplyPatchTargetPaths({
        projectRoot,
        toolInput: { patch },
        fileSystemHostFullAccess: true,
      })
      assert.deepEqual(targetPaths, [path.normalize(externalFile)])

      const result = await executeApplyPatchOperation({
        projectRoot,
        toolInput: { patch },
        fileSystemHostFullAccess: true,
      })
      assert.match(String(result.message || ''), /Patched file successfully/i)
      assert.equal(fs.readFileSync(externalFile, 'utf8'), 'new\n')
    } finally {
      fs.rmSync(externalDir, { recursive: true, force: true })
    }
  })
})

test('apply_patch can delete host paths in full access mode', async () => {
  await withTempProject(async (projectRoot) => {
    const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-apply-patch-host-delete-'))
    const externalFile = path.join(externalDir, 'note.txt')
    fs.writeFileSync(externalFile, 'remove me\n', 'utf8')

    try {
      const patch = [
        '*** Begin Patch',
        `*** Delete File: ${toPatchPath(externalFile)}`,
        '*** End Patch',
      ].join('\n')

      const preview = resolveApplyPatchPreview({
        projectRoot,
        toolInput: { patch },
        fileSystemHostFullAccess: true,
      })
      assert.equal(preview.previousContent, 'remove me\n')
      assert.equal(preview.nextContent, '')

      const result = await executeApplyPatchOperation({
        projectRoot,
        toolInput: { patch },
        fileSystemHostFullAccess: true,
      })
      assert.match(String(result.message || ''), /File deleted successfully/i)
      assert.equal(fs.existsSync(externalFile), false)
    } finally {
      fs.rmSync(externalDir, { recursive: true, force: true })
    }
  })
})
