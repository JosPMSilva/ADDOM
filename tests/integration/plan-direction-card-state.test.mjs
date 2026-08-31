import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createPlanDirectionAnswer,
  createPlanDirectionDrafts,
  isPlanDirectionDraftComplete,
  resolvePlanDirectionIndex,
} from '../../src/renderer/components/chat/plan-direction-card-state.mjs'

test('direction-card drafts remain isolated while moving between questions', () => {
  const questions = [
    { id: 'scope', answer: null },
    { id: 'depth', answer: { kind: 'custom', optionId: '', text: 'Detailed' } },
  ]
  const initial = createPlanDirectionDrafts(questions)
  const edited = {
    ...initial,
    scope: { kind: 'custom', optionId: '', text: 'Renderer and main process' },
  }

  assert.deepEqual(createPlanDirectionDrafts(questions, edited), {
    scope: { kind: 'custom', optionId: '', text: 'Renderer and main process' },
    depth: { kind: 'custom', optionId: '', text: 'Detailed' },
  })
  assert.equal(resolvePlanDirectionIndex(0, 1, questions.length), 1)
  assert.equal(resolvePlanDirectionIndex(1, 4, questions.length), 1)
  assert.equal(resolvePlanDirectionIndex(0, -1, questions.length), 0)
})

test('direction-card drafts preserve typed option and custom answer semantics', () => {
  const questions = [{
    id: 'scope',
    options: [
      { id: 'focused', label: 'Focused slice' },
      { id: 'broad', label: 'Broad plan' },
    ],
    answer: { kind: 'option', optionId: 'focused', text: 'Focused slice' },
  }]

  assert.deepEqual(createPlanDirectionDrafts(questions), {
    scope: { kind: 'option', optionId: 'focused', text: 'Focused slice' },
  })
  assert.deepEqual(createPlanDirectionAnswer({ kind: 'option', optionId: 'broad' }, questions[0]), {
    kind: 'option', optionId: 'broad', text: 'Broad plan',
  })
  assert.deepEqual(createPlanDirectionAnswer({ kind: 'custom', text: 'My own boundary' }, questions[0]), {
    kind: 'custom', optionId: '', text: 'My own boundary',
  })
  assert.equal(isPlanDirectionDraftComplete({ kind: 'custom', text: '   ' }, questions[0]), false)
  assert.equal(isPlanDirectionDraftComplete({ kind: 'option', optionId: 'focused' }, questions[0]), true)
})
