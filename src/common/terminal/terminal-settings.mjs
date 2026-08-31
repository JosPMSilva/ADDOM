function asTrimmedString(value = '') {
  return String(value || '').trim()
}

export const TERMINAL_FONT_SIZE_DEFAULT = 12
export const TERMINAL_FONT_SIZE_MIN = 9
export const TERMINAL_FONT_SIZE_MAX = 22
export const TERMINAL_SCROLLBACK_DEFAULT = 5000
export const TERMINAL_SCROLLBACK_MIN = 1000
export const TERMINAL_SCROLLBACK_MAX = 50000
export const TERMINAL_PASTE_CONFIRMATION_LINE_THRESHOLD_DEFAULT = 12
export const TERMINAL_PASTE_CONFIRMATION_LINE_THRESHOLD_MIN = 0
export const TERMINAL_PASTE_CONFIRMATION_LINE_THRESHOLD_MAX = 500

export const TERMINAL_FONT_FAMILY_OPTIONS = Object.freeze([
  'geist_mono',
  'jetbrains_mono',
  'fira_code',
  'cascadia_code',
  'system_mono',
])

export const TERMINAL_DEFAULT_SHELL_OPTIONS = Object.freeze([
  'default',
  'cmd',
  'powershell',
  'pwsh',
  'bash',
  'zsh',
  'git-bash',
  'wsl',
])

export const TERMINAL_DEFAULT_CWD_BEHAVIOR_OPTIONS = Object.freeze([
  'project_root',
  'editor_folder',
  'session_cwd',
])

const TERMINAL_FONT_FAMILY_MAP = Object.freeze({
  geist_mono: '\'Geist Mono\', \'JetBrains Mono\', \'Fira Code\', \'Cascadia Code\', monospace',
  jetbrains_mono: '\'JetBrains Mono\', \'Geist Mono\', \'Fira Code\', \'Cascadia Code\', monospace',
  fira_code: '\'Fira Code\', \'Geist Mono\', \'JetBrains Mono\', \'Cascadia Code\', monospace',
  cascadia_code: '\'Cascadia Code\', \'Geist Mono\', \'JetBrains Mono\', \'Fira Code\', monospace',
  system_mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \'Liberation Mono\', monospace',
})

export const DEFAULT_TERMINAL_SETTINGS = Object.freeze({
  fontSize: TERMINAL_FONT_SIZE_DEFAULT,
  fontFamily: 'geist_mono',
  scrollback: TERMINAL_SCROLLBACK_DEFAULT,
  defaultShell: 'default',
  defaultCwdBehavior: 'project_root',
  copyOnSelection: false,
  pasteConfirmationLineThreshold: TERMINAL_PASTE_CONFIRMATION_LINE_THRESHOLD_DEFAULT,
})

export function clampTerminalFontSize(value = TERMINAL_FONT_SIZE_DEFAULT) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return TERMINAL_FONT_SIZE_DEFAULT
  return Math.max(TERMINAL_FONT_SIZE_MIN, Math.min(TERMINAL_FONT_SIZE_MAX, Math.round(numeric)))
}

export function clampTerminalScrollback(value = TERMINAL_SCROLLBACK_DEFAULT) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return TERMINAL_SCROLLBACK_DEFAULT
  return Math.max(TERMINAL_SCROLLBACK_MIN, Math.min(TERMINAL_SCROLLBACK_MAX, Math.round(numeric)))
}

export function clampTerminalPasteConfirmationLineThreshold(
  value = TERMINAL_PASTE_CONFIRMATION_LINE_THRESHOLD_DEFAULT,
) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return TERMINAL_PASTE_CONFIRMATION_LINE_THRESHOLD_DEFAULT
  return Math.max(
    TERMINAL_PASTE_CONFIRMATION_LINE_THRESHOLD_MIN,
    Math.min(TERMINAL_PASTE_CONFIRMATION_LINE_THRESHOLD_MAX, Math.round(numeric)),
  )
}

export function normalizeTerminalFontFamily(value, fallback = DEFAULT_TERMINAL_SETTINGS.fontFamily) {
  const normalized = asTrimmedString(value).toLowerCase().replace(/\s+/g, '_')
  if (TERMINAL_FONT_FAMILY_OPTIONS.includes(normalized)) return normalized
  return TERMINAL_FONT_FAMILY_OPTIONS.includes(fallback) ? fallback : DEFAULT_TERMINAL_SETTINGS.fontFamily
}

