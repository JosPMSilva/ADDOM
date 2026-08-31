import { spawnSync } from 'child_process'
import { createRequire } from 'module'
import {
  CODE_ACTION_PROVIDER_FAMILY_IDS,
  fileExists,
  normalizeProjectRoot,
} from './editor-format-support.mjs'
import {
  detectNearestClangCompileContext,
  detectNearestClangFormatConfigRoot,
  detectNearestClangTidyConfigRoot,
  detectNearestCSharpProjectContext,
  detectNearestCSharpProjectRoot,
} from './editor-format-config.mjs'

let biomeCommandCache = undefined
let clangFormatCommandCache = undefined
let clangTidyCommandCache = undefined
let dotnetFormatCommandOverride = undefined
let dotnetFormatCommandCache = undefined
let ruffCommandCache = undefined
let csharpierCommandOverride = undefined
const csharpierCommandCacheByRoot = new Map()
let prettierModulePathCache = undefined
let prettierModulePromise = undefined
let smolTomlModulePathCache = undefined
let smolTomlModuleCache = undefined
const require = createRequire(import.meta.url)
const WINDOWS_MACHINE_PATH_REGISTRY_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
const WINDOWS_USER_PATH_REGISTRY_KEY = 'HKCU\\Environment'

function expandWindowsEnvVariables(value = '', env = process.env) {
  const text = String(value || '')
  if (!text) return ''
  return text.replace(/%([^%]+)%/g, (_match, rawName) => {
    const name = String(rawName || '').trim()
    if (!name) return ''
    return String(env?.[name] ?? env?.[name.toUpperCase()] ?? env?.[name.toLowerCase()] ?? '')
  })
}

function parseWindowsRegistryPathOutput(stdout = '') {
  const text = String(stdout || '')
  if (!text) return ''
  const line = text
    .split(/\r?\n/)
    .map((entry) => String(entry || '').trim())
    .find((entry) => /^path\s+reg_\w+\s+/i.test(entry))
  if (!line) return ''
  const match = line.match(/^path\s+reg_\w+\s+(.*)$/i)
  return match?.[1] ? expandWindowsEnvVariables(match[1]) : ''
}

function readWindowsRegistryPath(registryKey = '') {
  const key = String(registryKey || '').trim()
  if (!key || process.platform !== 'win32') return ''
  try {
    const result = spawnSync('reg.exe', ['query', key, '/v', 'Path'], {
      encoding: 'utf8',
      windowsHide: true,
    })
    if (result.status !== 0) return ''
    return parseWindowsRegistryPathOutput(result.stdout)
  } catch {
    return ''
  }
}

function mergeWindowsLookupPath() {
  if (process.platform !== 'win32') return ''
  const currentProcessPath = String(process.env.Path || process.env.PATH || '')
  const userPath = readWindowsRegistryPath(WINDOWS_USER_PATH_REGISTRY_KEY)
  const machinePath = readWindowsRegistryPath(WINDOWS_MACHINE_PATH_REGISTRY_KEY)
  const mergedEntries = []
  const seen = new Set()
  const pushEntries = (value = '') => {
    for (const entry of String(value || '').split(';')) {
      const normalizedEntry = String(entry || '').trim()
      if (!normalizedEntry) continue
      const key = normalizedEntry.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      mergedEntries.push(normalizedEntry)
    }
  }

  pushEntries(currentProcessPath)
  pushEntries(userPath)
  pushEntries(machinePath)
  return mergedEntries.join(';')
}


