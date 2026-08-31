import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  executeOpenAILocalRuntimeTool,
  isOpenAILocalRuntimeToolName,
  resolveOpenAIApplyPatchPreview,
} from '../../src/main/api-clients/openai-local-runtime-tools.mjs'
import { createTrustedCommandSafetyOverride } from '../../src/main/tools/command-tools-runner.mjs'

function canonicalizePathForAssertion(targetPath = '') {
  const resolvedPath = path.resolve(String(targetPath || ''))
  try {
    const realpath = typeof fs.realpathSync.native === 'function'
      ? fs.realpathSync.native(resolvedPath)
      : fs.realpathSync(resolvedPath)
    return process.platform === 'win32' ? realpath.toLowerCase() : realpath
  } catch {
    return process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath
  }
}

function extractCommandOutputPath(output = '') {
  const lines = String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  return lines.at(-1) || ''
}

test('openai local runtime tool names include local_shell and apply_patch only', () => {
  assert.equal(isOpenAILocalRuntimeToolName('local_shell'), true)
  assert.equal(isOpenAILocalRuntimeToolName('apply_patch'), true)
  assert.equal(isOpenAILocalRuntimeToolName('computer_use'), false)
  assert.equal(isOpenAILocalRuntimeToolName('run_command'), false)
})

test('openai apply_patch preview rejects legacy operation input and requires canonical patch text', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-local-preview-'))
  try {
    assert.throws(() => {
      resolveOpenAIApplyPatchPreview({
        projectRoot,
        toolInput: {
          operation: {
            type: 'update_file',
            path: 'note.txt',
            diff: '@@ -1,2 +1,2 @@\n line one\n-line two\n+line three\n',
          },
        },
      })
    }, /non-empty patch string/i)
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('openai apply_patch preview also accepts canonical patch text', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-local-preview-patch-'))
  try {
    const filePath = path.join(projectRoot, 'note.txt')
    fs.writeFileSync(filePath, 'line one\nline two\n', 'utf8')

    const preview = resolveOpenAIApplyPatchPreview({
      projectRoot,
      toolInput: {
        patch: [
          '*** Begin Patch',
          '*** Update File: note.txt',
          '@@ -1,2 +1,2 @@',
          ' line one',
          '-line two',
          '+line three',
          '*** End Patch',
        ].join('\n'),
      },
    })

    assert.equal(preview.relativePath, 'note.txt')
    assert.equal(preview.previousContent, 'line one\nline two\n')
    assert.equal(preview.nextContent, 'line one\nline three\n')
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('openai apply_patch preview rejects paths outside the active workspace', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-local-path-'))
  try {
    assert.throws(() => {
      resolveOpenAIApplyPatchPreview({
        projectRoot,
        toolInput: {
          patch: [
            '*** Begin Patch',
            '*** Add File: ../outside.txt',
            '+nope',
            '*** End Patch',
          ].join('\n'),
        },
      })
    }, /inside the active workspace/i)
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('openai apply_patch execution writes and deletes files through local tooling', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-local-exec-'))
  try {
    await executeOpenAILocalRuntimeTool({
      projectRoot,
      toolName: 'apply_patch',
      toolInput: {
        patch: [
          '*** Begin Patch',
          '*** Add File: created.txt',
          '+hello',
          '+world',
          '*** End Patch',
        ].join('\n'),
      },
    })

    const createdPath = path.join(projectRoot, 'created.txt')
    assert.equal(fs.readFileSync(createdPath, 'utf8'), 'hello\nworld\n')

    await executeOpenAILocalRuntimeTool({
      projectRoot,
      toolName: 'apply_patch',
      toolInput: {
        patch: [
          '*** Begin Patch',
          '*** Delete File: created.txt',
          '*** End Patch',
        ].join('\n'),
      },
    })
    assert.equal(fs.existsSync(createdPath), false)
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('openai local_shell routes environment overrides through shared shell policy and denies them', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-local-shell-'))
  try {
    await assert.rejects(
      () => executeOpenAILocalRuntimeTool({
        projectRoot,
        toolName: 'local_shell',
        toolInput: {
          action: {
            type: 'exec',
            command: ['node', '--version'],
            env: { FOO: 'bar' },
          },
        },
      }),
      /environment overrides are blocked by shared shell policy/i,
    )
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('openai local_shell resolves workingDirectory inside the active workspace', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-local-shell-cwd-'))
  const nestedDir = path.join(projectRoot, 'nested')
  fs.mkdirSync(nestedDir, { recursive: true })
  try {
    const result = await executeOpenAILocalRuntimeTool({
      projectRoot,
      toolName: 'local_shell',
      toolInput: {
        action: {
          type: 'exec',
          command: ['node', '-e', 'process.stdout.write(process.cwd())'],
          workingDirectory: 'nested',
        },
      },
    })
    assert.equal(
      canonicalizePathForAssertion(extractCommandOutputPath(result?.result?.output)),
      canonicalizePathForAssertion(nestedDir),
    )
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('openai local_shell allows outside-workspace workingDirectory only after host full access approval', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-local-shell-cwd-root-'))
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-openai-local-shell-cwd-outside-'))
  try {
    await assert.rejects(
      () => executeOpenAILocalRuntimeTool({
        projectRoot,
        toolName: 'local_shell',
        toolInput: {
          action: {
            type: 'exec',
            command: ['node', '-e', 'process.stdout.write(process.cwd())'],
            workingDirectory: outsideDir,
          },
        },
      }),
      /host_full_access approval/i,
    )

    const result = await executeOpenAILocalRuntimeTool({
      projectRoot,
      toolName: 'local_shell',
      toolInput: {
        action: {
          type: 'exec',
          command: ['node', '-e', 'process.stdout.write(process.cwd())'],
          workingDirectory: outsideDir,
        },
      },
      commandSafetyOverride: createTrustedCommandSafetyOverride({
        allowHostFullAccessForThisCommand: true,
        hostFullAccessApproved: true,
      }),
    })

    assert.equal(
      canonicalizePathForAssertion(extractCommandOutputPath(result?.result?.output)),
      canonicalizePathForAssertion(outsideDir),
    )
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
    fs.rmSync(outsideDir, { recursive: true, force: true })
  }
})
