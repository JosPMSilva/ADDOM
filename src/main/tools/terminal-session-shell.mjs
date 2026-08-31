import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { asTrimmedString, createTerminalSessionError } from './terminal-session-manager-normalizers.mjs'

const requireForRuntime = createRequire(import.meta.url)

function getPathEnv(env = process.env) {
  return asTrimmedString(env?.PATH || env?.Path || env?.path)
}

function getPlatformPath(platform = process.platform) {
  return platform === 'win32' ? path.win32 : path.posix
}

function executableCandidates(command = '', { platform = process.platform, env = process.env } = {}) {
  const normalizedCommand = asTrimmedString(command)
  if (!normalizedCommand) return []
  if (platform !== 'win32' || path.win32.extname(normalizedCommand)) return [normalizedCommand]
  const pathExt = asTrimmedString(env?.PATHEXT) || '.COM;.EXE;.BAT;.CMD'
  return pathExt
    .split(';')
    .map((ext) => asTrimmedString(ext).toLowerCase())
    .filter(Boolean)
    .map((ext) => `${normalizedCommand}${ext.startsWith('.') ? ext : `.${ext}`}`)
}

function findExecutableOnPath(command = '', {
  platform = process.platform,
  env = process.env,
  pathExists = fs.existsSync,
} = {}) {
  const pathValue = getPathEnv(env)
  if (!pathValue) return ''
  const pathModule = getPlatformPath(platform)
  const separator = platform === 'win32' ? ';' : ':'
  const names = executableCandidates(command, { platform, env })
  for (const entry of pathValue.split(separator)) {
    const dir = asTrimmedString(entry)
    if (!dir) continue
    for (const name of names) {
      const candidate = pathModule.join(dir, name)
      if (pathExists(candidate)) return candidate
    }
  }
  return ''
}

function findFirstExisting(paths = [], { pathExists = fs.existsSync } = {}) {
  return paths.map((entry) => asTrimmedString(entry)).find((entry) => entry && pathExists(entry)) || ''
}

function windowsKnownPathCandidates(relativePath = '', {
  env = process.env,
  platform = process.platform,
} = {}) {
  const pathModule = getPlatformPath(platform)
  return [
    env?.ProgramFiles,
    env?.['ProgramFiles(x86)'],
    env?.LOCALAPPDATA,
    env?.SystemRoot,
    env?.WINDIR,
  ]
    .map((root) => asTrimmedString(root))
    .filter(Boolean)
    .map((root) => pathModule.join(root, relativePath))
}

function resolveWindowsGitBashPath({
  platform = process.platform,
  env = process.env,
  pathExists = fs.existsSync,
} = {}) {
  if (platform !== 'win32') return ''
  const pathModule = getPlatformPath(platform)
  const knownPaths = [
    ...windowsKnownPathCandidates(pathModule.join('Git', 'bin', 'bash.exe'), { env, platform }),
    ...windowsKnownPathCandidates(pathModule.join('Git', 'usr', 'bin', 'bash.exe'), { env, platform }),
  ]
  const known = findFirstExisting(knownPaths, { pathExists })
  if (known) return known

  const pathBash = findExecutableOnPath('bash.exe', { platform, env, pathExists })
  return /[\\/]git[\\/]/i.test(pathBash) ? pathBash : ''
}

function resolveWindowsWslPath(options = {}) {
  const { platform = process.platform, env = process.env, pathExists = fs.existsSync } = options
  if (platform !== 'win32') return ''
  const pathModule = getPlatformPath(platform)
  return findFirstExisting([
    findExecutableOnPath('wsl.exe', { platform, env, pathExists }),
    ...windowsKnownPathCandidates(pathModule.join('System32', 'wsl.exe'), { env, platform }),
  ], { pathExists })
}

function createShellChoice(id, shellKind, file = '') {
  return {
    id,
    shellKind,
    file: asTrimmedString(file),
  }
}

