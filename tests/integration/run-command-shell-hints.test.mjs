import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildShellDialectHints,
  classifyShellDialectMistake,
} from '../../src/main/tools/command-tools-core.mjs'

test('buildShellDialectHints detects PowerShell dir /a cmd-switch misuse and suggests -Force', () => {
  const stderr = [
    "dir : Cannot find path 'C:\\a' because it does not exist.",
    '+ dir /a',
    '    + FullyQualifiedErrorId : PathNotFound,Microsoft.PowerShell.Commands.GetChildItemCommand',
  ].join('\n')

  const mistake = classifyShellDialectMistake('dir /a', {
    shell: 'powershell',
    stderr,
  })
  assert.ok(mistake)
  assert.equal(mistake.code, 'powershell_dir_slash_a')

  const hints = buildShellDialectHints('dir /a', {
    shell: 'powershell',
    stderr,
  })
  assert.ok(Array.isArray(hints))
  assert.ok(hints.some((hint) => /Get-ChildItem -Force|dir -Force/.test(hint)))
})

test('buildShellDialectHints does not emit false hint for valid PowerShell dir -Force', () => {
  const hints = buildShellDialectHints('dir -Force', {
    shell: 'powershell',
    stderr: '',
  })
  assert.deepEqual(hints, [])
})

