import test from 'node:test'
import assert from 'node:assert/strict'

const { evaluateMergeResolutionApplySnapshot } = await import('../../src/main/artifacts/merge-resolution-guards.mjs')

test('evaluateMergeResolutionApplySnapshot rejects stale artifact heads', () => {
  const result = evaluateMergeResolutionApplySnapshot({
    latestRevision: {
      id: 'rev_latest',
      rev: 12,
      content: 'const latest = 2\n',
    },
    expectedLatestRevId: 'rev_old',
    diskContent: 'const latest = 2\n',
  })

  assert.equal(result.ok, false)
  assert.equal(result.conflict, true)
  assert.equal(result.reason, 'changed_since_conflict')
  assert.equal(result.latestId, 'rev_latest')
  assert.equal(result.latestRev, 12)
})

test('evaluateMergeResolutionApplySnapshot rejects external disk drift', () => {
  const result = evaluateMergeResolutionApplySnapshot({
    latestRevision: {
      id: 'rev_new',
      rev: 5,
      content: 'const tracked = 2\n',
    },
    expectedLatestRevId: 'rev_new',
    diskContent: 'const userEditedOutside = 3\n',
  })

  assert.equal(result.ok, false)
  assert.equal(result.conflict, true)
  assert.equal(result.reason, 'disk_changed_since_conflict')
  assert.equal(result.latestId, 'rev_new')
  assert.equal(result.latestRev, 5)
})

test('evaluateMergeResolutionApplySnapshot accepts matching artifact and disk state', () => {
  const result = evaluateMergeResolutionApplySnapshot({
    latestRevision: {
      id: 'rev_new',
      rev: 5,
      content: 'const tracked = 2\n',
    },
    expectedLatestRevId: 'rev_new',
    diskContent: 'const tracked = 2\n',
  })

  assert.deepEqual(result, {
    ok: true,
    latestId: 'rev_new',
    latestRev: 5,
  })
})
