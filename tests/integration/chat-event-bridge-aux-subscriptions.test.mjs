import test from 'node:test'
import assert from 'node:assert/strict'

import { registerChatEventBridgeAuxSubscriptions } from '../../src/renderer/components/chat/chat-event-bridge-aux-subscriptions.mjs'

test('aux chat event bridge surfaces artifact tracking exceptions as visible warnings', () => {
  const handlers = new Map()
  const unsubscribed = []
  const activities = []
  const notices = []

  const cleanup = registerChatEventBridgeAuxSubscriptions({
    safeSub: (eventKey, handler, label = '') => {
      if (!eventKey) return () => {}
      const key = String(label || eventKey)
      handlers.set(key, handler)
      return () => unsubscribed.push(key)
    },
    chatApi: {
      onArtifactTracking: 'artifactTrackingEvent',
    },
    useChatStore: {
      getState: () => ({
        pushToolActivity: (activity) => activities.push(activity),
        pushNotice: (notice) => notices.push(notice),
        recordCostEstimate: () => {},
        recordUsage: () => {},
        pushWriteConflict: () => {},
        recordContinuityStatus: () => {},
        recordContinuityPacket: () => {},
      }),
    },
    useMemoryStore: {
      getState: () => ({
        setCompressionEvent: () => {},
      }),
    },
  })

  const emitArtifactTracking = handlers.get('onArtifactTracking')
  assert.equal(typeof emitArtifactTracking, 'function')

  emitArtifactTracking({
    threadId: 'thread_1',
    turnId: 'turn_1',
    stepId: 'turn_1:step:2',
    sequence: 2,
    toolName: 'write_file',
    status: 'untracked',
    reasonCode: 'missing_revision_metadata',
    reason: 'File changes were visible but did not include artifact revision metadata.',
    trackedCount: 0,
    untrackedCount: 1,
  })

  assert.equal(activities.length, 1)
  assert.equal(activities[0]?.type, 'warning')
  assert.equal(activities[0]?.eventKind, 'artifact_tracking')
  assert.equal(activities[0]?.toolName, 'write_file')
  assert.match(activities[0]?.label || '', /Artifact tracking untracked for write_file/)
  assert.match(activities[0]?.detail || '', /reason_code: missing_revision_metadata/)
  assert.match(activities[0]?.detail || '', /untracked: 1/)
  assert.equal(activities[0]?.artifactTracking?.reasonCode, 'missing_revision_metadata')
  assert.deepEqual(notices, [])

  cleanup()
  assert.deepEqual(unsubscribed, ['onArtifactTracking'])
})
