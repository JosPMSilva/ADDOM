import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

process.env.ADDOM_USER_DATA_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-notice-dedupe-'))

const {
  createChatStreamDelivery,
} = await import('../../src/main/ipc-handlers/chat-stream-handler-helpers.mjs')

test('chat delivery deduplicates explicit notice keys for the duration of one turn', () => {
  const sent = []
  const delivery = createChatStreamDelivery({
    event: {
      sender: {
        isDestroyed: () => false,
        send: (channel, payload) => sent.push({ channel, payload }),
      },
    },
    activeThreadId: 'thread-protocol-drift',
    activeTurnId: 'turn-protocol-drift',
  })
  const errorDiagnostics = {
    capabilityNotices: [],
    capabilityBlockReasons: [],
  }
  const sendNotice = delivery.createSendNotice({ errorDiagnostics })
  const notice = {
    type: 'warning',
    text: 'Codex app-server activity',
    meta: {
      reason: 'unrecognized_provider_activity',
      dedupeKey: 'openai_account_protocol_drift:0.124.0:item:futureActivity',
    },
  }

  sendNotice(notice)
  sendNotice(notice)

  assert.equal(sent.filter((entry) => entry.channel.endsWith(':chat:notice')).length, 1)
  assert.deepEqual(errorDiagnostics.capabilityNotices, ['unrecognized_provider_activity'])
  assert.deepEqual(errorDiagnostics.capabilityBlockReasons, ['unrecognized_provider_activity'])
})
