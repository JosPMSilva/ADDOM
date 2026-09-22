import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isStaleSettingsPersistError,
} from '../../src/renderer/components/settings/settings-panel-runtime-and-storage.mjs'

test('isStaleSettingsPersistError detects rejected allowlist keys from older main handlers', () => {
  assert.equal(
    isStaleSettingsPersistError({
      code: 'settings_set_rejected_keys',
      rejectedKeys: ['backgroundTone'],
      message: 'settings:set cannot mutate advanced or dedicated settings: backgroundTone',
    }, 'backgroundTone'),
    true,
  )
  assert.equal(
    isStaleSettingsPersistError(
      new Error('settings:set cannot mutate advanced or dedicated settings: backgroundTone'),
      'backgroundTone',
    ),
    true,
  )
  assert.equal(
    isStaleSettingsPersistError(new Error('disk full'), 'backgroundTone'),
    false,
  )
})
