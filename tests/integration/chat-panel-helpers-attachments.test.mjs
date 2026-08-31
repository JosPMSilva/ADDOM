import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildToolFreeCommandTurnOptions,
  executeCompactionCommand,
  executeSendMessage,
  isPdfAttachment,
  resolveAttachmentCapabilityGates,
  supportsPdfAttachmentsForSelection,
} from '../../src/renderer/components/chat/chat-panel-helpers.mjs'
import { parseCompactionCommand } from '../../src/renderer/components/chat/compaction-command-parser.mjs'
import {
  TERMINAL_CHAT_OUTPUT_MAX_CHARS,
  buildTerminalChatDraftInjection,
  buildTerminalMemorySnapshotPayload,
  extractTerminalOutputContext,
} from '../../src/renderer/components/terminal/terminal-output-context.mjs'

test('executeSendMessage maps PDF attachments to file parts and images to image parts', () => {
  let capturedHistory = null
  let echoedUserContent = null
  let attachmentsCleared = false

  const ok = executeSendMessage({
    rawContent: 'Please review this.',
    selectedProvider: 'gemini',
    selectedModel: 'gemini-2.5-flash',
    activeThreadId: 'thread-1',
    projectFolder: 'C:\\repo',
    attachedImagesRef: {
      current: [
        {
          id: 'pdf-1',
          dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
          mediaType: 'application/pdf',
          fileName: 'spec.pdf',
        },
        {
          id: 'img-1',
          dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA',
          mediaType: 'image/png',
          fileName: 'diagram.png',
        },
      ],
    },
    addUserMessage: (content) => {
      echoedUserContent = content
      return 'user-turn-1'
    },
    setAttachedImages: (nextValue) => {
      attachmentsCleared = Array.isArray(nextValue) && nextValue.length === 0
    },
    addAssistantPlaceholder: () => {},
    getChatState: () => ({ messages: [], planState: {} }),
    chatStream: (_provider, _model, history) => {
      capturedHistory = history
    },
  })

  assert.equal(ok, true)
  assert.equal(Array.isArray(echoedUserContent), true)
  assert.equal(attachmentsCleared, true)
  assert.equal(Array.isArray(capturedHistory), true)

  const finalMessage = capturedHistory[capturedHistory.length - 1]
  assert.equal(finalMessage.role, 'user')
  assert.equal(Array.isArray(finalMessage.content), true)

  const parts = finalMessage.content
  assert.equal(parts[0]?.type, 'text')
  assert.equal(parts[0]?.text, 'Please review this.')

  const pdfPart = parts.find((part) => part?.type === 'file')
  assert.ok(pdfPart)
  assert.equal(pdfPart.mediaType, 'application/pdf')
  assert.equal(pdfPart.data, 'JVBERi0xLjQK')
  assert.equal(pdfPart.filename, 'spec.pdf')

  const imagePart = parts.find((part) => part?.type === 'image')
  assert.ok(imagePart)
  assert.equal(imagePart.mediaType, 'image/png')
  assert.equal(imagePart.image, 'iVBORw0KGgoAAAANSUhEUgAAAAUA')
  assert.equal(Object.prototype.hasOwnProperty.call(imagePart, 'mimeType'), false)
})

