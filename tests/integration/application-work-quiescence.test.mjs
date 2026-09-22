import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assertApplicationWorkStartAllowed,
  beginApplicationWorkQuiescence,
  getApplicationWorkQuiescence,
  resetApplicationWorkQuiescenceForTests,
} from '../../src/main/application-work-quiescence.mjs'

test.afterEach(() => resetApplicationWorkQuiescenceForTests())

test('application work quiescence blocks new work until its lease is released', () => {
  assert.doesNotThrow(() => assertApplicationWorkStartAllowed())

  const lease = beginApplicationWorkQuiescence('application_update')
  assert.deepEqual(getApplicationWorkQuiescence(), {
    active: true,
    reason: 'application_update',
  })
  assert.throws(
    () => assertApplicationWorkStartAllowed(),
    (error) => error?.code === 'application_quiescing',
  )
  assert.throws(
    () => beginApplicationWorkQuiescence('another_update'),
    (error) => error?.code === 'application_quiescing',
  )

  assert.equal(lease.release(), true)
  assert.equal(lease.release(), false)
  assert.deepEqual(getApplicationWorkQuiescence(), { active: false, reason: '' })
  assert.doesNotThrow(() => assertApplicationWorkStartAllowed())
})