function resolveSystemCommand(command = '') {
  const normalizedCommand = String(command || '').trim()
  if (!normalizedCommand) return ''

  const lookupCommand = process.platform === 'win32' ? 'where.exe' : 'which'
  let lookupResult = spawnSync(lookupCommand, [normalizedCommand], {
    encoding: 'utf8',
    windowsHide: true,
  })

  if (lookupResult.status !== 0 && process.platform === 'win32') {
    const mergedWindowsPath = mergeWindowsLookupPath()
    if (mergedWindowsPath) {
      lookupResult = spawnSync(lookupCommand, [normalizedCommand], {
        encoding: 'utf8',
        windowsHide: true,
        env: {
          ...process.env,
          PATH: mergedWindowsPath,
          Path: mergedWindowsPath,
        },
      })
    }
  }

  if (lookupResult.status !== 0) return ''

  const stdout = String(lookupResult.stdout || '').trim()
  if (!stdout) return ''
  const firstLine = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
  return firstLine || ''
}


export function resetFormatterCommandCaches() {
  biomeCommandCache = undefined
  clangFormatCommandCache = undefined
  clangTidyCommandCache = undefined
  dotnetFormatCommandOverride = undefined
  dotnetFormatCommandCache = undefined
  ruffCommandCache = undefined
  csharpierCommandOverride = undefined
  csharpierCommandCacheByRoot.clear()
  prettierModulePathCache = undefined
  prettierModulePromise = undefined
  smolTomlModulePathCache = undefined
  smolTomlModuleCache = undefined
}

function resolveBiomeNativeBinary() {
  const { platform, arch } = process
  const candidates = []

  if (platform === 'win32') {
    if (arch === 'x64') candidates.push('@biomejs/cli-win32-x64/biome.exe')
    if (arch === 'arm64') candidates.push('@biomejs/cli-win32-arm64/biome.exe')
  } else if (platform === 'darwin') {
    if (arch === 'x64') candidates.push('@biomejs/cli-darwin-x64/biome')
    if (arch === 'arm64') candidates.push('@biomejs/cli-darwin-arm64/biome')
  } else if (platform === 'linux') {
    if (arch === 'x64') {
      candidates.push('@biomejs/cli-linux-x64/biome', '@biomejs/cli-linux-x64-musl/biome')
    }
    if (arch === 'arm64') {
      candidates.push('@biomejs/cli-linux-arm64/biome', '@biomejs/cli-linux-arm64-musl/biome')
    }
  }

  for (const spec of candidates) {
    try {
      const p = require.resolve(spec)
      if (fileExists(p)) return p
    } catch {
      // Try next candidate.
    }
  }
  return ''
}

export function resolveBiomeCommand() {
  if (biomeCommandCache !== undefined) return biomeCommandCache

  const nativeBinary = resolveBiomeNativeBinary()
  if (nativeBinary) {
    biomeCommandCache = {
      command: nativeBinary,
      argsPrefix: [],
      env: {},
    }
    return biomeCommandCache
  }

  try {
    const binAbs = require.resolve('@biomejs/biome/bin/biome')
    if (fileExists(binAbs)) {
      biomeCommandCache = {
        command: process.execPath,
        argsPrefix: [binAbs],
        env: process.versions?.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {},
      }
      return biomeCommandCache
    }
  } catch {
    // Package not installed / not resolvable.
  }

  biomeCommandCache = null
  return biomeCommandCache
}

export function getBiomeFormatterAvailability() {
  const biome = resolveBiomeCommand()
  return {
    available: !!biome,
    source: 'biome',
    reason: biome ? '' : 'biome_not_installed',
  }
}


export function resolveClangFormatCommand() {
  if (clangFormatCommandCache !== undefined) return clangFormatCommandCache

  const systemCommandPath = resolveSystemCommand('clang-format')
  if (systemCommandPath) {
    clangFormatCommandCache = {
      command: systemCommandPath,
      argsPrefix: [],
    }
    return clangFormatCommandCache
  }

  clangFormatCommandCache = null
  return clangFormatCommandCache
}

export function resolveClangTidyCommand() {
  if (clangTidyCommandCache !== undefined) return clangTidyCommandCache

  const systemCommandPath = resolveSystemCommand('clang-tidy')
  if (systemCommandPath) {
    clangTidyCommandCache = {
      command: systemCommandPath,
      argsPrefix: [],
    }
    return clangTidyCommandCache
  }

  clangTidyCommandCache = null
  return clangTidyCommandCache
}

