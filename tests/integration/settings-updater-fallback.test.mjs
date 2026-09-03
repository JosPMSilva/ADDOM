import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isStaleSettingsPersistError,
  resolveUpdateCheckFallbackInfo,
  resolveUpdateCheckFallbackStatus,
} from '../../src/renderer/components/settings/settings-panel-runtime-and-storage.mjs'

test('unconfigured updater checks settle to the no-update state', () => {
  assert.equal(resolveUpdateCheckFallbackStatus({ status: 'dev-mode' }), 'not-available')
  assert.equal(resolveUpdateCheckFallbackStatus({ status: 'disabled' }), 'not-available')
})

test('configured updater checks continue to rely on updater events', () => {
  assert.equal(resolveUpdateCheckFallbackStatus({ ok: true }), null)
})

test('failed updater checks settle to the safe error state when no updater event arrives', () => {
  assert.equal(resolveUpdateCheckFallbackStatus({ ok: false, code: 'unavailable' }), 'error')
  assert.equal(resolveUpdateCheckFallbackStatus({ ok: false, code: 'network' }), 'error')
  assert.equal(resolveUpdateCheckFallbackStatus({ ok: false }), 'error')
  assert.deepEqual(
    resolveUpdateCheckFallbackInfo({
      ok: false,
      code: 'unavailable',
      message: 'set-cookie: _gh_sess=secret',
    }),
    { code: 'unavailable' },
  )
  assert.deepEqual(resolveUpdateCheckFallbackInfo({ ok: false, code: 'unsupported' }), { code: 'generic' })
  assert.equal(resolveUpdateCheckFallbackInfo({ ok: true }), null)
})

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
