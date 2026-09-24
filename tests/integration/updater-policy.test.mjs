import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('updater accepts only the official public ADDOM GitHub release feed', () => {
  const source = fs.readFileSync(path.resolve('src/main/ipc-handlers/updater.mjs'), 'utf8')

  assert.match(source, /function readPackagedUpdateConfig\(\)/)
  assert.match(source, /path\.join\(resourcesPath, 'app-update\.yml'\)/)
  assert.match(source, /ALLOWED_PACKAGED_UPDATE_PROVIDER = 'github'/)
  assert.match(source, /ALLOWED_GITHUB_OWNER = 'JosPMSilva'/)
  assert.match(source, /ALLOWED_GITHUB_REPOSITORY = 'ADDOM'/)
  assert.match(source, /function hasSupportedPackagedUpdateConfig\(\)/)
  assert.match(source, /if \(!hasSupportedPackagedUpdateConfig\(\)\) return null/)
  assert.match(source, /createElectronUpdateAdapter\(updater/)
  assert.match(source, /createProductionApplicationUpdateActivityMonitor\(/)
  assert.match(source, /createApplicationUpdateInstallCoordinator\(/)
  assert.match(source, /beginQuiescence: beginApplicationWorkQuiescence/)
  assert.match(source, /prepareForExit/)
  assert.match(source, /createUnavailableUpdateSnapshot\(\)/)
  assert.match(source, /process\.windowsStore === true/)
  assert.match(source, /createMicrosoftStoreManagedUpdateSnapshot\(\)/)
  assert.match(source, /isMicrosoftStore \? 'microsoft-store'/)
  assert.doesNotMatch(source, /ADDOM-AGENTIC|hasPrivateUpdateToken|updater-dev|createDevUpdateSimulator/)
  assert.doesNotMatch(source, /message:\s*err\.message/)
  assert.doesNotMatch(source, /error:\s*err\.message/)
})

test('public updater IPC surface contains no simulator channels', () => {
  const source = fs.readFileSync(path.resolve('src/main/updater/application-updater-ipc.mjs'), 'utf8')
  assert.doesNotMatch(source, /updater-dev:|simulationAdapter|applySimulationScenario/)
})

test('packaged smoke registers the disabled updater IPC surface instead of leaving renderer calls unhandled', () => {
  const source = fs.readFileSync(path.resolve('src/main/main-ipc-registration.mjs'), 'utf8')
  assert.match(source, /const disposeUpdater = registerUpdaterHandlers\(\{/)
  assert.match(source, /isPackaged: isPackagedSmoke \? false : undefined/)
  assert.doesNotMatch(source, /!isPackagedSmoke\s*\?\s*registerUpdaterHandlers/)
})
