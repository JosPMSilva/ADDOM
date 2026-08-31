import {
  DEFAULT_THEME_COLORS as colors,
  DEFAULT_THEME_COLOR_CHANNELS as channels,
} from './theme-color-contract.mjs'

export const BACKGROUND_TONE_OBSIDIAN = 'obsidian'
export const BACKGROUND_TONE_CHARCOAL = 'charcoal'
export const BACKGROUND_TONE_GRAPHITE = 'graphite'
export const BACKGROUND_TONE_SLATE = 'slate'
export const BACKGROUND_TONE_ASH = 'ash'

export const BACKGROUND_TONE_IDS = Object.freeze([
  BACKGROUND_TONE_OBSIDIAN,
  BACKGROUND_TONE_CHARCOAL,
  BACKGROUND_TONE_GRAPHITE,
  BACKGROUND_TONE_SLATE,
  BACKGROUND_TONE_ASH,
])

function hexToRgbChannels(hex) {
  const normalized = String(hex || '').trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return channels.surfacePanel
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return `${red} ${green} ${blue}`
}

function buildToneTokens({
  surface,
  raised,
  panelAlt,
  panel,
  border,
  borderStrong,
  borderHover,
  infoBg,
  infoBgHover,
}) {
  const panelChannels = hexToRgbChannels(panel)
  return Object.freeze({
    surface,
    raised,
    panelAlt,
    panel,
    border,
    borderStrong,
    borderHover,
    infoBg,
    infoBgHover,
    panelMuted: `rgb(${panelChannels} / 0.55)`,
    panelMutedStrong: `rgb(${panelChannels} / 0.72)`,
  })
}

/** Current product stack is Graphite (middle preset). */
export const BACKGROUND_TONE_PRESETS = Object.freeze({
  [BACKGROUND_TONE_OBSIDIAN]: Object.freeze({
    id: BACKGROUND_TONE_OBSIDIAN,
    swatch: '#050505',
    tokens: buildToneTokens({
      surface: '#050505',
      raised: '#0a0b0a',
      panelAlt: '#0f100f',
      panel: '#141614',
      border: '#242724',
      borderStrong: '#383b36',
      borderHover: '#4e524a',
      infoBg: '#181b18',
      infoBgHover: '#1e221e',
    }),
  }),
  [BACKGROUND_TONE_CHARCOAL]: Object.freeze({
    id: BACKGROUND_TONE_CHARCOAL,
    swatch: '#080909',
    tokens: buildToneTokens({
      surface: '#080909',
      raised: '#0d0e0d',
      panelAlt: '#121412',
      panel: '#171917',
      border: '#292c28',
      borderStrong: '#3e4239',
      borderHover: '#565a51',
      infoBg: '#1c1f1c',
      infoBgHover: '#232623',
    }),
  }),
  [BACKGROUND_TONE_GRAPHITE]: Object.freeze({
    id: BACKGROUND_TONE_GRAPHITE,
    swatch: colors.surface,
    tokens: buildToneTokens({
      surface: colors.surface,
      raised: colors.surfaceRaised,
      panelAlt: colors.surfacePanelAlt,
      panel: colors.surfacePanel,
      border: colors.surfaceBorder,
      borderStrong: colors.borderStrong,
      borderHover: colors.borderHover,
      infoBg: colors.surfacePanelHover,
      infoBgHover: colors.surfacePanelStrong,
    }),
  }),
  [BACKGROUND_TONE_SLATE]: Object.freeze({
    id: BACKGROUND_TONE_SLATE,
    swatch: '#101211',
    tokens: buildToneTokens({
      surface: '#101211',
      raised: '#151715',
      panelAlt: '#1a1c1a',
      panel: '#20231f',
      border: '#383b36',
      borderStrong: '#4e524a',
      borderHover: '#686c63',
      infoBg: '#272a25',
      infoBgHover: '#2f332e',
    }),
  }),
  [BACKGROUND_TONE_ASH]: Object.freeze({
    id: BACKGROUND_TONE_ASH,
    swatch: '#151715',
    tokens: buildToneTokens({
      surface: '#151715',
      raised: '#1a1c1a',
      panelAlt: '#20231f',
      panel: '#272a25',
      border: '#44483f',
      borderStrong: '#5e6258',
      borderHover: '#787c73',
      infoBg: '#2f332e',
      infoBgHover: '#383c37',
    }),
  }),
})

export const DEFAULT_BACKGROUND_TONE_SETTINGS = Object.freeze({
  tone: BACKGROUND_TONE_GRAPHITE,
})

export function listBackgroundTonePresets() {
  return BACKGROUND_TONE_IDS.map((id) => BACKGROUND_TONE_PRESETS[id])
}

export function normalizeBackgroundToneId(rawTone, fallback = DEFAULT_BACKGROUND_TONE_SETTINGS.tone) {
  const normalizedFallback = BACKGROUND_TONE_IDS.includes(String(fallback || '').trim().toLowerCase())
    ? String(fallback || '').trim().toLowerCase()
    : DEFAULT_BACKGROUND_TONE_SETTINGS.tone
  const normalized = String(rawTone || '').trim().toLowerCase()
  return BACKGROUND_TONE_IDS.includes(normalized) ? normalized : normalizedFallback
}

export function normalizeBackgroundToneSettings(raw, defaults = DEFAULT_BACKGROUND_TONE_SETTINGS) {
  const fallback = defaults && typeof defaults === 'object'
    ? defaults
    : DEFAULT_BACKGROUND_TONE_SETTINGS
  if (typeof raw === 'string') {
    return {
      tone: normalizeBackgroundToneId(raw, fallback.tone),
    }
  }
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    tone: normalizeBackgroundToneId(source.tone, fallback.tone),
  }
}

export function resolveBackgroundTonePreset(settings = DEFAULT_BACKGROUND_TONE_SETTINGS) {
  const normalized = normalizeBackgroundToneSettings(settings)
  return BACKGROUND_TONE_PRESETS[normalized.tone] || BACKGROUND_TONE_PRESETS[BACKGROUND_TONE_GRAPHITE]
}

export function buildBackgroundToneCssVars(settings = DEFAULT_BACKGROUND_TONE_SETTINGS) {
  const { tokens } = resolveBackgroundTonePreset(settings)
  return {
    '--color-surface': tokens.surface,
    '--color-surface-raised': tokens.raised,
    '--color-surface-border': tokens.border,
    '--color-surface-panel': tokens.panel,
    '--color-surface-panel-alt': tokens.panelAlt,
    '--color-surface-panel-muted': tokens.panelMuted,
    '--color-surface-panel-muted-strong': tokens.panelMutedStrong,
    '--color-chat-surface': tokens.panelAlt,
    '--color-chat-border': tokens.border,
    '--color-chat-user-surface': tokens.panel,
    '--color-chat-user-border': tokens.borderStrong,
    '--color-border-strong': tokens.borderStrong,
    '--color-border-hover': tokens.borderHover,
    '--color-info-bg': tokens.infoBg,
    '--color-info-bg-hover': tokens.infoBgHover,
  }
}
