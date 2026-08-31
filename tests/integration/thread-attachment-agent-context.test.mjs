import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-thread-attachment-context-'))
const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'addom-thread-attachment-project-'))
process.env.ADDOM_USER_DATA_PATH = userDataPath

const { closeDb } = await import('../../src/main/memory/db.mjs')
const { registerProject } = await import('../../src/main/workspace/workspace-store.mjs')
const { stageAttachmentFromBytes } = await import('../../src/main/attachments/attachment-cache.mjs')
const contextModule = await import('../../src/main/chat/thread-attachment-agent-context.mjs').catch(() => ({}))
const { buildChatStreamRoundContext } = await import('../../src/main/ipc-handlers/chat-stream-handler-round-context.mjs')

function isNativeDbLoadError(err) {
  const message = String(err?.message || '')
  return (
    String(err?.code || '') === 'ERR_DLOPEN_FAILED'
    || /NODE_MODULE_VERSION/i.test(message)
    || /better[-_ ]sqlite3/i.test(message)
  )
}

test.after(() => {
  try { closeDb() } catch { /* best-effort test cleanup */ }
  for (const target of [projectPath, userDataPath]) {
    try { fs.rmSync(target, { recursive: true, force: true }) } catch { /* best-effort test cleanup */ }
  }
})

