import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSelectorCandidates } from '../../src/main/tools/browser-tool-selectors.mjs'

test('selector candidates prefer stable attributes before positional selectors', () => {
  const candidates = buildSelectorCandidates({
    tag: 'button',
    id: 'save-button',
    attributes: {
      'data-testid': 'save',
      'aria-label': 'Save changes',
    },
    role: 'button',
    name: 'Save',
    nthOfTypeSelector: 'main > button:nth-of-type(2)',
  })

  assert.deepEqual(candidates.map((candidate) => candidate.type), [
    'id',
    'testid',
    'aria-label',
    'role-name',
  ])
  assert.equal(candidates[0].selector, '#save-button')
  assert.equal(candidates.some((candidate) => candidate.type === 'nth-of-type'), false)
})

test('selector candidates escape attribute values and keep role metadata separate', () => {
  const candidates = buildSelectorCandidates({
    tag: 'input',
    attributes: {
      'data-cy': 'project "name"',
    },
    role: 'textbox',
    name: 'Project name',
  })

  assert.deepEqual(candidates, [
    {
      type: 'testid',
      attribute: 'data-cy',
      selector: '[data-cy="project \\"name\\""]',
      reason: 'data-cy',
    },
    {
      type: 'role-name',
      role: 'textbox',
      name: 'Project name',
      reason: 'accessibility',
    },
  ])
})

test('selector candidates include nth-of-type only when no stronger css selector exists', () => {
  const candidates = buildSelectorCandidates({
    tag: 'button',
    role: 'button',
    name: 'Delete',
    nthOfTypeSelector: 'section > button:nth-of-type(3)',
  })

  assert.deepEqual(candidates, [
    {
      type: 'role-name',
      role: 'button',
      name: 'Delete',
      reason: 'accessibility',
    },
    {
      type: 'nth-of-type',
      selector: 'section > button:nth-of-type(3)',
      reason: 'button position',
    },
  ])
})
