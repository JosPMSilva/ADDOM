function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function pushChoice(choices, shellId = '') {
  const normalized = asTrimmedString(shellId).toLowerCase()
  if (!normalized || choices.includes(normalized)) return
  choices.push(normalized)
}

function getAvailabilityChoices(runtimeHealth = null) {
  const source = runtimeHealth && typeof runtimeHealth === 'object' ? runtimeHealth : {}
  const availableShells = Array.isArray(source.availableShells) ? source.availableShells : []
  const choices = []
  for (const shell of availableShells) {
    pushChoice(choices, shell?.id)
  }
  return choices
}

export function getTerminalShellChoices(runtimeHealth = null) {
  const availabilityChoices = getAvailabilityChoices(runtimeHealth)
  if (availabilityChoices.length > 0) {
    const choices = []
    pushChoice(choices, 'default')
    for (const shell of availabilityChoices) pushChoice(choices, shell)
    return choices
  }

  const platform = asTrimmedString(runtimeHealth?.platform).toLowerCase()
  if (platform === 'win32' || platform.startsWith('win')) {
    return ['default', 'cmd', 'powershell', 'pwsh']
  }
  return ['default', 'pwsh']
}
