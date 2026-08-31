const PLATFORM_DARWIN = 'darwin'

export const TERMINAL_KEY_ACTIONS = Object.freeze({
  cutSelection: 'cutSelection',
  copySelection: 'copySelection',
  pasteClipboard: 'pasteClipboard',
  find: 'find',
  clear: 'clear',
  newTerminal: 'newTerminal',
  closeTerminal: 'closeTerminal',
  switchPreviousSession: 'switchPreviousSession',
  switchNextSession: 'switchNextSession',
  zoomIn: 'zoomIn',
  zoomOut: 'zoomOut',
  zoomReset: 'zoomReset',
})

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

export function normalizeTerminalPlatform(platform = '') {
  const normalized = asTrimmedString(platform).toLowerCase()
  if (!normalized) return ''
  if (normalized === PLATFORM_DARWIN || normalized.includes('mac')) return PLATFORM_DARWIN
  if (normalized === 'win32' || normalized.startsWith('win')) return 'win32'
  if (normalized.includes('linux')) return 'linux'
  return normalized
}

function isMacPlatform(platform = '') {
  return normalizeTerminalPlatform(platform) === PLATFORM_DARWIN
}

function getEventKey(event = null) {
  return asTrimmedString(event?.key).toLowerCase()
}

function isKeyboardShortcutCandidate(event = null) {
  if (!event || typeof event !== 'object') return false
  if (event.defaultPrevented === true) return false
  if (asTrimmedString(event.type || 'keydown').toLowerCase() !== 'keydown') return false
  if (event.altKey === true) return false
  return true
}

function hasPrimaryModifier(event = null, platform = '') {
  if (isMacPlatform(platform)) {
    return event?.metaKey === true && event?.ctrlKey !== true
  }
  return event?.ctrlKey === true && event?.metaKey !== true
}

function hasTerminalClipboardModifier(event = null, platform = '') {
  if (isMacPlatform(platform)) return hasPrimaryModifier(event, platform)
  return event?.ctrlKey === true && event?.shiftKey === true && event?.metaKey !== true
}

function hasShiftedPrimaryModifier(event = null, platform = '') {
  return hasPrimaryModifier(event, platform) && event?.shiftKey === true
}

function createTerminalKeybindings(platform = '') {
  const primaryLabel = isMacPlatform(platform) ? 'Cmd' : 'Ctrl'
  const clipboardLabel = isMacPlatform(platform) ? primaryLabel : `${primaryLabel}+Shift`

  return [
    {
      id: TERMINAL_KEY_ACTIONS.cutSelection,
      label: `${clipboardLabel}+X`,
      matches: (event) => hasTerminalClipboardModifier(event, platform) && getEventKey(event) === 'x',
    },
    {
      id: TERMINAL_KEY_ACTIONS.copySelection,
      label: `${clipboardLabel}+C`,
      matches: (event) => hasTerminalClipboardModifier(event, platform) && getEventKey(event) === 'c',
    },
    {
      id: TERMINAL_KEY_ACTIONS.pasteClipboard,
      label: `${clipboardLabel}+V`,
      matches: (event) => hasTerminalClipboardModifier(event, platform) && getEventKey(event) === 'v',
    },
    {
      id: TERMINAL_KEY_ACTIONS.find,
      label: `${primaryLabel}+Shift+F`,
      matches: (event) => hasShiftedPrimaryModifier(event, platform) && getEventKey(event) === 'f',
    },
    {
      id: TERMINAL_KEY_ACTIONS.clear,
      label: `${primaryLabel}+Shift+K`,
      matches: (event) => hasShiftedPrimaryModifier(event, platform) && getEventKey(event) === 'k',
    },
    {
      id: TERMINAL_KEY_ACTIONS.newTerminal,
      label: `${primaryLabel}+Shift+\``,
      matches: (event) => hasShiftedPrimaryModifier(event, platform) && ['`', '~'].includes(getEventKey(event)),
    },
    {
      id: TERMINAL_KEY_ACTIONS.closeTerminal,
      label: `${primaryLabel}+Shift+W`,
      matches: (event) => hasShiftedPrimaryModifier(event, platform) && getEventKey(event) === 'w',
    },
    {
      id: TERMINAL_KEY_ACTIONS.switchPreviousSession,
      label: `${primaryLabel}+Shift+[`,
      matches: (event) => hasShiftedPrimaryModifier(event, platform) && getEventKey(event) === '[',
    },
    {
      id: TERMINAL_KEY_ACTIONS.switchNextSession,
      label: `${primaryLabel}+Shift+]`,
      matches: (event) => hasShiftedPrimaryModifier(event, platform) && getEventKey(event) === ']',
    },
    {
      id: TERMINAL_KEY_ACTIONS.zoomIn,
      label: `${primaryLabel}+=`,
      matches: (event) => hasPrimaryModifier(event, platform) && ['=', '+'].includes(getEventKey(event)),
    },
    {
      id: TERMINAL_KEY_ACTIONS.zoomOut,
      label: `${primaryLabel}+-`,
      matches: (event) => hasPrimaryModifier(event, platform) && getEventKey(event) === '-',
    },
    {
      id: TERMINAL_KEY_ACTIONS.zoomReset,
      label: `${primaryLabel}+0`,
      matches: (event) => hasPrimaryModifier(event, platform) && getEventKey(event) === '0',
    },
  ]
}

export function getTerminalShortcutLabels(platform = '') {
  return Object.fromEntries(
    createTerminalKeybindings(platform).map((binding) => [binding.id, binding.label]),
  )
}

export function resolveTerminalKeyAction(event = null, platform = '') {
  if (!isKeyboardShortcutCandidate(event)) return null
  return createTerminalKeybindings(platform).find((binding) => binding.matches(event)) || null
}