test('executeSendMessage keeps cached attachment references without inline base64 payloads', () => {
  let capturedHistory = null

  const ok = executeSendMessage({
    rawContent: 'Use cached attachments.',
    selectedProvider: 'gemini',
    selectedModel: 'gemini-2.5-flash',
    activeThreadId: 'thread-ref',
    projectFolder: 'C:\\repo',
    attachedImagesRef: {
      current: [
        {
          id: 'att-image-1',
          attachmentId: 'att-image-1',
          kind: 'image',
          mediaType: 'image/png',
          fileName: 'diagram.png',
          previewUrl: 'file:///tmp/diagram.png',
        },
        {
          id: 'att-file-1',
          attachmentId: 'att-file-1',
          kind: 'file',
          mediaType: 'text/plain',
          fileName: 'notes.txt',
        },
      ],
    },
    setAttachedImages: () => {},
    addUserMessage: () => 'user-turn-ref',
    addAssistantPlaceholder: () => {},
    getChatState: () => ({ messages: [], planState: {} }),
    chatStream: (_provider, _model, history) => {
      capturedHistory = history
    },
  })

  assert.equal(ok, true)
  assert.equal(Array.isArray(capturedHistory), true)
  const finalMessage = capturedHistory[capturedHistory.length - 1]
  assert.equal(finalMessage.role, 'user')
  assert.equal(Array.isArray(finalMessage.content), true)
  const imagePart = finalMessage.content.find((part) => part?.type === 'image')
  const filePart = finalMessage.content.find((part) => part?.type === 'file')
  assert.equal(imagePart?.attachmentId, 'att-image-1')
  assert.equal(filePart?.attachmentId, 'att-file-1')
  assert.equal(Object.prototype.hasOwnProperty.call(imagePart || {}, 'image'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(filePart || {}, 'data'), false)
})

test('executeSendMessage uses attachment summary for PDF-only turns without text', () => {
  let capturedCurrentUserMessage = ''

  const ok = executeSendMessage({
    rawContent: '',
    selectedProvider: 'gemini',
    selectedModel: 'gemini-2.5-flash',
    activeThreadId: 'thread-2',
    attachedImagesRef: {
      current: [{
        id: 'pdf-only',
        dataUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
        mediaType: 'application/pdf',
        fileName: 'notes.pdf',
      }],
    },
    setAttachedImages: () => {},
    addUserMessage: () => 'user-turn-2',
    addAssistantPlaceholder: () => {},
    getChatState: () => ({ messages: [], planState: {} }),
    chatStream: (...args) => {
      capturedCurrentUserMessage = String(args[11] || '')
    },
  })

  assert.equal(ok, true)
  assert.equal(capturedCurrentUserMessage, '[1 PDF attached]')
})

test('supportsPdfAttachmentsForSelection applies provider and model guards', () => {
  assert.equal(supportsPdfAttachmentsForSelection({ providerId: 'gemini' }), false)
  assert.equal(supportsPdfAttachmentsForSelection({ providerId: 'groq' }), false)
  assert.equal(
    supportsPdfAttachmentsForSelection({
      providerId: 'openai',
      modelManifest: {
        capabilities: {
          inputModalities: ['text'],
          attachment: { supported: false, kinds: [], modalities: ['text'] },
        },
      },
    }),
    false,
  )
  assert.equal(
    supportsPdfAttachmentsForSelection({
      providerId: 'gemini',
      modelManifest: {
        capabilities: {
          inputModalities: ['text', 'image', 'file'],
          attachment: { supported: true, kinds: ['image', 'pdf'], modalities: ['text', 'image', 'file'] },
        },
      },
    }),
    true,
  )
})

test('isPdfAttachment detects MIME type and filename suffix', () => {
  assert.equal(isPdfAttachment({ mediaType: 'application/pdf' }), true)
  assert.equal(isPdfAttachment({ mediaType: 'image/png', fileName: 'contract.PDF' }), true)
  assert.equal(isPdfAttachment({ mediaType: 'image/png', fileName: 'photo.png' }), false)
})

test('executeSendMessage sanitizes legacy history attachments missing file data', () => {
  let capturedHistory = null
  const ok = executeSendMessage({
    rawContent: 'Continue',
    selectedProvider: 'gemini',
    selectedModel: 'gemini-2.5-flash',
    activeThreadId: 'thread-3',
    projectFolder: 'C:\\repo',
    attachedImagesRef: { current: [] },
    setAttachedImages: () => {},
    addUserMessage: () => 'user-turn-3',
    addAssistantPlaceholder: () => {},
    getChatState: () => ({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'application/pdf',
              filename: 'legacy.pdf',
            },
          ],
        },
      ],
      planState: {},
    }),
    chatStream: (_provider, _model, history) => {
      capturedHistory = history
    },
  })

  assert.equal(ok, true)
  assert.equal(Array.isArray(capturedHistory), true)
  assert.equal(capturedHistory.length >= 2, true)
  const first = capturedHistory[0]
  assert.equal(first.role, 'user')
  assert.equal(typeof first.content, 'string')
  assert.match(first.content, /\[Attachment omitted: legacy\.pdf\]/)
})