export function resolveRuffCommand() {
  if (ruffCommandCache !== undefined) return ruffCommandCache

  const systemCommandPath = resolveSystemCommand('ruff')
  if (systemCommandPath) {
    ruffCommandCache = {
      command: systemCommandPath,
      argsPrefix: [],
    }
    return ruffCommandCache
  }

  ruffCommandCache = null
  return ruffCommandCache
}

export function resolveDotnetFormatCommand() {
  if (dotnetFormatCommandOverride !== undefined) return dotnetFormatCommandOverride
  if (dotnetFormatCommandCache !== undefined) return dotnetFormatCommandCache

  const dotnetCommandPath = resolveSystemCommand('dotnet')
  if (!dotnetCommandPath) {
    dotnetFormatCommandCache = null
    return dotnetFormatCommandCache
  }

  const versionResult = spawnSync(dotnetCommandPath, ['format', '--version'], {
    encoding: 'utf8',
    windowsHide: true,
  })

  dotnetFormatCommandCache = versionResult.status === 0
    ? {
        command: dotnetCommandPath,
        argsPrefix: ['format'],
        env: {},
      }
    : null
  return dotnetFormatCommandCache
}

export function resolveCSharpierCommand(projectRoot = '') {
  if (csharpierCommandOverride !== undefined) return csharpierCommandOverride

  const normalizedRoot = normalizeProjectRoot(projectRoot)
  const cacheKey = normalizedRoot || '__workspace__'
  if (csharpierCommandCacheByRoot.has(cacheKey)) {
    return csharpierCommandCacheByRoot.get(cacheKey)
  }

  const dotnetCommandPath = resolveSystemCommand('dotnet')
  if (!dotnetCommandPath) {
    csharpierCommandCacheByRoot.set(cacheKey, null)
    return null
  }

  const versionResult = spawnSync(dotnetCommandPath, ['csharpier', '--version'], {
    cwd: normalizedRoot || undefined,
    encoding: 'utf8',
    windowsHide: true,
  })

  const resolvedCommand = versionResult.status === 0
    ? {
        command: dotnetCommandPath,
        argsPrefix: ['csharpier'],
        env: {},
      }
    : null

  csharpierCommandCacheByRoot.set(cacheKey, resolvedCommand)
  return resolvedCommand
}

export function getRuffFormatterAvailability() {
  const ruff = resolveRuffCommand()
  return {
    available: !!ruff,
    source: 'ruff',
    reason: ruff ? '' : 'ruff_not_installed',
    message: ruff ? 'Using the system-installed Ruff formatter.' : 'Ruff formatter was not found on PATH.',
  }
}

export function getClangFormatAvailability(projectRoot = '', filePath = '') {
  const configRoot = detectNearestClangFormatConfigRoot(projectRoot, filePath)
  if (!configRoot) {
    return {
      available: false,
      source: 'clang-format',
      reason: 'real_provider_missing',
      message: 'Formatting requires a project .clang-format or _clang-format config.',
    }
  }

  const clangFormat = resolveClangFormatCommand()
  return {
    available: !!clangFormat,
    source: 'clang-format',
    reason: clangFormat ? '' : 'clang_format_not_installed',
    message: clangFormat
      ? 'Using the system-installed clang-format binary.'
      : 'clang-format was not found on PATH.',
  }
}

export function getRuffFixAvailability() {
  const ruff = resolveRuffCommand()
  return {
    available: !!ruff,
    source: 'ruff',
    reason: ruff ? '' : 'ruff_not_installed',
    message: ruff ? 'Using the system-installed Ruff binary.' : 'Ruff was not found on PATH.',
  }
}

