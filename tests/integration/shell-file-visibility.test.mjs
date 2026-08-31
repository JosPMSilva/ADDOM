import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  takeShellWriteSnapshot,
  detectShellWriteArtifactChanges,
} from '../../src/main/chat/chat-tool-step.mjs'

async function detectShellChanges(projectRoot, commandText, mutate) {
  const beforeSnapshot = await takeShellWriteSnapshot(projectRoot, { commandText })
  await mutate()
  return detectShellWriteArtifactChanges({
    projectFolder: projectRoot,
    beforeSnapshot,
    commandText,
    source: 'run_command',
  })
}

function makeTempProject(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

test('shell change detector hydrates exact single-file create diffs and counts', async () => {
  const projectRoot = makeTempProject('addom-shell-create-')
  try {
    const outcome = await detectShellChanges(
      projectRoot,
      'Set-Content -Path "created.txt" -Value "hello"',
      async () => {
        fs.writeFileSync(path.join(projectRoot, 'created.txt'), 'hello\nworld', 'utf8')
      },
    )

    assert.equal(outcome.diagnostics?.status, 'hydrated')
    assert.deepEqual(outcome.diagnostics?.reasonCodes, [])
    assert.equal(outcome.changes.length, 1)
    assert.deepEqual(outcome.changes[0], {
      ...outcome.changes[0],
      filePath: 'created.txt',
      renamedFrom: '',
      changeType: 'created',
      source: 'run_command',
      hydrationProven: true,
      addedLines: 2,
      removedLines: 0,
      diffText: '@@ -1,0 +1,2 @@\n+hello\n+world',
    })
    assert.equal(typeof outcome.changes[0].newRevId, 'string')
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('shell change detector hydrates exact single-file modify diffs and counts', async () => {
  const projectRoot = makeTempProject('addom-shell-modify-')
  try {
    fs.writeFileSync(path.join(projectRoot, 'notes.txt'), 'alpha\nbeta', 'utf8')
    const outcome = await detectShellChanges(
      projectRoot,
      'Set-Content -Path "notes.txt" -Value "alpha gamma beta"',
      async () => {
        fs.writeFileSync(path.join(projectRoot, 'notes.txt'), 'alpha\ngamma\nbeta', 'utf8')
      },
    )

    assert.equal(outcome.diagnostics?.status, 'hydrated')
    assert.equal(outcome.changes.length, 1)
    assert.equal(outcome.changes[0]?.filePath, 'notes.txt')
    assert.equal(outcome.changes[0]?.changeType, 'modified')
    assert.equal(outcome.changes[0]?.addedLines, 1)
    assert.equal(outcome.changes[0]?.removedLines, 0)
    assert.equal(
      outcome.changes[0]?.diffText,
      '@@ -1,2 +1,3 @@\n alpha\n+gamma\n beta',
    )
    assert.equal(typeof outcome.changes[0]?.prevRevId, 'string')
    assert.equal(typeof outcome.changes[0]?.newRevId, 'string')
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('shell change detector hydrates exact single-file delete diffs and counts', async () => {
  const projectRoot = makeTempProject('addom-shell-delete-')
  try {
    fs.writeFileSync(path.join(projectRoot, 'obsolete.txt'), 'first\nsecond', 'utf8')
    const outcome = await detectShellChanges(
      projectRoot,
      'Remove-Item -Path "obsolete.txt" -Force',
      async () => {
        fs.rmSync(path.join(projectRoot, 'obsolete.txt'))
      },
    )

    assert.equal(outcome.diagnostics?.status, 'hydrated')
    assert.equal(outcome.changes.length, 1)
    assert.equal(outcome.changes[0]?.filePath, 'obsolete.txt')
    assert.equal(outcome.changes[0]?.changeType, 'deleted')
    assert.equal(outcome.changes[0]?.addedLines, 0)
    assert.equal(outcome.changes[0]?.removedLines, 2)
    assert.equal(
      outcome.changes[0]?.diffText,
      '@@ -1,2 +1,0 @@\n-first\n-second',
    )
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('shell change detector deletes newline-terminated single-line files without phantom line counts', async () => {
  const projectRoot = makeTempProject('addom-shell-delete-trailing-newline-')
  try {
    fs.writeFileSync(path.join(projectRoot, 'obsolete.txt'), 'remove this line\n', 'utf8')
    const outcome = await detectShellChanges(
      projectRoot,
      'Remove-Item -Path "obsolete.txt" -Force',
      async () => {
        fs.rmSync(path.join(projectRoot, 'obsolete.txt'))
      },
    )

    assert.equal(outcome.diagnostics?.status, 'hydrated')
    assert.equal(outcome.changes.length, 1)
    assert.equal(outcome.changes[0]?.filePath, 'obsolete.txt')
    assert.equal(outcome.changes[0]?.changeType, 'deleted')
    assert.equal(outcome.changes[0]?.addedLines, 0)
    assert.equal(outcome.changes[0]?.removedLines, 1)
    assert.equal(
      outcome.changes[0]?.diffText,
      '@@ -1,1 +1,0 @@\n-remove this line',
    )
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('shell change detector hydrates a provable rename without fabricating content deltas', async () => {
  const projectRoot = makeTempProject('addom-shell-rename-')
  try {
    fs.writeFileSync(path.join(projectRoot, 'from.txt'), 'rename me', 'utf8')
    const outcome = await detectShellChanges(
      projectRoot,
      'Rename-Item -Path "from.txt" -NewName "to.txt"',
      async () => {
        fs.renameSync(path.join(projectRoot, 'from.txt'), path.join(projectRoot, 'to.txt'))
      },
    )

    assert.equal(outcome.diagnostics?.status, 'hydrated')
    assert.equal(outcome.changes.length, 1)
    assert.equal(outcome.changes[0]?.filePath, 'to.txt')
    assert.equal(outcome.changes[0]?.renamedFrom, 'from.txt')
    assert.equal(outcome.changes[0]?.changeType, 'renamed')
    assert.equal(outcome.changes[0]?.addedLines, 0)
    assert.equal(outcome.changes[0]?.removedLines, 0)
    assert.equal(outcome.changes[0]?.diffText, '')
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('shell change detector suppresses broad churn commands even when files changed', async () => {
  const projectRoot = makeTempProject('addom-shell-broad-')
  try {
    const outcome = await detectShellChanges(
      projectRoot,
      'npm install lodash',
      async () => {
        fs.writeFileSync(path.join(projectRoot, 'package-lock.json'), '{"lock":true}', 'utf8')
      },
    )

    assert.equal(outcome.diagnostics?.status, 'suppressed')
    assert.deepEqual(outcome.diagnostics?.reasonCodes, ['broad_command'])
    assert.equal(outcome.changes.length, 0)
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('shell change detector suppresses oversized files', async () => {
  const projectRoot = makeTempProject('addom-shell-large-')
  try {
    const outcome = await detectShellChanges(
      projectRoot,
      'Set-Content -Path "large.txt" -Value "..."',
      async () => {
        fs.writeFileSync(path.join(projectRoot, 'large.txt'), 'x'.repeat(1_048_577), 'utf8')
      },
    )

    assert.equal(outcome.diagnostics?.status, 'suppressed')
    assert.deepEqual(outcome.diagnostics?.reasonCodes, ['oversized_file'])
    assert.equal(outcome.changes.length, 0)
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('shell change detector suppresses binary files', async () => {
  const projectRoot = makeTempProject('addom-shell-binary-')
  try {
    const outcome = await detectShellChanges(
      projectRoot,
      'Set-Content -Path "binary.bin" -Value "..."',
      async () => {
        fs.writeFileSync(path.join(projectRoot, 'binary.bin'), Buffer.from([0x00, 0x01, 0x02]))
      },
    )

    assert.equal(outcome.diagnostics?.status, 'suppressed')
    assert.deepEqual(outcome.diagnostics?.reasonCodes, ['binary_file'])
    assert.equal(outcome.changes.length, 0)
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('shell change detector suppresses unreadable invalid UTF-8 content', async () => {
  const projectRoot = makeTempProject('addom-shell-unreadable-')
  try {
    const outcome = await detectShellChanges(
      projectRoot,
      'Set-Content -Path "broken.txt" -Value "..."',
      async () => {
        fs.writeFileSync(path.join(projectRoot, 'broken.txt'), Buffer.from([0xc3, 0x28]))
      },
    )

    assert.equal(outcome.diagnostics?.status, 'suppressed')
    assert.deepEqual(outcome.diagnostics?.reasonCodes, ['unreadable_file'])
    assert.equal(outcome.changes.length, 0)
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('shell change detector suppresses truncated snapshots', async () => {
  const projectRoot = makeTempProject('addom-shell-truncated-')
  try {
    for (let index = 0; index <= 6_000; index += 1) {
      fs.writeFileSync(path.join(projectRoot, `seed-${index}.txt`), 'seed', 'utf8')
    }
    const outcome = await detectShellChanges(
      projectRoot,
      'Set-Content -Path "seed-0.txt" -Value "changed"',
      async () => {
        fs.writeFileSync(path.join(projectRoot, 'seed-0.txt'), 'changed', 'utf8')
      },
    )

    assert.equal(outcome.diagnostics?.status, 'suppressed')
    assert.deepEqual(outcome.diagnostics?.reasonCodes, ['snapshot_truncated'])
    assert.equal(outcome.changes.length, 0)
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('shell command hints without a provable diff stay command-only', async () => {
  const projectRoot = makeTempProject('addom-shell-hint-only-')
  try {
    const outcome = await detectShellChanges(
      projectRoot,
      'Set-Content -Path "temp.txt" -Value "alpha"; Remove-Item -Path "temp.txt" -Force',
      async () => {},
    )

    assert.equal(outcome.diagnostics?.status, 'no_write')
    assert.deepEqual(outcome.diagnostics?.reasonCodes, ['no_diff'])
    assert.equal(outcome.changes.length, 0)
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})
