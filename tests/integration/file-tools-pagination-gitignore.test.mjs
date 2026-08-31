import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { grepFile, listDirectory, searchCode } from '../../src/main/tools/file-tools.mjs'

async function withTempProject(fn) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-file-tools-'))
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

function normalizeSlashes(text) {
  return String(text || '').replace(/\\/g, '/')
}

test('listDirectory respects .gitignore and supports depth/pagination', async () => {
  await withTempProject(async (projectRoot) => {
    write(projectRoot, '.gitignore', 'coverage/\ncustom-out/\n*.secret\n')
    write(projectRoot, 'src/app.js', 'console.log("ok")\n')
    write(projectRoot, 'src/deep/inner.js', 'export const x = 1\n')
    write(projectRoot, 'keep/readme.md', '# keep\n')
    write(projectRoot, 'coverage/skip.js', 'console.log("skip")\n')
    write(projectRoot, 'custom-out/build.js', 'console.log("skip")\n')
    write(projectRoot, 'root.secret', 'hidden\n')

    const rootListing = await listDirectory(projectRoot, { path: '.' })
    const rootNorm = normalizeSlashes(rootListing)
    assert.match(rootNorm, /\[dir\] keep/)
    assert.match(rootNorm, /\[dir\] src/)
    assert.doesNotMatch(rootNorm, /coverage/)
    assert.doesNotMatch(rootNorm, /custom-out/)
    assert.doesNotMatch(rootNorm, /root\.secret/)

    const nestedListing = await listDirectory(projectRoot, { path: '.', depth: 3, limit: 50 })
    const nestedNorm = normalizeSlashes(nestedListing)
    assert.match(nestedNorm, /\[dir\] src\/deep/)
    assert.match(nestedNorm, /\[file\] src\/app\.js/)
    assert.match(nestedNorm, /\[file\] src\/deep\/inner\.js/)

    const page1 = await listDirectory(projectRoot, { path: '.', depth: 2, limit: 2, offset: 0 })
    const page1Norm = normalizeSlashes(page1)
    assert.match(page1Norm, /Showing 2 entries from offset 0/)
    assert.match(page1Norm, /More entries available/)
    assert.match(page1Norm, /"offset":2/)

    const page2 = await listDirectory(projectRoot, { path: '.', depth: 2, limit: 2, offset: 2 })
    const page2Norm = normalizeSlashes(page2)
    assert.match(page2Norm, /Showing \d+ entries from offset 2/)
  })
})

test('listDirectory returns explicit output for empty directories', async () => {
  await withTempProject(async (projectRoot) => {
    const rootListing = await listDirectory(projectRoot, { path: '.' })
    assert.equal(rootListing, 'Directory is empty.')

    const pagedListing = await listDirectory(projectRoot, { path: '.', depth: 2, limit: 10 })
    assert.match(pagedListing, /Showing 0 entries from offset 0/)
    assert.match(pagedListing, /Directory is empty\./)
  })
})

test('searchCode respects .gitignore filtering for directories and files', async () => {
  await withTempProject(async (projectRoot) => {
    write(projectRoot, '.gitignore', 'coverage/\n*.secret\n')
    write(projectRoot, 'src/visible.js', 'const marker = "NEEDLE_TOKEN";\n')
    write(projectRoot, 'coverage/hidden.js', 'const marker = "NEEDLE_TOKEN";\n')
    write(projectRoot, 'notes.secret', 'NEEDLE_TOKEN\n')

    const output = normalizeSlashes(await searchCode(projectRoot, { query: 'NEEDLE_TOKEN' }))
    assert.match(output, /visible\.js:1:/)
    assert.doesNotMatch(output, /coverage\/hidden\.js/)
    assert.doesNotMatch(output, /notes\.secret/)
  })
})

test('searchCode supports pagination/continuation with offset and limit', async () => {
  await withTempProject(async (projectRoot) => {
    write(projectRoot, '.gitignore', '')
    for (let i = 0; i < 6; i += 1) {
      write(projectRoot, `src/f${String(i).padStart(2, '0')}.js`, `const needle_${i} = "PAGINATE_ME";\n`)
    }

    const first = normalizeSlashes(await searchCode(projectRoot, { query: 'PAGINATE_ME', limit: 3, offset: 0 }))
    assert.match(first, /Showing 3 match\(es\) .* offset 0 \(limit=3\)/)
    assert.match(first, /More matches available/)
    assert.match(first, /"offset":3/)
    assert.match(first, /src\/f00\.js:1:/)
    assert.match(first, /src\/f02\.js:1:/)
    assert.doesNotMatch(first, /src\/f03\.js:1:/)

    const second = normalizeSlashes(await searchCode(projectRoot, { query: 'PAGINATE_ME', limit: 3, offset: 3 }))
    assert.match(second, /Showing 3 match\(es\) .* offset 3 \(limit=3\)/)
    assert.match(second, /src\/f03\.js:1:/)
    assert.match(second, /src\/f05\.js:1:/)
    assert.doesNotMatch(second, /src\/f00\.js:1:/)
    assert.doesNotMatch(second, /More matches available/)
  })
})

test('searchCode rejects potentially catastrophic regex patterns', async () => {
  await withTempProject(async (projectRoot) => {
    write(projectRoot, '.gitignore', '')
    write(projectRoot, 'src/sample.js', 'const sample = "aaaaaaaaaaaaaaaaaaaaaaaa";\n')

    await assert.rejects(
      () => searchCode(projectRoot, { query: '(a+)+$', path: '.' }),
      /Unsafe regex for query/i,
    )
  })
})

test('grepFile rejects potentially catastrophic regex patterns', async () => {
  await withTempProject(async (projectRoot) => {
    write(projectRoot, 'src/sample.js', 'const sample = "aaaaaaaaaaaaaaaaaaaaaaaa";\n')

    await assert.rejects(
      () => grepFile(projectRoot, { path: 'src/sample.js', pattern: '(a+)+$' }),
      /Unsafe regex for pattern/i,
    )
  })
})
