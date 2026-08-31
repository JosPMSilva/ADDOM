import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'

import {
  createCommandEnv,
  MAX_COMMAND_CHAIN_OPERATORS,
  normalizeCommandCwd,
  validateCommandPolicy,
} from '../../src/main/tools/command-tools-core.mjs'

test('validateCommandPolicy blocks destructive PowerShell Remove-Item/ri recursive+force commands', () => {
  assert.throws(
    () => validateCommandPolicy('Remove-Item -Recurse -Force ~'),
    /destructive PowerShell delete commands targeting the home directory/i,
  )
  assert.throws(
    () => validateCommandPolicy('ri -r -fo C:\\Users\\example'),
    /destructive PowerShell/i,
  )
  assert.throws(
    () => validateCommandPolicy("Remove-Item 'C:\\\\' -Force -Recurse"),
    /destructive PowerShell absolute delete commands/i,
  )
  assert.doesNotThrow(() => validateCommandPolicy('Get-ChildItem -Force'))
})

test('validateCommandPolicy allows PowerShell Format-* display cmdlets but blocks disk-format executables', () => {
  assert.doesNotThrow(() => {
    validateCommandPolicy('Get-Process -Id $PID | Format-Table Id,ProcessName -AutoSize')
  })
  assert.doesNotThrow(() => {
    validateCommandPolicy('Get-Process -Id $PID | Format-List Id,ProcessName')
  })
  assert.doesNotThrow(() => {
    validateCommandPolicy('Get-Process -Id $PID | Format-Wide ProcessName')
  })

  assert.throws(
    () => validateCommandPolicy('format C:'),
    /Refusing disk formatting commands\./,
  )
  assert.throws(
    () => validateCommandPolicy('cmd /c format C:'),
    /Refusing disk formatting commands\./,
  )
  assert.throws(
    () => validateCommandPolicy('format.com C:'),
    /Refusing disk formatting commands\./,
  )
  assert.throws(
    () => validateCommandPolicy('diskpart'),
    /Refusing disk formatting commands\./,
  )
  assert.throws(
    () => validateCommandPolicy('mkfs.ext4 /dev/sda1'),
    /Refusing disk formatting commands\./,
  )
})

test('validateCommandPolicy allows destructive absolute delete patterns only after host full access approval', () => {
  assert.doesNotThrow(() => validateCommandPolicy(
    "Remove-Item 'C:\\temp\\artifact.zip' -Force -Recurse",
    { hostFullAccessApproved: true },
  ))
  assert.doesNotThrow(() => validateCommandPolicy(
    "Remove-Item 'C:\\Users\\example\\AppData\\Roaming\\addom-dev\\openai-account\\codex-home\\skills\\pdf' -Force -Recurse",
    { hostFullAccessApproved: true },
  ))
  assert.doesNotThrow(() => validateCommandPolicy(
    'rm -rf C:\\temp\\artifact',
    { allowHostFullAccessForThisCommand: true },
  ))
  assert.throws(
    () => validateCommandPolicy(
      'Remove-Item -Recurse -Force ~',
      { hostFullAccessApproved: true },
    ),
    /targeting the home directory/i,
  )
})

test('validateCommandPolicy blocks blocklist evasions and overly complex chains', () => {
  assert.throws(
    () => validateCommandPolicy('echo `rm -rf /`'),
    /backtick-escaped destructive delete commands/i,
  )
  assert.throws(
    () => validateCommandPolicy('echo $(rm -rf /)'),
    /subshell-escaped destructive delete commands/i,
  )
  assert.throws(
    () => validateCommandPolicy('rm -rf $ENV:USERPROFILE'),
    /targeting user-home paths/i,
  )
  assert.throws(
    () => validateCommandPolicy('r\u200bm -rf /'),
    /destructive root delete commands/i,
  )

  const tooManyChains = new Array(MAX_COMMAND_CHAIN_OPERATORS + 2).fill('echo ok').join(' && ')
  assert.throws(
    () => validateCommandPolicy(tooManyChains),
    /too many pipes\/chains/i,
  )

  const acceptableChains = new Array(MAX_COMMAND_CHAIN_OPERATORS).fill('echo ok').join(' && ')
  assert.doesNotThrow(() => validateCommandPolicy(acceptableChains))
})

