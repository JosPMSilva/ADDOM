import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const REQUIRED_KEYS = [
  'menuAriaLabel',
  'copy',
  'showInFolder',
  'saveAs',
  'openWith',
  'defaultApp',
  'chooseAnotherApp',
  'copyFailed',
  'showInFolderFailed',
  'saveFailed',
  'openWithFailed',
]

test('every locale defines the complete attachment action vocabulary', () => {
  const localeRoot = path.resolve('src/renderer/i18n/locales')
  const localeNames = fs.readdirSync(localeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  assert.equal(localeNames.length, 16)

  for (const localeName of localeNames) {
    const catalog = JSON.parse(fs.readFileSync(path.join(localeRoot, localeName, 'core.json'), 'utf8'))
    const actions = catalog?.chat?.attachments?.actions
    assert.ok(actions, `${localeName} is missing chat.attachments.actions`)
    for (const key of REQUIRED_KEYS) {
      assert.equal(typeof actions[key], 'string', `${localeName} is missing ${key}`)
      assert.notEqual(actions[key].trim(), '', `${localeName}.${key} is empty`)
    }
  }
})
