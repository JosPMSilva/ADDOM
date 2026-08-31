import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('index main-process source validates external URLs before opening them', () => {
  const source = fs.readFileSync(path.resolve('src/main/index.mjs'), 'utf8')
  const ipcRegistrationSource = fs.readFileSync(path.resolve('src/main/main-ipc-registration.mjs'), 'utf8')

  assert.match(source, /validateExternalHttpUrl/)
  assert.match(source, /setWindowOpenHandler\(\(\{ url \}\) => \{/)
  assert.match(source, /const validation = validateExternalHttpUrl\(url\)/)
  assert.match(source, /if \(validation\.ok\)\s*\{\s*void shell\.openExternal\(validation\.url\)/)
  assert.match(source, /return \{ action: 'deny' \}/)
  assert.match(ipcRegistrationSource, /handleVersioned\(ipcMain,\s*'shell:openExternal',\s*async\s*\(_event,\s*url\)\s*=>\s*\{/)
  assert.match(ipcRegistrationSource, /if \(!validation\.ok\) return validation/)
  assert.match(ipcRegistrationSource, /await shell\.openExternal\(validation\.url\)/)
  assert.match(ipcRegistrationSource, /return \{ ok: true \}/)
  assert.doesNotMatch(source, /\^https\?:\\\/\\\//)
})

test('index main-process source uses guarded native menu for open containing folder', () => {
  const source = fs.readFileSync(path.resolve('src/main/main-ipc-registration.mjs'), 'utf8')

  assert.match(source, /handleVersioned\(ipcMain,\s*'shell:showOpenContainingFolderMenu',\s*async\s*\(event,\s*folderPath\)\s*=>\s*\{/)
  assert.match(source, /const validation = await validateOpenDirectoryPath\(folderPath,\s*allowedProjectPaths\)/)
  assert.match(source, /const browserWindow = BrowserWindow\.fromWebContents\(event\.sender\)/)
  assert.match(source, /Menu\.buildFromTemplate\(\[\s*\{\s*label:\s*'Open containing folder'/)
  assert.match(source, /menu\.popup\(\{\s*window:\s*browserWindow\s*\}\)/)
})

test('index main-process source writes attachment temp files with owner-only mode', () => {
  const source = fs.readFileSync(path.resolve('src/main/attachments/attachment-action-resource.mjs'), 'utf8')
  assert.match(source, /await writeFile\(tempPath,\s*bytes,\s*\{\s*mode:\s*0o600\s*\}\)/)
})