export function getClangTidyFixAvailability(projectRoot = '', filePath = '') {
  const clangTidyConfigRoot = detectNearestClangTidyConfigRoot(projectRoot, filePath)
  if (!clangTidyConfigRoot) {
    return createUnavailableRouteAvailability({
      source: 'clang-tidy',
      reason: 'real_provider_missing',
      message: 'Code actions require a project .clang-tidy config.',
      routeId: 'clang-tidy',
      familyId: CODE_ACTION_PROVIDER_FAMILY_IDS.C_CPP_FIX,
    })
  }

  const compileContext = detectNearestClangCompileContext(projectRoot, filePath)
  if (!compileContext?.path) {
    return createUnavailableRouteAvailability({
      source: 'clang-tidy',
      reason: 'real_provider_missing',
      message: 'Code actions require compile_commands.json or compile_flags.txt.',
      routeId: 'clang-tidy',
      familyId: CODE_ACTION_PROVIDER_FAMILY_IDS.C_CPP_FIX,
    })
  }

  const clangTidy = resolveClangTidyCommand()
  return {
    supported: true,
    available: !!clangTidy,
    source: 'clang-tidy',
    reason: clangTidy ? '' : 'clang_tidy_not_installed',
    message: clangTidy
      ? `Using the system-installed clang-tidy binary with ${compileContext.kind}.`
      : 'clang-tidy was not found on PATH.',
    routeId: 'clang-tidy',
    familyId: CODE_ACTION_PROVIDER_FAMILY_IDS.C_CPP_FIX,
    configRoot: clangTidyConfigRoot,
    compileContext,
  }
}

export function getCSharpierAvailability(projectRoot = '', filePath = '') {
  const csharpProjectRoot = detectNearestCSharpProjectRoot(projectRoot, filePath)
  if (!csharpProjectRoot) {
    return {
      available: false,
      source: 'csharpier',
      reason: 'real_provider_missing',
      message: 'Formatting requires a real .csproj or .sln context.',
    }
  }

  if (csharpierCommandOverride === undefined && !resolveSystemCommand('dotnet')) {
    return {
      available: false,
      source: 'csharpier',
      reason: 'dotnet_not_installed',
      message: 'dotnet was not found on PATH. Install the .NET SDK to enable C# formatting.',
    }
  }

  const csharpier = resolveCSharpierCommand(csharpProjectRoot)
  return {
    available: !!csharpier,
    source: 'csharpier',
    reason: csharpier ? '' : 'csharpier_not_installed',
    message: csharpier
      ? 'Using CSharpier through the dotnet tool runtime.'
      : 'CSharpier was not found for this project. Install the dotnet csharpier tool or restore the local tool manifest.',
  }
}


function resolvePrettierModulePath() {
  if (prettierModulePathCache !== undefined) return prettierModulePathCache
  try {
    const modulePath = require.resolve('prettier')
    prettierModulePathCache = fileExists(modulePath) ? modulePath : ''
  } catch {
    prettierModulePathCache = ''
  }
  return prettierModulePathCache
}

export async function loadPrettierModule() {
  if (prettierModulePromise !== undefined) return prettierModulePromise
  if (!resolvePrettierModulePath()) {
    prettierModulePromise = null
    return prettierModulePromise
  }
  prettierModulePromise = import('prettier')
    .then((module) => (typeof module?.format === 'function' ? module : null))
    .catch(() => null)
  return prettierModulePromise
}

export function getPrettierFormatterAvailability() {
  const modulePath = resolvePrettierModulePath()
  return {
    available: !!modulePath,
    source: 'prettier',
    reason: modulePath ? '' : 'prettier_not_installed',
    message: modulePath ? 'Using the bundled Prettier formatter.' : 'Prettier formatter is not installed.',
  }
}

function resolveSmolTomlModulePath() {
  if (smolTomlModulePathCache !== undefined) return smolTomlModulePathCache
  try {
    const modulePath = require.resolve('smol-toml')
    smolTomlModulePathCache = fileExists(modulePath) ? modulePath : ''
  } catch {
    smolTomlModulePathCache = ''
  }
  return smolTomlModulePathCache
}

