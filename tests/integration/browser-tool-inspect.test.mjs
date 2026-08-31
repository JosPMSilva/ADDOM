import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeBrowserElementSummary,
  normalizeBrowserPageInspection,
} from '../../src/main/tools/browser-tool-inspect.mjs'

test('browser inspect normalization produces bounded element summaries', () => {
  const summary = normalizeBrowserElementSummary({
    index: 7,
    tagName: 'INPUT',
    attributes: {
      type: 'checkbox',
      'aria-label': 'Enable sync',
      'data-testid': 'sync-toggle',
    },
    checked: true,
    disabled: false,
    rect: { x: 10.4, y: 20.5, width: 30.6, height: 40.1 },
  }, 0)

  assert.equal(summary.index, 7)
  assert.equal(summary.tag, 'input')
  assert.equal(summary.role, 'checkbox')
  assert.equal(summary.name, 'Enable sync')
  assert.equal(summary.checked, true)
  assert.equal(summary.disabled, false)
  assert.equal(summary.hidden, false)
  assert.deepEqual(summary.boundingBox, { x: 10, y: 21, width: 31, height: 40 })
  assert.deepEqual(summary.suggestedActions, ['click'])
  assert.equal(summary.selectors[0].selector, '[data-testid="sync-toggle"]')
})

test('browser page inspection preserves total count while limiting returned elements', () => {
  const page = normalizeBrowserPageInspection({
    url: ' https://example.test/form ',
    title: ' Example Form ',
    elements: [
      { tag: 'button', text: 'First' },
      { tag: 'select', name: 'Mode' },
      { tag: 'textarea', placeholder: 'Notes' },
    ],
  }, { limit: 2 })

  assert.equal(page.url, 'https://example.test/form')
  assert.equal(page.title, 'Example Form')
  assert.equal(page.elementCount, 3)
  assert.equal(page.elements.length, 2)
  assert.deepEqual(page.elements[0].suggestedActions, ['click'])
  assert.deepEqual(page.elements[1].suggestedActions, ['list_options', 'select_option'])
})
