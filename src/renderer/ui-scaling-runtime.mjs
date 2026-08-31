import useAppStore from './store/useAppStore.js'
import {
  buildUiScalingCssVars,
  DEFAULT_UI_SCALING_SETTINGS,
  normalizeUiScalingSettings,
  resolveEffectiveUiScale,
} from '../common/ui/ui-scaling-settings.mjs'

let appliedUiScalingSettings = { ...DEFAULT_UI_SCALING_SETTINGS }
let resizeListenerInstalled = false
let resizeRafId = 0

function hasWindowResizeApi() {
  return (
    typeof window !== 'undefined'
    && typeof window.addEventListener === 'function'
    && typeof window.requestAnimationFrame === 'function'
  )
}

function readViewportMetrics() {
  if (typeof window === 'undefined') return { viewportWidth: 0, viewportHeight: 0 }
  return {
    viewportWidth: Number(window.innerWidth || 0),
    viewportHeight: Number(window.innerHeight || 0),
  }
}

function applyResolvedUiScale() {
  if (typeof document === 'undefined' || !document?.documentElement?.style) return
  const resolvedScale = resolveEffectiveUiScale(appliedUiScalingSettings, readViewportMetrics())
  const rootStyle = document.documentElement.style
  const cssVars = buildUiScalingCssVars(resolvedScale)
  for (const [key, value] of Object.entries(cssVars)) {
    rootStyle.setProperty(key, value)
  }
  document.documentElement.dataset.appUiScaleMode = appliedUiScalingSettings.mode
  useAppStore.getState().setUiScale(resolvedScale)
}

function scheduleResolvedUiScaleApply() {
  if (!hasWindowResizeApi()) return
  if (resizeRafId) return
  resizeRafId = window.requestAnimationFrame(() => {
    resizeRafId = 0
    applyResolvedUiScale()
  })
}

function ensureResizeListener() {
  if (resizeListenerInstalled || !hasWindowResizeApi()) return
  window.addEventListener('resize', scheduleResolvedUiScaleApply, { passive: true })
  resizeListenerInstalled = true
}

export function applyUiScalingSettings(rawSettings) {
  appliedUiScalingSettings = normalizeUiScalingSettings(rawSettings)
  ensureResizeListener()
  applyResolvedUiScale()
}

if (typeof window !== 'undefined') {
  applyUiScalingSettings(DEFAULT_UI_SCALING_SETTINGS)
}
