export const APPEARANCE_MODE_DARK = 'dark'
export const APPEARANCE_MODE_LIGHT = 'light'
export const APPEARANCE_MODE_SYSTEM = 'system'

export const APPEARANCE_MODES = Object.freeze([
  APPEARANCE_MODE_DARK,
  APPEARANCE_MODE_LIGHT,
  APPEARANCE_MODE_SYSTEM,
])

export const DEFAULT_APPEARANCE_SETTINGS = Object.freeze({
  mode: APPEARANCE_MODE_DARK,
})

export function normalizeAppearanceMode(rawMode, fallback = DEFAULT_APPEARANCE_SETTINGS.mode) {
  const normalizedFallback = APPEARANCE_MODES.includes(String(fallback || '').trim().toLowerCase())
    ? String(fallback || '').trim().toLowerCase()
    : DEFAULT_APPEARANCE_SETTINGS.mode
  const normalized = String(rawMode || '').trim().toLowerCase()
  return APPEARANCE_MODES.includes(normalized) ? normalized : normalizedFallback
}

export function normalizeAppearanceSettings(raw, fallback = DEFAULT_APPEARANCE_SETTINGS) {
  const fallbackMode = normalizeAppearanceMode(fallback?.mode, DEFAULT_APPEARANCE_SETTINGS.mode)
  const sourceMode = typeof raw === 'string' ? raw : raw?.mode
  return {
    mode: normalizeAppearanceMode(sourceMode, fallbackMode),
  }
}

export function resolveAppearanceMode(raw, { systemPrefersDark = false } = {}) {
  const { mode } = normalizeAppearanceSettings(raw)
  if (mode === APPEARANCE_MODE_SYSTEM) {
    return systemPrefersDark ? APPEARANCE_MODE_DARK : APPEARANCE_MODE_LIGHT
  }
  return mode
}
