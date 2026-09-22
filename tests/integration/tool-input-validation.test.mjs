import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { executeTool } from '../../src/main/tools/fs-tool-executor.mjs'
import { executeApprovedToolStep } from '../../src/main/chat/chat-stream-tool-execution.mjs'
import { toAISDKTools } from '../../src/main/tools/tool-definitions.mjs'

async function withTemporaryProject(run) {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'addom-tool-input-'))
  try {
    return await run(projectRoot)
  } finally {
    await fs.rm(projectRoot, { recursive: true, force: true })
  }
}

test('write_file rejects missing content without mutating an existing file', async () => {
  await withTemporaryProject(async (projectRoot) => {
    const target = path.join(projectRoot, 'fixture.txt')
    await fs.writeFile(target, 'preserve me', 'utf8')

    await assert.rejects(
      executeTool(projectRoot, 'write_file', { path: 'fixture.txt' }, { fileSystemHostFullAccess: true }),
      /content|required|invalid/i,
    )

    assert.equal(await fs.readFile(target, 'utf8'), 'preserve me')
  })
})

test('write_file preserves an explicit empty-string write as valid intent', async () => {
  await withTemporaryProject(async (projectRoot) => {
    const target = path.join(projectRoot, 'fixture.txt')
    await fs.writeFile(target, 'replace me', 'utf8')

    const result = await executeTool(
      projectRoot,
      'write_file',
      { path: 'fixture.txt', content: '' },
      { fileSystemHostFullAccess: true },
    )

    assert.match(String(result?.result || ''), /written successfully/i)
    assert.equal(await fs.readFile(target, 'utf8'), '')
  })
})

for (const [label, input] of [
  ['null content', { path: 'fixture.txt', content: null }],
  ['wrong content type', { path: 'fixture.txt', content: 42 }],
  ['unknown fields', { path: 'fixture.txt', content: 'replace me', unexpected: true }],
]) {
  test(`write_file rejects ${label} without mutating an existing file`, async () => {
    await withTemporaryProject(async (projectRoot) => {
      const target = path.join(projectRoot, 'fixture.txt')
      await fs.writeFile(target, 'preserve me', 'utf8')

      await assert.rejects(
        executeTool(projectRoot, 'write_file', input, { fileSystemHostFullAccess: true }),
        /invalid/i,
      )

      assert.equal(await fs.readFile(target, 'utf8'), 'preserve me')
    })
  })
}

test('AI SDK tool schema returns canonical validation feedback before generation execution', async () => {
  const schema = toAISDKTools('ask', true).write_file.inputSchema
  const invalid = await schema.validate({ path: 'fixture.txt' })
  const valid = await schema.validate({ path: 'fixture.txt', content: '' })

  assert.equal(invalid.success, false)
  assert.equal(invalid.error?.code, 'invalid_tool_input')
  assert.equal(valid.success, true)
  assert.deepEqual(valid.value, { path: 'fixture.txt', content: '' })
})

test('approved execution rejects invalid input before invoking its executor', async () => {
  let executorCalled = false
  const result = await executeApprovedToolStep({
    tc: { name: 'write_file' },
    toolInput: { path: 'fixture.txt' },
    helpers: {
      executeTool: async () => {
        executorCalled = true
        return { result: 'unexpected' }
      },
    },
  })

  assert.equal(result.isError, true)
  assert.equal(result.inputValidationError?.code, 'invalid_tool_input')
  assert.equal(result.canonicalToolName, 'write_file')
  assert.equal(result.toolExecutionPath, 'pre_execution')
  assert.equal(executorCalled, false)
})
