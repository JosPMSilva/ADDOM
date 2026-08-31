import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.resolve('src/renderer/components/chat/LiveExecutionStreamBlock.jsx'),
  'utf8',
)

test('LiveExecutionStreamBlock collapses on final answer start and respects manual override', () => {
  assert.match(
    source,
    /if \(isLiveTurn\) \{\s*if \(!userToggled\) \{\s*setExpanded\(true\)\s*\}\s*return\s*\}/s,
  )
  assert.doesNotMatch(
    source,
    /if \(isLiveTurn\) \{\s*setExpanded\(true\)\s*setUserToggled\(false\)\s*return\s*\}/s,
  )
  assert.match(source, /if \(!wasStarted && finalAnswerStarted && !userToggled\) \{\s*setExpanded\(false\)/s)
  assert.doesNotMatch(source, /if \(wasLive && !isLiveTurn\) \{\s*setExpanded\(false\)/s)
})