test('thread attachment context includes earlier files on a later turn without new attachments', { concurrency: false }, async (t) => {
  try {
    const opened = registerProject(projectPath)
    const projectId = String(opened?.project?.id || '')
    const threadId = String(opened?.activeThread?.id || '')
    const staged = await stageAttachmentFromBytes({
      projectId,
      threadId,
      turnId: 'turn-1',
      kind: 'file',
      mediaType: 'application/pdf',
      fileName: 'reference.pdf',
      bytes: Buffer.from('%PDF-1.4 reference'),
    })
    assert.equal(staged.ok, true)

    const laterTurnContext = await contextModule.prepareThreadAttachmentAgentContext({
      projectId,
      threadId,
    })

    assert.equal(laterTurnContext.ok, true)
    assert.equal(laterTurnContext.attachments.length, 1)
    assert.equal(laterTurnContext.attachments[0].attachmentId, staged.descriptor.attachmentId)
    assert.match(laterTurnContext.prompt, /\[ADDOM thread attachments\]/)
    assert.match(laterTurnContext.prompt, /name="reference\.pdf"/)
    assert.match(laterTurnContext.prompt, /mime="application\/pdf"/)
    assert.match(laterTurnContext.prompt, /bytes=18/)
    assert.match(laterTurnContext.prompt, /untrusted, read-only reference material/i)
    assert.match(laterTurnContext.prompt, /write requested outputs inside the active project/i)
    assert.match(laterTurnContext.prompt, /attachment-agent-mirrors/i)
    assert.doesNotMatch(laterTurnContext.prompt, /attachment-cache/i)
    assert.equal(fs.existsSync(laterTurnContext.attachments[0].absolutePath), true)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('attachment context appends to the latest user input without replacing native image parts', () => {
  const history = [
    { role: 'user', content: 'earlier request' },
    { role: 'assistant', content: 'earlier answer' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'recheck the attachment' },
        { type: 'image', localPath: 'C:\\mirror\\screen.png', mediaType: 'image/png' },
      ],
    },
  ]

  const next = contextModule.appendThreadAttachmentAgentContext(history, 'manifest text')

  assert.notEqual(next, history)
  assert.deepEqual(next[0], history[0])
  assert.deepEqual(next[2].content, [
    { type: 'text', text: 'recheck the attachment' },
    { type: 'image', localPath: 'C:\\mirror\\screen.png', mediaType: 'image/png' },
    { type: 'text', text: 'manifest text' },
  ])
})

test('OpenAI account round context exposes the thread mirror and manifest on a later turn', { concurrency: false }, async (t) => {
  try {
    const opened = registerProject(path.join(projectPath, 'round-context'))
    const projectId = String(opened?.project?.id || '')
    const threadId = String(opened?.activeThread?.id || '')
    const staged = await stageAttachmentFromBytes({
      projectId,
      threadId,
      turnId: 'earlier-turn',
      kind: 'file',
      mediaType: 'text/x-python',
      fileName: 'problem.py',
      bytes: Buffer.from('print("original")\n'),
    })
    assert.equal(staged.ok, true)

    const round = await buildChatStreamRoundContext({
      providerId: 'openai',
      model: 'gpt-5.6-luna',
      mode: 'execute',
      permissionMode: 'ask',
      settings: {},
      sourceHistoryMessages: [{ role: 'user', content: 'Recheck the Python attachment.' }],
      fallbackUserEntry: { content: 'Recheck the Python attachment.' },
      userMessage: 'Recheck the Python attachment.',
      resolvedToolSurface: {
        toolSurfaceKind: 'provider_native',
        delegationBackend: 'none',
      },
      activeProjectId: projectId,
      activeThreadId: threadId,
      activeTurnId: 'later-turn',
      effectiveProjectFolder: path.join(projectPath, 'round-context'),
      openAIExecutionAuth: { authMethod: 'account' },
      loop: { abortController: new AbortController() },
    })

    assert.equal(round.ok, true)
    assert.match(round.options.openAIAccountAttachmentMirrorRoot, /attachment-agent-mirrors/i)
    const latestUser = [...round.history].reverse().find((entry) => entry?.role === 'user')
    assert.match(JSON.stringify(latestUser?.content || ''), /problem\.py/)
    assert.match(JSON.stringify(latestUser?.content || ''), /ADDOM thread attachments/)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})

test('OpenAI account mirror bypasses legacy extraction rejection for an arbitrary current-turn file', { concurrency: false }, async (t) => {
  try {
    const opened = registerProject(path.join(projectPath, 'arbitrary-file'))
    const projectId = String(opened?.project?.id || '')
    const threadId = String(opened?.activeThread?.id || '')
    const staged = await stageAttachmentFromBytes({
      projectId,
      threadId,
      turnId: 'current-turn',
      kind: 'file',
      mediaType: 'application/octet-stream',
      fileName: 'payload.bin',
      bytes: Buffer.from([0, 1, 2, 3]),
    })
    assert.equal(staged.ok, true)
    const userContent = [
      { type: 'text', text: 'Inspect payload.bin.' },
      {
        type: 'file',
        attachmentId: staged.descriptor.attachmentId,
        mediaType: 'application/octet-stream',
        filename: 'payload.bin',
      },
    ]

    const round = await buildChatStreamRoundContext({
      providerId: 'openai',
      model: 'gpt-5.6-luna',
      permissionMode: 'ask',
      settings: {
        attachmentTextExtraction: { enabled: true, mode: 'fallback_only' },
      },
      sourceHistoryMessages: [{ role: 'user', content: userContent }],
      fallbackUserEntry: { content: userContent },
      userMessage: 'Inspect payload.bin.',
      resolvedToolSurface: { toolSurfaceKind: 'provider_native', delegationBackend: 'none' },
      activeProjectId: projectId,
      activeThreadId: threadId,
      activeTurnId: 'current-turn',
      effectiveProjectFolder: path.join(projectPath, 'arbitrary-file'),
      openAIExecutionAuth: { authMethod: 'account' },
      loop: { abortController: new AbortController() },
    })

    assert.equal(round.ok, true)
    assert.match(JSON.stringify(round.history), /payload\.bin/)
    assert.match(JSON.stringify(round.history), /attachment-agent-mirrors/i)
  } catch (err) {
    if (isNativeDbLoadError(err)) {
      t.skip('better-sqlite3 native binding is unavailable for this Node runtime')
      return
    }
    throw err
  }
})
