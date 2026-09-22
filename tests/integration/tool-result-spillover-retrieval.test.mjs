import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { budgetToolResultForModel } from '../../src/main/tools/tool-result-budget.mjs'
import { executeTool } from '../../src/main/tools/fs-tool-executor.mjs'
import { toAISDKTools } from '../../src/main/tools/tool-definitions.mjs'
import { resolveToolApprovalPromptDecision } from '../../src/main/chat/tool-approval-rules.mjs'
import { resolveModeCapability } from '../../src/main/chat/turn-mode.mjs'
import {
  persistToolResultSpillover,
  retrieveToolResultSpillover,
} from '../../src/main/tools/tool-result-spillover.mjs'

async function withTempUserData(run) {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-spillover-retrieval-'))
  try {
    return await run(userDataPath)
  } finally {
    fs.rmSync(userDataPath, { recursive: true, force: true })
  }
}

test('truncated feedback exposes an opaque handle without a workstation path', async () => {
  await withTempUserData((userDataPath) => {
    const result = budgetToolResultForModel({
      providerId: 'openai',
      model: 'gpt-6-astra',
      toolName: 'run_command',
      result: `prefix\n${'large output\n'.repeat(500)}marker-outside-preview`,
      budgetChars: 1_000,
      projectRoot: 'C:/workspace/project-a',
      threadId: 'thread-a',
      turnId: 'turn-a',
      userDataPath,
    })

    const handle = result.truncationMetadata.persistedOutputHandle
    assert.match(handle, /^spill_[A-Za-z0-9_-]{24,}$/)
    assert.equal('persistedOutputPath' in result.truncationMetadata, false)
    assert.match(result.resultText, new RegExp(`read_tool_result.*${handle}`))
    assert.equal(result.resultText.length <= 1_000, true)
    assert.equal(result.resultText.includes(userDataPath), false)
  })
})

test('spillover retrieval supports Unicode-safe bounded ranges and search', async () => {
  await withTempUserData((userDataPath) => {
    const marker = 'MARKER-OUTSIDE-PREVIEW'
    const output = `αβ😀γ\n${'noise\n'.repeat(40)}${marker}\ntrailer`
    const persisted = persistToolResultSpillover({
      providerId: 'openai',
      model: 'gpt-6-astra',
      toolName: 'run_command',
      resultText: output,
      originalChars: output.length,
      projectRoot: 'C:/workspace/project-a',
      threadId: 'thread-a',
      turnId: 'turn-a',
      userDataPath,
    })

    const range = retrieveToolResultSpillover({
      handle: persisted.persistedOutputHandle,
      projectRoot: 'C:/workspace/project-a',
      threadId: 'thread-a',
      turnId: 'turn-a',
      offset: 2,
      maxChars: 2,
      userDataPath,
    })
    assert.deepEqual(range, {
      ok: true,
      mode: 'range',
      content: '😀γ',
      offset: 2,
      endOffset: 4,
      totalChars: Array.from(output).length,
      hasMore: true,
      nextOffset: 4,
    })

    const searched = retrieveToolResultSpillover({
      handle: persisted.persistedOutputHandle,
      projectRoot: 'C:/workspace/project-a',
      threadId: 'thread-a',
      turnId: 'turn-a',
      query: marker,
      maxChars: 80,
      userDataPath,
    })
    assert.equal(searched.ok, true)
    assert.equal(searched.mode, 'search')
    assert.match(searched.content, new RegExp(marker))
    assert.equal(searched.content.length <= 80, true)
    assert.equal('path' in searched, false)
  })
})

test('foreign, expired, and deleted spillover handles fail without scope disclosure', async () => {
  await withTempUserData((userDataPath) => {
    const now = Date.UTC(2026, 8, 18, 10, 0, 0)
    const persisted = persistToolResultSpillover({
      providerId: 'openai',
      model: 'gpt-6-astra',
      toolName: 'run_command',
      resultText: 'private output',
      originalChars: 14,
      projectRoot: 'C:/workspace/project-a',
      threadId: 'thread-a',
      turnId: 'turn-a',
      userDataPath,
      now,
    })
    const base = {
      handle: persisted.persistedOutputHandle,
      projectRoot: 'C:/workspace/project-a',
      threadId: 'thread-a',
      turnId: 'turn-a',
      userDataPath,
      now,
    }

    const expectedFailure = {
      ok: false,
      code: 'spillover_unavailable',
      message: 'The stored tool result is unavailable or outside this project, task, turn, or retention window.',
    }
    assert.deepEqual(retrieveToolResultSpillover({ ...base, projectRoot: 'C:/workspace/project-b' }), expectedFailure)
    assert.deepEqual(retrieveToolResultSpillover({ ...base, threadId: 'thread-b' }), expectedFailure)
    assert.deepEqual(retrieveToolResultSpillover({ ...base, turnId: 'turn-b' }), expectedFailure)
    assert.deepEqual(retrieveToolResultSpillover({
      ...base,
      now: now + 2_000,
      retentionPolicy: { maxAgeMs: 1_000 },
    }), expectedFailure)

    fs.unlinkSync(persisted.persistedOutputPath)
    assert.deepEqual(retrieveToolResultSpillover(base), expectedFailure)
  })
})

test('read_tool_result is a validated read-only native tool', async () => {
  await withTempUserData(async (userDataPath) => {
    const projectRoot = 'C:/workspace/project-a'
    const persisted = persistToolResultSpillover({
      providerId: 'openai',
      model: 'gpt-6-astra',
      toolName: 'run_command',
      resultText: 'first\nsecond\nthird',
      originalChars: 18,
      projectRoot,
      threadId: 'thread-a',
      turnId: 'turn-a',
      userDataPath,
    })
    const tools = toAISDKTools()
    assert.ok(tools.read_tool_result)
    assert.equal(resolveModeCapability('read_tool_result', 'plan').allowed, true)
    assert.equal(resolveToolApprovalPromptDecision({
      toolName: 'read_tool_result',
      projectFolder: projectRoot,
      permissionMode: 'ask',
    }).action, 'approve')

    const executed = await executeTool(projectRoot, 'read_tool_result', {
      handle: persisted.persistedOutputHandle,
      offset: 6,
      max_chars: 6,
    }, {
      threadId: 'thread-a',
      turnId: 'turn-a',
      userDataPath,
    })
    assert.match(executed.result, /second/)
    assert.match(executed.result, /next_offset: 12/)
    assert.equal(executed.result.includes(userDataPath), false)

    await assert.rejects(
      () => executeTool(projectRoot, 'read_tool_result', {
        handle: persisted.persistedOutputHandle,
        max_chars: 50_000,
      }, {
        threadId: 'thread-a',
        turnId: 'turn-a',
        userDataPath,
      }),
      /must be <= 12000/,
    )
  })
})
