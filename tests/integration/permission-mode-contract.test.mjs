import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizePermissionMode,
  resolvePermissionModeFromLegacySettings,
} from '../../src/common/chat/permission-mode.mjs'

test('normalizePermissionMode accepts full_access and legacy full aliases', () => {
  assert.equal(normalizePermissionMode('full_access'), 'full_access')
  assert.equal(normalizePermissionMode('full_permissions'), 'full_access')
  assert.equal(normalizePermissionMode('full'), 'full_access')
  assert.equal(normalizePermissionMode('unknown_mode', 'full_access'), 'full_access')
})

test('resolvePermissionModeFromLegacySettings maps legacy full_permissions without restrictions to full_access', () => {
  assert.equal(resolvePermissionModeFromLegacySettings({
    commandSafety: {
      commandAccessMode: 'full_permissions',
    },
  }), 'full_access')
})

test('resolvePermissionModeFromLegacySettings keeps ask when legacy restrictions are explicit', () => {
  assert.equal(resolvePermissionModeFromLegacySettings({
    commandSafety: {
      commandAccessMode: 'full_permissions',
    },
    webBrowsingEnabled: false,
  }), 'ask')
})
