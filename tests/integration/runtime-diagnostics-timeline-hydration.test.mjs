import test from 'node:test'
import assert from 'node:assert/strict'

import { mapTimelineFromPersistedEvents } from '../../src/renderer/store/chat/timeline-hydration.mjs'

test('runtime_diagnostics timeline events hydrate into warning activities', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 1,
      createdAt: 1_700_000_000_000,
      kind: 'runtime_diagnostics',
      role: 'system',
      content: 'Runtime diagnostics: mixed tool surface detected',
      turnId: 'turn_1',
      meta: {
        threadId: 'thread_1',
        turnId: 'turn_1',
        type: 'warning',
        label: 'Runtime diagnostics: mixed tool surface detected',
        detail: 'mixed_tool_surface_detected: true',
      },
    },
  ])

  assert.equal(mapped.toolActivity.length, 1)
  assert.equal(mapped.toolActivity[0].eventKind, 'runtime_diagnostics')
  assert.equal(mapped.toolActivity[0].type, 'warning')
  assert.equal(mapped.toolActivity[0].label, 'Runtime diagnostics: mixed tool surface detected')
  assert.equal(mapped.toolActivity[0].detail, 'mixed_tool_surface_detected: true')
})

test('runtime_diagnostics timeline events preserve sanitized info activities for adaptive budget notes', () => {
  const mapped = mapTimelineFromPersistedEvents([
    {
      eventId: 2,
      createdAt: 1_700_000_000_100,
      kind: 'runtime_diagnostics',
      role: 'system',
      content: 'Adaptive budget: moderate for this turn',
      turnId: 'turn_2',
      meta: {
        threadId: 'thread_2',
        turnId: 'turn_2',
        type: 'info',
        label: 'Adaptive budget: moderate for this turn',
        detail: 'source: learned provider budget\nreason: recent provider feedback supports a balanced prompt budget.',
      },
    },
  ])

  assert.equal(mapped.toolActivity.length, 1)
  assert.equal(mapped.toolActivity[0].eventKind, 'runtime_diagnostics')
  assert.equal(mapped.toolActivity[0].type, 'info')
  assert.equal(mapped.toolActivity[0].label, 'Adaptive budget: moderate for this turn')
  assert.equal(
    mapped.toolActivity[0].detail,
    'source: learned provider budget\nreason: recent provider feedback supports a balanced prompt budget.',
  )
})
