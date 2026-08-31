import test from 'node:test'
import assert from 'node:assert/strict'

import {
  BACKGROUND_TONE_IDS,
  BACKGROUND_TONE_GRAPHITE,
  DEFAULT_BACKGROUND_TONE_SETTINGS,
  buildBackgroundToneCssVars,
  listBackgroundTonePresets,
  normalizeBackgroundToneSettings,
  resolveBackgroundTonePreset,
} from '../../src/common/ui/background-tone-settings.mjs'

test('normalizeBackgroundToneSettings defaults to graphite and rejects unknown tones', () => {
  assert.deepEqual(
    normalizeBackgroundToneSettings(null),
    DEFAULT_BACKGROUND_TONE_SETTINGS,
  )
  assert.deepEqual(
    normalizeBackgroundToneSettings({ tone: 'neon' }),
    { tone: BACKGROUND_TONE_GRAPHITE },
  )
  assert.deepEqual(
    normalizeBackgroundToneSettings('ash'),
    { tone: 'ash' },
  )
})

test('listBackgroundTonePresets spans darker to lighter with graphite in the middle', () => {
  const presets = listBackgroundTonePresets()
  assert.deepEqual(presets.map((preset) => preset.id), [...BACKGROUND_TONE_IDS])
  assert.equal(BACKGROUND_TONE_IDS[2], BACKGROUND_TONE_GRAPHITE)
  assert.equal(presets[2].tokens.surface, '#0b0c0c')
})

test('buildBackgroundToneCssVars shifts the shared surface stack for each tone', () => {
  const graphite = buildBackgroundToneCssVars({ tone: 'graphite' })
  const ash = buildBackgroundToneCssVars({ tone: 'ash' })
  const obsidian = buildBackgroundToneCssVars({ tone: 'obsidian' })

  assert.equal(graphite['--color-surface'], '#0b0c0c')
  assert.equal(graphite['--color-surface-panel'], '#1a1c1a')
  assert.equal(ash['--color-surface'], '#151715')
  assert.equal(obsidian['--color-surface'], '#050505')
  assert.equal(ash['--color-chat-surface'], resolveBackgroundTonePreset({ tone: 'ash' }).tokens.panelAlt)
  assert.match(ash['--color-surface-panel-muted'], /^rgb\(/)
})
