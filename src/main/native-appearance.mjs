import {
  DEFAULT_APPEARANCE_SETTINGS,
  normalizeAppearanceSettings,
  resolveAppearanceMode,
} from '../common/ui/appearance-settings.mjs'
import { resolveThemePalette } from '../common/ui/theme-color-contract.mjs'
import { BrowserWindow, nativeTheme } from './electron-api.mjs'

let currentAppearanceSettings = { ...DEFAULT_APPEARANCE_SETTINGS }
let currentResolvedAppearance = DEFAULT_APPEARANCE_SETTINGS.mode
let nativeAppearanceListenerInstalled = false

function listWindows(windows) {
  if (Array.isArray(windows)) return windows
  return typeof BrowserWindow?.getAllWindows === 'function' ? BrowserWindow.getAllWindows() : []
}

export function applyNativeAppearanceSettings(rawSettings, options = {}) {
  const nativeThemeApi = options?.nativeThemeApi ?? nativeTheme
  currentAppearanceSettings = normalizeAppearanceSettings(rawSettings)
  if (nativeThemeApi) nativeThemeApi.themeSource = currentAppearanceSettings.mode
  currentResolvedAppearance = resolveAppearanceMode(currentAppearanceSettings, {
    systemPrefersDark: nativeThemeApi?.shouldUseDarkColors === true,
  })
  const backgroundColor = resolveThemePalette(currentResolvedAppearance).colors.surface
  for (const win of listWindows(options?.windows)) {
    if (win?.isDestroyed?.()) continue
    win?.setBackgroundColor?.(backgroundColor)
  }
  return {
    settings: { ...currentAppearanceSettings },
    resolvedMode: currentResolvedAppearance,
    backgroundColor,
  }
}

export function getNativeResolvedAppearance() {
  return currentResolvedAppearance
}

export function startNativeAppearanceSync(readSettings, options = {}) {
  const nativeThemeApi = options?.nativeThemeApi ?? nativeTheme
  const applyCurrent = () => applyNativeAppearanceSettings(
    typeof readSettings === 'function' ? readSettings()?.appearance : DEFAULT_APPEARANCE_SETTINGS,
    { ...options, nativeThemeApi },
  )
  const initial = applyCurrent()
  if (!nativeAppearanceListenerInstalled && typeof nativeThemeApi?.on === 'function') {
    nativeThemeApi.on('updated', applyCurrent)
    nativeAppearanceListenerInstalled = true
  }
  return initial
}