test('executeSendMessage does not forward obsolete renderer-owned plan state', () => {
  let capturedTurnOptions = null

  const ok = executeSendMessage({
    rawContent: 'Implement the plan.',
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.2',
    activeThreadId: 'thread-plan',
    projectFolder: 'C:\\repo',
    attachedImagesRef: { current: [] },
    setAttachedImages: () => {},
    addUserMessage: () => 'user-turn-plan',
    addAssistantPlaceholder: () => 'assistant-turn-plan',
    getChatState: () => ({
      messages: [],
      planState: {
        canonicalPlan: {
          messageId: 'msg_plan',
          summary: 'Preserve OpenAI first.',
          questions: [{
            id: 'q_scope',
            text: 'What provider should lead?',
            choices: ['Use OpenAI first.', 'Keep it provider agnostic.'],
          }],
          options: [{
            id: 'opt_a',
            title: 'OpenAI first',
            description: 'Start with OpenAI continuity surfaces.',
            recommended: true,
          }],
          requests: [{
            id: 'req_1',
            type: 'artifact_review',
            reason: 'Inspect compaction modules',
          }],
        },
        selectedOptionByMessage: { msg_plan: 'opt_a' },
        answeredQuestions: { q_scope: 'Use OpenAI first.' },
        pendingRequestIds: ['msg_plan:req_1'],
        completedRequestIds: [],
        requestTraceById: {
          'msg_plan:req_1': {
            requestId: 'req_1',
            type: 'artifact_review',
            status: 'pending',
            traceSummary: 'Inspect compaction modules',
          },
        },
      },
    }),
    buildCanonicalPlanTurnStateFn: () => ({ mode: 'execute_from_plan' }),
    chatStream: (...args) => {
      capturedTurnOptions = args[13]
    },
  })

  assert.equal(ok, true)
  assert.equal(Object.hasOwn(capturedTurnOptions || {}, 'planState'), false)
})

test('buildToolFreeCommandTurnOptions preserves existing turn options and forces tools off for command turns', () => {
  assert.deepEqual(
    buildToolFreeCommandTurnOptions({
      openai: { forceManualCompaction: true },
      command: { preserveHistory: true },
    }),
    {
      openai: { forceManualCompaction: true },
      command: {
        preserveHistory: true,
        disableTools: true,
      },
    },
  )
})

test('executeSendMessage forwards processing mode independently in turn options', () => {
  let streamArgs = null
  const sent = executeSendMessage({
    rawContent: 'Use the faster route.',
    processingMode: 'fast',
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.4',
    activeThreadId: 'thread-fast',
    projectFolder: 'C:\\repo',
    attachedImagesRef: { current: [] },
    setAttachedImages: () => {},
    addUserMessage: () => 'turn-fast',
    addAssistantPlaceholder: () => 'assistant-fast',
    getChatState: () => ({ messages: [], planState: {} }),
    chatStream: (...args) => {
      streamArgs = args
    },
  })

  assert.equal(sent, true)
  assert.equal(streamArgs[13].processingMode, 'fast')
})

