import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_UI_SCALING_SETTINGS,
  buildUiScalingCssVars,
  normalizeUiScalingSettings,
  resolveAutoUiScale,
  resolveEffectiveUiScale,
  scaleDesignPixels,
} from '../../src/common/ui/ui-scaling-settings.mjs'

test('normalizeUiScalingSettings keeps defaults for invalid payloads', () => {
  assert.deepEqual(
    normalizeUiScalingSettings(null),
    DEFAULT_UI_SCALING_SETTINGS,
  )
  assert.deepEqual(
    normalizeUiScalingSettings({ mode: 'nope', scale: 99 }),
    { mode: 'auto', scale: 1.15 },
  )
})

test('resolveAutoUiScale follows effective viewport size instead of raw monitor resolution', () => {
  assert.equal(resolveAutoUiScale({ viewportWidth: 1280, viewportHeight: 720 }), 0.9)
  assert.equal(resolveAutoUiScale({ viewportWidth: 1600, viewportHeight: 900 }), 1)
  assert.equal(resolveAutoUiScale({ viewportWidth: 2560, viewportHeight: 1440 }), 1.05)
})

test('resolveEffectiveUiScale honors manual override scale', () => {
  assert.equal(
    resolveEffectiveUiScale({ mode: 'manual', scale: 0.95 }, { viewportWidth: 2560, viewportHeight: 1440 }),
    0.95,
  )
})

test('buildUiScalingCssVars scales shell geometry tokens together', () => {
  const vars = buildUiScalingCssVars(0.9)
  assert.equal(vars['--app-sidebar-expanded-width'], `${scaleDesignPixels(160, 0.9)}px`)
  assert.equal(vars['--app-thread-drawer-default-width'], `${scaleDesignPixels(260, 0.9)}px`)
  assert.equal(vars['--app-chat-content-max-width'], `${scaleDesignPixels(980, 0.9)}px`)
  assert.equal(vars['--app-chat-companion-width'], `${scaleDesignPixels(300, 0.9)}px`)
  assert.equal(vars['--app-moa-panel-width'], undefined)
})
