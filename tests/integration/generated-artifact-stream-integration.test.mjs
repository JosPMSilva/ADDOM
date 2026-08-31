import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-generated-artifact-stream-'))
const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-generated-artifact-project-'))
const sourcePath = path.join(projectFolder, 'generated-hero.png')
fs.writeFileSync(sourcePath, Buffer.from('generated-image-bytes'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { executeProviderModelStream } = await import('../../src/main/chat/chat-stream-model-step.mjs')
const { resolveCachedAttachmentFilePath } = await import('../../src/main/attachments/attachment-cache.mjs')
const { closeDb } = await import('../../src/main/memory/db.mjs')

test.after(() => {
  try { closeDb() } catch { /* best-effort cleanup */ }
  try { fs.rmSync(projectFolder, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
  try { fs.rmSync(userDataPath, { recursive: true, force: true }) } catch { /* best-effort cleanup */ }
})

test('provider image output is cached before the final stream result is returned', async () => {
  const sent = []
  const persisted = []
  const streamResult = await executeProviderModelStream({
    providerId: 'provider-a',
    apiKey: 'test',
    history: [{ role: 'user', content: 'Generate and show an image.' }],
    options: { model: 'model-a', tools: {} },
    projectFolder,
    activeProjectId: 'project-generated',
    activeThreadId: 'thread-generated',
    activeTurnId: 'turn-generated',
    tools: {},
    round: 1,
    model: 'model-a',
    send: (channel, payload) => sent.push({ channel, payload }),
    persistTimelineEvent: (kind, payload) => persisted.push({ kind, payload }),
    sendNotice: () => {},
    createStreamWithTools: async (_providerId, _apiKey, _history, options) => {
      options.onProviderToolOutput({
        type: 'tool-output-available',
        toolCallId: 'image-call-1',
        toolName: 'vendor_image',
        output: {
          status: 'completed',
          savedPath: sourcePath,
          resultAvailable: true,
        },
        providerExecuted: true,
      })
      return {
        stopReason: 'stop',
        text: `![Generated hero](<${sourcePath.replace(/\\/g, '/')}>)`,
        toolCalls: [],
        usage: null,
        reasoning: '',
      }
    },
  })

  assert.equal(streamResult.generatedArtifacts.length, 1)
  const [artifact] = streamResult.generatedArtifacts
  assert.equal(artifact.sourcePath, sourcePath)
  assert.match(artifact.previewUrl, /^addom-attachment:\/\/attachment\//)
  const cached = await resolveCachedAttachmentFilePath(artifact.attachmentId, {
    projectId: 'project-generated',
    threadId: 'thread-generated',
  })
  assert.equal(cached.ok, true)
  assert.notEqual(path.resolve(cached.absolutePath), path.resolve(sourcePath))
  assert.equal(
    sent.some((entry) => (
      entry.channel === 'chat:provider-tool-output'
      && entry.payload?.generatedArtifacts?.[0]?.attachmentId === artifact.attachmentId
    )),
    true,
  )
  assert.equal(
    persisted.some((entry) => (
      entry.kind === 'provider_tool_output'
      && entry.payload?.meta?.generatedArtifacts?.[0]?.attachmentId === artifact.attachmentId
    )),
    true,
  )
})