test('executeSendMessage can run a transcript-quiet typed Plan action', () => {
  let streamArgs = null
  let assistantPlaceholders = 0
  const sent = executeSendMessage({
    rawContent: 'Internal Plan action',
    modeOverride: 'plan',
    options: {
      echoUser: false,
      echoAssistant: false,
      omitTurnHistoryMessage: true,
      currentUserMessage: '',
      turnOptions: {
        planAction: {
          kind: 'synthesize_direction',
          planId: 'plan-1',
          requestId: 'request-1',
          expectedDirectionRevision: 2,
          expectedAnswerRevision: 1,
        },
      },
    },
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.6-luna',
    activeThreadId: 'thread-plan-action',
    projectFolder: 'C:\\repo',
    attachedImagesRef: { current: [] },
    setAttachedImages: () => {},
    addUserMessage: () => assert.fail('must not echo a user message'),
    addAssistantPlaceholder: () => { assistantPlaceholders += 1; return 'assistant-hidden' },
    getChatState: () => ({ messages: [] }),
    chatStream: (...args) => { streamArgs = args },
  })

  assert.equal(sent, true)
  assert.equal(assistantPlaceholders, 0)
  assert.equal(streamArgs[10], '')
  assert.equal(streamArgs[11], '')
  assert.equal(streamArgs[12], '')
  assert.equal(streamArgs[13].planAction.kind, 'synthesize_direction')
})

test('executeSendMessage can suppress prior thread history for isolated tool-free command turns', () => {
  let streamArgs = null

  const ok = executeSendMessage({
    rawContent: 'Create an agent role for: desktop investigations',
    options: {
      turnOptions: buildToolFreeCommandTurnOptions({
        command: {
          preserveHistory: false,
        },
      }),
      historyContentOverride: 'Create an agent role for: desktop investigations',
      currentUserMessage: 'Create an agent role for: desktop investigations',
    },
    selectedProvider: 'anthropic',
    selectedModel: 'claude-haiku-4-5',
    activeThreadId: 'thread-role-isolated',
    projectFolder: 'C:\\repo',
    attachedImagesRef: { current: [] },
    setAttachedImages: () => {},
    addUserMessage: () => 'user-turn-role-isolated',
    addAssistantPlaceholder: () => 'assistant-role-isolated',
    getChatState: () => ({
      messages: [
        { role: 'user', status: 'done', content: 'Earlier ask that should not leak' },
        { role: 'assistant', status: 'done', content: 'Earlier answer that should not leak' },
      ],
      planState: {},
    }),
    chatStream: (...args) => {
      streamArgs = args
    },
  })

  assert.equal(ok, true)
  assert.deepEqual(streamArgs[2], [
    { role: 'user', content: 'Create an agent role for: desktop investigations' },
  ])
  assert.deepEqual(streamArgs[13], {
    command: {
      preserveHistory: false,
      disableTools: true,
    },
    processingMode: 'standard',
  })
})

test('executeSendMessage skips background-pending assistant history and forwards assistant placeholder id', () => {
  let streamArgs = null

  const ok = executeSendMessage({
    rawContent: 'Continue from the finished answer only.',
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.2',
    activeThreadId: 'thread-4',
    projectFolder: 'C:\\repo',
    attachedImagesRef: { current: [] },
    setAttachedImages: () => {},
    addUserMessage: () => 'user-turn-4',
    addAssistantPlaceholder: () => 'assistant-pending-4',
    getChatState: () => ({
      messages: [
        { role: 'user', status: 'done', content: 'Earlier user question' },
        { role: 'assistant', status: 'background_pending', content: 'Queued OpenAI background response' },
        { role: 'assistant', status: 'done', content: 'Finished assistant answer' },
      ],
      planState: {},
    }),
    chatStream: (...args) => {
      streamArgs = args
    },
  })

  assert.equal(ok, true)
  assert.ok(Array.isArray(streamArgs))
  assert.equal(streamArgs[12], 'assistant-pending-4')
  assert.deepEqual(streamArgs[2], [
    { role: 'user', content: 'Earlier user question' },
    { role: 'assistant', content: 'Finished assistant answer' },
    { role: 'user', content: 'Continue from the finished answer only.' },
  ])
})

test('executeSendMessage preserves assistant phase in replayed history', () => {
  let streamArgs = null

  executeSendMessage({
    rawContent: 'Keep going.',
    selectedProvider: 'openai',
    selectedModel: 'gpt-5.4',
    activeThreadId: 'thread-phase-1',
    projectFolder: 'C:\\repo',
    attachedImagesRef: { current: [] },
    setAttachedImages: () => {},
    addUserMessage: () => 'user-turn-phase-1',
    addAssistantPlaceholder: () => 'assistant-phase-1',
    getChatState: () => ({
      messages: [
        { role: 'assistant', status: 'done', content: 'Working...', phase: 'commentary' },
      ],
      planState: {},
    }),
    chatStream: (...args) => {
      streamArgs = args
    },
  })

  assert.ok(Array.isArray(streamArgs))
  assert.deepEqual(streamArgs[2], [
    { role: 'assistant', content: 'Working...', phase: 'commentary' },
    { role: 'user', content: 'Keep going.' },
  ])
})

