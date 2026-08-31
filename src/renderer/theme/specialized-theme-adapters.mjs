import { resolveThemePalette, withHexAlpha } from '../../common/ui/theme-color-contract.mjs'
import { getResolvedAppearanceMode, subscribeAppearanceChanges } from './appearance-runtime.mjs'

export const ADDOM_MONACO_THEME_ID = 'addom-dark'
export const ADDOM_MONACO_LIGHT_THEME_ID = 'addom-light'
export const ADDOM_MONACO_DIFF_THEME_ID = 'addom-dark-diff'
export const ADDOM_MONACO_LIGHT_DIFF_THEME_ID = 'addom-light-diff'

function normalizeResolvedAppearance(appearance = 'dark') {
  return String(appearance || '').trim().toLowerCase() === 'light' ? 'light' : 'dark'
}

function buildMonacoTokenRules(colors, appearance) {
  const light = appearance === 'light'
  return [
    { token: 'comment', foreground: colors.textMuted.slice(1), fontStyle: 'italic' },
    { token: 'keyword', foreground: (light ? colors.danger : colors.accentStrong).slice(1) },
    { token: 'string', foreground: colors.success.slice(1) },
    { token: 'number', foreground: colors.warning.slice(1) },
    { token: 'type', foreground: colors.successSoft.slice(1) },
    { token: 'function', foreground: (light ? colors.accentStrong : colors.textPrimary).slice(1) },
    { token: 'variable', foreground: colors.textPrimary.slice(1) },
  ]
}

function buildBaseMonacoColors(colors) {
  return {
    'editor.background': colors.surfaceRaised,
    'editor.foreground': colors.textPrimary,
    'editor.selectionBackground': withHexAlpha(colors.accentMuted, '88'),
    'editor.inactiveSelectionBackground': withHexAlpha(colors.accentMuted, '44'),
    'editorCursor.foreground': colors.accentStrong,
    'editorLineNumber.foreground': colors.accentMuted,
    'editorLineNumber.activeForeground': colors.textSecondary,
    'editorGutter.background': colors.surfaceRaised,
    'editorWidget.background': colors.surfacePanel,
    'editorWidget.border': colors.surfaceBorder,
  }
}

export function buildMonacoThemeData(appearance = 'dark') {
  const resolvedAppearance = normalizeResolvedAppearance(appearance)
  const { colors } = resolveThemePalette(resolvedAppearance)
  return {
    base: resolvedAppearance === 'light' ? 'vs' : 'vs-dark',
    inherit: true,
    rules: buildMonacoTokenRules(colors, resolvedAppearance),
    colors: {
      ...buildBaseMonacoColors(colors),
      'editor.lineHighlightBackground': colors.surfacePanelAlt,
      'editorSuggestWidget.background': colors.surfacePanel,
      'editorSuggestWidget.border': colors.surfaceBorder,
      'editorSuggestWidget.selectedBackground': colors.surfaceBorder,
      'input.background': colors.surfacePanelAlt,
      'input.border': colors.surfaceBorder,
      'scrollbarSlider.background': withHexAlpha(colors.surfaceBorder, '88'),
      'scrollbarSlider.hoverBackground': withHexAlpha(colors.accentMuted, 'aa'),
      'minimap.background': colors.surfacePanelAlt,
    },
  }
}

export function buildMonacoDiffThemeData(appearance = 'dark') {
  const resolvedAppearance = normalizeResolvedAppearance(appearance)
  const { colors } = resolveThemePalette(resolvedAppearance)
  return {
    base: resolvedAppearance === 'light' ? 'vs' : 'vs-dark',
    inherit: true,
    rules: buildMonacoTokenRules(colors, resolvedAppearance),
    colors: {
      ...buildBaseMonacoColors(colors),
      'editor.lineHighlightBackground': withHexAlpha(colors.surfacePanelAlt, '00'),
      'diffEditor.insertedLineBackground': withHexAlpha(colors.successBackground, '52'),
      'diffEditor.insertedTextBackground': withHexAlpha(colors.successBackgroundHover, '78'),
      'diffEditorGutter.insertedLineBackground': withHexAlpha(colors.successBackground, '40'),
      'diffEditorOverview.insertedForeground': withHexAlpha(colors.success, '88'),
      'diffEditor.removedLineBackground': withHexAlpha(colors.dangerBackground, '52'),
      'diffEditor.removedTextBackground': withHexAlpha(colors.dangerBackgroundHover, '78'),
      'diffEditorGutter.removedLineBackground': withHexAlpha(colors.dangerBackground, '40'),
      'diffEditorOverview.removedForeground': withHexAlpha(colors.danger, '88'),
      'diffEditor.diagonalFill': withHexAlpha(colors.surfaceBorder, '80'),
      'scrollbarSlider.background': withHexAlpha(colors.accent, '12'),
      'scrollbarSlider.hoverBackground': withHexAlpha(colors.accent, '20'),
      'scrollbarSlider.activeBackground': withHexAlpha(colors.accentStrong, '30'),
      'editorOverviewRuler.border': colors.surfaceBorder,
      'editorOverviewRuler.addedForeground': withHexAlpha(colors.success, '88'),
      'editorOverviewRuler.deletedForeground': withHexAlpha(colors.danger, '88'),
      'editorOverviewRuler.modifiedForeground': withHexAlpha(colors.accent, 'aa'),
    },
  }
}

