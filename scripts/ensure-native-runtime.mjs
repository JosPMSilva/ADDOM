import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VALID_RUNTIMES = new Set(['node', 'electron'])
const MARKER_DIR_SEGMENTS = ['node_modules', '.cache', 'addom-native-runtime']
const MARKER_FILE_NAME = 'state.json'

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function getTargetVersion(runtime, repoRoot) {
  if (runtime === 'node') return process.versions.node
  const electronPackageJson = path.join(repoRoot, 'node_modules', 'electron', 'package.json')
  const electronPackage = readJson(electronPackageJson)
  const version = asTrimmedString(electronPackage?.version)
  if (!version) {
    throw new Error('Unable to determine the installed Electron version.')
  }
  return version
}

function resolveMarkerPath(repoRoot) {
  return path.join(repoRoot, ...MARKER_DIR_SEGMENTS, MARKER_FILE_NAME)
}

function resolveRequiredBindings(
  repoRoot,
  runtime,
  {
    platform = process.platform,
    arch = process.arch,
  } = {},
) {
  const betterSqliteTargets = platform === 'linux'
    ? [`linux-${arch}`, `linuxmusl-${arch}`]
    : [`${platform}-${arch}`]
  const bindingGroups = [
    [
      ...betterSqliteTargets.map((target) => (
        path.join(repoRoot, 'node_modules', 'better-sqlite3', 'prebuilds', `${target}.node`)
      )),
      path.join(repoRoot, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
    ],
  ]
  bindingGroups.push(...resolveNodePtyBindingGroups(repoRoot, { platform, arch }))
  return bindingGroups
}

function resolveNodePtyBindingGroups(repoRoot, { platform = process.platform, arch = process.arch } = {}) {
  const moduleRoot = path.join(repoRoot, 'node_modules', 'node-pty')
  const prebuildRoot = path.join(moduleRoot, 'prebuilds', `${platform}-${arch}`)
  const buildReleaseRoot = path.join(moduleRoot, 'build', 'Release')

  if (platform === 'win32') {
    return [
      [
        path.join(buildReleaseRoot, 'pty.node'),
        path.join(prebuildRoot, 'pty.node'),
      ],
      [
        path.join(buildReleaseRoot, 'conpty.node'),
        path.join(prebuildRoot, 'conpty.node'),
      ],
      [
        path.join(buildReleaseRoot, 'conpty', 'conpty.dll'),
        path.join(prebuildRoot, 'conpty', 'conpty.dll'),
      ],
      [
        path.join(buildReleaseRoot, 'conpty', 'OpenConsole.exe'),
        path.join(prebuildRoot, 'conpty', 'OpenConsole.exe'),
      ],
    ]
  }

  if (platform === 'darwin') {
    return [[
      path.join(buildReleaseRoot, 'pty.node'),
      path.join(prebuildRoot, 'pty.node'),
    ]]
  }

  return [[path.join(buildReleaseRoot, 'pty.node')]]
}

export function readNativeRuntimeMarker(repoRoot = resolveRepoRoot()) {
  const markerPath = resolveMarkerPath(repoRoot)
  if (!fs.existsSync(markerPath)) return null
  try {
    return readJson(markerPath)
  } catch {
    return null
  }
}

export function isNativeRuntimePrepared(
  runtime,
  {
    repoRoot = resolveRepoRoot(),
    platform = process.platform,
    arch = process.arch,
    target = getTargetVersion(runtime, repoRoot),
  } = {},
) {
  const marker = readNativeRuntimeMarker(repoRoot)
  if (!marker || typeof marker !== 'object') return false
  if (asTrimmedString(marker.runtime) !== runtime) return false
  if (asTrimmedString(marker.platform) !== platform) return false
  if (asTrimmedString(marker.arch) !== arch) return false
  if (asTrimmedString(marker.target) !== target) return false

  const requiredBindings = resolveRequiredBindings(repoRoot, runtime, { platform, arch })
  return requiredBindings.every((bindingGroup) => bindingGroup.some((bindingPath) => fs.existsSync(bindingPath)))
}

export function writeNativeRuntimeMarker(
  runtime,
  {
    repoRoot = resolveRepoRoot(),
    platform = process.platform,
    arch = process.arch,
    target = getTargetVersion(runtime, repoRoot),
  } = {},
) {
  const markerPath = resolveMarkerPath(repoRoot)
  fs.mkdirSync(path.dirname(markerPath), { recursive: true })
  fs.writeFileSync(markerPath, JSON.stringify({
    runtime,
    platform,
    arch,
    target,
    preparedAt: new Date().toISOString(),
  }, null, 2))
}

export async function ensureNativeRuntime(runtime, { repoRoot = resolveRepoRoot() } = {}) {
  if (!VALID_RUNTIMES.has(runtime)) {
    throw new Error(`Invalid runtime: ${runtime || '(missing)'}`)
  }

  const target = getTargetVersion(runtime, repoRoot)
  const alreadyPrepared = isNativeRuntimePrepared(runtime, { repoRoot, target })
  const missingGroups = resolveRequiredBindings(repoRoot, runtime)
    .filter((bindingGroup) => !bindingGroup.some((bindingPath) => fs.existsSync(bindingPath)))
  if (missingGroups.length > 0) {
    throw new Error(
      `Native runtime assets are incomplete for ${process.platform}/${process.arch}. Re-run npm install.`,
    )
  }

  console.log(`[native-runtime] Validated portable native assets for ${runtime} (${target}).`)
  writeNativeRuntimeMarker(runtime, { repoRoot, target })
  return { changed: !alreadyPrepared, runtime, target }
}

async function main() {
  const runtime = asTrimmedString(process.argv[2]).toLowerCase()
  if (!VALID_RUNTIMES.has(runtime)) {
    console.error('Usage: node scripts/ensure-native-runtime.mjs <node|electron>')
    process.exit(1)
  }
  await ensureNativeRuntime(runtime)
}

const isEntrypoint = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false

if (isEntrypoint) {
  await main()
}
