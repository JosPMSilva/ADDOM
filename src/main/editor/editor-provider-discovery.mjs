import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const WINDOWS_MACHINE_PATH_REGISTRY_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
const WINDOWS_USER_PATH_REGISTRY_KEY = 'HKCU\\Environment'

function cleanString(value = '') {
  return String(value || '').trim()
}

function normalizeWorkspaceRoot(projectFolder = '') {
  const raw = cleanString(projectFolder)
  return raw ? path.resolve(raw) : ''
}

function normalizeWorkspaceRelativeFilePath(projectFolder = '', filePath = '') {
  const workspaceRoot = normalizeWorkspaceRoot(projectFolder)
  const raw = cleanString(filePath)
  if (!workspaceRoot || !raw) return ''
  const absolute = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(workspaceRoot, raw)
  const relative = path.relative(workspaceRoot, absolute)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return ''
  return relative
}

function fileExists(targetPath = '') {
  try {
    return !!targetPath && fs.existsSync(targetPath)
  } catch {
    return false
  }
}

function samePath(left = '', right = '') {
  const a = normalizeWorkspaceRoot(left)
  const b = normalizeWorkspaceRoot(right)
  if (!a || !b) return false
  return process.platform === 'win32'
    ? a.toLowerCase() === b.toLowerCase()
    : a === b
}

function buildDocumentSearchDirectories(projectFolder = '', filePath = '') {
  const workspaceRoot = normalizeWorkspaceRoot(projectFolder)
  if (!workspaceRoot) return []

  const relativeFilePath = normalizeWorkspaceRelativeFilePath(workspaceRoot, filePath)
  const absoluteFilePath = relativeFilePath
    ? path.resolve(workspaceRoot, relativeFilePath)
    : workspaceRoot
  const initialDir = fileExists(absoluteFilePath) && fs.statSync(absoluteFilePath).isDirectory()
    ? absoluteFilePath
    : path.dirname(absoluteFilePath)

  const directories = []
  let currentDir = initialDir
  while (currentDir && currentDir.startsWith(workspaceRoot)) {
    directories.push(currentDir)
    if (samePath(currentDir, workspaceRoot)) break
    const parentDir = path.dirname(currentDir)
    if (!parentDir || samePath(parentDir, currentDir)) break
    currentDir = parentDir
  }

  if (!directories.some((dirPath) => samePath(dirPath, workspaceRoot))) {
    directories.push(workspaceRoot)
  }

  return directories
}

function findProjectLocalPath(searchDirs = [], relativeCandidates = []) {
  for (const dirPath of Array.isArray(searchDirs) ? searchDirs : []) {
    for (const relativeCandidate of Array.isArray(relativeCandidates) ? relativeCandidates : []) {
      const candidatePath = path.join(dirPath, relativeCandidate)
      if (fileExists(candidatePath)) {
        return candidatePath
      }
    }
  }
  return ''
}