export function resolveTerminalFontFamily(value, fallback = DEFAULT_TERMINAL_SETTINGS.fontFamily) {
  const normalized = normalizeTerminalFontFamily(value, fallback)
  return TERMINAL_FONT_FAMILY_MAP[normalized] || TERMINAL_FONT_FAMILY_MAP[DEFAULT_TERMINAL_SETTINGS.fontFamily]
}

export function normalizeTerminalDefaultShell(value, fallback = DEFAULT_TERMINAL_SETTINGS.defaultShell) {
  const normalized = asTrimmedString(value).toLowerCase()
  if (TERMINAL_DEFAULT_SHELL_OPTIONS.includes(normalized)) return normalized
  return TERMINAL_DEFAULT_SHELL_OPTIONS.includes(fallback) ? fallback : DEFAULT_TERMINAL_SETTINGS.defaultShell
}

export function normalizeTerminalDefaultCwdBehavior(
  value,
  fallback = DEFAULT_TERMINAL_SETTINGS.defaultCwdBehavior,
) {
  const normalized = asTrimmedString(value).toLowerCase()
  if (TERMINAL_DEFAULT_CWD_BEHAVIOR_OPTIONS.includes(normalized)) return normalized
  return TERMINAL_DEFAULT_CWD_BEHAVIOR_OPTIONS.includes(fallback)
    ? fallback
    : DEFAULT_TERMINAL_SETTINGS.defaultCwdBehavior
}

export function normalizeTerminalSettings(raw = {}, fallback = DEFAULT_TERMINAL_SETTINGS) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const base = fallback && typeof fallback === 'object' ? fallback : DEFAULT_TERMINAL_SETTINGS
  return {
    fontSize: clampTerminalFontSize(source.fontSize ?? base.fontSize),
    fontFamily: normalizeTerminalFontFamily(source.fontFamily, base.fontFamily),
    scrollback: clampTerminalScrollback(source.scrollback ?? base.scrollback),
    defaultShell: normalizeTerminalDefaultShell(source.defaultShell, base.defaultShell),
    defaultCwdBehavior: normalizeTerminalDefaultCwdBehavior(
      source.defaultCwdBehavior,
      base.defaultCwdBehavior,
    ),
    copyOnSelection: source.copyOnSelection == null
      ? base.copyOnSelection === true
      : source.copyOnSelection === true,
    pasteConfirmationLineThreshold: clampTerminalPasteConfirmationLineThreshold(
      source.pasteConfirmationLineThreshold ?? base.pasteConfirmationLineThreshold,
    ),
  }
}

export function resolveTerminalLaunchSettings({
  terminalSettings = DEFAULT_TERMINAL_SETTINGS,
  projectFolder = '',
  explicitCwd = '',
  explicitShell = '',
  launchContext = {},
} = {}) {
  const normalizedTerminalSettings = normalizeTerminalSettings(terminalSettings)
  const normalizedProjectFolder = asTrimmedString(projectFolder)
  const normalizedExplicitCwd = asTrimmedString(explicitCwd)
  const normalizedExplicitShell = asTrimmedString(explicitShell)
  const normalizedEditorCwd = asTrimmedString(launchContext?.editorCwd)
  const normalizedSessionCwd = asTrimmedString(launchContext?.sessionCwd)

  const cwd = normalizedExplicitCwd || (() => {
    if (normalizedTerminalSettings.defaultCwdBehavior === 'editor_folder') {
      return normalizedEditorCwd || normalizedProjectFolder || normalizedSessionCwd || '.'
    }
    if (normalizedTerminalSettings.defaultCwdBehavior === 'session_cwd') {
      return normalizedSessionCwd || normalizedProjectFolder || normalizedEditorCwd || '.'
    }
    return normalizedProjectFolder || normalizedEditorCwd || normalizedSessionCwd || '.'
  })()

  const shell = normalizeTerminalDefaultShell(
    normalizedExplicitShell || normalizedTerminalSettings.defaultShell,
    DEFAULT_TERMINAL_SETTINGS.defaultShell,
  )

  return {
    cwd,
    shell,
  }
}
