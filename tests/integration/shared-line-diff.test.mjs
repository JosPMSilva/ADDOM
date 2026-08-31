import test from 'node:test'
import assert from 'node:assert/strict'

import {
  computeLineDiff,
  flattenLineDiffSegmentsToPreviewRows,
} from '../../src/renderer/components/diff/line-diff.mjs'

test('computeLineDiff preserves surrounding context for a single-line edit', () => {
  const segments = computeLineDiff('alpha\nbeta\ngamma', 'alpha\nBETA\ngamma')
  const rows = flattenLineDiffSegmentsToPreviewRows(segments, { maxRows: 20 })

  assert.deepEqual(rows.map((row) => row.kind), ['context', 'delete', 'add', 'context'])
  assert.equal(rows[0].text, 'alpha')
  assert.equal(rows[1].text, 'beta')
  assert.equal(rows[2].text, 'BETA')
  assert.equal(rows[3].text, 'gamma')
})

test('computeLineDiff handles pure additions and deletions', () => {
  const addRows = flattenLineDiffSegmentsToPreviewRows(
    computeLineDiff('', 'one\ntwo'),
    { maxRows: 20 },
  )
  const deleteRows = flattenLineDiffSegmentsToPreviewRows(
    computeLineDiff('one\ntwo', ''),
    { maxRows: 20 },
  )

  assert.deepEqual(addRows.map((row) => row.kind), ['add', 'add'])
  assert.deepEqual(deleteRows.map((row) => row.kind), ['delete', 'delete'])
})

test('large diff fallback includes ellipsis rows', () => {
  const before = Array.from({ length: 900 }, (_, index) => `before-${index}`).join('\n')
  const after = Array.from({ length: 900 }, (_, index) => `after-${index}`).join('\n')
  const rows = flattenLineDiffSegmentsToPreviewRows(computeLineDiff(before, after), { maxRows: 40 })

  assert.ok(rows.some((row) => row.kind === 'ellipsis'))
  assert.ok(rows.every((row) => ['context', 'add', 'delete', 'ellipsis'].includes(row.kind)))
})

test('preview flattening appends a truncation ellipsis row when max rows are exceeded', () => {
  const rows = flattenLineDiffSegmentsToPreviewRows(
    computeLineDiff('a\nb\nc\nd\ne', 'A\nB\nC\nD\nE'),
    { maxRows: 3, truncateMessage: 'Diff preview truncated.' },
  )

  assert.equal(rows.length, 3)
  assert.equal(rows.at(-1)?.kind, 'ellipsis')
  assert.equal(rows.at(-1)?.text, 'Diff preview truncated.')
})

test('preview flattening does not truncate when maxRows is omitted', () => {
  const rows = flattenLineDiffSegmentsToPreviewRows(
    computeLineDiff('a\nb\nc\nd\ne', 'A\nB\nC\nD\nE'),
  )

  assert.equal(rows.length, 10)
  assert.notEqual(rows.at(-1)?.text, 'Diff preview truncated.')
})

test('collapsed unmodified regions keep hiddenLines so DiffLine can expand them', () => {
  const before = Array.from({ length: 20 }, (_, index) => `line-${index + 1}`).join('\n')
  const after = before.split('\n').map((line, index) => (index === 10 ? 'CHANGED' : line)).join('\n')
  const rows = flattenLineDiffSegmentsToPreviewRows(computeLineDiff(before, after))
  const ellipsisRows = rows.filter((row) => row.kind === 'ellipsis')

  assert.ok(ellipsisRows.length > 0)
  for (const row of ellipsisRows) {
    assert.match(String(row.text || ''), /unmodified lines/)
    assert.ok(Array.isArray(row.hiddenLines))
    assert.ok(row.hiddenLines.length > 0)
    assert.equal(
      row.hiddenLines.length,
      Number(String(row.text).match(/^(\d+)/)?.[1] || 0),
    )
  }
})