export function loadSmolTomlModule() {
  if (smolTomlModuleCache !== undefined) return smolTomlModuleCache
  if (!resolveSmolTomlModulePath()) {
    smolTomlModuleCache = null
    return smolTomlModuleCache
  }
  try {
    const module = require('smol-toml')
    smolTomlModuleCache = (
      module
      && typeof module.parse === 'function'
      && typeof module.stringify === 'function'
    )
      ? module
      : null
  } catch {
    smolTomlModuleCache = null
  }
  return smolTomlModuleCache
}

function hasTomlComments(content = '') {
  const text = String(content ?? '')
  let index = 0

  while (index < text.length) {
    if (text.startsWith('"""', index)) {
      index += 3
      while (index < text.length) {
        if (text.startsWith('"""', index)) {
          index += 3
          break
        }
        if (text[index] === '\\') {
          index += 2
          continue
        }
        index += 1
      }
      continue
    }

    if (text.startsWith("'''", index)) {
      index += 3
      while (index < text.length) {
        if (text.startsWith("'''", index)) {
          index += 3
          break
        }
        index += 1
      }
      continue
    }

    const char = text[index]
    if (char === '#') return true

    if (char === '"') {
      index += 1
      while (index < text.length) {
        if (text[index] === '\\') {
          index += 2
          continue
        }
        if (text[index] === '"') {
          index += 1
          break
        }
        index += 1
      }
      continue
    }

    if (char === "'") {
      index += 1
      while (index < text.length) {
        if (text[index] === "'") {
          index += 1
          break
        }
        index += 1
      }
      continue
    }

    index += 1
  }

  return false
}

export function getTomlFormatterAvailability({ content } = {}) {
  const smolToml = loadSmolTomlModule()
  if (!smolToml) {
    return {
      available: false,
      source: 'smol-toml',
      reason: 'smol_toml_not_installed',
      message: 'The bundled TOML formatter is not installed.',
    }
  }

  if (typeof content === 'string' && hasTomlComments(content)) {
    return {
      available: false,
      source: 'smol-toml',
      reason: 'toml_comments_unsupported',
      message: 'TOML formatting stays disabled for files with comments in this phase.',
    }
  }

  return {
    available: true,
    source: 'smol-toml',
    reason: '',
    message: 'Using the bundled TOML formatter.',
  }
}

export function createUnavailableFormatterRouteResult({
  source = '',
  reason = 'formatter_unavailable',
  message = '',
} = {}) {
  return {
    available: false,
    source: String(source || '').trim(),
    reason: String(reason || 'formatter_unavailable').trim() || 'formatter_unavailable',
    message: String(message || '').trim(),
  }
}

export function createUnavailableRouteAvailability({
  source = '',
  reason = 'real_provider_missing',
  message = '',
  routeId = '',
  familyId = '',
} = {}) {
  return {
    supported: true,
    available: false,
    source: String(source || '').trim(),
    reason: String(reason || 'real_provider_missing').trim() || 'real_provider_missing',
    message: String(message || '').trim(),
    routeId: String(routeId || '').trim(),
    familyId: String(familyId || '').trim(),
  }
}


