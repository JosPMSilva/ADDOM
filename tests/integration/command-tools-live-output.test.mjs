import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  createTrustedCommandSafetyOverride,
  runCommand,
} from '../../src/main/tools/command-tools-runner.mjs'

test('runCommand forwards live stdout chunks through the host runner callback', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-live-output-'))
  const seen = []

  try {
    const result = await runCommand(projectRoot, {
      command: 'echo hello',
      cwd: '.',
      shell: 'auto',
      timeout_ms: 5000,
      background: false,
    }, {
      runWithCandidateImpl: async (_candidate, options = {}) => {
        options.onOutputChunk?.({
          stream: 'stdout',
          chunk: 'partial output',
          emittedAt: 123,
        })
        return 'stdout:\nhello'
      },
      onOutputChunk: (payload) => seen.push(payload),
    })

    assert.equal(result, 'stdout:\nhello')
    assert.deepEqual(seen, [{
      stream: 'stdout',
      chunk: 'partial output',
      emittedAt: 123,
    }])
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('runCommand accepts workdir as a compatibility alias for cwd', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-workdir-alias-'))
  const nestedPath = path.join(projectRoot, 'nested')
  fs.mkdirSync(nestedPath, { recursive: true })

  try {
    const result = await runCommand(projectRoot, {
      command: 'echo alias',
      workdir: 'nested',
      shell: 'auto',
      timeout_ms: 5000,
      background: false,
    }, {
      runWithCandidateImpl: async (_candidate, options = {}) => {
        assert.equal(options.cwd, nestedPath)
        return 'stdout:\nalias'
      },
    })

    assert.equal(result, 'stdout:\nalias')
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('runCommand accepts an absolute cwd outside the workspace when host full access is already approved', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-host-cwd-root-'))
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-host-cwd-external-'))

  try {
    const result = await runCommand(projectRoot, {
      command: 'echo host-cwd',
      cwd: externalRoot,
      shell: 'auto',
      timeout_ms: 5000,
      background: false,
    }, {
      commandSafetyOverride: createTrustedCommandSafetyOverride({
        hostFullAccessApproved: true,
        allowHostFullAccessForThisCommand: true,
      }),
      runWithCandidateImpl: async (_candidate, options = {}) => {
        assert.equal(options.cwd, externalRoot)
        return 'stdout:\nhost-cwd'
      },
    })

    assert.equal(result, 'stdout:\nhost-cwd')
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
    fs.rmSync(externalRoot, { recursive: true, force: true })
  }
})
