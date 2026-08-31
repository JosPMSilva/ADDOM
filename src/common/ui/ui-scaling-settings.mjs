export const UI_SCALING_MODE_AUTO = 'auto'
export const UI_SCALING_MODE_MANUAL = 'manual'
export const UI_SCALING_MODES = Object.freeze([
  UI_SCALING_MODE_AUTO,
  UI_SCALING_MODE_MANUAL,
])

export const UI_SCALING_SCALE_MIN = 0.85
export const UI_SCALING_SCALE_MAX = 1.15
export const UI_SCALING_SCALE_STEP = 0.05

export const DEFAULT_UI_SCALING_SETTINGS = Object.freeze({
  mode: UI_SCALING_MODE_AUTO,
  scale: 1,
})

const AUTO_UI_SCALE_MIN = 0.9
const AUTO_UI_SCALE_MAX = 1.05
const AUTO_UI_SCALE_BASELINE_WIDTH = 1600
const AUTO_UI_SCALE_BASELINE_HEIGHT = 900

function roundUiScale(value) {
  const stepped = Math.round(Number(value || 0) / UI_SCALING_SCALE_STEP) * UI_SCALING_SCALE_STEP
  return Math.round(stepped * 100) / 100
}

export function normalizeUiScalingMode(rawMode, fallback = DEFAULT_UI_SCALING_SETTINGS.mode) {
  const normalizedFallback = UI_SCALING_MODES.includes(String(fallback || '').trim().toLowerCase())
    ? String(fallback || '').trim().toLowerCase()
    : DEFAULT_UI_SCALING_SETTINGS.mode
  const normalized = String(rawMode || '').trim().toLowerCase()
  return UI_SCALING_MODES.includes(normalized) ? normalized : normalizedFallback
}

export function normalizeUiScalingScale(rawScale, fallback = DEFAULT_UI_SCALING_SETTINGS.scale) {
  const numericScale = Number(rawScale)
  if (!Number.isFinite(numericScale)) return roundUiScale(fallback)
  const clampedScale = Math.min(UI_SCALING_SCALE_MAX, Math.max(UI_SCALING_SCALE_MIN, numericScale))
  return roundUiScale(clampedScale)
}

export function normalizeUiScalingSettings(raw, defaults = DEFAULT_UI_SCALING_SETTINGS) {
  const fallback = defaults && typeof defaults === 'object'
    ? defaults
    : DEFAULT_UI_SCALING_SETTINGS
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    mode: normalizeUiScalingMode(source.mode, fallback.mode),
    scale: normalizeUiScalingScale(source.scale, fallback.scale),
  }
}

export function resolveAutoUiScale({
  viewportWidth = 0,
  viewportHeight = 0,
} = {}, fallback = DEFAULT_UI_SCALING_SETTINGS.scale) {
  const width = Number(viewportWidth || 0)
  const height = Number(viewportHeight || 0)
  if (!(width > 0) || !(height > 0)) return normalizeUiScalingScale(fallback)

  const widthRatio = width / AUTO_UI_SCALE_BASELINE_WIDTH
  const heightRatio = height / AUTO_UI_SCALE_BASELINE_HEIGHT
  const resolvedRatio = Math.min(widthRatio, heightRatio)
  const boundedRatio = Math.min(AUTO_UI_SCALE_MAX, Math.max(AUTO_UI_SCALE_MIN, resolvedRatio))
  return normalizeUiScalingScale(boundedRatio, fallback)
}

export function resolveEffectiveUiScale(settings = DEFAULT_UI_SCALING_SETTINGS, viewport = {}) {
  const normalized = normalizeUiScalingSettings(settings)
  if (normalized.mode === UI_SCALING_MODE_MANUAL) return normalized.scale
  return resolveAutoUiScale(viewport, normalized.scale)
}

export function scaleDesignPixels(value = 0, scale = 1) {
  const numericValue = Number(value || 0)
  const numericScale = Number(scale || 1)
  if (!Number.isFinite(numericValue) || !Number.isFinite(numericScale)) return 0
  return Math.max(0, Math.round(numericValue * numericScale))
}

export function buildUiScalingCssVars(scale = 1) {
  const resolvedScale = normalizeUiScalingScale(scale, DEFAULT_UI_SCALING_SETTINGS.scale)
  return {
    '--app-ui-scale': String(resolvedScale),
    '--app-sidebar-collapsed-width': `${scaleDesignPixels(56, resolvedScale)}px`,
    '--app-sidebar-expanded-width': `${scaleDesignPixels(160, resolvedScale)}px`,
    '--app-thread-drawer-min-width': `${scaleDesignPixels(180, resolvedScale)}px`,
    '--app-thread-drawer-max-width': `${scaleDesignPixels(520, resolvedScale)}px`,
    '--app-thread-drawer-default-width': `${scaleDesignPixels(260, resolvedScale)}px`,
    '--app-chat-companion-width': `${scaleDesignPixels(300, resolvedScale)}px`,
    '--app-chat-content-max-width': `${scaleDesignPixels(980, resolvedScale)}px`,
    '--app-chat-composer-max-width': `${scaleDesignPixels(1028, resolvedScale)}px`,
  }
}
