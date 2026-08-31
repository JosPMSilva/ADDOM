import {
  CHAT_TYPOGRAPHY_TOKEN_KEYS,
  chatTypographyKeyToCssVar,
  normalizeChatTypographySettings,
} from '../../../common/chat/chat-typography-settings.mjs'

const ABSOLUTE_UNIT_VALUE_PATTERN = /^(-?\d*\.?\d+)(px|rem)$/i

function scaleAbsoluteTypographyValue(rawValue, scale) {
  const normalizedValue = String(rawValue || '').trim()
  if (!normalizedValue) return ''
  if (scale === 1) return normalizedValue

  const match = ABSOLUTE_UNIT_VALUE_PATTERN.exec(normalizedValue)
  if (!match) return normalizedValue

  const numericValue = Number(match[1])
  const unit = String(match[2] || '').toLowerCase()
  if (!Number.isFinite(numericValue) || !unit) return normalizedValue

  const scaledValue = Math.round(numericValue * scale * 1000) / 1000
  return `${scaledValue}${unit}`
}

export function applyChatTypographySettings(rawSettings) {
  if (
    typeof document === 'undefined'
    || !document?.documentElement?.style
    || typeof window?.getComputedStyle !== 'function'
  ) return

  const rootStyle = document.documentElement.style
  const { scale } = normalizeChatTypographySettings(rawSettings)

  for (const key of CHAT_TYPOGRAPHY_TOKEN_KEYS) {
    const cssVarName = chatTypographyKeyToCssVar(key)
    rootStyle.removeProperty(cssVarName)
  }

  if (scale === 1) return

  const computedStyles = window.getComputedStyle(document.documentElement)

  for (const key of CHAT_TYPOGRAPHY_TOKEN_KEYS) {
    const cssVarName = chatTypographyKeyToCssVar(key)
    const baseValue = computedStyles.getPropertyValue(cssVarName).trim()
    const scaledValue = scaleAbsoluteTypographyValue(baseValue, scale)
    if (scaledValue && scaledValue !== baseValue) {
      rootStyle.setProperty(cssVarName, scaledValue)
    }
  }
}