function expandWindowsEnvVariables(value = '') {
  return String(value || '').replace(/%([^%]+)%/g, (_match, rawName = '') => {
    const name = String(rawName || '').trim()
    if (!name) return ''
    return String(process.env?.[name] ?? process.env?.[name.toUpperCase()] ?? process.env?.[name.toLowerCase()] ?? '')
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
  const key = cleanString(registryKey)
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
      const normalizedEntry = cleanString(entry)
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
  const normalizedCommand = cleanString(command)
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
  const candidates = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (process.platform === 'win32') {
    return selectRunnableWindowsCommand(candidates)
  }
  return candidates[0] || ''
}

function selectRunnableWindowsCommand(candidates = []) {
  const normalizedCandidates = Array.isArray(candidates)
    ? candidates.map((candidate) => cleanString(candidate)).filter(Boolean)
    : []
  if (normalizedCandidates.length === 0) return ''

  const directMatch = normalizedCandidates.find((candidate) => /\.(exe|cmd|bat|com)$/i.test(candidate))
  if (directMatch) return directMatch

  for (const candidate of normalizedCandidates) {
    const siblingExecutable = resolveSiblingWindowsCommand(candidate)
    if (siblingExecutable) return siblingExecutable
  }

  return normalizedCandidates[0] || ''
}

function resolveSiblingWindowsCommand(commandPath = '') {
  const normalizedPath = cleanString(commandPath)
  if (!normalizedPath || path.extname(normalizedPath)) return ''
  for (const suffix of ['.cmd', '.bat', '.exe', '.com']) {
    const candidatePath = `${normalizedPath}${suffix}`
    if (fileExists(candidatePath)) return candidatePath
  }
  return ''
}

function findProjectLocalCommand(searchDirs = [], relativeCandidates = []) {
  for (const dirPath of Array.isArray(searchDirs) ? searchDirs : []) {
    for (const relativeCandidate of Array.isArray(relativeCandidates) ? relativeCandidates : []) {
      const candidatePath = path.join(dirPath, relativeCandidate)
      if (fileExists(candidatePath)) return candidatePath
      if (process.platform === 'win32') {
        const siblingExecutable = resolveSiblingWindowsCommand(candidatePath)
        if (siblingExecutable) return siblingExecutable
      }
    }
  }
  return ''
}

function normalizeSpawnCommand(command = '', args = []) {
  return {
    command: cleanString(command),
    args: Array.isArray(args) ? args.map((entry) => String(entry)) : [],
  }
}

function createMissingResolution({
  id = '',
  source = '',
  workspaceRoot = '',
  message = '',
  reason = '',
} = {}) {
  return {
    id: cleanString(id),
    available: false,
    source: cleanString(source) || 'missing-provider-binary',
    workspaceRoot: normalizeWorkspaceRoot(workspaceRoot),
    command: '',
    args: [],
    env: {},
    cwd: normalizeWorkspaceRoot(workspaceRoot),
    executablePath: '',
    message: cleanString(message) || 'Provider binary was not found.',
    reason: cleanString(reason) || 'missing_provider_binary',
  }
}

function createCommandResolution({
  id = '',
  source = '',
  workspaceRoot = '',
  cwd = '',
  command = '',
  args = [],
  env = {},
  executablePath = '',
  message = '',
} = {}) {
  const spawnTarget = normalizeSpawnCommand(command, args)
  return {
    id: cleanString(id),
    available: true,
    source: cleanString(source) || 'project-local',
    workspaceRoot: normalizeWorkspaceRoot(workspaceRoot),
    command: spawnTarget.command,
    args: spawnTarget.args,
    env: env && typeof env === 'object' ? { ...env } : {},
    cwd: normalizeWorkspaceRoot(cwd || workspaceRoot),
    executablePath: cleanString(executablePath),
    message: cleanString(message),
    reason: '',
  }
}

function createElectronNodeEnv() {
  return process.versions?.electron
    ? { ELECTRON_RUN_AS_NODE: '1' }
    : {}
}

export function resolveTsServerRuntime(projectFolder = '', filePath = '') {
  const workspaceRoot = normalizeWorkspaceRoot(projectFolder)
  const searchDirs = buildDocumentSearchDirectories(workspaceRoot, filePath)
  const projectLocalScript = findProjectLocalPath(searchDirs, [
    path.join('node_modules', 'typescript', 'lib', 'tsserver.js'),
  ])

  if (projectLocalScript) {
    return createCommandResolution({
      id: 'tsserver',
      source: 'project-local',
      workspaceRoot,
      command: process.execPath,
      args: [projectLocalScript, '--disableAutomaticTypingAcquisition'],
      env: createElectronNodeEnv(),
      executablePath: projectLocalScript,
      message: 'Using the project-local TypeScript server.',
    })
  }

  const systemCommandPath = resolveSystemCommand('tsserver')
  if (systemCommandPath) {
    return createCommandResolution({
      id: 'tsserver',
      source: 'system-installed',
      workspaceRoot,
      command: systemCommandPath,
      args: ['--disableAutomaticTypingAcquisition'],
      executablePath: systemCommandPath,
      message: 'Using the system-installed TypeScript server.',
    })
  }

  return createMissingResolution({
    id: 'tsserver',
    workspaceRoot,
    message: 'TypeScript language service was not found in this project or on PATH.',
  })
}

export function resolvePyrightRuntime(projectFolder = '', filePath = '') {
  const workspaceRoot = normalizeWorkspaceRoot(projectFolder)
  const searchDirs = buildDocumentSearchDirectories(workspaceRoot, filePath)
  const projectLocalScript = findProjectLocalPath(searchDirs, [
    path.join('node_modules', 'pyright', 'langserver.index.js'),
  ])

  if (projectLocalScript) {
    return createCommandResolution({
      id: 'pyright',
      source: 'project-local',
      workspaceRoot,
      command: process.execPath,
      args: [projectLocalScript, '--stdio'],
      env: createElectronNodeEnv(),
      executablePath: projectLocalScript,
      message: 'Using the project-local Pyright runtime.',
    })
  }

  const systemCommandPath = resolveSystemCommand('pyright-langserver')
  if (systemCommandPath) {
    return createCommandResolution({
      id: 'pyright',
      source: 'system-installed',
      workspaceRoot,
      command: systemCommandPath,
      args: ['--stdio'],
      executablePath: systemCommandPath,
      message: 'Using the system-installed Pyright runtime.',
    })
  }

  return createMissingResolution({
    id: 'pyright',
    workspaceRoot,
    message: 'Pyright language server was not found in this project or on PATH.',
  })
}

function resolveJavaCommand() {
  const javaHome = cleanString(process.env.JAVA_HOME)
  if (javaHome) {
    const javaSuffix = process.platform === 'win32' ? 'java.exe' : 'java'
    const javaHomeCommand = path.join(javaHome, 'bin', javaSuffix)
    if (fileExists(javaHomeCommand)) return javaHomeCommand
  }
  return resolveSystemCommand('java')
}

function readJsonFile(targetPath = '') {
  try {
    const raw = fs.readFileSync(targetPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function hasCSharpLsDotnetTool(manifestPath = '') {
  const manifest = readJsonFile(manifestPath)
  const tools = manifest?.tools && typeof manifest.tools === 'object' ? manifest.tools : {}
  for (const [toolId, toolConfig] of Object.entries(tools)) {
    const normalizedToolId = cleanString(toolId).toLowerCase()
    const commands = Array.isArray(toolConfig?.commands)
      ? toolConfig.commands.map((command) => cleanString(command).toLowerCase()).filter(Boolean)
      : []
    if (normalizedToolId === 'csharp-ls' || commands.includes('csharp-ls')) {
      return true
    }
  }
  return false
}

export function resolveClangdRuntime(projectFolder = '', filePath = '') {
  const workspaceRoot = normalizeWorkspaceRoot(projectFolder)
  const searchDirs = buildDocumentSearchDirectories(workspaceRoot, filePath)
  const projectLocalCommand = findProjectLocalCommand(searchDirs, [
    path.join('node_modules', '.bin', 'clangd'),
    path.join('bin', 'clangd'),
    path.join('.bin', 'clangd'),
    path.join('.local', 'bin', 'clangd'),
    path.join('tools', 'clangd'),
  ])

  if (projectLocalCommand) {
    return createCommandResolution({
      id: 'clangd',
      source: 'project-local',
      workspaceRoot,
      command: projectLocalCommand,
      args: ['--log=error'],
      executablePath: projectLocalCommand,
      message: 'Using the project-local clangd runtime.',
    })
  }

  const systemCommandPath = resolveSystemCommand('clangd')
  if (systemCommandPath) {
    return createCommandResolution({
      id: 'clangd',
      source: 'system-installed',
      workspaceRoot,
      command: systemCommandPath,
      args: ['--log=error'],
      executablePath: systemCommandPath,
      message: 'Using the system-installed clangd runtime.',
    })
  }

  return createMissingResolution({
    id: 'clangd',
    workspaceRoot,
    message: 'clangd was not found in this project or on PATH.',
  })
}

export function resolveCSharpLsRuntime(projectFolder = '', filePath = '') {
  const workspaceRoot = normalizeWorkspaceRoot(projectFolder)
  const searchDirs = buildDocumentSearchDirectories(workspaceRoot, filePath)
  const manifestPath = findProjectLocalPath(searchDirs, [
    path.join('.config', 'dotnet-tools.json'),
  ])
  if (manifestPath && hasCSharpLsDotnetTool(manifestPath)) {
    const dotnetCommandPath = resolveSystemCommand('dotnet')
    if (!dotnetCommandPath) {
      return createMissingResolution({
        id: 'csharp-ls',
        source: 'missing-provider-runtime',
        workspaceRoot,
        message: 'dotnet was not found on PATH. Install the .NET SDK to enable csharp-ls.',
        reason: 'dotnet_not_installed',
      })
    }
    return createCommandResolution({
      id: 'csharp-ls',
      source: 'project-local',
      workspaceRoot,
      cwd: path.dirname(path.dirname(manifestPath)),
      command: dotnetCommandPath,
      args: ['tool', 'run', 'csharp-ls', '--'],
      executablePath: manifestPath,
      message: 'Using the project-local csharp-ls dotnet tool manifest.',
    })
  }

  const systemCommandPath = resolveSystemCommand('csharp-ls')
  if (systemCommandPath) {
    return createCommandResolution({
      id: 'csharp-ls',
      source: 'system-installed',
      workspaceRoot,
      command: systemCommandPath,
      args: [],
      executablePath: systemCommandPath,
      message: 'Using the system-installed csharp-ls runtime.',
    })
  }

  return createMissingResolution({
    id: 'csharp-ls',
    workspaceRoot,
    message: 'csharp-ls was not found in this project or on PATH.',
  })
}

export function resolveJdtlsRuntime(projectFolder = '', filePath = '') {
  const workspaceRoot = normalizeWorkspaceRoot(projectFolder)
  const searchDirs = buildDocumentSearchDirectories(workspaceRoot, filePath)
  const projectLocalCommand = findProjectLocalCommand(searchDirs, [
    path.join('bin', 'jdtls'),
    path.join('.jdtls', 'bin', 'jdtls'),
    'jdtls',
  ])
  const javaCommandPath = resolveJavaCommand()

  if (projectLocalCommand) {
    if (!javaCommandPath) {
      return createMissingResolution({
        id: 'jdtls',
        source: 'missing-provider-runtime',
        workspaceRoot,
        message: 'A usable JDK was not found on PATH or JAVA_HOME. jdtls requires Java.',
        reason: 'java_not_installed',
      })
    }
    return createCommandResolution({
      id: 'jdtls',
      source: 'project-local',
      workspaceRoot,
      command: projectLocalCommand,
      args: [],
      executablePath: projectLocalCommand,
      message: 'Using the project-local jdtls runtime.',
    })
  }

  const systemCommandPath = resolveSystemCommand('jdtls')
  if (systemCommandPath) {
    if (!javaCommandPath) {
      return createMissingResolution({
        id: 'jdtls',
        source: 'missing-provider-runtime',
        workspaceRoot,
        message: 'A usable JDK was not found on PATH or JAVA_HOME. jdtls requires Java.',
        reason: 'java_not_installed',
      })
    }
    return createCommandResolution({
      id: 'jdtls',
      source: 'system-installed',
      workspaceRoot,
      command: systemCommandPath,
      args: [],
      executablePath: systemCommandPath,
      message: 'Using the system-installed jdtls runtime.',
    })
  }

  return createMissingResolution({
    id: 'jdtls',
    workspaceRoot,
    message: 'jdtls was not found in this project or on PATH.',
  })
}

export const __testEditorProviderDiscoveryInternals = Object.freeze({
  buildDocumentSearchDirectories,
  createCommandResolution,
  createMissingResolution,
  findProjectLocalPath,
  findProjectLocalCommand,
  hasCSharpLsDotnetTool,
  mergeWindowsLookupPath,
  normalizeWorkspaceRelativeFilePath,
  parseWindowsRegistryPathOutput,
  resolveJavaCommand,
  resolveSystemCommand,
  resolveSiblingWindowsCommand,
  selectRunnableWindowsCommand,
})
