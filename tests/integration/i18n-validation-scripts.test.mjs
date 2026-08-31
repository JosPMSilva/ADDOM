import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { validateI18nEncoding } from '../../scripts/check-i18n-encoding.mjs'
import { validateI18nKeys } from '../../scripts/check-i18n-keys.mjs'
import {
  extractI18nPlaceholders,
  validateI18nPlaceholders,
} from '../../scripts/check-i18n-placeholders.mjs'
import {
  generatePseudoLocale,
  pseudoLocalizeMessage,
} from '../../scripts/generate-pseudo-locale.mjs'

function createLocalesFixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-i18n-fixture-'))
  const localesRoot = path.join(rootDir, 'locales')
  fs.mkdirSync(path.join(localesRoot, 'en'), { recursive: true })
  return { rootDir, localesRoot }
}

function writeLocaleJson(localesRoot, localeCode, fileName, value) {
  const localeDir = path.join(localesRoot, localeCode)
  fs.mkdirSync(localeDir, { recursive: true })
  fs.writeFileSync(
    path.join(localeDir, fileName),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  )
}

test('i18n validation scripts pass on the checked-in locale baseline', () => {
  assert.equal(validateI18nEncoding().issues.length, 0)
  assert.equal(validateI18nKeys().issues.length, 0)
  assert.equal(validateI18nPlaceholders().issues.length, 0)
})

test('i18n encoding validation rejects non-UTF-8 locale files', () => {
  const { rootDir, localesRoot } = createLocalesFixture()
  try {
    fs.mkdirSync(path.join(localesRoot, 'fr'), { recursive: true })
    fs.writeFileSync(
      path.join(localesRoot, 'fr', 'core.json'),
      Buffer.from([0x7b, 0x22, 0x74, 0x69, 0x74, 0x6c, 0x65, 0x22, 0x3a, 0x22, 0xe9, 0x22, 0x7d]),
    )

    const result = validateI18nEncoding({ localesRoot })
    assert.equal(result.issues.some((issue) => issue.type === 'invalid_utf8'), true)
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true })
  }
})

test('i18n key and placeholder validation reject drift from English baseline', () => {
  const { rootDir, localesRoot } = createLocalesFixture()
  try {
    writeLocaleJson(localesRoot, 'en', 'core.json', {
      dialog: {
        title: 'Open {{name}}',
        summary: '{count, plural, one {# file} other {# files}}',
      },
    })

    writeLocaleJson(localesRoot, 'fr', 'core.json', {
      dialog: {
        title: 'Ouvrir {{title}}',
      },
    })

    const keyResult = validateI18nKeys({ localesRoot })
    const placeholderResult = validateI18nPlaceholders({ localesRoot })

    assert.equal(keyResult.issues.some((issue) => issue.type === 'missing_key'), true)
    assert.equal(placeholderResult.issues.some((issue) => issue.type === 'placeholder_mismatch'), true)
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true })
  }
})

test('pseudo locale generation preserves placeholders and canonical technical terms', () => {
  const { rootDir, localesRoot } = createLocalesFixture()
  try {
    writeLocaleJson(localesRoot, 'en', 'core.json', {
      dialog: {
        title: 'ADDOM opens {{count}} files',
      },
    })

    const result = generatePseudoLocale({
      sourceLocaleDir: path.join(localesRoot, 'en'),
      targetLocaleDir: path.join(localesRoot, 'en-XA'),
    })

    const generated = JSON.parse(
      fs.readFileSync(path.join(localesRoot, 'en-XA', 'core.json'), 'utf8'),
    )

    assert.equal(result.writtenFiles, 1)
    assert.match(generated.dialog.title, /\[.*ADDOM.*\{\{count\}\}.*\]/)
    assert.notEqual(generated.dialog.title, 'ADDOM opens {{count}} files')
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true })
  }
})

test('pseudo locale helper keeps ICU and interpolation placeholders discoverable', () => {
  const message = pseudoLocalizeMessage('Updated {{date}} for {count, plural, one {# file} other {# files}}')
  assert.deepEqual(
    [...extractI18nPlaceholders(message)].sort(),
    ['count', 'date'],
  )
})
