import {
  APPEARANCE_MODE_DARK,
  APPEARANCE_MODE_SYSTEM,
  DEFAULT_APPEARANCE_SETTINGS,
  normalizeAppearanceSettings,
  resolveAppearanceMode,
} from '../../common/ui/appearance-settings.mjs'
import { buildThemeCssVariables } from '../../common/ui/theme-color-contract.mjs'

export const APPEARANCE_CHANGE_EVENT = 'addom:appearance-changed'

let appliedAppearanceSettings = { ...DEFAULT_APPEARANCE_SETTINGS }
let resolvedAppearanceMode = APPEARANCE_MODE_DARK
let systemAppearanceQuery = null
let systemAppearanceListenerInstalled = false

function getSystemAppearanceQuery() {
  if (systemAppearanceQuery || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return systemAppearanceQuery
  }
  systemAppearanceQuery = window.matchMedia('(prefers-color-scheme: dark)')
  return systemAppearanceQuery
}

function readSystemPrefersDark(fallback = false) {
  return getSystemAppearanceQuery()?.matches ?? fallback
}

function emitAppearanceChange() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent(APPEARANCE_CHANGE_EVENT, {
    detail: {
      settings: { ...appliedAppearanceSettings },
      resolvedMode: resolvedAppearanceMode,
    },
  }))
}

function ensureSystemAppearanceListener() {
  const query = getSystemAppearanceQuery()
  if (!query || systemAppearanceListenerInstalled) return
  const handleChange = () => {
    if (appliedAppearanceSettings.mode !== APPEARANCE_MODE_SYSTEM) return
    applyAppearanceSettings(appliedAppearanceSettings)
  }
  query.addEventListener?.('change', handleChange)
  systemAppearanceListenerInstalled = true
}

export function applyAppearanceSettings(rawSettings, options = {}) {
  appliedAppearanceSettings = normalizeAppearanceSettings(rawSettings)
  const systemPrefersDark = typeof options?.systemPrefersDark === 'boolean'
    ? options.systemPrefersDark
    : readSystemPrefersDark(false)
  resolvedAppearanceMode = resolveAppearanceMode(appliedAppearanceSettings, { systemPrefersDark })
  ensureSystemAppearanceListener()

  if (typeof document !== 'undefined' && document?.documentElement?.style) {
    const root = document.documentElement
    const cssVars = buildThemeCssVariables(resolvedAppearanceMode)
    for (const [key, value] of Object.entries(cssVars)) {
      root.style.setProperty(key, value)
    }
    root.dataset.appAppearance = appliedAppearanceSettings.mode
    root.dataset.appTheme = resolvedAppearanceMode
    root.style.colorScheme = resolvedAppearanceMode
  }

  emitAppearanceChange()
  return {
    settings: { ...appliedAppearanceSettings },
    resolvedMode: resolvedAppearanceMode,
  }
}

export function getAppliedAppearanceSettings() {
  return { ...appliedAppearanceSettings }
}

export function getResolvedAppearanceMode() {
  return resolvedAppearanceMode
}

export function subscribeAppearanceChanges(listener) {
  if (typeof window === 'undefined' || typeof listener !== 'function') return () => {}
  const handler = (event) => listener(event?.detail || {
    settings: getAppliedAppearanceSettings(),
    resolvedMode: getResolvedAppearanceMode(),
  })
  window.addEventListener(APPEARANCE_CHANGE_EVENT, handler)
  return () => window.removeEventListener(APPEARANCE_CHANGE_EVENT, handler)
}

if (typeof window !== 'undefined') {
  applyAppearanceSettings({ mode: window?.addom?._initialAppearance || APPEARANCE_MODE_DARK })
}