export function resolveAvailableTerminalShells({
  platform = process.platform,
  env = process.env,
  pathExists = fs.existsSync,
} = {}) {
  const normalizedPlatform = asTrimmedString(platform).toLowerCase()
  const choices = []
  const addChoice = (choice) => {
    if (!choice?.id || choices.some((entry) => entry.id === choice.id)) return
    choices.push(choice)
  }

  if (normalizedPlatform === 'win32') {
    const cmdPath = asTrimmedString(env?.ComSpec) || findExecutableOnPath('cmd.exe', { platform: normalizedPlatform, env, pathExists })
    addChoice(createShellChoice('default', 'cmd', cmdPath || 'cmd.exe'))
    if (cmdPath) addChoice(createShellChoice('cmd', 'cmd', cmdPath))

    const powershellPath = findFirstExisting([
      findExecutableOnPath('powershell.exe', { platform: normalizedPlatform, env, pathExists }),
      ...windowsKnownPathCandidates(path.win32.join('System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), {
        env,
        platform: normalizedPlatform,
      }),
    ], { pathExists })
    if (powershellPath) addChoice(createShellChoice('powershell', 'powershell', powershellPath))

    const pwshPath = findExecutableOnPath('pwsh.exe', { platform: normalizedPlatform, env, pathExists })
    if (pwshPath) addChoice(createShellChoice('pwsh', 'pwsh', pwshPath))

    const gitBashPath = resolveWindowsGitBashPath({ platform: normalizedPlatform, env, pathExists })
    if (gitBashPath) addChoice(createShellChoice('git-bash', 'bash', gitBashPath))

    const wslPath = resolveWindowsWslPath({ platform: normalizedPlatform, env, pathExists })
    if (wslPath) addChoice(createShellChoice('wsl', 'wsl', wslPath))

    return choices
  }

  const defaultShell = asTrimmedString(env?.SHELL) || '/bin/bash'
  addChoice(createShellChoice('default', path.posix.basename(defaultShell) || 'shell', defaultShell))
  for (const [id, file] of [['bash', '/bin/bash'], ['zsh', '/bin/zsh'], ['sh', '/bin/sh']]) {
    if (pathExists(file)) addChoice(createShellChoice(id, id, file))
  }
  const pwshPath = findExecutableOnPath('pwsh', { platform: normalizedPlatform, env, pathExists })
  if (pwshPath) addChoice(createShellChoice('pwsh', 'pwsh', pwshPath))
  return choices
}

function createUnavailableShellError(shell, platform) {
  return createTerminalSessionError(
    'terminal_session_shell_unavailable',
    `Shell "${shell}" is not available on ${platform}.`,
    { shell, platform },
  )
}

export function resolveTerminalShellLaunch({
  platform = process.platform,
  env = process.env,
  shell = 'default',
  pathExists = fs.existsSync,
} = {}) {
  const requestedShell = asTrimmedString(shell).toLowerCase() || 'default'

  if (platform === 'win32') {
    if (requestedShell === 'default' || requestedShell === 'auto' || requestedShell === 'cmd') {
      return {
        shellId: requestedShell === 'cmd' ? 'cmd' : 'default',
        shellKind: 'cmd',
        file: asTrimmedString(env?.ComSpec) || 'cmd.exe',
        args: [],
      }
    }
    if (requestedShell === 'powershell') {
      return {
        shellId: 'powershell',
        shellKind: 'powershell',
        file: 'powershell.exe',
        args: ['-NoLogo'],
      }
    }
    if (requestedShell === 'pwsh') {
      return {
        shellId: 'pwsh',
        shellKind: 'pwsh',
        file: findExecutableOnPath('pwsh.exe', { platform, env, pathExists }) || 'pwsh.exe',
        args: ['-NoLogo'],
      }
    }
    if (requestedShell === 'git-bash') {
      const gitBashPath = resolveWindowsGitBashPath({ platform, env, pathExists })
      if (!gitBashPath) throw createUnavailableShellError(requestedShell, platform)
      return {
        shellId: 'git-bash',
        shellKind: 'bash',
        file: gitBashPath,
        args: ['--login', '-i'],
      }
    }
    if (requestedShell === 'wsl') {
      const wslPath = resolveWindowsWslPath({ platform, env, pathExists })
      if (!wslPath) throw createUnavailableShellError(requestedShell, platform)
      return {
        shellId: 'wsl',
        shellKind: 'wsl',
        file: wslPath,
        args: [],
      }
    }
    throw createTerminalSessionError(
      'terminal_session_unsupported_shell',
      `Shell "${requestedShell}" is not supported on ${platform}.`,
      { shell: requestedShell, platform },
    )
  }

  if (requestedShell === 'default' || requestedShell === 'auto') {
    const shellPath = asTrimmedString(env?.SHELL) || '/bin/bash'
    return {
      shellId: 'default',
      shellKind: path.basename(shellPath) || 'shell',
      file: shellPath,
      args: [],
    }
  }
  if (requestedShell === 'bash') {
    return {
      shellId: 'bash',
      shellKind: 'bash',
      file: '/bin/bash',
      args: [],
    }
  }
  if (requestedShell === 'zsh') {
    return {
      shellId: 'zsh',
      shellKind: 'zsh',
      file: '/bin/zsh',
      args: [],
    }
  }
  if (requestedShell === 'sh') {
    return {
      shellId: 'sh',
      shellKind: 'sh',
      file: '/bin/sh',
      args: [],
    }
  }
  if (requestedShell === 'pwsh') {
    return {
      shellId: 'pwsh',
      shellKind: 'pwsh',
      file: 'pwsh',
      args: ['-NoLogo'],
    }
  }
  throw createTerminalSessionError(
    'terminal_session_unsupported_shell',
    `Shell "${requestedShell}" is not supported on ${platform}.`,
    { shell: requestedShell, platform },
  )
}

export function defaultSpawnTerminal({ file, args, options }) {
  const nodePty = requireForRuntime('node-pty')
  return nodePty.spawn(file, args, options)
}
