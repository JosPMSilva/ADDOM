import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('installer launches the installed executable directly after install', () => {
  const source = fs.readFileSync(path.resolve('build/installer.nsh'), 'utf8')

  assert.match(source, /!macro customInstall[\s\S]*StrCpy \$launchLink "\$appExe"[\s\S]*!macroend/)
  assert.doesNotMatch(source, /ExecShellAsUser/)
})
