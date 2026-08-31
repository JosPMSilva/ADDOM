import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readText(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

function readJson(relPath) {
  return JSON.parse(readText(relPath))
}

test('manual attributions include required vendored and bundled runtime entries, and keep Playwright runtime optional', () => {
  const manual = readJson('build/legal/manual-attributions.json')
  const ids = new Set((manual.items || []).map((entry) => String(entry?.id || '').trim()).filter(Boolean))
  const playwrightRuntime = (manual.items || []).find((entry) => entry?.id === 'bundled:playwright-browser-runtime')

  assert.equal(ids.has('vendored:phosphor'), true)
  assert.equal(ids.has('bundled:electron-runtime'), true)
  assert.equal(ids.has('bundled:chromium-notice-bundle'), true)
  assert.equal(ids.has('bundled:playwright-browser-runtime'), true)
  assert.equal(Boolean(playwrightRuntime?.shipped), false)
})

test('generated legal outputs exclude the optional Playwright runtime from shipped credits', () => {
  const shipped = readJson('build/legal/shipped-third-party-inventory.json')
  const credits = readJson('build/legal/OSS_CREDITS.json')
  const notices = readText('build/legal/THIRD_PARTY_NOTICES.txt')

  assert.match(JSON.stringify(shipped), /vendored:phosphor/)
  assert.match(JSON.stringify(shipped), /bundled:electron-runtime/)
  assert.match(JSON.stringify(shipped), /bundled:chromium-notice-bundle/)
  assert.doesNotMatch(JSON.stringify(shipped), /bundled:playwright-browser-runtime/)
  assert.doesNotMatch(JSON.stringify(credits), /bundled:playwright-browser-runtime/)
  assert.match(JSON.stringify(credits), /legal\/THIRD_PARTY_NOTICES\.txt/)
  assert.match(notices, /=== vendored:phosphor ===/)
  assert.match(notices, /=== bundled:electron-runtime ===/)
  assert.match(notices, /=== bundled:chromium-notice-bundle ===/)
  assert.doesNotMatch(notices, /=== bundled:playwright-browser-runtime ===/)
})

test('generated legal outputs only depend on installed metadata for shipped packages', () => {
  const full = readJson('build/legal/full-dependency-inventory.json')
  const shipped = readJson('build/legal/shipped-third-party-inventory.json')
  const lockfile = readJson('package-lock.json')
  const betterSqliteVersion = lockfile.packages?.['node_modules/better-sqlite3']?.version
  const transformersVersion = lockfile.packages?.['node_modules/@huggingface/transformers']?.version

  const optionalPlatformPackage = (full.items || []).find(
    (entry) => entry?.id === 'npm:@tailwindcss/oxide-win32-x64-msvc@4.2.0',
  )
  const shippedRuntimePackage = (shipped.items || []).find(
    (entry) => entry?.id === `npm:better-sqlite3@${betterSqliteVersion}`,
  )
  const shippedTransformersPackage = (shipped.items || []).find(
    (entry) => entry?.id === `npm:@huggingface/transformers@${transformersVersion}`,
  )

  assert.ok(betterSqliteVersion)
  assert.ok(transformersVersion)
  assert.equal(optionalPlatformPackage?.classification, 'inventory_only')
  assert.deepEqual(optionalPlatformPackage?.licenseFiles, [])
  assert.equal(shippedRuntimePackage?.classification, 'shipped_runtime')
  assert.match(JSON.stringify(shippedRuntimePackage?.licenseFiles || []), /better-sqlite3\/LICENSE/)
  assert.equal(shippedTransformersPackage?.classification, 'shipped_runtime')
  assert.match(
    JSON.stringify(shippedTransformersPackage?.licenseFiles || []),
    /@huggingface\/transformers\/LICENSE/,
  )
})

test('preload and main expose the legal document API', () => {
  const preloadSource = readText('src/preload/index.mjs')
  const mainSource = readText('src/main/index.mjs')
  const ipcRegistrationSource = readText('src/main/main-ipc-registration.mjs')

  assert.match(preloadSource, /openLegalDocument:\s*\(documentId\)\s*=>\s*invokeVersioned\('app:openLegalDocument'/)
  assert.match(mainSource, /resolveLegalDocumentPath/)
  assert.match(ipcRegistrationSource, /handleVersioned\(ipcMain,\s*'app:openLegalDocument'/)
  assert.match(mainSource, /third-party-notices/)
  assert.match(mainSource, /oss-inventory/)
})

test('about block exposes legal document actions', () => {
  const source = readText('src/renderer/components/settings/SettingsBlocksGovernance.jsx')

  assert.match(source, /Open source notices/)
  assert.match(source, /Third-party inventory/)
  assert.match(source, /handleOpenLegalDocument\('third-party-notices'\)/)
  assert.match(source, /handleOpenLegalDocument\('oss-inventory'\)/)
})
