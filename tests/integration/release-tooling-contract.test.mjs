import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import {
  resolveElectronBuilderArgs,
  resolveElectronBuilderCommand,
} from '../../scripts/run-electron-builder-host-check.mjs'
import {
  applyElectronBuilderTraversalPatch,
  applyElectronBuilderOptionalDependencyLogPatch,
} from '../../scripts/prepare-electron-builder-runtime.mjs'
import {
  isWindowsBatchCommand,
  resolveSpawnCommand,
} from '../../scripts/lib/resolve-spawn-command.mjs'

const ROOT = process.cwd()
const PACKAGE_JSON = path.join(ROOT, 'package.json')
const CHECK_BUNDLE_SIZE_SCRIPT = path.join(ROOT, 'scripts', 'check-bundle-size.mjs')
const CHECK_RELEASE_FREEZE_SCRIPT = path.join(ROOT, 'scripts', 'check-release-freeze.mjs')

function readPackageJson() {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'))
}

function writeAsset(filePath, sizeBytes) {
  const buffer = Buffer.alloc(Math.max(0, Number(sizeBytes) || 0), 0x61)
  return writeFile(filePath, buffer)
}

function runBundleCheck(cwd, env = {}) {
  return spawnSync(process.execPath, [CHECK_BUNDLE_SIZE_SCRIPT], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
    },
  })
}

