import test from 'node:test'
import assert from 'node:assert/strict'

import { buildBrowserActionFailureGuidance } from '../../src/main/tools/browser-tool-failures.mjs'

function buildInspectionPage(elements = []) {
  return {
    evaluate: async () => ({
      url: 'http://localhost:5173/form',
      title: 'Form',
      elements,
    }),
  }
}

test('browser failure guidance classifies native option clicks', async () => {
  const result = await buildBrowserActionFailureGuidance({
    action: 'click',
    input: { selector: 'select option[value="safe"]' },
    error: new Error('Cannot click native <option> elements directly.'),
  })

  assert.match(result, /native <option>/)
  assert.match(result, /parent <select>/)
  assert.match(result, /list_options/)
  assert.match(result, /select_option/)
})

test('browser failure guidance classifies hidden or detached elements with selector hints', async () => {
  const page = buildInspectionPage([
    {
      tag: 'button',
      role: 'button',
      name: 'Save',
      hidden: true,
      attributes: { id: 'save' },
    },
  ])

  const result = await buildBrowserActionFailureGuidance({
    action: 'click',
    input: { selector: '#save' },
    page,
    error: new Error('Element is not attached to the DOM'),
  })

  assert.match(result, /hidden, detached, outside the viewport, or not stable/)
  assert.match(result, /Candidate selectors: <button> role=button name="Save" hidden selector=#save/)
})

test('browser failure guidance classifies strict mode multiple matches', async () => {
  const result = await buildBrowserActionFailureGuidance({
    action: 'click',
    input: { selector: 'button' },
    error: new Error('strict mode violation: locator("button") resolved to 2 elements'),
  })

  assert.match(result, /matched multiple elements/)
  assert.match(result, /one unique target/)
  assert.match(result, /inspect or find_elements/)
})

test('browser failure guidance classifies missing select value or label and lists options', async () => {
  const page = {
    evaluate: async () => [
      { value: 'fast', label: 'Fast mode' },
      { value: 'safe', label: 'Safe mode', disabled: true },
    ],
  }

  const result = await buildBrowserActionFailureGuidance({
    action: 'select_option',
    input: { selector: 'select[name="mode"]' },
    page,
    error: new Error('Either value or label is required for the select_option action.'),
  })

  assert.match(result, /missing an option value or label/)
  assert.match(result, /exact option value or label/)
  assert.match(result, /Available options: "fast" \(Fast mode\), "safe" \(Safe mode disabled\)\./)
})

test('browser failure guidance classifies non-fillable targets', async () => {
  const result = await buildBrowserActionFailureGuidance({
    action: 'type',
    input: { selector: 'button.save' },
    error: new Error('Element is not an <input>, <textarea> or [contenteditable] element'),
  })

  assert.match(result, /cannot receive typed text/)
  assert.match(result, /editable input, textarea, or contenteditable/)
  assert.match(result, /suggested action is type/)
})

test('browser failure guidance classifies visible selector timeouts', async () => {
  const result = await buildBrowserActionFailureGuidance({
    action: 'wait_for',
    input: { selector: '#ready' },
    error: new Error('Timeout 5000ms exceeded while waiting for selector "#ready" to be visible'),
  })

  assert.match(result, /did not become visible/)
  assert.match(result, /be visible, and be ready/)
  assert.match(result, /inspect with include_hidden/)
})

test('browser failure guidance preserves unknown errors', async () => {
  const result = await buildBrowserActionFailureGuidance({
    action: 'click',
    input: { selector: '#save' },
    error: new Error('unexpected browser process crash'),
  })

  assert.equal(result, null)
})
