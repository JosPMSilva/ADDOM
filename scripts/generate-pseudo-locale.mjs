import fs from 'node:fs'
import path from 'node:path'

import { CANONICAL_TECHNICAL_TERMS } from '../src/common/i18n/technical-glossary.mjs'
import {
  LOCALES_ROOT,
  collectLocaleFiles,
  ensureDirectory,
  isDirectExecution,
  isPlainObject,
  readJsonFile,
} from './lib/i18n-locale-utils.mjs'

const PSEUDO_UI_LOCALE = 'en-XA'
const ACCENT_MAP = Object.freeze({
  a: 'à',
  b: 'ƀ',
  c: 'ç',
  d: 'ď',
  e: 'ë',
  f: 'ƒ',
  g: 'ğ',
  h: 'ħ',
  i: 'ï',
  j: 'ĵ',
  k: 'ķ',
  l: 'ľ',
  m: 'ṁ',
  n: 'ñ',
  o: 'õ',
  p: 'þ',
  q: 'ʠ',
  r: 'ř',
  s: 'š',
  t: 'ŧ',
  u: 'ü',
  v: 'ṽ',
  w: 'ŵ',
  x: 'ẋ',
  y: 'ÿ',
  z: 'ž',
  A: 'À',
  B: 'ß',
  C: 'Ç',
  D: 'Ď',
  E: 'Ë',
  F: 'Ƒ',
  G: 'Ğ',
  H: 'Ħ',
  I: 'Ï',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ľ',
  M: 'Ṁ',
  N: 'Ñ',
  O: 'Õ',
  P: 'Þ',
  Q: 'Ǫ',
  R: 'Ř',
  S: 'Š',
  T: 'Ŧ',
  U: 'Ü',
  V: 'Ṽ',
  W: 'Ŵ',
  X: 'Ẋ',
  Y: 'Ÿ',
  Z: 'Ž',
})

const PRESERVED_TECHNICAL_TERM_PATTERN = new RegExp(
  CANONICAL_TECHNICAL_TERMS
    .map((term) => String(term || '').trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'g',
)

function captureBraceBlock(source, startIndex) {
  let depth = 0

  for (let index = startIndex; index < source.length; index += 1) {
    const current = source[index]
    if (current === '{') depth += 1
    if (current === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(startIndex, index + 1)
      }
    }
  }

  return ''
}

function accentLiteralCharacters(text) {
  return text.replace(/[A-Za-z]/g, (character) => ACCENT_MAP[character] || character)
}

function pseudoLocalizeLiteral(text) {
  if (!text) return text
  if (!PRESERVED_TECHNICAL_TERM_PATTERN.source) return accentLiteralCharacters(text)

  let cursor = 0
  let output = ''
  for (const match of text.matchAll(PRESERVED_TECHNICAL_TERM_PATTERN)) {
    const matchIndex = match.index ?? 0
    output += accentLiteralCharacters(text.slice(cursor, matchIndex))
    output += match[0]
    cursor = matchIndex + match[0].length
  }
  output += accentLiteralCharacters(text.slice(cursor))
  return output
}

function buildPseudoPadding(message) {
  const visibleLength = String(message || '')
    .replace(/\{\{[\s\S]*?\}\}/g, '')
    .replace(/\{[\s\S]*?\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .length

  const paddingUnits = Math.max(2, Math.ceil(visibleLength / 12))
  return ` ${'~'.repeat(paddingUnits)}`
}

export function pseudoLocalizeMessage(message) {
  const rawMessage = String(message ?? '')
  if (!rawMessage) return rawMessage

  const match = rawMessage.match(/^(\s*)([\s\S]*?)(\s*)$/)
  const leadingWhitespace = match?.[1] ?? ''
  const coreMessage = match?.[2] ?? rawMessage
  const trailingWhitespace = match?.[3] ?? ''
  if (!coreMessage) return rawMessage
  if (/^\[\[canon:[a-z0-9_]+\]\]$/i.test(coreMessage)) {
    return `${leadingWhitespace}${coreMessage}${trailingWhitespace}`
  }

  let output = ''
  let cursor = 0

  while (cursor < coreMessage.length) {
    if (coreMessage.startsWith('[[canon:', cursor)) {
      const endIndex = coreMessage.indexOf(']]', cursor + 8)
      if (endIndex === -1) {
        output += coreMessage.slice(cursor)
        break
      }
      output += coreMessage.slice(cursor, endIndex + 2)
      cursor = endIndex + 2
      continue
    }

    if (coreMessage.startsWith('{{', cursor)) {
      const endIndex = coreMessage.indexOf('}}', cursor + 2)
      if (endIndex === -1) {
        output += coreMessage.slice(cursor)
        break
      }
      output += coreMessage.slice(cursor, endIndex + 2)
      cursor = endIndex + 2
      continue
    }

    if (coreMessage[cursor] === '{') {
      const block = captureBraceBlock(coreMessage, cursor)
      if (!block) {
        output += coreMessage[cursor]
        cursor += 1
        continue
      }
      output += block
      cursor += block.length
      continue
    }

    const nextPlaceholderIndex = coreMessage.indexOf('{', cursor)
    const nextCanonicalMarkerIndex = coreMessage.indexOf('[[canon:', cursor)
    const nextLiteralBoundary = [nextPlaceholderIndex, nextCanonicalMarkerIndex]
      .filter((index) => index !== -1)
      .sort((left, right) => left - right)[0] ?? coreMessage.length
    output += pseudoLocalizeLiteral(coreMessage.slice(cursor, nextLiteralBoundary))
    cursor = nextLiteralBoundary
  }

  return `${leadingWhitespace}[${output}${buildPseudoPadding(coreMessage)}]${trailingWhitespace}`
}

export function transformLocaleResource(value) {
  if (typeof value === 'string') {
    return pseudoLocalizeMessage(value)
  }
  if (Array.isArray(value)) {
    return value.map((entry) => transformLocaleResource(entry))
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, transformLocaleResource(entry)]),
    )
  }
  return value
}

export function generatePseudoLocale({
  sourceLocaleDir = path.join(LOCALES_ROOT, 'en'),
  targetLocaleDir = path.join(LOCALES_ROOT, PSEUDO_UI_LOCALE),
} = {}) {
  const sourceFiles = collectLocaleFiles(sourceLocaleDir)
  let writtenFiles = 0

  ensureDirectory(targetLocaleDir)

  for (const [relativePath, absolutePath] of sourceFiles) {
    const targetPath = path.join(targetLocaleDir, relativePath)
    ensureDirectory(path.dirname(targetPath))

    const transformedResource = transformLocaleResource(readJsonFile(absolutePath))
    fs.writeFileSync(
      targetPath,
      `${JSON.stringify(transformedResource, null, 2)}\n`,
      'utf8',
    )
    writtenFiles += 1
  }

  return { writtenFiles, targetLocaleDir }
}

function runCli() {
  const result = generatePseudoLocale()
  console.log(`Generated ${PSEUDO_UI_LOCALE} locale files: ${result.writtenFiles}`)
  console.log(`Output directory: ${result.targetLocaleDir}`)
}

if (isDirectExecution(import.meta.url)) {
  runCli()
}
