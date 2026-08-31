import {
  DEFAULT_BACKGROUND_TONE_SETTINGS,
  buildBackgroundToneCssVars,
  normalizeBackgroundToneSettings,
} from '../common/ui/background-tone-settings.mjs'
import {
  APPEARANCE_CHANGE_EVENT,
  getResolvedAppearanceMode,
} from './theme/appearance-runtime.mjs'

let appliedBackgroundToneSettings = { ...DEFAULT_BACKGROUND_TONE_SETTINGS }

export function applyBackgroundToneSettings(rawSettings) {
  appliedBackgroundToneSettings = normalizeBackgroundToneSettings(rawSettings)
  if (typeof document === 'undefined' || !document?.documentElement?.style) return

  const rootStyle = document.documentElement.style
  if (getResolvedAppearanceMode() !== 'dark') return
  const cssVars = buildBackgroundToneCssVars(appliedBackgroundToneSettings)
  for (const [key, value] of Object.entries(cssVars)) {
    rootStyle.setProperty(key, value)
  }
  document.documentElement.dataset.appBackgroundTone = appliedBackgroundToneSettings.tone
}

if (typeof window !== 'undefined') {
  applyBackgroundToneSettings(DEFAULT_BACKGROUND_TONE_SETTINGS)
  if (typeof window.addEventListener === 'function') {
    window.addEventListener(APPEARANCE_CHANGE_EVENT, () => {
      applyBackgroundToneSettings(appliedBackgroundToneSettings)
    })
  }
}
