import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  buildLiveTurnFileChangeState,
  formatLiveUpdatedAgo,
} from '../../src/renderer/components/chat/turn-file-changes.mjs'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

function makeRow({ key, sequence, createdAt, filePath, newRevId, prevRevId }) {
  return {
    key,
    sequence,
    createdAt,
    fileChange: {
      filePath,
      newRevId,
      prevRevId,
    },
  }
}

test('buildLiveTurnFileChangeState tracks revision updates and diff readiness/failure', () => {
  const rows = [
    makeRow({
      key: 'row_live',
      sequence: 10,
      createdAt: 1000,
      filePath: 'src/live.js',
      newRevId: 'rev_new',
      prevRevId: 'rev_prev',
    }),
  ]

  const first = buildLiveTurnFileChangeState(rows, {
    isLiveTurn: true,
    previousByKey: {
      row_live: {
        isLive: true,
        revisionId: 'rev_old',
        diffReady: false,
        diffFailed: false,
        lastUpdatedAt: 300,
      },
    },
    prefetchedByRevision: {
      rev_new: {
        status: 'ready',
        lastUpdatedAt: 450,
      },
    },
    now: 500,
  })

  assert.equal(first.row_live.isLive, true)
  assert.equal(first.row_live.revisionId, 'rev_new')
  assert.equal(first.row_live.diffReady, true)
  assert.equal(first.row_live.diffFailed, false)
  assert.equal(first.row_live.lastUpdatedAt, 500)

  const second = buildLiveTurnFileChangeState(rows, {
    isLiveTurn: true,
    previousByKey: first,
    prefetchedByRevision: {
      rev_new: {
        status: 'error',
        lastUpdatedAt: 760,
      },
    },
    now: 900,
  })

  assert.equal(second.row_live.isLive, true)
  assert.equal(second.row_live.diffReady, false)
  assert.equal(second.row_live.diffFailed, true)
  assert.equal(second.row_live.lastUpdatedAt, 760)
})

test('formatLiveUpdatedAgo returns compact age labels', () => {
  assert.equal(formatLiveUpdatedAgo(5000, 5000), 'now')
  assert.equal(formatLiveUpdatedAgo(5000, 9000), '4s ago')
  assert.equal(formatLiveUpdatedAgo(5000, 75_000), '1m ago')
})

test('TurnFileChangesCard keys live effects off stable digests and deduplicates latest-file map writes', () => {
  const source = readSource('src/renderer/components/chat/TurnFileChangesCard.jsx')

  assert.match(source, /function latestFilePathMapEqual\(/)
  assert.match(source, /\}, \[turnId\]\)/)
  assert.match(source, /\}, \[isLiveTurn, rows\.length\]\)/)
  assert.match(source, /\}, \[rows, rowsDigest, isLiveTurn\]\)/)
  assert.doesNotMatch(source, /prefetchedDiffByRevision|runPrefetch/)
  assert.match(source, /\}, \[projectFolder, rows, rowsDigest\]\)/)
  assert.match(source, /setLatestByFilePath\(\(prev\) => \(latestFilePathMapEqual\(prev, next\) \? prev : next\)\)/)
})
