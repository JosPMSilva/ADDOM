import {
  DEFAULT_CHAT_TYPOGRAPHY_SETTINGS,
  normalizeChatTypographySettings,
} from '../common/chat/chat-typography-settings.mjs'
import {
  DEFAULT_UI_SCALING_SETTINGS,
  normalizeUiScalingSettings,
} from '../common/ui/ui-scaling-settings.mjs'
import {
  DEFAULT_BACKGROUND_TONE_SETTINGS,
  normalizeBackgroundToneSettings,
} from '../common/ui/background-tone-settings.mjs'
import { DEFAULT_APPEARANCE_SETTINGS, normalizeAppearanceSettings } from '../common/ui/appearance-settings.mjs'
import {
  DEFAULT_TERMINAL_SETTINGS,
  normalizeTerminalSettings,
} from '../common/terminal/terminal-settings.mjs'

export function applyUiSurfaceSettingsPatch(mergedPatch, patch, current) {
  if (patch?.chatTypography && typeof patch.chatTypography === 'object') {
    const currentChatTypography = normalizeChatTypographySettings(
      current.chatTypography,
      DEFAULT_CHAT_TYPOGRAPHY_SETTINGS,
    )
    mergedPatch.chatTypography = normalizeChatTypographySettings(
      {
        ...currentChatTypography,
        ...patch.chatTypography,
      },
      DEFAULT_CHAT_TYPOGRAPHY_SETTINGS,
    )
  }
  if (patch?.uiScaling && typeof patch.uiScaling === 'object') {
    const currentUiScaling = normalizeUiScalingSettings(
      current.uiScaling,
      DEFAULT_UI_SCALING_SETTINGS,
    )
    const rawUiScalingPatch = patch.uiScaling
    mergedPatch.uiScaling = normalizeUiScalingSettings(
      {
        ...currentUiScaling,
        ...(rawUiScalingPatch && typeof rawUiScalingPatch === 'object' ? rawUiScalingPatch : {}),
      },
      DEFAULT_UI_SCALING_SETTINGS,
    )
  }
  if (patch?.backgroundTone != null) {
    mergedPatch.backgroundTone = normalizeBackgroundToneSettings(
      patch.backgroundTone,
      normalizeBackgroundToneSettings(current.backgroundTone, DEFAULT_BACKGROUND_TONE_SETTINGS),
    )
  }
  if (patch?.appearance != null) {
    mergedPatch.appearance = normalizeAppearanceSettings(
      patch.appearance,
      normalizeAppearanceSettings(current.appearance, DEFAULT_APPEARANCE_SETTINGS),
    )
  }
  if (patch?.terminal && typeof patch.terminal === 'object') {
    const currentTerminal = normalizeTerminalSettings(
      current.terminal,
      DEFAULT_TERMINAL_SETTINGS,
    )
    mergedPatch.terminal = normalizeTerminalSettings(
      {
        ...currentTerminal,
        ...patch.terminal,
      },
      DEFAULT_TERMINAL_SETTINGS,
    )
  }
}
