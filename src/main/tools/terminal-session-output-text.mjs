import {
  asTrimmedString,
  createTerminalSessionError,
} from './terminal-session-manager-normalizers.mjs'

const ESC = String.fromCharCode(0x1b)
const BEL = String.fromCharCode(0x07)
const CSI = String.fromCharCode(0x9b)

const OSC_SEQUENCE = new RegExp(`${ESC}\\][^${BEL}]*(?:${BEL}|${ESC}\\\\)`, 'g')
const ANSI_SEQUENCE = new RegExp(`[${ESC}${CSI}]\\[[0-?]*[ -/]*[@-~]`, 'g')
const SINGLE_ESCAPE_SEQUENCE = new RegExp(`[${ESC}${CSI}][()#][0-2A-ORZcf-nqry=><]`, 'g')

export function stripTerminalAnsi(value = '') {
  return String(value || '')
    .replace(OSC_SEQUENCE, '')
    .replace(ANSI_SEQUENCE, '')
    .replace(SINGLE_ESCAPE_SEQUENCE, '')
}

export function createTerminalOutputMatcher({
  pattern = '',
  text = '',
} = {}) {
  const normalizedPattern = asTrimmedString(pattern)
  const literalText = String(text ?? '')
  const hasPattern = normalizedPattern.length > 0
  const hasText = literalText.length > 0

  if (hasPattern && hasText) {
    throw createTerminalSessionError(
      'terminal_session_wait_matcher_ambiguous',
      'Specify either pattern or text, not both, when waiting for terminal output.',
    )
  }
  if (!hasPattern && !hasText) {
    throw createTerminalSessionError(
      'terminal_session_wait_matcher_missing',
      'Waiting for terminal output requires either pattern or text.',
    )
  }

  if (hasPattern) {
    let regex = null
    try {
      regex = new RegExp(normalizedPattern, 'm')
    } catch (error) {
      throw createTerminalSessionError(
        'terminal_session_wait_pattern_invalid',
        `Terminal wait pattern is invalid: ${asTrimmedString(error?.message || error) || normalizedPattern}`,
      )
    }
    return {
      matchType: 'pattern',
      pattern: normalizedPattern,
      text: '',
      matches(value = '') {
        const source = String(value || '')
        return regex.test(source)
      },
    }
  }

  return {
    matchType: 'text',
    pattern: '',
    text: literalText,
    matches(value = '') {
      return String(value || '').includes(literalText)
    },
  }
}
