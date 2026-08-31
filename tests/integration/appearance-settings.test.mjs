import test from 'node:test'
import assert from 'node:assert/strict'

import {
  APPEARANCE_MODE_DARK,
  APPEARANCE_MODE_LIGHT,
  APPEARANCE_MODE_SYSTEM,
  DEFAULT_APPEARANCE_SETTINGS,
  normalizeAppearanceSettings,
  resolveAppearanceMode,
} from '../../src/common/ui/appearance-settings.mjs'
import {
  LIGHT_SPECIALIZED_THEME_COLORS,
  LIGHT_THEME_COLORS,
  buildThemeCssVariables,
} from '../../src/common/ui/theme-color-contract.mjs'
import {
  buildMonacoDiffThemeData,
  buildMonacoThemeData,
  buildTerminalTheme,
  resolveAddomMonacoThemeId,
} from '../../src/renderer/theme/specialized-theme-adapters.mjs'

test('appearance settings preserve dark as the existing default', () => {
  assert.deepEqual(DEFAULT_APPEARANCE_SETTINGS, { mode: APPEARANCE_MODE_DARK })
  assert.deepEqual(normalizeAppearanceSettings(null), DEFAULT_APPEARANCE_SETTINGS)
  assert.deepEqual(normalizeAppearanceSettings('light'), { mode: APPEARANCE_MODE_LIGHT })
  assert.deepEqual(normalizeAppearanceSettings({ mode: 'system' }), { mode: APPEARANCE_MODE_SYSTEM })
  assert.deepEqual(normalizeAppearanceSettings({ mode: 'unknown' }), DEFAULT_APPEARANCE_SETTINGS)
})

test('system appearance resolves from the operating-system preference', () => {
  assert.equal(resolveAppearanceMode({ mode: 'system' }, { systemPrefersDark: true }), APPEARANCE_MODE_DARK)
  assert.equal(resolveAppearanceMode({ mode: 'system' }, { systemPrefersDark: false }), APPEARANCE_MODE_LIGHT)
  assert.equal(resolveAppearanceMode({ mode: 'dark' }, { systemPrefersDark: false }), APPEARANCE_MODE_DARK)
})

test('light theme exposes a complete readable semantic palette', () => {
  const cssVars = buildThemeCssVariables(APPEARANCE_MODE_LIGHT)
  assert.equal(cssVars['--color-surface'], LIGHT_THEME_COLORS.surface)
  assert.equal(cssVars['--color-text-primary'], LIGHT_THEME_COLORS.textPrimary)
  assert.equal(cssVars['--color-terminal-background'], LIGHT_THEME_COLORS.surface)
  assert.equal(cssVars['--theme-color-scheme'], APPEARANCE_MODE_LIGHT)
  assert.match(cssVars['--color-overlay-scrim'], /^rgb\(/)
  assert.match(cssVars['--color-success-border'], /^rgb\(/)
  assert.ok(Object.keys(cssVars).length >= 70)
})

test('light theme publishes the syntax variables consumed by highlighted code', () => {
  const cssVars = buildThemeCssVariables(APPEARANCE_MODE_LIGHT)

  assert.equal(cssVars['--color-syntax-text'], LIGHT_SPECIALIZED_THEME_COLORS.syntaxText)
  assert.equal(cssVars['--color-syntax-section'], LIGHT_SPECIALIZED_THEME_COLORS.syntaxSection)
  assert.equal(cssVars['--color-syntax-bullet'], LIGHT_SPECIALIZED_THEME_COLORS.syntaxBullet)
  assert.equal(
    Object.keys(cssVars).some((name) => name.startsWith('--color-syntax--')),
    false,
  )
})

test('light theme reaches specialized editor, diff, and terminal adapters', () => {
  const editor = buildMonacoThemeData(APPEARANCE_MODE_LIGHT)
  const diff = buildMonacoDiffThemeData(APPEARANCE_MODE_LIGHT)
  const terminal = buildTerminalTheme(APPEARANCE_MODE_LIGHT)

  assert.equal(editor.base, 'vs')
  assert.equal(editor.colors['editor.background'], LIGHT_THEME_COLORS.surfaceRaised)
  assert.equal(diff.colors['diffEditor.insertedLineBackground'], '#e4f0e252')
  assert.equal(terminal.background, LIGHT_THEME_COLORS.surface)
  assert.equal(terminal.foreground, LIGHT_THEME_COLORS.textPrimary)
  assert.equal(resolveAddomMonacoThemeId({ appearance: APPEARANCE_MODE_LIGHT }), 'addom-light')
  assert.equal(resolveAddomMonacoThemeId({ appearance: APPEARANCE_MODE_LIGHT, diff: true }), 'addom-light-diff')
})
