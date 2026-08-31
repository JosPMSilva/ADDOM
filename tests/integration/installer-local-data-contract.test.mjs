import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('builder config and NSIS include define secure local-data uninstall behavior', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'))
  const installerSource = fs.readFileSync(path.resolve('build/installer.nsh'), 'utf8')

  assert.equal(packageJson?.build?.nsis?.include, 'build/installer.nsh')
  assert.match(installerSource, /customUnWelcomePage/)
  assert.match(installerSource, /Section \/o "un\.Keep local history and settings after uninstall"/)
  assert.match(installerSource, /\$\{isUpdated\}/)
  assert.match(installerSource, /\$TEMP\\addom-attachments/)
  assert.match(installerSource, /vault\.json/)
})
