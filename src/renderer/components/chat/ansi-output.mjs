const ESC = String.fromCharCode(0x1b)
const BEL = String.fromCharCode(0x07)
const CSI = String.fromCharCode(0x9b)
const NUL = String.fromCharCode(0)
const BOM = String.fromCharCode(0xfeff)
const REPLACEMENT = String.fromCharCode(0xfffd)

const OSC_SEQUENCE = new RegExp(`${ESC}\\][^${BEL}]*(?:${BEL}|${ESC}\\\\)`, 'g')
const ANSI_SEQUENCE = new RegExp(`[${ESC}${CSI}]\\[[0-?]*[ -/]*[@-~]`, 'g')
const SINGLE_ESCAPE_SEQUENCE = new RegExp(`[${ESC}${CSI}][()#][0-2A-ORZcf-nqry=><]`, 'g')

function stripNonTextControlCharacters(value = '') {
  return Array.from(String(value || '')).filter((char) => {
    const code = char.charCodeAt(0)
    return !(
      code === 0x7f
      || (code >= 0x00 && code <= 0x08)
      || code === 0x0b
      || code === 0x0c
      || (code >= 0x0e && code <= 0x1a)
      || (code >= 0x1c && code <= 0x1f)
    )
  }).join('')
}

function stripKnownDecodePrefixes(value = '') {
  let text = String(value || '')
  if (text.startsWith(BOM)) text = text.slice(BOM.length)
  for (let index = 0; index < 2 && text.startsWith(REPLACEMENT); index += 1) {
    text = text.slice(REPLACEMENT.length)
  }
  const lower = text.toLowerCase()
  if (lower.startsWith('ÿþ') || lower.startsWith('þÿ')) return text.slice(2)
  return text
}

function stripMisdecodedUtf16Artifacts(value = '') {
  let text = String(value || '')
  if (text.includes(NUL)) {
    text = stripKnownDecodePrefixes(text.replaceAll(NUL, ''))
  }
  return text
}

export function stripAnsiControlSequences(value = '') {
  const strippedAnsi = stripMisdecodedUtf16Artifacts(value)
    .replace(OSC_SEQUENCE, '')
    .replace(ANSI_SEQUENCE, '')
    .replace(SINGLE_ESCAPE_SEQUENCE, '')
  return stripNonTextControlCharacters(strippedAnsi)
}
