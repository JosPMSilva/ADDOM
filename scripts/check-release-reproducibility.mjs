import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  isNativeRuntimePrepared,
  readNativeRuntimeMarker,
} from './ensure-native-runtime.mjs'

const EXPECTED_POSTINSTALL = 'node node_modules/electron/install.js && npm run native:electron'
const EXPECTED_NATIVE_ELECTRON = 'node scripts/ensure-native-runtime.mjs electron'
const EXPECTED_TEST_INTEGRATION = 'node scripts/with-native-runtime.mjs node --restore electron -- npm run test:integration:raw'
const EXPECTED_BETTER_SQLITE_VERSION = '13.0.3'
const EXPECTED_ELECTRON_VERSION = '44.1.0'

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message)
}

export function getLockedPackageVersion(lockfile, packagePath) {
  return asTrimmedString(lockfile?.packages?.[packagePath]?.version)
}

export function validateReleaseReproducibility({ repoRoot = resolveRepoRoot() } = {}) {
  const packageJson = readJson(path.join(repoRoot, 'package.json'))
  const packageLock = readJson(path.join(repoRoot, 'package-lock.json'))
  const postinstall = asTrimmedString(packageJson?.scripts?.postinstall)
  const nativeElectron = asTrimmedString(packageJson?.scripts?.['native:electron'])
  const testIntegration = asTrimmedString(packageJson?.scripts?.['test:integration'])
  const buildDir = asTrimmedString(packageJson?.scripts?.['build:dir'])
  const lockedBetterSqliteVersion = getLockedPackageVersion(packageLock, 'node_modules/better-sqlite3')
  const lockedElectronVersion = getLockedPackageVersion(packageLock, 'node_modules/electron')

  requireCondition(postinstall === EXPECTED_POSTINSTALL, `Expected postinstall to be "${EXPECTED_POSTINSTALL}".`)
  requireCondition(
    nativeElectron === EXPECTED_NATIVE_ELECTRON,
    `Expected native:electron to be "${EXPECTED_NATIVE_ELECTRON}".`,
  )
  requireCondition(
    testIntegration === EXPECTED_TEST_INTEGRATION,
    `Expected test:integration to be "${EXPECTED_TEST_INTEGRATION}".`,
  )
  requireCondition(
    buildDir.includes('npm run build:runtime-assets')
      && buildDir.includes('node scripts/run-electron-builder-host-check.mjs --dir --config electron-builder.config.cjs')
      && buildDir.includes('npm run test:live-smoke:packaged'),
    'build:dir must keep runtime asset prep, host-aware directory build, and packaged smoke coverage.',
  )
  requireCondition(
    lockedBetterSqliteVersion === EXPECTED_BETTER_SQLITE_VERSION,
    `Expected better-sqlite3 lockfile version ${EXPECTED_BETTER_SQLITE_VERSION}, got ${lockedBetterSqliteVersion || '(missing)'}.`,
  )
  requireCondition(
    lockedElectronVersion === EXPECTED_ELECTRON_VERSION,
    `Expected Electron lockfile version ${EXPECTED_ELECTRON_VERSION}, got ${lockedElectronVersion || '(missing)'}.`,
  )

  const nativeRuntimeMarker = readNativeRuntimeMarker(repoRoot)
  requireCondition(
    nativeRuntimeMarker?.runtime === 'electron',
    'Native runtime marker must exist and point at the electron runtime after install.',
  )
  requireCondition(
    isNativeRuntimePrepared('electron', { repoRoot }),
    'Electron native runtime assets are incomplete. Re-run npm install or npm run native:electron.',
  )

  return {
    postinstall,
    nativeElectron,
    testIntegration,
    buildDir,
    lockedBetterSqliteVersion,
    lockedElectronVersion,
    nativeRuntimeMarker,
  }
}

function printSummary(summary) {
  console.log(`[release-repro] postinstall: ${summary.postinstall}`)
  console.log(`[release-repro] native:electron: ${summary.nativeElectron}`)
  console.log(`[release-repro] test:integration: ${summary.testIntegration}`)
  console.log('[release-repro] build:dir: ok')
  console.log(`[release-repro] better-sqlite3 lock: ${summary.lockedBetterSqliteVersion}`)
  console.log(`[release-repro] Electron lock: ${summary.lockedElectronVersion}`)
  console.log(
    `[release-repro] native runtime marker: ${summary.nativeRuntimeMarker.runtime} ${summary.nativeRuntimeMarker.platform}/${summary.nativeRuntimeMarker.arch} target ${summary.nativeRuntimeMarker.target}`,
  )
  console.log('[release-repro] reproducibility gate passed')
}

async function main() {
  const summary = validateReleaseReproducibility()
  printSummary(summary)
}

const isEntrypoint = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false

if (isEntrypoint) await main()
