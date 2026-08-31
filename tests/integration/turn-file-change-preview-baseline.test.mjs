import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { resolvePreviewRevisionPair } from '../../src/renderer/components/chat/turn-file-changes.mjs'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('preview hook prefers turn baseline revisions over last-write prevRevId', () => {
  const source = readSource('src/renderer/components/chat/use-turn-file-change-preview.mjs')
  assert.match(source, /resolvePreviewRevisionPair/)
  assert.match(source, /canUseDiffText/)
  assert.match(source, /!revisionPair\.usesTurnBaseline/)
  assert.match(source, /!hasRevisionIds/)
  assert.match(source, /beforeRevId/)
  assert.match(source, /hasInlineTurnContent/)
  assert.match(source, /Hunk-only unified diffs cannot expand collapsed regions/)
})

test('resolvePreviewRevisionPair uses prevContent when turn baseline content is absent', () => {
  const pair = resolvePreviewRevisionPair({
    prevRevId: 'rev0',
    newRevId: 'rev1',
    changeType: 'modified',
    prevContent: 'before\n',
    newContent: 'after\n',
  })
  assert.equal(pair.beforeContent, 'before\n')
  assert.equal(pair.afterContent, 'after\n')
  assert.equal(pair.hasInlineTurnContent, true)
})

test('resolvePreviewRevisionPair prefers turnBaselinePrevRevId for multi-write turns', () => {
  const pair = resolvePreviewRevisionPair({
    prevRevId: 'rev1',
    newRevId: 'rev2',
    turnBaselinePrevRevId: 'rev0',
    changeType: 'modified',
  })
  assert.equal(pair.beforeRevId, 'rev0')
  assert.equal(pair.afterRevId, 'rev2')
  assert.equal(pair.usesTurnBaseline, true)
})

test('resolvePreviewRevisionPair treats created baseline as empty before content', () => {
  const pair = resolvePreviewRevisionPair({
    prevRevId: 'c1',
    newRevId: 'c2',
    turnBaselinePrevRevId: '',
    turnBaselineChangeType: 'created',
    newContent: 'line\n',
  })
  assert.equal(pair.beforeRevId, '')
  assert.equal(pair.beforeContent, '')
  assert.equal(pair.afterContent, 'line\n')
  assert.equal(pair.hasInlineTurnContent, true)
  assert.equal(pair.usesTurnBaseline, true)
})
