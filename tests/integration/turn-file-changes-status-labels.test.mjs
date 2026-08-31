import test from 'node:test'
import assert from 'node:assert/strict'

import { deriveRowSyncStatus } from '../../src/renderer/components/chat/turn-file-changes-card-helpers.mjs'

test('deriveRowSyncStatus labels applied and draft/untracked file previews explicitly', () => {
  const draft = deriveRowSyncStatus({
    fileChange: {
      filePath: 'src/draft.js',
      diffText: '@@ -0,0 +1 @@\n+draft',
    },
  }, null)
  const applied = deriveRowSyncStatus({
    fileChange: {
      filePath: 'src/applied.js',
      newRevId: 'rev_1',
    },
  }, { latestId: 'rev_1' })

  assert.equal(draft.kind, 'untracked')
  assert.equal(draft.label, 'draft/untracked')
  assert.equal(applied.kind, 'active')
  assert.equal(applied.label, 'applied')
})

test('deriveRowSyncStatus marks untracked previews as discarded after a cancelled turn', () => {
  const discarded = deriveRowSyncStatus({
    fileChange: {
      filePath: 'src/discarded.js',
      diffText: '@@ -0,0 +1 @@\n+draft',
    },
  }, null, {
    turnState: 'cancelled',
  })

  assert.equal(discarded.kind, 'discarded')
  assert.equal(discarded.label, 'discarded draft')
})
