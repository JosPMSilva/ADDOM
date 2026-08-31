import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../../src/main/index.mjs', import.meta.url), 'utf8')

test('index startup path schedules attachment cache orphan cleanup instead of running it synchronously', () => {
  assert.match(source, /function scheduleAttachmentCacheOrphanCleanup\(reason = 'startup'\)/)
  assert.match(source, /let attachmentCacheOrphanCleanupScheduled = false/)
  assert.match(source, /let attachmentCacheOrphanCleanupInFlight = false/)
  assert.match(source, /const timer = setTimeout\(\(\) => \{/)
  assert.match(source, /if \(timer && typeof timer\.unref === 'function'\) \{/)
  assert.match(source, /scheduleAttachmentCacheOrphanCleanup\('startup'\)/)
  assert.doesNotMatch(source, /runAttachmentCacheOrphanCleanup\('startup'\)/)
  assert.match(source, /cleanupAttachmentAgentMirrorOrphans/)
  assert.match(source, /Promise\.all\(\[cleanupAttachmentCacheOrphans\(\), cleanupAttachmentAgentMirrorOrphans\(\)\]\)/)
  assert.match(source, /scheduleAttachmentTempCleanup\(\)/)
})