export function getDotnetFormatFixAvailability(projectRoot = '', filePath = '') {
  const csharpProjectContext = detectNearestCSharpProjectContext(projectRoot, filePath)
  if (!csharpProjectContext?.root || !csharpProjectContext?.path) {
    return createUnavailableRouteAvailability({
      source: 'dotnet-format',
      reason: 'real_provider_missing',
      message: 'Code actions require a real .csproj or .sln context.',
      routeId: 'dotnet-format',
      familyId: CODE_ACTION_PROVIDER_FAMILY_IDS.CSHARP_FIX,
    })
  }

  const dotnetFormat = resolveDotnetFormatCommand()
  if (!dotnetFormat) {
    const dotnetCommandPath = dotnetFormatCommandOverride === undefined
      ? resolveSystemCommand('dotnet')
      : ''
    const reason = dotnetCommandPath ? 'dotnet_format_not_installed' : 'dotnet_not_installed'
    const message = dotnetCommandPath
      ? 'dotnet format is unavailable. Install a .NET SDK that includes dotnet format to enable C# fixes.'
      : 'dotnet was not found on PATH. Install the .NET SDK to enable C# fixes.'
    return createUnavailableRouteAvailability({
      source: 'dotnet-format',
      reason,
      message,
      routeId: 'dotnet-format',
      familyId: CODE_ACTION_PROVIDER_FAMILY_IDS.CSHARP_FIX,
      projectRoot: csharpProjectContext.root,
      projectPath: csharpProjectContext.path,
      projectKind: csharpProjectContext.kind,
    })
  }

  return {
    supported: true,
    available: true,
    source: 'dotnet-format',
    reason: '',
    message: `Using dotnet format ${csharpProjectContext.kind} fixes in a scratch workspace.`,
    routeId: 'dotnet-format',
    familyId: CODE_ACTION_PROVIDER_FAMILY_IDS.CSHARP_FIX,
    projectRoot: csharpProjectContext.root,
    projectPath: csharpProjectContext.path,
    projectKind: csharpProjectContext.kind,
  }
}


export function setBiomeCommandForTests(command = null) {
  biomeCommandCache = command && typeof command === 'object'
    ? {
        command: String(command.command || '').trim(),
        argsPrefix: Array.isArray(command.argsPrefix) ? command.argsPrefix.map((arg) => String(arg)) : [],
        env: command.env && typeof command.env === 'object' ? { ...command.env } : {},
      }
    : null
}

export function setClangFormatCommandForTests(command = null) {
  clangFormatCommandCache = command && typeof command === 'object'
    ? {
        command: String(command.command || '').trim(),
        argsPrefix: Array.isArray(command.argsPrefix) ? command.argsPrefix.map((arg) => String(arg)) : [],
        env: command.env && typeof command.env === 'object' ? { ...command.env } : {},
      }
    : null
}

export function setClangTidyCommandForTests(command = null) {
  clangTidyCommandCache = command && typeof command === 'object'
    ? {
        command: String(command.command || '').trim(),
        argsPrefix: Array.isArray(command.argsPrefix) ? command.argsPrefix.map((arg) => String(arg)) : [],
        env: command.env && typeof command.env === 'object' ? { ...command.env } : {},
      }
    : null
}

export function setDotnetFormatCommandForTests(command = null) {
  dotnetFormatCommandOverride = command && typeof command === 'object'
    ? {
        command: String(command.command || '').trim(),
        argsPrefix: Array.isArray(command.argsPrefix) ? command.argsPrefix.map((arg) => String(arg)) : [],
        env: command.env && typeof command.env === 'object' ? { ...command.env } : {},
      }
    : null
  dotnetFormatCommandCache = undefined
}

export function setRuffCommandForTests(command = null) {
  ruffCommandCache = command && typeof command === 'object'
    ? {
        command: String(command.command || '').trim(),
        argsPrefix: Array.isArray(command.argsPrefix) ? command.argsPrefix.map((arg) => String(arg)) : [],
        env: command.env && typeof command.env === 'object' ? { ...command.env } : {},
      }
    : null
}

export function setCSharpierCommandForTests(command = null) {
  csharpierCommandOverride = command && typeof command === 'object'
    ? {
        command: String(command.command || '').trim(),
        argsPrefix: Array.isArray(command.argsPrefix) ? command.argsPrefix.map((arg) => String(arg)) : [],
        env: command.env && typeof command.env === 'object' ? { ...command.env } : {},
      }
    : null
  csharpierCommandCacheByRoot.clear()
}