test('validateCommandPolicy ignores quoted/script-body separators and no longer double-counts ||', () => {
  const quotedSeparators = 'node -e "console.log(1); console.log(2); console.log(3);" && echo done'
  assert.doesNotThrow(() => validateCommandPolicy(quotedSeparators))

  const fallbackHeavy = new Array(8).fill('echo ok').join(' || ')
  assert.doesNotThrow(() => validateCommandPolicy(fallbackHeavy))

  const powerShellHereString = [
    "@'",
    'const a = 1; const b = 2; const c = 3;',
    'console.log(a + b + c);',
    "'@ | node -",
  ].join('\n')
  assert.doesNotThrow(() => validateCommandPolicy(powerShellHereString))
})

test('validateCommandPolicy allows logged Playwright-style eval commands with dense JS expressions', () => {
  const debugElectronEval = 'node scripts/debug-electron-cdp.mjs eval --target ADDOM --expr "JSON.stringify([...document.querySelectorAll(\'button\')].map(b=>({text:(b.innerText||\'\').trim(),title:b.getAttribute(\'title\')||\'\',aria:b.getAttribute(\'aria-label\')||\'\',dataUi:b.getAttribute(\'data-ui\')||\'\'})).filter(x=>/thread|send message|context meter|openai/i.test([x.text,x.title,x.aria,x.dataUi].join(\' \'))).slice(0,25))"'
  assert.doesNotThrow(() => validateCommandPolicy(debugElectronEval))

  const npmEval = 'npm run debug:addom:eval -- --expr "(() => { const btn = Array.from(document.querySelectorAll(\'button\')).find(b => (b.title||\'\')===\'New thread\' || (b.getAttribute(\'aria-label\')||\'\')===\'New thread\' || (b.innerText||\'\').trim()===\'New\'); if (!btn) return {clicked:false}; btn.click(); return {clicked:true, dialogs:Array.from(document.querySelectorAll(\'[role=dialog]\')).map(d => d.textContent.trim())}; })()"'
  assert.doesNotThrow(() => validateCommandPolicy(npmEval))
})

test('normalizeCommandCwd rejects cwd values with null bytes before path resolution', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-cwd-'))
  try {
    assert.throws(
      () => normalizeCommandCwd(projectRoot, '.\0\\nested'),
      /Working directory contains unsupported null bytes/i,
    )
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('normalizeCommandCwd keeps outside-workspace cwd behind an explicit allowOutsideProjectRoot gate', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-cwd-root-'))
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-cwd-outside-'))
  try {
    assert.throws(
      () => normalizeCommandCwd(projectRoot, outsideRoot),
      /escapes the project root/i,
    )
    assert.equal(
      normalizeCommandCwd(projectRoot, outsideRoot, { allowOutsideProjectRoot: true }),
      outsideRoot,
    )
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true })
    fs.rmSync(outsideRoot, { recursive: true, force: true })
  }
})

test('createCommandEnv strips sensitive inherited env vars but keeps baseline process env for commands', () => {
  const original = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    DATABASE_URL: process.env.DATABASE_URL,
    PATH: process.env.PATH,
    CI: process.env.CI,
  }
  process.env.OPENAI_API_KEY = 'secret-openai'
  process.env.GITHUB_TOKEN = 'secret-github'
  process.env.DATABASE_URL = 'postgres://secret'
  process.env.PATH = process.env.PATH || 'C:\\Windows\\System32'
  delete process.env.CI

  try {
    const env = createCommandEnv()
    assert.equal(env.OPENAI_API_KEY, undefined)
    assert.equal(env.GITHUB_TOKEN, undefined)
    assert.equal(env.DATABASE_URL, undefined)
    assert.equal(typeof env.PATH, 'string')
    assert.equal(env.CI, '1')
    assert.equal(env.DEBIAN_FRONTEND, 'noninteractive')
    assert.equal(env.PIP_DISABLE_PIP_VERSION_CHECK, '1')
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (typeof value === 'undefined') delete process.env[key]
      else process.env[key] = value
    }
  }
})
