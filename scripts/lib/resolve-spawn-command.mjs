function asCommandString(value) {
  return String(value ?? '').trim()
}

function asArgsArray(value) {
  return Array.isArray(value) ? value.map((entry) => String(entry ?? '')) : []
}

export function isWindowsBatchCommand(command = '', platform = process.platform) {
  return platform === 'win32' && /\.(cmd|bat)$/i.test(asCommandString(command))
}

export function resolveSpawnCommand(
  command,
  args = [],
  platform = process.platform,
  env = process.env,
) {
  const normalizedCommand = asCommandString(command)
  const normalizedArgs = asArgsArray(args)

  if (isWindowsBatchCommand(normalizedCommand, platform)) {
    const commandProcessor = asCommandString(env?.ComSpec || env?.COMSPEC || 'cmd.exe')
    return {
      command: commandProcessor || 'cmd.exe',
      args: ['/d', '/s', '/c', normalizedCommand, ...normalizedArgs],
      options: {
        shell: false,
        windowsHide: true,
      },
    }
  }

  return {
    command: normalizedCommand,
    args: normalizedArgs,
    options: {
      shell: false,
      windowsHide: true,
    },
  }
}