test('executeCompactionCommand forwards prompt commands as turn options without leaking slash syntax into model history', async () => {
  let streamArgs = null
  let echoedUserContent = null

  const handled = await executeCompactionCommand({
    rawContent: '/compact-threshold 180000 :: Continue with the investigation.',
    activeThreadId: 'thread-compact-1',
    addUserMessage: (content) => {
      echoedUserContent = content
      return 'user-turn-compact-1'
    },
    addAssistantPlaceholder: () => 'assistant-compact-1',
    markError: () => {},
    parseCompactionCommandFn: parseCompactionCommand,
    sendMessage: (rawContent, modeOverride, options = {}) => executeSendMessage({
      rawContent,
      modeOverride,
      options,
      selectedProvider: 'openai',
      selectedModel: 'gpt-5.2',
      activeThreadId: 'thread-compact-1',
      projectFolder: 'C:\\repo',
      attachedImagesRef: { current: [] },
      setAttachedImages: () => {},
      addUserMessage: (content) => {
        echoedUserContent = content
        return 'user-turn-compact-1'
      },
      addAssistantPlaceholder: () => 'assistant-compact-1',
      getChatState: () => ({ messages: [], planState: {} }),
      chatStream: (...args) => {
        streamArgs = args
      },
    }),
  })

  assert.equal(handled, true)
  assert.equal(echoedUserContent, '/compact-threshold 180000 :: Continue with the investigation.')
  assert.equal(streamArgs[11], 'Continue with the investigation.')
  assert.equal(streamArgs[2][streamArgs[2].length - 1].content, 'Continue with the investigation.')
  assert.deepEqual(streamArgs[13], {
    command: {
      disableTools: true,
    },
    openai: {
      forceServerSideCompaction: true,
      serverSideCompactionThresholdTokens: 180000,
    },
    processingMode: 'standard',
  })
})

test('executeCompactionCommand supports standalone /compact command-only turns', async () => {
  let streamArgs = null

  const handled = await executeCompactionCommand({
    rawContent: '/compact',
    activeThreadId: 'thread-compact-only',
    addUserMessage: () => 'user-turn-compact-only',
    addAssistantPlaceholder: () => 'assistant-compact-only',
    markError: () => {},
    parseCompactionCommandFn: parseCompactionCommand,
    sendMessage: (rawContent, modeOverride, options = {}) => executeSendMessage({
      rawContent,
      modeOverride,
      options,
      selectedProvider: 'openai',
      selectedModel: 'gpt-5.2',
      activeThreadId: 'thread-compact-only',
      projectFolder: 'C:\\repo',
      attachedImagesRef: { current: [] },
      setAttachedImages: () => {},
      addUserMessage: () => 'user-turn-compact-only',
      addAssistantPlaceholder: () => 'assistant-compact-only',
      getChatState: () => ({ messages: [], planState: {} }),
      chatStream: (...args) => {
        streamArgs = args
      },
    }),
  })

  assert.equal(handled, true)
  assert.deepEqual(streamArgs[2], [])
  assert.equal(streamArgs[11], '')
  assert.deepEqual(streamArgs[13], {
    command: {
      disableTools: true,
    },
    openai: {
      forceManualCompaction: true,
      commandOnly: true,
    },
    processingMode: 'standard',
  })
})

