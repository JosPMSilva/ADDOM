import test from 'node:test'
import assert from 'node:assert/strict'

import { applyNativeAppearanceSettings } from '../../src/main/native-appearance.mjs'

test('native appearance applies Electron theme source and window background together', () => {
  const colors = []
  const nativeThemeApi = { themeSource: 'dark', shouldUseDarkColors: false }
  const result = applyNativeAppearanceSettings({ mode: 'light' }, {
    nativeThemeApi,
    windows: [{
      isDestroyed: () => false,
      setBackgroundColor: (color) => colors.push(color),
    }],
  })

  assert.equal(nativeThemeApi.themeSource, 'light')
  assert.equal(result.resolvedMode, 'light')
  assert.equal(result.backgroundColor, '#f7f6f2')
  assert.deepEqual(colors, ['#f7f6f2'])
})

test('native system appearance resolves from Electron and skips destroyed windows', () => {
  const colors = []
  const nativeThemeApi = { themeSource: 'dark', shouldUseDarkColors: true }
  const result = applyNativeAppearanceSettings({ mode: 'system' }, {
    nativeThemeApi,
    windows: [
      { isDestroyed: () => true, setBackgroundColor: (color) => colors.push(color) },
      { isDestroyed: () => false, setBackgroundColor: (color) => colors.push(color) },
    ],
  })

  assert.equal(nativeThemeApi.themeSource, 'system')
  assert.equal(result.resolvedMode, 'dark')
  assert.deepEqual(colors, ['#0b0c0c'])
})
