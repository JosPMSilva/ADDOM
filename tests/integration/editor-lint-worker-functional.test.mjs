import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { __testEditorLintWorkerInternals } from '../../src/main/ipc-handlers/editor-lint-worker.mjs'

const ORIGINAL_ADDOM_USER_DATA_PATH = process.env.ADDOM_USER_DATA_PATH
process.env.ADDOM_USER_DATA_PATH ||= path.join(os.tmpdir(), 'addom-test-user-data')

const tempDirs = new Set()

function makeTempProject(prefix = 'addom-lint-worker-') {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.add(projectRoot)
  return projectRoot
}

function writeFile(projectRoot, relPath, content) {
  const absPath = path.join(projectRoot, relPath)
  fs.mkdirSync(path.dirname(absPath), { recursive: true })
  fs.writeFileSync(absPath, content, 'utf8')
  return absPath
}

test.afterEach(() => {
  __testEditorLintWorkerInternals.clearEslintCache()
})

test.after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  tempDirs.clear()
  if (ORIGINAL_ADDOM_USER_DATA_PATH === undefined) {
    delete process.env.ADDOM_USER_DATA_PATH
  } else {
    process.env.ADDOM_USER_DATA_PATH = ORIGINAL_ADDOM_USER_DATA_PATH
  }
})

test('editor lint worker fallback lint path runs real ESLint rules without project config', async () => {
  const projectRoot = makeTempProject()
  writeFile(projectRoot, 'src/example.js', 'var answer = 1\nconsole.log(answer)\n')

  const result = await __testEditorLintWorkerInternals.lintTextWithEngine({
    project: projectRoot,
    filePath: 'src/example.js',
    content: 'var answer = 1\nconsole.log(answer)\n',
  })

  assert.equal(result.ok, true)
  assert.equal(result.available, true)
  assert.equal(result.source, 'addom-fallback')
  const ruleIds = new Set((result.messages || []).map((row) => row.ruleId))
  assert.equal(ruleIds.has('no-var') || ruleIds.has('no-console'), true)
})

test('editor lint worker project-config fix path applies deterministic fixes', async () => {
  const projectRoot = makeTempProject()
  writeFile(projectRoot, 'eslint.config.mjs', [
    'export default [',
    '  {',
    "    files: ['**/*.js'],",
    '    rules: {',
    "      semi: ['error', 'always'],",
    '    },',
    '  },',
    ']',
    '',
  ].join('\n'))
  writeFile(projectRoot, 'src/example.js', 'const answer = 1\n')

  const result = await __testEditorLintWorkerInternals.fixTextWithEngine({
    project: projectRoot,
    filePath: 'src/example.js',
    content: 'const answer = 1\n',
  })

  assert.equal(result.ok, true)
  assert.equal(result.available, true)
  assert.equal(result.source, 'project-config')
  assert.equal(result.changed, true)
  assert.match(result.fixedContent, /const answer = 1;/)
})

test('editor lint worker returns unsupported response for non-lintable files', async () => {
  const projectRoot = makeTempProject()

  const result = await __testEditorLintWorkerInternals.lintTextWithEngine({
    project: projectRoot,
    filePath: 'README.md',
    content: '# Hello\n',
  })

  assert.deepEqual(result, {
    ok: true,
    available: false,
    reason: 'unsupported_file',
    messages: [],
  })
})

test('editor lint worker rejects project-root escape attempts', async () => {
  const projectRoot = makeTempProject()

  const result = await __testEditorLintWorkerInternals.lintTextWithEngine({
    project: projectRoot,
    filePath: '../escape.js',
    content: 'console.log("nope")\n',
  })

  assert.equal(result.ok, false)
  assert.match(String(result.error || ''), /escapes the project root/i)
})

test('editor lint worker cache helpers show reuse for repeated project lint runs', async () => {
  const projectRoot = makeTempProject()
  writeFile(projectRoot, 'eslint.config.mjs', [
    'export default [',
    '  {',
    "    files: ['**/*.js'],",
    '    rules: {',
    "      semi: ['error', 'always'],",
    '    },',
    '  },',
    ']',
    '',
  ].join('\n'))
  writeFile(projectRoot, 'src/cache.js', 'const cacheValue = 1\n')

  assert.equal(__testEditorLintWorkerInternals.getEslintCacheSize(), 0)

  await __testEditorLintWorkerInternals.fixTextWithEngine({
    project: projectRoot,
    filePath: 'src/cache.js',
    content: 'const cacheValue = 1\n',
  })
  const firstSize = __testEditorLintWorkerInternals.getEslintCacheSize()

  await __testEditorLintWorkerInternals.fixTextWithEngine({
    project: projectRoot,
    filePath: 'src/cache.js',
    content: 'const cacheValue = 1\n',
  })
  const secondSize = __testEditorLintWorkerInternals.getEslintCacheSize()

  assert.equal(firstSize, 1)
  assert.equal(secondSize, 1)
})