test('resolveAttachmentCapabilityGates reflects live extraction toggle and runtime readiness', () => {
  const disabled = resolveAttachmentCapabilityGates({
    providerId: 'groq',
    modelManifest: {
      capabilities: {
        inputModalities: ['text'],
        attachment: { supported: false, kinds: [], modalities: ['text'] },
      },
    },
    attachmentTextExtractionEnabled: false,
    attachmentTextExtractionRuntimeReady: false,
  })
  assert.equal(disabled.imageAttachmentsEnabled, false)
  assert.equal(disabled.fileAttachmentsEnabled, false)
  assert.equal(disabled.attachmentsEnabled, false)

  const enabledNoRuntime = resolveAttachmentCapabilityGates({
    providerId: 'groq',
    modelManifest: {
      capabilities: {
        inputModalities: ['text'],
        attachment: { supported: false, kinds: [], modalities: ['text'] },
      },
    },
    attachmentTextExtractionEnabled: true,
    attachmentTextExtractionRuntimeReady: false,
  })
  assert.equal(enabledNoRuntime.fileAttachmentsEnabled, false)
  assert.equal(enabledNoRuntime.attachmentsEnabled, false)

  const enabledWithRuntime = resolveAttachmentCapabilityGates({
    providerId: 'groq',
    modelManifest: {
      capabilities: {
        inputModalities: ['text'],
        attachment: { supported: false, kinds: [], modalities: ['text'] },
      },
    },
    attachmentTextExtractionEnabled: true,
    attachmentTextExtractionRuntimeReady: true,
  })
  assert.equal(enabledWithRuntime.imageAttachmentsEnabled, false)
  assert.equal(enabledWithRuntime.fileAttachmentsEnabled, true)
  assert.equal(enabledWithRuntime.attachmentsEnabled, true)
})

test('terminal output context strips controls, bounds inserted output, and builds composer blocks', () => {
  const output = extractTerminalOutputContext({
    mode: 'selected_or_visible',
    selectedText: '',
    visibleText: `\u001b[31m${'x'.repeat(TERMINAL_CHAT_OUTPUT_MAX_CHARS + 12)}\u001b[0m`,
    maxChars: TERMINAL_CHAT_OUTPUT_MAX_CHARS,
  })

  assert.equal(output.truncated, true)
  assert.equal(output.text.length, TERMINAL_CHAT_OUTPUT_MAX_CHARS)
  assert.equal(output.text.includes('\u001b'), false)

  const draft = buildTerminalChatDraftInjection({
    action: 'explain_error',
    session: {
      id: 'term_1',
      threadId: 'thread_1',
      cwd: 'C:\\repo',
      shell: 'pwsh',
    },
    output,
  })

  assert.equal(draft.source, 'terminal_output')
  assert.equal(draft.mode, 'append')
  assert.equal(draft.composerBlocks.length, 2)
  assert.equal(draft.composerBlocks[0].type, 'text')
  assert.match(draft.composerBlocks[0].text, /Explain the last terminal error/)
  assert.match(draft.composerBlocks[0].text, /Session ID: term_1/)
  assert.equal(draft.composerBlocks[1].type, 'code')
  assert.equal(draft.composerBlocks[1].language, 'terminal')
})

test('terminal memory snapshot payload tags session and thread provenance explicitly', () => {
  const payload = buildTerminalMemorySnapshotPayload({
    session: {
      id: 'term_memory',
      threadId: 'thread_memory',
      project: 'C:\\repo',
      cwd: 'C:\\repo',
      shell: 'pwsh',
    },
    output: { text: 'npm test failed', truncated: false, maxChars: 100 },
    projectFolder: 'C:\\repo',
    targetScope: 'thread',
    acceptedAt: 12345,
  })

  assert.equal(payload.source, 'terminal_summary')
  assert.equal(payload.scope, 'thread')
  assert.equal(payload.threadId, 'thread_memory')
  assert.equal(payload.originThreadId, 'thread_memory')
  assert.ok(payload.tags.includes('terminal_summary'))
  assert.ok(payload.tags.includes('terminal_session:term_memory'))
  assert.ok(payload.tags.includes('terminal_thread:thread_memory'))
  assert.ok(payload.tags.includes('terminal_accepted_at:12345'))
  assert.match(payload.content, /npm test failed/)
})
