import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  installDenyAllWebPermissions,
  installMainWindowWebGuards,
  isAllowedMainFrameNavigation,
} from '../../src/main/main-web-security-policy.mjs'

test('index main-process source validates external URLs before opening them', () => {
  const source = fs.readFileSync(path.resolve('src/main/index.mjs'), 'utf8')
  const webSecuritySource = fs.readFileSync(path.resolve('src/main/main-web-security-policy.mjs'), 'utf8')
  const ipcRegistrationSource = fs.readFileSync(path.resolve('src/main/main-ipc-registration.mjs'), 'utf8')

  assert.match(source, /installMainWindowWebGuards\(mainWindow\.webContents/)
  assert.match(source, /openExternal:\s*\(url\)\s*=>\s*shell\.openExternal\(url\)/)
  assert.match(webSecuritySource, /setWindowOpenHandler\(\(\{ url \}\) => \{/)
  assert.match(webSecuritySource, /const validation = validateExternalHttpUrl\(url\)/)
  assert.match(webSecuritySource, /if \(validation\.ok\) void openExternal\(validation\.url\)/)
  assert.match(webSecuritySource, /return \{ action: 'deny' \}/)
  assert.match(ipcRegistrationSource, /handleVersioned\(ipcMain,\s*'shell:openExternal',\s*async\s*\(_event,\s*url\)\s*=>\s*\{/)
  assert.match(ipcRegistrationSource, /if \(!validation\.ok\) return validation/)
  assert.match(ipcRegistrationSource, /await shell\.openExternal\(validation\.url\)/)
  assert.match(ipcRegistrationSource, /return \{ ok: true \}/)
  assert.doesNotMatch(source, /\^https\?:\\\/\\\//)
})

test('main-frame navigation stays on the renderer origin in development and production', () => {
  assert.equal(isAllowedMainFrameNavigation('addom-app://renderer/index.html'), true)
  assert.equal(isAllowedMainFrameNavigation('addom-app://renderer/settings?tab=agents#roles'), true)
  assert.equal(isAllowedMainFrameNavigation('https://example.com'), false)
  assert.equal(isAllowedMainFrameNavigation('javascript:alert(1)'), false)

  assert.equal(isAllowedMainFrameNavigation('http://localhost:5173/settings', { isDev: true }), true)
  assert.equal(isAllowedMainFrameNavigation('http://127.0.0.1:5173/settings', { isDev: true }), false)
  assert.equal(isAllowedMainFrameNavigation('http://localhost:5174/settings', { isDev: true }), false)
  assert.equal(isAllowedMainFrameNavigation('not a url', { isDev: true }), false)
})

test('main-window web guards prevent external navigation and route safe popups outward', () => {
  let navigationHandler = null
  let windowOpenHandler = null
  const opened = []
  const webContents = {
    on(eventName, handler) {
      if (eventName === 'will-navigate') navigationHandler = handler
    },
    setWindowOpenHandler(handler) {
      windowOpenHandler = handler
    },
  }

  installMainWindowWebGuards(webContents, {
    openExternal: (url) => opened.push(url),
  })

  let prevented = false
  navigationHandler?.({ preventDefault: () => { prevented = true } }, 'https://example.com')
  assert.equal(prevented, true)
  assert.deepEqual(windowOpenHandler?.({ url: 'https://example.com/docs' }), { action: 'deny' })
  assert.deepEqual(windowOpenHandler?.({ url: 'javascript:alert(1)' }), { action: 'deny' })
  assert.deepEqual(opened, ['https://example.com/docs'])
})

test('web permission policy denies checks and asynchronous requests by default', () => {
  let checkHandler = null
  let requestHandler = null
  const targetSession = {
    setPermissionCheckHandler(handler) {
      checkHandler = handler
    },
    setPermissionRequestHandler(handler) {
      requestHandler = handler
    },
  }

  installDenyAllWebPermissions(targetSession)

  assert.equal(checkHandler?.(null, 'geolocation', 'addom-app://renderer'), false)
  let permissionDecision = null
  requestHandler?.(null, 'media', (allowed) => {
    permissionDecision = allowed
  })
  assert.equal(permissionDecision, false)
})

test('index installs main-frame navigation and deny-all web permission guards', () => {
  const source = fs.readFileSync(path.resolve('src/main/index.mjs'), 'utf8')

  assert.match(source, /installDenyAllWebPermissions\(session\.defaultSession\)/)
  assert.match(source, /installMainWindowWebGuards\(mainWindow\.webContents/)
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