export function ensureAddomMonacoTheme(monaco) {
  monaco.editor.defineTheme(ADDOM_MONACO_THEME_ID, buildMonacoThemeData('dark'))
  monaco.editor.defineTheme(ADDOM_MONACO_LIGHT_THEME_ID, buildMonacoThemeData('light'))
}

export function ensureAddomMonacoDiffTheme(monaco) {
  monaco.editor.defineTheme(ADDOM_MONACO_DIFF_THEME_ID, buildMonacoDiffThemeData('dark'))
  monaco.editor.defineTheme(ADDOM_MONACO_LIGHT_DIFF_THEME_ID, buildMonacoDiffThemeData('light'))
}

export function resolveAddomMonacoThemeId({ diff = false, appearance = getResolvedAppearanceMode() } = {}) {
  const light = normalizeResolvedAppearance(appearance) === 'light'
  if (diff) return light ? ADDOM_MONACO_LIGHT_DIFF_THEME_ID : ADDOM_MONACO_DIFF_THEME_ID
  return light ? ADDOM_MONACO_LIGHT_THEME_ID : ADDOM_MONACO_THEME_ID
}

export function bindMonacoAppearance(monaco, { diff = false, editor = null } = {}) {
  if (diff) ensureAddomMonacoDiffTheme(monaco)
  else ensureAddomMonacoTheme(monaco)
  const apply = () => monaco.editor.setTheme(resolveAddomMonacoThemeId({ diff }))
  apply()
  const unsubscribe = subscribeAppearanceChanges(apply)
  editor?.onDidDispose?.(unsubscribe)
  return unsubscribe
}

function rgba(channelValue, alpha) {
  return `rgba(${String(channelValue).trim().replaceAll(' ', ', ')}, ${alpha})`
}

export function buildTerminalTheme(appearance = 'dark') {
  const { colors, channels, specialized } = resolveThemePalette(normalizeResolvedAppearance(appearance))
  return {
    background: colors.surface,
    foreground: colors.textPrimary,
    cursor: colors.accentStrong,
    cursorAccent: colors.surface,
    selectionBackground: rgba(channels.accent, 0.28),
    selectionInactiveBackground: rgba(channels.accentMuted, 0.22),
    black: colors.surface,
    red: colors.danger,
    green: colors.success,
    yellow: colors.warning,
    blue: colors.accent,
    magenta: specialized.terminalMagenta,
    cyan: colors.textSecondary,
    white: colors.textPrimary,
    brightBlack: colors.accentMuted,
    brightRed: colors.dangerSoft,
    brightGreen: colors.successSoft,
    brightYellow: colors.warningSoft,
    brightBlue: colors.accentStrong,
    brightMagenta: specialized.terminalBrightMagenta,
    brightCyan: colors.accentStrong,
    brightWhite: colors.textPrimary,
  }
}

export function buildTerminalSearchDecorations(appearance = 'dark') {
  const { colors } = resolveThemePalette(normalizeResolvedAppearance(appearance))
  return {
    matchBackground: colors.accentMuted,
    matchBorder: colors.accentStrong,
    matchOverviewRuler: colors.accentStrong,
    activeMatchBackground: colors.warning,
    activeMatchBorder: colors.warningSoft,
    activeMatchColorOverviewRuler: colors.warning,
  }
}

export const ADDOM_TERMINAL_THEME = Object.freeze(buildTerminalTheme('dark'))
export const ADDOM_TERMINAL_SEARCH_DECORATIONS = Object.freeze(buildTerminalSearchDecorations('dark'))

export function resolveGitDecorationColor(kind = 'modified', appearance = getResolvedAppearanceMode()) {
  const { colors } = resolveThemePalette(normalizeResolvedAppearance(appearance))
  switch (String(kind || '').trim().toLowerCase()) {
    case 'added': return colors.success
    case 'deleted': return colors.danger
    default: return colors.accent
  }
}
