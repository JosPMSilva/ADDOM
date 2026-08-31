import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { listDirectory, searchCode } from '../../src/main/tools/file-tools.mjs'
import { disposeFileToolWorker, runFileToolInWorker } from '../../src/main/tools/file-tools-worker-runner.mjs'

async function withTempProject(fn) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-file-tools-worker-'))
  try {
    return await fn(projectRoot)
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
}

function write(projectRoot, relPath, content = '') {
  const abs = path.join(projectRoot, relPath)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content, 'utf8')
}

function normalize(text) {
  return String(text || '').replace(/\\/g, '/')
}

test.after(() => {
  disposeFileToolWorker()
})

test('list_directory worker output matches direct implementation', async () => {
  await withTempProject(async (projectRoot) => {
    write(projectRoot, '.gitignore', 'node_modules/\n')
    write(projectRoot, 'src/a.js', 'export const a = 1\n')
    write(projectRoot, 'src/deep/b.js', 'export const b = 2\n')
    write(projectRoot, 'README.md', '# demo\n')

    const input = { path: '.', depth: 3, limit: 100, offset: 0 }
    const direct = normalize(await listDirectory(projectRoot, input))
    const worker = normalize(await runFileToolInWorker('list_directory', projectRoot, input))
    assert.equal(worker, direct)
  })
})

test('search_code worker output matches direct implementation', async () => {
  await withTempProject(async (projectRoot) => {
    write(projectRoot, '.gitignore', '')
    write(projectRoot, 'src/a.js', 'const token = "WORKER_NEEDLE"\n')
    write(projectRoot, 'src/b.js', 'const token2 = "WORKER_NEEDLE"\n')

    const input = { query: 'WORKER_NEEDLE', path: '.', limit: 10, offset: 0 }
    const direct = normalize(await searchCode(projectRoot, input))
    const worker = normalize(await runFileToolInWorker('search_code', projectRoot, input))
    assert.equal(worker, direct)
  })
})

test('search_code worker rejects potentially catastrophic regex patterns', async () => {
  await withTempProject(async (projectRoot) => {
    write(projectRoot, '.gitignore', '')
    write(projectRoot, 'src/a.js', 'const token = "aaaaaaaaaaaaaaaaaaaaaaaa"\n')

    await assert.rejects(
      () => runFileToolInWorker('search_code', projectRoot, { query: '(a+)+$', path: '.', limit: 10, offset: 0 }),
      /Unsafe regex for query/i,
    )
  })
})