test('release build scripts route multi-target packaging through the host-aware electron-builder wrapper', () => {
  const packageJson = readPackageJson()
  const scripts = packageJson.scripts || {}
  const extraResourceSources = (packageJson.build?.extraResources || []).map((entry) => String(entry?.from || ''))
  const exportModelsScript = fs.readFileSync(path.join(ROOT, 'scripts', 'export-models-dev-portable.ps1'), 'utf8')
  const syncModelsScript = fs.readFileSync(path.join(ROOT, 'scripts', 'sync-models-dev-repo.ps1'), 'utf8')
  const ensureNativeRuntimeScript = fs.readFileSync(path.join(ROOT, 'scripts', 'ensure-native-runtime.mjs'), 'utf8')
  const builderConfigSource = fs.readFileSync(path.join(ROOT, 'electron-builder.config.cjs'), 'utf8')
  const afterPackSource = fs.readFileSync(path.join(ROOT, 'scripts', 'after-pack.cjs'), 'utf8')
  const preCommitHookSource = fs.readFileSync(path.join(ROOT, '.githooks', 'pre-commit'), 'utf8')
  const ciWorkflowSource = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci-cross-platform.yml'), 'utf8')

  assert.equal(packageJson.version, '0.1.0-alpha')
  assert.deepEqual(packageJson.engines, { node: '>=24' })
  assert.equal(String(scripts['native:node'] || ''), 'node scripts/ensure-native-runtime.mjs node')
  assert.equal(String(scripts['native:electron'] || ''), 'node scripts/ensure-native-runtime.mjs electron')
  assert.equal(
    String(scripts['check:release-reproducibility'] || ''),
    'node scripts/check-release-reproducibility.mjs',
  )
  assert.equal(
    String(scripts['check:release-freeze'] || ''),
    'node scripts/check-release-freeze.mjs',
  )
  assert.equal(
    String(scripts['check:syntax'] || ''),
    'npm run check:node-syntax && npm run check:renderer-syntax && npm run check:json-syntax && npm run check:powershell-syntax',
  )
  assert.equal(String(scripts['check:staged-syntax'] || ''), 'node scripts/check-staged-syntax.mjs')
  assert.equal(String(scripts['check:max-lines'] || ''), 'node scripts/check-max-lines.mjs')
  assert.equal(String(scripts['check:node-syntax'] || ''), 'node scripts/check-node-syntax.mjs')
  assert.equal(String(scripts['check:renderer-syntax'] || ''), 'node scripts/check-renderer-jsx-syntax.mjs')
  assert.equal(
    String(scripts['check:renderer-jsx-syntax'] || ''),
    'node scripts/check-renderer-jsx-syntax.mjs',
  )
  assert.equal(
    String(scripts['check:renderer'] || ''),
    'npm run check:renderer-syntax && node --test tests/integration/chat-event-bridge-openai.test.mjs tests/integration/agent-run-event-bridge.test.mjs tests/integration/chat-event-bridge-stream-runtime.test.mjs tests/integration/chat-event-bridge-tool-output-buffer.test.mjs tests/integration/chat-panel-header-permission-mode-ui.test.mjs tests/integration/chat-panel-timeline-wiring-contract.test.mjs tests/integration/question-user-composer-card-contract.test.mjs tests/integration/openai-account-rate-limit-refresh-contract.test.mjs tests/integration/write-conflict-card-hydration-ui.test.mjs',
  )
  assert.equal(String(scripts['check:json-syntax'] || ''), 'node scripts/check-json-syntax.mjs')
  assert.equal(String(scripts['check:powershell-syntax'] || ''), 'node scripts/check-powershell-syntax.mjs')
  assert.equal(String(scripts['check:eslint'] || ''), 'eslint --max-warnings=0 src scripts tests')
  assert.equal(String(scripts.dev || ''), 'node scripts/with-native-runtime.mjs electron -- npm run dev:raw')
  assert.equal(String(scripts['dev:electron'] || ''), 'node scripts/with-native-runtime.mjs electron -- npm run dev:electron:raw')
  assert.equal(String(scripts['dev:raw'] || ''), 'concurrently "npm run dev:vite" "npm run dev:electron:raw"')
  assert.match(String(scripts['build:all'] || ''), /node scripts\/run-electron-builder-host-check\.mjs --config electron-builder\.config\.cjs/)
  assert.match(String(scripts['build:dir'] || ''), /node scripts\/run-electron-builder-host-check\.mjs --dir --config electron-builder\.config\.cjs/)
  assert.match(String(scripts['test:live-smoke:packaged'] || ''), /ADDOM_PACKAGED_BROWSER_SMOKE=1/)
  assert.equal(
    String(scripts['test:live-smoke:packaged:terminal'] || ''),
    'cross-env ADDOM_PACKAGED_TERMINAL_SMOKE=1 node --test tests/live/packaged-terminal-runtime-smoke.test.mjs',
  )
  assert.match(String(scripts['build:runtime-assets'] || ''), /node scripts\/prepare-electron-builder-runtime\.mjs/)
  assert.equal(String(scripts['build:runtime-assets'] || '').includes('check:renderer-jsx-syntax'), false)
  assert.equal(String(scripts['build:runtime-assets'] || '').includes('check:syntax'), false)
  assert.equal(String(scripts['build:runtime-assets'] || '').includes('check:renderer'), false)
  assert.equal(String(scripts['build:runtime-assets'] || '').includes('check:eslint'), false)
  assert.match(ciWorkflowSource, /actions\/setup-node@[a-f0-9]{40} # v7/)
  assert.match(ciWorkflowSource, /Reject high-severity dependency advisories[\s\S]*npm audit --audit-level=high/)
  assert.match(String(scripts['build:win'] || ''), /npm run test:live-smoke:packaged/)
  assert.match(String(scripts['build:dir'] || ''), /npm run test:live-smoke:packaged/)
  assert.match(String(scripts['build:win'] || ''), /ADDOM_ELECTRON_BUILDER_FORCE_TRAVERSAL=1/)
  assert.match(String(scripts['build:mac'] || ''), /ADDOM_ELECTRON_BUILDER_FORCE_TRAVERSAL=1/)
  assert.match(String(scripts['build:linux'] || ''), /ADDOM_ELECTRON_BUILDER_FORCE_TRAVERSAL=1/)
  assert.match(builderConfigSource, /ADDOM_UPDATE_PROVIDER/)
  assert.match(builderConfigSource, /provider: 'github'/)
  assert.match(builderConfigSource, /owner: 'JosPMSilva'/)
  assert.match(builderConfigSource, /repo: 'ADDOM'/)
  assert.match(builderConfigSource, /config\.afterPack = path\.join\(__dirname, 'scripts', 'after-pack\.cjs'\)/)
  assert.match(afterPackSource, /ADDOM_UPDATE_PROVIDER/)
  assert.match(afterPackSource, /app-update\.yml/)
  assert.equal(String(scripts['build:runtime-assets'] || '').includes('browser:prepare-runtime'), false)
  assert.equal(extraResourceSources.includes('.playwright-browsers'), false)
  assert.equal(extraResourceSources.includes('build/advanced'), true)
  const windowsBuilderCommand = resolveElectronBuilderCommand('win32', ROOT)
  assert.equal(
    windowsBuilderCommand.endsWith(path.join('node_modules', '.bin', 'electron-builder.cmd'))
      || windowsBuilderCommand === 'electron-builder.cmd',
    true,
  )
  assert.equal(
    /electron-builder(\.cmd)?$/.test(resolveElectronBuilderCommand(process.platform, ROOT)),
    true,
  )
  assert.equal(isWindowsBatchCommand('npm.cmd', 'win32'), true)
  assert.equal(isWindowsBatchCommand('electron-builder.cmd', 'win32'), true)
  assert.equal(isWindowsBatchCommand('node', 'win32'), false)

  assert.deepEqual(
    resolveSpawnCommand('npm.cmd', ['run', 'build:dir'], 'win32', { ComSpec: 'C:\\Windows\\System32\\cmd.exe' }),
    {
      command: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', 'run', 'build:dir'],
      options: {
        shell: false,
        windowsHide: true,
      },
    },
  )
  assert.deepEqual(
    resolveSpawnCommand('node', ['scripts/check-bundle-size.mjs'], 'win32', { ComSpec: 'C:\\Windows\\System32\\cmd.exe' }),
    {
      command: 'node',
      args: ['scripts/check-bundle-size.mjs'],
      options: {
        shell: false,
        windowsHide: true,
      },
    },
  )

  assert.deepEqual(
    resolveElectronBuilderArgs(['--win', '--dir', '--config', 'electron-builder.config.cjs'], 'darwin'),
    ['--mac', '--dir', '--config', 'electron-builder.config.cjs'],
  )
  assert.deepEqual(
    resolveElectronBuilderArgs(['--mac', '--linux', '--publish', 'never'], 'win32'),
    ['--win', '--publish', 'never'],
  )

  assert.doesNotMatch(
    fs.readFileSync(path.join(ROOT, 'scripts', 'with-native-runtime.mjs'), 'utf8'),
    /shell:\s*true/,
  )
  assert.match(ensureNativeRuntimeScript, /node_modules', '\.cache', 'addom-native-runtime'/)
  assert.match(ensureNativeRuntimeScript, /Validated portable native assets/)
  assert.doesNotMatch(ensureNativeRuntimeScript, /install-app-deps/)
  assert.match(ensureNativeRuntimeScript, /better_sqlite3\.node/)
  assert.doesNotMatch(
    fs.readFileSync(path.join(ROOT, 'scripts', 'run-electron-builder-host-check.mjs'), 'utf8'),
    /shell:\s*true/,
  )
  assert.match(exportModelsScript, /\[CmdletBinding\(\)\]/)
  assert.match(exportModelsScript, /\$repoRoot = Split-Path -Parent \$PSScriptRoot/)
  assert.match(exportModelsScript, /Join-Path \$repoRoot '\.cache\\models\.dev\.git'/)
  assert.match(exportModelsScript, /Join-Path \$repoRoot '\.cache\\models\.dev-portable'/)
  assert.doesNotMatch(exportModelsScript, /C:\\Users\\example\\Documents\\ADDOM/)
  assert.match(syncModelsScript, /-MirrorPath \$mirror -OutputPath \$portableExport/)
  assert.match(syncModelsScript, /refresh-model-catalog-source\.mjs/)
  assert.match(syncModelsScript, /catalog:accept:refresh/)
  assert.doesNotMatch(syncModelsScript, /generate-model-catalog\.mjs/)
  assert.equal(
    String(scripts['catalog:check:generated'] || ''),
    'node scripts/check-generated-model-catalog.mjs',
  )
  assert.equal(
    String(scripts['catalog:refresh'] || ''),
    'node scripts/refresh-model-catalog-source.mjs',
  )
  assert.equal(
    String(scripts['catalog:accept:refresh'] || ''),
    'node scripts/accept-model-catalog-refresh.mjs',
  )
  assert.match(preCommitHookSource, /npm run check:docs-links/)
  assert.match(preCommitHookSource, /npm run check:staged-syntax/)
  assert.doesNotMatch(preCommitHookSource, /npm run check:syntax/)
  assert.doesNotMatch(preCommitHookSource, /check:eslint/)
  assert.match(ciWorkflowSource, /validate:\s*\n\s*runs-on: ubuntu-latest/)
  assert.match(ciWorkflowSource, /integration:\s*\n\s*needs: validate\s*\n\s*runs-on: windows-latest/)
  assert.match(ciWorkflowSource, /integration:[\s\S]*- name: Run integration tests[\s\S]*npm run test:integration/)
  assert.match(ciWorkflowSource, /package:\s*\n\s*needs: \[validate, integration\]/)
  assert.match(ciWorkflowSource, /validate:[\s\S]*- name: Check syntax[\s\S]*npm run check:syntax/)
  assert.match(ciWorkflowSource, /validate:[\s\S]*- name: Check renderer[\s\S]*npm run check:renderer/)
  assert.match(ciWorkflowSource, /validate:[\s\S]*- name: Check ESLint[\s\S]*npm run check:eslint/)
  assert.doesNotMatch(ciWorkflowSource, /package:[\s\S]*- name: Check syntax[\s\S]*npm run check:syntax/)
  assert.doesNotMatch(ciWorkflowSource, /package:[\s\S]*- name: Check renderer[\s\S]*npm run check:renderer/)
  assert.doesNotMatch(ciWorkflowSource, /package:[\s\S]*- name: Check ESLint[\s\S]*npm run check:eslint/)
  assert.doesNotMatch(ciWorkflowSource, /package:[\s\S]*GH_TOKEN:/)
  assert.doesNotMatch(ciWorkflowSource, /actions\/upload-artifact/)
  assert.match(ciWorkflowSource, /- name: Verify compiled app[\s\S]*node scripts\/check-ci-package-output\.mjs/)
  const ciBuilderCommands = ciWorkflowSource.match(/electron-builder [^\r\n]+/g) || []
  assert.equal(ciBuilderCommands.length, 3)
  for (const command of ciBuilderCommands) {
    assert.match(command, /--publish never(?:\s|$)/)
  }
})

test('manual release artifact workflow packages native targets without publishing a release', () => {
  const workflowSource = fs.readFileSync(
    path.join(ROOT, '.github', 'workflows', 'package-release-artifacts.yml'),
    'utf8',
  )

  assert.match(workflowSource, /workflow_dispatch:/)
  assert.doesNotMatch(workflowSource, /\n\s+push:/)
  assert.match(workflowSource, /permissions:\s*\n\s+contents: read/)
  assert.match(workflowSource, /os: windows-latest[\s\S]*target: --win[\s\S]*arch: --x64/)
  assert.match(workflowSource, /os: ubuntu-latest[\s\S]*target: --linux[\s\S]*arch: --x64/)
  assert.match(workflowSource, /os: macos-15-intel[\s\S]*target: --mac[\s\S]*arch: --x64/)
  assert.match(workflowSource, /os: macos-15[\s\S]*target: --mac[\s\S]*arch: --arm64/)
  assert.match(workflowSource, /os: macos-15-intel[\s\S]*package_arch: x64/)
  assert.match(workflowSource, /os: macos-15[\s\S]*package_arch: arm64/)
  assert.match(workflowSource, /ADDOM_PACKAGE_ARCH: \$\{\{ matrix\.package_arch \}\}/)
  assert.match(workflowSource, /os: windows-latest[\s\S]*update_provider: github/)
  assert.match(workflowSource, /ADDOM_UPDATE_PROVIDER: \$\{\{ matrix\.update_provider \}\}/)
  assert.equal((workflowSource.match(/ADDOM_UPDATE_PROVIDER: \$\{\{ matrix\.update_provider \}\}/g) || []).length, 2)
  assert.match(workflowSource, /dist-electron\/latest\.yml/)
  assert.doesNotMatch(workflowSource, /dist-electron\/latest-linux\.yml/)
  assert.equal((workflowSource.match(/actions\/upload-artifact@[a-f0-9]{40} # v7/g) || []).length, 1)
  assert.match(workflowSource, /if-no-files-found: error/)
  assert.match(workflowSource, /retention-days: 30/)
  assert.match(workflowSource, /electron-builder[^\r\n]+--publish never/)
})

test('release architecture override limits every configured macOS target', () => {
  for (const architecture of ['x64', 'arm64']) {
    const result = spawnSync(process.execPath, ['-e', [
      `process.env.ADDOM_PACKAGE_ARCH = '${architecture}'`,
      "const config = require('./electron-builder.config.cjs')",
      'process.stdout.write(JSON.stringify(config.mac.target.map((target) => target.arch)))',
    ].join(';')], {
      cwd: ROOT,
      encoding: 'utf8',
    })

    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), [[architecture], [architecture]])
  }
})

test('CI packaging prepares current legal artifacts before packaging', () => {
  const workflowSource = fs.readFileSync(
    path.join(ROOT, '.github', 'workflows', 'ci-cross-platform.yml'),
    'utf8',
  )
  const packageJob = workflowSource.slice(workflowSource.indexOf('\n  package:'))

  assert.match(packageJob, /npm run build:runtime-assets[\s\S]*electron-builder/)
  assert.doesNotMatch(packageJob, /run: npm run legal:check/)
})

test('GitHub workflows pin every external action to an immutable commit', () => {
  const workflowDir = path.join(ROOT, '.github', 'workflows')
  const workflowSources = fs.readdirSync(workflowDir)
    .filter((fileName) => fileName.endsWith('.yml') || fileName.endsWith('.yaml'))
    .map((fileName) => fs.readFileSync(path.join(workflowDir, fileName), 'utf8'))

  const actionRefs = workflowSources.flatMap((source) => (
    [...source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)].map((match) => match[1])
  ))

  assert.ok(actionRefs.length > 0)
  for (const actionRef of actionRefs) {
    assert.match(actionRef, /^[^@\s]+@[a-f0-9]{40}$/)
  }
})

test('electron-builder runtime patch forces traversal collector behind a repo-owned env flag', () => {
  const source = [
    'async function collectNodeModulesWithLogging(platformPackager) {',
    '    const packager = platformPackager.info;',
    '    const pmApproaches = [await packager.getPackageManager(), node_module_collector_1.PM.TRAVERSAL];',
    '    return pmApproaches;',
    '}',
  ].join('\n')

  const patched = applyElectronBuilderTraversalPatch(source)

  assert.match(patched, /ADDOM_ELECTRON_BUILDER_FORCE_TRAVERSAL/)
  assert.match(patched, /\? \[node_module_collector_1\.PM\.TRAVERSAL\]/)
  assert.match(patched, /: \[await packager\.getPackageManager\(\), node_module_collector_1\.PM\.TRAVERSAL\]/)
  assert.equal(applyElectronBuilderTraversalPatch(patched), patched)
})

test('electron-builder runtime patch downgrades missing optional dependency traversal logs to debug', () => {
  const source = [
    'exports.logMessageLevelByKey = {',
    '    [LogMessageByKey.PKG_DUPLICATE_REF]: "info",',
    '    [LogMessageByKey.PKG_OPTIONAL_NOT_INSTALLED]: "info",',
    '    [LogMessageByKey.PKG_COLLECTOR_OUTPUT]: "warn",',
    '};',
  ].join('\n')

  const patched = applyElectronBuilderOptionalDependencyLogPatch(source)

  assert.match(patched, /\[LogMessageByKey\.PKG_OPTIONAL_NOT_INSTALLED\]: "debug"/)
  assert.doesNotMatch(patched, /\[LogMessageByKey\.PKG_OPTIONAL_NOT_INSTALLED\]: "info"/)
  assert.equal(applyElectronBuilderOptionalDependencyLogPatch(patched), patched)
})

test('bundle size checks use dist/index.html for current assets and catch oversized secondary chunks', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'addom-release-tooling-'))
  const distDir = path.join(tempRoot, 'dist')
  const assetsDir = path.join(distDir, 'assets')
  await fs.promises.mkdir(assetsDir, { recursive: true })

  try {
    await writeFile(path.join(distDir, 'index.html'), [
      '<!DOCTYPE html>',
      '<html>',
      '<head>',
      '  <script type="module" crossorigin src="./assets/index-current.js"></script>',
      '  <link rel="stylesheet" crossorigin href="./assets/index-current.css">',
      '</head>',
      '<body></body>',
      '</html>',
    ].join('\n'), 'utf8')

    await writeAsset(path.join(assetsDir, 'index-current.js'), 512)
    await writeAsset(path.join(assetsDir, 'index-stale.js'), 2048)
    await writeAsset(path.join(assetsDir, 'index-current.css'), 128)
    await writeAsset(path.join(assetsDir, 'ts.worker-current.js'), 256)
    await writeAsset(path.join(assetsDir, 'vendor-chunk.js'), 1024)

    const passResult = runBundleCheck(tempRoot, {
      MAX_RENDERER_INDEX_JS_KB: '1',
      MAX_RENDERER_INDEX_CSS_KB: '1',
      MAX_MONACO_TS_WORKER_KB: '1',
      MAX_RENDERER_SECONDARY_JS_KB: '2',
    })

    assert.equal(passResult.status, 0, passResult.stderr || passResult.stdout)
    assert.match(passResult.stdout, /renderer index bundle: index-current\.js/)
    assert.match(passResult.stdout, /renderer index stylesheet: index-current\.css/)
    assert.match(passResult.stdout, /secondary renderer chunk: vendor-chunk\.js/)
    assert.doesNotMatch(passResult.stderr, /Bundle size check failed:/)

    await writeAsset(path.join(assetsDir, 'vendor-chunk.js'), 4096)

    const failResult = runBundleCheck(tempRoot, {
      MAX_RENDERER_INDEX_JS_KB: '1',
      MAX_RENDERER_INDEX_CSS_KB: '1',
      MAX_MONACO_TS_WORKER_KB: '1',
      MAX_RENDERER_SECONDARY_JS_KB: '2',
    })

    assert.notEqual(failResult.status, 0)
    assert.match(failResult.stderr, /Bundle size check failed:/)
    assert.match(failResult.stderr, /secondary renderer chunk: vendor-chunk\.js is 4\.10 kB \(budget 2\.00 kB\)/)
    assert.doesNotMatch(failResult.stderr, /index-stale\.js/)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test('release freeze keeps build:dir semantics unchanged and owns the Windows-only terminal smoke gate', async () => {
  const packageJson = readPackageJson()
  const scripts = packageJson.scripts || {}
  const { buildReleaseFreezeSteps } = await import(pathToFileURL(CHECK_RELEASE_FREEZE_SCRIPT).href)

  assert.doesNotMatch(String(scripts['build:dir'] || ''), /test:live-smoke:packaged:terminal/)
  assert.doesNotMatch(String(scripts['build:mac'] || ''), /test:live-smoke:packaged:terminal/)
  assert.doesNotMatch(String(scripts['build:linux'] || ''), /test:live-smoke:packaged:terminal/)

  assert.deepEqual(
    buildReleaseFreezeSteps({ platform: 'win32' }).map((step) => step.display),
    [
      'npm run check:release-reproducibility',
      'npm run native:electron',
      'npm run test:integration',
      'npm run build:dir',
      'npm run test:live-smoke:packaged:terminal',
    ],
  )
  assert.deepEqual(
    buildReleaseFreezeSteps({ platform: 'linux' }).map((step) => step.display),
    [
      'npm run check:release-reproducibility',
      'npm run native:electron',
      'npm run test:integration',
      'npm run build:dir',
    ],
  )
})
