import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let ChatPanelTimelineArea = null

function baseProps(overrides = {}) {
  return {
    notices: [],
    onDismissNotice: () => {},
    onSuppressNoticeForSession: () => {},
    onNoticeAction: () => {},
    hiddenTimelineCount: 0,
    onLoadOlderEntries: () => {},
    visibleTimelineLength: 1,
    streamingMessage: null,
    configuredProvidersCount: 1,
    chatMode: 'execute',
    timelineBlocks: [],
    liveExecutionTurns: {},
    projectFolder: '',
    actionsDisabled: false,
    planState: null,
    onPlanBundleSubmit: () => {},
    onPlanImplement: () => {},
    onPlanContinue: () => {},
    onPlanRevisit: () => {},
    onPlanRequest: () => {},
    isStreaming: false,
    webPreview: null,
    onApproveWebPreview: () => {},
    onCancelWebPreview: () => {},
    jobsModalOpen: false,
    backgroundJobs: [],
    jobsLoading: false,
    jobsError: '',
    jobsLastUpdated: 0,
    jobsStoppingId: '',
    onRefreshBackgroundJobs: () => {},
    onStopBackgroundJob: () => {},
    onStopAllBackgroundJobs: () => {},
    onCloseJobsModal: () => {},
    devPerfEnabled: false,
    reasoningDiagnosticsOpen: false,
    onCloseReasoningDiagnostics: () => {},
    createThreadModalOpen: false,
    newThreadTitle: '',
    onNewThreadTitleChange: () => {},
    onCreateThreadSubmit: () => {},
    onCloseCreateThreadModal: () => {},
    renameThreadModalOpen: false,
    renameThreadTitle: '',
    onRenameThreadTitleChange: () => {},
    onRenameThreadSubmit: () => {},
    onCloseRenameThreadModal: () => {},
    clearThreadModalOpen: false,
    clearThreadAction: 'clear',
    activeThreadTitle: '',
    onConfirmClearConversation: () => {},
    onCloseClearThreadModal: () => {},
    bottomRef: null,
    terminalMemorySuggestionCard: null,
    ...overrides,
  }
}

function makeRunbookBlock(id, turnId, createdAt) {
  return {
    kind: 'runbook',
    id,
    turnId,
    activities: [{
      id: `${id}-activity`,
      turnId,
      type: 'turn',
      turnState: 'started',
      createdAt,
    }],
  }
}

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/ChatPanelTimelineArea.jsx')
  ChatPanelTimelineArea = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('ChatPanelTimelineArea hides live turn runbook while streaming', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      isStreaming: true,
      timelineBlocks: [makeRunbookBlock('run-1', 'turn-1', 1_000_000)],
      visibleTimelineLength: 1,
    })),
  )

  assert.doesNotMatch(html, /Turn runbook \|/)
})

test('ChatPanelTimelineArea renders the live execution block for the active runbook turn', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      isStreaming: true,
      timelineBlocks: [makeRunbookBlock('run-1', 'turn-1', 1_000_000)],
      liveExecutionTurns: {
        'turn-1': {
          turnId: 'turn-1',
          status: 'active',
          createdAt: 1_000_000,
          updatedAt: 1_001_000,
          eventOrder: ['evt-1'],
          eventsById: {
            'evt-1': {
              id: 'evt-1',
              kind: 'tool_start',
              summary: 'write_file',
              detail: '',
              activity: {
                id: 'evt-1',
                type: 'executing',
                toolName: 'write_file',
                label: 'write_file',
                createdAt: 1_000_000,
              },
            },
          },
        },
      },
      visibleTimelineLength: 1,
    })),
  )

  assert.match(html, /data-live-execution-stream-root="true"/)
  assert.doesNotMatch(html, /turn-runbook-turn-1/)
})

test('ChatPanelTimelineArea keeps live execution in the runbook lane when the assistant anchor is outside the visible window', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      isStreaming: true,
      timelineBlocks: [makeRunbookBlock('run-hidden', 'turn-hidden', 1_000_000)],
      timelineBlockMeta: {
        assistantMessageTurnIds: [],
        runbookTurnIds: ['turn-hidden'],
        lastRunbookIndex: 0,
      },
      liveExecutionTurns: {
        'turn-hidden': {
          turnId: 'turn-hidden',
          status: 'active',
          createdAt: 1_000_000,
          updatedAt: 1_001_000,
          eventOrder: ['evt-hidden'],
          eventsById: {
            'evt-hidden': {
              id: 'evt-hidden',
              kind: 'tool_start',
              summary: 'list_directory',
              detail: '',
              activity: {
                id: 'evt-hidden',
                type: 'executing',
                toolName: 'list_directory',
                label: 'list_directory',
                createdAt: 1_000_000,
              },
            },
          },
        },
      },
      visibleTimelineLength: 1,
    })),
  )

  assert.match(html, /data-live-execution-stream-root="true"/)
  assert.doesNotMatch(html, /turn-runbook-turn-hidden/)
})

test('ChatPanelTimelineArea keeps a visible pending execution stream before the first curated event arrives', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      isStreaming: true,
      timelineBlocks: [makeRunbookBlock('run-pending', 'turn-pending', 1_000_000)],
      liveExecutionTurns: {
        'turn-pending': {
          turnId: 'turn-pending',
          status: 'active',
          createdAt: 1_000_000,
          updatedAt: 1_001_000,
          eventOrder: ['evt-turn-start'],
          eventsById: {
            'evt-turn-start': {
              id: 'evt-turn-start',
              kind: 'transport',
              summary: 'Turn started',
              activity: {
                id: 'evt-turn-start',
                type: 'turn',
                eventKind: 'turn_started',
                label: 'Turn started',
                createdAt: 1_000_000,
              },
            },
          },
        },
      },
      visibleTimelineLength: 1,
    })),
  )

  assert.match(html, /data-live-execution-stream-root="true"/)
  assert.match(html, /Starting turn/)
  assert.match(html, /Starting turn/)
})

test('ChatPanelTimelineArea keeps the execution stream visible while streaming reasoning-only turns before answer text exists', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      isStreaming: true,
      streamingMessage: {
        id: 'assistant-streaming',
        role: 'assistant',
        content: '',
        status: 'streaming',
        streamMeta: {
          turnId: 'turn-streaming',
          startedAt: 1_000_000,
        },
      },
      visibleTimelineLength: 1,
    })),
  )

  assert.match(html, /data-live-execution-stream-root="true"/)
  assert.match(html, /Starting turn/)
  assert.match(html, /Starting turn/)
})

test('ChatPanelTimelineArea binds a streaming assistant without turn metadata to the sole active compaction turn', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      isStreaming: true,
      visibleTimelineLength: 1,
      timelineBlocks: [makeRunbookBlock('run-compaction', 'turn-compaction', 1_000_000)],
      streamingMessage: {
        id: 'assistant-compaction',
        role: 'assistant',
        content: '',
        status: 'streaming',
        streamMeta: {
          threadId: 'thread-compaction',
          startedAt: 1_000_000,
        },
      },
      liveExecutionTurns: {
        'turn-compaction': {
          turnId: 'turn-compaction',
          threadId: 'thread-compaction',
          status: 'active',
          createdAt: 1_000_000,
          updatedAt: 1_001_000,
          eventOrder: ['evt-compaction'],
          eventsById: {
            'evt-compaction': {
              id: 'evt-compaction',
              kind: 'compaction',
              status: 'active',
              activity: {
                id: 'evt-compaction',
                type: 'info',
                eventKind: 'openai_compaction_event',
                status: 'running',
                label: 'Compacting context',
                createdAt: 1_000_000,
              },
            },
          },
        },
      },
    })),
  )

  assert.match(html, /Compacting context/)
  assert.doesNotMatch(html, /Starting turn/)
})

test('ChatPanelTimelineArea does not bind a streaming assistant without turn metadata to a compaction turn from another thread', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      isStreaming: true,
      visibleTimelineLength: 1,
      timelineBlocks: [makeRunbookBlock('run-compaction-other-thread', 'turn-compaction-other-thread', 1_000_000)],
      streamingMessage: {
        id: 'assistant-compaction-other-thread',
        role: 'assistant',
        content: '',
        status: 'streaming',
        streamMeta: {
          threadId: 'thread-streaming',
          startedAt: 1_000_000,
        },
      },
      liveExecutionTurns: {
        'turn-compaction-other-thread': {
          turnId: 'turn-compaction-other-thread',
          threadId: 'thread-other',
          status: 'active',
          createdAt: 1_000_000,
          updatedAt: 1_001_000,
          eventOrder: ['evt-compaction-other-thread'],
          eventsById: {
            'evt-compaction-other-thread': {
              id: 'evt-compaction-other-thread',
              kind: 'compaction',
              status: 'active',
              activity: {
                id: 'evt-compaction-other-thread',
                type: 'info',
                eventKind: 'openai_compaction_event',
                status: 'running',
                label: 'Compacting context',
                createdAt: 1_000_000,
              },
            },
          },
        },
      },
    })),
  )

  assert.match(html, /Starting turn/)
  assert.equal((html.match(/Compacting context/g) || []).length, 1)
})

test('ChatPanelTimelineArea respects the live execution rollout flag', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      isStreaming: true,
      liveExecutionEnabled: false,
      timelineBlocks: [makeRunbookBlock('run-1', 'turn-1', 1_000_000)],
      liveExecutionTurns: {
        'turn-1': {
          turnId: 'turn-1',
          status: 'active',
          createdAt: 1_000_000,
          updatedAt: 1_001_000,
          eventOrder: ['evt-1'],
          eventsById: {
            'evt-1': {
              id: 'evt-1',
              kind: 'tool_progress',
              summary: 'Preparing 1 action...',
              detail: '',
            },
          },
        },
      },
      visibleTimelineLength: 1,
    })),
  )

  assert.doesNotMatch(html, /data-live-execution-stream-root="true"/)
})

test('ChatPanelTimelineArea renders runbook after turn completes', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      isStreaming: false,
      timelineBlocks: [makeRunbookBlock('run-1', 'turn-1', 1_000_000)],
      visibleTimelineLength: 1,
    })),
  )

  assert.match(html, /turn-runbook-turn-1/)
})

test('ChatPanelTimelineArea renders the terminal memory suggestion card in the timeline lane instead of the dock', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      visibleTimelineLength: 1,
      timelineBlocks: [{
        kind: 'entry',
        id: 'assistant-terminal-memory',
        entry: {
          kind: 'message',
          id: 'assistant-terminal-memory',
          message: {
            id: 'assistant-terminal-memory',
            role: 'assistant',
            content: 'Closed the session and captured the environment fix.',
            status: 'done',
          },
        },
      }],
      terminalMemorySuggestionCard: React.createElement('div', {
        'data-ui': 'terminal-memory-suggestion-card',
      }, 'Save this terminal insight to Memory?'),
    })),
  )

  assert.match(html, /Closed the session and captured the environment fix\./)
  assert.match(html, /data-ui="terminal-memory-suggestion-card"/)
  assert.match(html, /Save this terminal insight to Memory\?/)
})

test('ChatPanelTimelineArea keeps older runbooks visible during a new streaming turn', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      isStreaming: true,
      timelineBlocks: [
        makeRunbookBlock('run-old', 'turn-old', 1_000_000),
        makeRunbookBlock('run-live', 'turn-live', 2_000_000),
      ],
      visibleTimelineLength: 2,
    })),
  )

  const matches = html.match(/turn-runbook-turn-/g) || []
  assert.equal(matches.length, 1)
})

test('ChatPanelTimelineArea keeps one live execution block above the streaming answer', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      isStreaming: true,
      timelineBlocks: [makeRunbookBlock('run-live', 'turn-live', 2_000_000)],
      streamingMessage: {
        id: 'assistant-live',
        role: 'assistant',
        content: 'Working...',
        status: 'streaming',
        streamMeta: { turnId: 'turn-live' },
      },
      liveExecutionTurns: {
        'turn-live': {
          turnId: 'turn-live',
          status: 'active',
          createdAt: 2_000_000,
          updatedAt: 2_001_000,
          eventOrder: ['evt-1'],
          eventsById: {
            'evt-1': {
              id: 'evt-1',
              kind: 'tool_start',
              summary: 'write_file',
              detail: '',
              activity: {
                id: 'evt-1',
                type: 'executing',
                toolName: 'write_file',
                label: 'write_file',
                createdAt: 2_000_000,
              },
            },
          },
        },
      },
      visibleTimelineLength: 1,
    })),
  )

  const matches = html.match(/data-live-execution-stream-root="true"/g) || []
  assert.equal(matches.length, 1)
  assert.doesNotMatch(html, /Thought Process/)
  assert.ok(html.indexOf('data-live-execution-stream-root="true"') < html.indexOf('Working...'))
})

test('ChatPanelTimelineArea keeps an anchored streaming answer before newer activity-only plan turns', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const streamingMessage = {
    id: 'assistant-direction',
    role: 'assistant',
    content: 'Direction ready for review.',
    status: 'streaming',
    streamMeta: { turnId: 'turn-direction' },
  }
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      isStreaming: true,
      timelineBlocks: [
        {
          kind: 'entry',
          id: 'entry-direction',
          entry: {
            kind: 'message',
            id: 'msg:assistant-direction',
            message: streamingMessage,
          },
        },
        makeRunbookBlock('run-direction', 'turn-direction', 1_000_000),
        makeRunbookBlock('run-plan-draft', 'turn-plan-draft', 2_000_000),
      ],
      timelineBlockMeta: {
        assistantMessageTurnIds: ['turn-direction'],
        runbookTurnIds: ['turn-direction', 'turn-plan-draft'],
        lastRunbookIndex: 2,
      },
      streamingMessage,
      liveExecutionTurns: {
        'turn-plan-draft': {
          turnId: 'turn-plan-draft',
          status: 'active',
          createdAt: 2_000_000,
          updatedAt: 2_001_000,
          eventOrder: ['evt-plan-draft'],
          eventsById: {
            'evt-plan-draft': {
              id: 'evt-plan-draft',
              kind: 'tool_start',
              summary: 'Updated plan draft',
              detail: '',
              activity: {
                id: 'evt-plan-draft',
                type: 'executing',
                toolName: 'plan_update',
                label: 'Updated plan draft',
                createdAt: 2_000_000,
              },
            },
          },
        },
      },
      visibleTimelineLength: 3,
    })),
  )

  assert.equal((html.match(/Direction ready for review\./g) || []).length, 1)
  assert.ok(html.indexOf('Direction ready for review.') < html.indexOf('turn-plan-draft'))
})

test('ChatPanelTimelineArea does not render a finalized assistant message again from stale streaming state', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const finalizedMessage = {
    id: 'assistant-finalized',
    role: 'assistant',
    content: 'Final answer only.',
    status: 'done',
    streamMeta: { turnId: 'turn-finalized' },
  }
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      timelineBlocks: [{
        kind: 'entry',
        id: 'entry-finalized',
        entry: {
          kind: 'message',
          id: 'msg:assistant-finalized',
          message: finalizedMessage,
        },
      }],
      streamingMessage: finalizedMessage,
      visibleTimelineLength: 1,
    })),
  )

  const matches = html.match(/Final answer only\./g) || []
  assert.equal(matches.length, 1)
})

test('ChatPanelTimelineArea does not render an orphan streaming file footer after turn completion', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const turnId = 'turn-stale-streaming-footer'
  const finalizedMessage = {
    id: 'assistant-stale-footer',
    role: 'assistant',
    content: 'Scientific calculator upgrade complete.',
    status: 'done',
    streamMeta: { turnId },
  }
  const runbookBlock = {
    ...makeRunbookBlock('run-stale-footer', turnId, 1_000_000),
    fileChanges: [{
      filePath: 'calculator.py',
      changeType: 'edit',
      addedLines: 2,
      removedLines: 2,
    }],
  }
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      timelineBlocks: [
        {
          kind: 'entry',
          id: 'entry-stale-footer',
          entry: {
            kind: 'message',
            id: 'msg-stale-footer',
            message: finalizedMessage,
          },
        },
        runbookBlock,
      ],
      streamingMessage: finalizedMessage,
      liveExecutionTurns: {
        [turnId]: {
          turnId,
          status: 'done',
          createdAt: 1_000_000,
          updatedAt: 1_021_000,
          eventOrder: ['reasoning-stale-footer'],
          eventsById: {
            'reasoning-stale-footer': {
              id: 'reasoning-stale-footer',
              kind: 'reasoning',
              status: 'done',
              detail: 'Upgraded the calculator.',
            },
          },
        },
      },
      visibleTimelineLength: 2,
    })),
  )

  assert.equal((html.match(/data-turn-shell="true"/g) || []).length, 1)
  assert.equal((html.match(/data-turn-header-dock-row="files"/g) || []).length, 1)
  const timelineBlockIndex = html.indexOf('data-chat-timeline-block=')
  const shellIndex = html.indexOf('data-turn-shell="true"')
  assert.ok(timelineBlockIndex >= 0)
  assert.ok(shellIndex > timelineBlockIndex)
  assert.match(html, /aria-controls="turn-file-changes-turn-stale-streaming-footer-timeline"/)
})

test('ChatPanelTimelineArea keeps the streaming footer visible while an active turn is still streaming file changes', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const turnId = 'turn-live-footer'
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      isStreaming: true,
      timelineBlocks: [{
        ...makeRunbookBlock('run-live-footer', turnId, 1_000_000),
        fileChanges: [{
          filePath: 'calculator.py',
          changeType: 'edit',
          addedLines: 1,
          removedLines: 0,
        }],
      }],
      streamingMessage: {
        id: 'assistant-live-footer',
        role: 'assistant',
        content: '',
        status: 'streaming',
        streamMeta: { turnId },
      },
      liveExecutionTurns: {
        [turnId]: {
          turnId,
          status: 'active',
          createdAt: 1_000_000,
          updatedAt: 1_001_000,
          eventOrder: ['evt-live-footer'],
          eventsById: {
            'evt-live-footer': {
              id: 'evt-live-footer',
              kind: 'tool_start',
              summary: 'edit_file',
              detail: '',
              activity: {
                id: 'evt-live-footer',
                type: 'executing',
                toolName: 'edit_file',
                label: 'edit_file',
                createdAt: 1_000_000,
              },
            },
          },
        },
      },
      visibleTimelineLength: 1,
    })),
  )

  assert.match(html, /data-turn-shell="true"/)
  assert.match(html, /data-turn-header-dock-row="files"/)
  assert.match(html, /aria-controls="turn-file-changes-turn-live-footer-streaming"/)
})

test('ChatPanelTimelineArea streaming shell keeps execution above answer and files below', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const turnId = 'turn-stream-shell-order'
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      isStreaming: true,
      timelineBlocks: [{
        ...makeRunbookBlock('run-stream-shell-order', turnId, 1_000_000),
        fileChanges: [{
          filePath: 'streamed.js',
          changeType: 'edit',
          addedLines: 3,
          removedLines: 1,
        }],
      }],
      streamingMessage: {
        id: 'assistant-stream-shell-order',
        role: 'assistant',
        content: 'Working on the streamed edit...',
        status: 'streaming',
        streamMeta: { turnId },
      },
      liveExecutionTurns: {
        [turnId]: {
          turnId,
          status: 'active',
          createdAt: 1_000_000,
          updatedAt: 1_001_000,
          eventOrder: ['evt-stream-shell'],
          eventsById: {
            'evt-stream-shell': {
              id: 'evt-stream-shell',
              kind: 'tool_start',
              summary: 'edit_file',
              detail: '',
              activity: {
                id: 'evt-stream-shell',
                type: 'executing',
                toolName: 'edit_file',
                label: 'edit_file',
                createdAt: 1_000_000,
              },
            },
          },
        },
      },
      visibleTimelineLength: 1,
    })),
  )

  const executionSlot = html.indexOf('data-turn-shell-slot="execution"')
  const answerSlot = html.indexOf('data-turn-shell-slot="answer"')
  const filesSlot = html.indexOf('data-turn-shell-slot="files"')
  const answerText = html.indexOf('Working on the streamed edit...')
  const filesHeader = html.indexOf('data-turn-header-dock-row="files"')
  assert.ok(executionSlot >= 0)
  assert.ok(answerSlot > executionSlot)
  assert.ok(filesSlot > answerSlot)
  assert.ok(answerText > executionSlot)
  assert.ok(filesHeader > answerText)
})

test('ChatPanelTimelineArea renders historical reasoning inside the execution stream instead of a separate panel', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      timelineBlocks: [{
        kind: 'entry',
        entry: {
          id: 'msg-1',
          kind: 'message',
          message: {
            id: 'assistant-1',
            role: 'assistant',
            content: 'Done.',
            status: 'done',
            reasoning: 'first step\n\n---\n\nsecond step',
            reasoningDone: true,
            streamMeta: { turnId: 'turn-history' },
          },
        },
      }],
      liveExecutionTurns: {
        'turn-history': {
          turnId: 'turn-history',
          status: 'done',
          createdAt: 1_000_000,
          updatedAt: 1_001_000,
          eventOrder: ['reasoning:1', 'reasoning:2'],
          eventsById: {
            'reasoning:1': {
              id: 'reasoning:1',
              kind: 'reasoning',
              status: 'done',
              detail: 'first step',
            },
            'reasoning:2': {
              id: 'reasoning:2',
              kind: 'reasoning',
              status: 'done',
              detail: 'second step',
            },
          },
        },
      },
      visibleTimelineLength: 1,
    })),
  )

  assert.match(html, /data-live-execution-stream-root="true"/)
  assert.doesNotMatch(html, /Thought Process/)
})

test('ChatPanelTimelineArea hides the empty streaming assistant bubble but keeps the execution stream visible before output arrives', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      isStreaming: true,
      visibleTimelineLength: 0,
      streamingMessage: {
        id: 'assistant-empty',
        role: 'assistant',
        content: '',
        status: 'streaming',
        streamMeta: { turnId: 'turn-empty' },
      },
    })),
  )

  assert.doesNotMatch(html, /prose-chat/)
  assert.match(html, /data-live-execution-stream-root="true"/)
  assert.match(html, /Starting turn/)
})

test('ChatPanelTimelineArea keeps streamed reasoning sentence continuations in a single reasoning card', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      timelineBlocks: [{
        kind: 'entry',
        entry: {
          id: 'msg-merge',
          kind: 'message',
          message: {
            id: 'assistant-merge',
            role: 'assistant',
            content: 'Done.',
            status: 'done',
            streamMeta: { turnId: 'turn-merge' },
          },
        },
      }],
      liveExecutionTurns: {
        'turn-merge': {
          turnId: 'turn-merge',
          status: 'done',
          createdAt: 1_000_000,
          updatedAt: 1_001_000,
          eventOrder: ['reasoning:1', 'reasoning:2'],
          eventsById: {
            'reasoning:1': {
              id: 'reasoning:1',
              kind: 'reasoning',
              status: 'done',
              detail: 'Inspecting repo structure Listing the directory to understand the project context before deciding on the',
            },
            'reasoning:2': {
              id: 'reasoning:2',
              kind: 'reasoning',
              status: 'done',
              detail: ' appropriate SQL database setup.',
            },
          },
        },
      },
      visibleTimelineLength: 1,
    })),
  )

  assert.match(html, /Inspecting repo structure Listing the directory to understand the project context before deciding on the appropriate SQL database setup\./)
  assert.equal((html.match(/data-chat-render="reasoning-rail"/g) || []).length, 1)
})

test('ChatPanelTimelineArea renders long execution-stream reasoning as plain prose without heading promotion or collapse chrome', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const detail = [
    'Planning comprehensive schema and seed improvements',
    'The plan is to comprehensively enhance the database schema with new enums, tables, constraints, triggers, indexes, and matching seed updates while keeping the migration readable and idempotent.',
    'Next I will rewrite schema.sql in the right dependency order and then update seed.sql to match.',
  ].join(' ')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      timelineBlocks: [{
        kind: 'entry',
        entry: {
          id: 'msg-long',
          kind: 'message',
          message: {
            id: 'assistant-long',
            role: 'assistant',
            content: 'Done.',
            status: 'done',
            streamMeta: { turnId: 'turn-long' },
          },
        },
      }],
      liveExecutionTurns: {
        'turn-long': {
          turnId: 'turn-long',
          status: 'done',
          createdAt: 1_000_000,
          updatedAt: 1_001_000,
          eventOrder: ['reasoning:1'],
          eventsById: {
            'reasoning:1': {
              id: 'reasoning:1',
              kind: 'reasoning',
              status: 'done',
              detail,
            },
          },
        },
      },
      visibleTimelineLength: 1,
    })),
  )

  assert.match(html, /Planning comprehensive schema and seed improvements/)
  assert.doesNotMatch(html, /chat-markdown-heading-2/)
  assert.doesNotMatch(html, /Hide reasoning|Show reasoning/)
})

test('ChatPanelTimelineArea renders the execution stream above the completed assistant message for the same turn', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      timelineBlocks: [
        {
          kind: 'entry',
          entry: {
            id: 'msg-1',
            kind: 'message',
            message: {
              id: 'assistant-1',
              role: 'assistant',
              content: 'Done - created schema.sql',
              status: 'done',
              streamMeta: { turnId: 'turn-order' },
            },
          },
        },
        makeRunbookBlock('run-order', 'turn-order', 1_000_000),
      ],
      liveExecutionTurns: {
        'turn-order': {
          turnId: 'turn-order',
          status: 'done',
          createdAt: 1_000_000,
          updatedAt: 1_001_000,
          eventOrder: ['evt-1'],
          eventsById: {
            'evt-1': {
              id: 'evt-1',
              kind: 'tool_start',
              activity: {
                id: 'evt-1',
                type: 'executing',
                toolName: 'write_file',
                label: 'write_file',
                createdAt: 1_000_000,
              },
            },
          },
        },
      },
      visibleTimelineLength: 2,
    })),
  )

  const streamIndex = html.indexOf('data-live-execution-stream-root="true"')
  const messageIndex = html.indexOf('data-final-answer-document="true"')
  assert.ok(streamIndex >= 0)
  assert.ok(messageIndex >= 0)
  assert.ok(streamIndex < messageIndex)
  assert.match(html, /Done - created/)
  assert.match(html, /schema\.sql/)
  const matches = html.match(/data-live-execution-stream-root="true"/g) || []
  assert.equal(matches.length, 1)
})

test('ChatPanelTimelineArea places execution above the answer and files below it', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const turnId = 'turn-header-dock'
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      timelineBlocks: [
        {
          kind: 'entry',
          id: 'assistant-header-dock',
          entry: {
            kind: 'message',
            id: 'assistant-header-dock',
            message: {
              id: 'assistant-header-dock',
              role: 'assistant',
              content: 'Acceptance recheck passed.',
              status: 'done',
              streamMeta: { turnId },
            },
          },
        },
        {
          ...makeRunbookBlock('run-header-dock', turnId, 1_000_000),
          fileChanges: [{
            filePath: 'addom-execution-acceptance.tmp',
            changeType: 'delete',
            addedLines: 0,
            removedLines: 1,
          }],
        },
      ],
      liveExecutionTurns: {
        [turnId]: {
          turnId,
          status: 'done',
          createdAt: 1_000_000,
          updatedAt: 1_021_000,
          eventOrder: ['reasoning-header-dock'],
          eventsById: {
            'reasoning-header-dock': {
              id: 'reasoning-header-dock',
              kind: 'reasoning',
              status: 'done',
              detail: 'Verified the acceptance flow.',
            },
          },
        },
      },
      visibleTimelineLength: 2,
    })),
  )

  const executionIndex = html.indexOf('data-turn-header-dock-row="execution"')
  const filesIndex = html.indexOf('data-turn-header-dock-row="files"')
  const messageIndex = html.indexOf('Acceptance recheck passed.')
  const answerSlotIndex = html.indexOf('data-turn-shell-slot="answer"')
  const filesSlotIndex = html.indexOf('data-turn-shell-slot="files"')
  const executionSlotIndex = html.indexOf('data-turn-shell-slot="execution"')
  assert.ok(messageIndex >= 0)
  assert.ok(executionIndex >= 0)
  assert.ok(filesIndex >= 0)
  assert.ok(executionSlotIndex < answerSlotIndex)
  assert.ok(answerSlotIndex < filesSlotIndex)
  assert.ok(executionIndex < messageIndex)
  assert.ok(messageIndex < filesIndex)
  assert.equal((html.match(/data-turn-shell="true"/g) || []).length, 1)
  assert.doesNotMatch(html, /data-turn-header-dock="start"|data-turn-header-dock="end"/)
  assert.doesNotMatch(html, /data-turn-header-dock-joined="true"/)
  assert.match(html, /data-turn-boundary="spaced"/)
})

test('ChatPanelTimelineArea moves a legacy preceding runbook into the same turn shell', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const turnId = 'turn-header-dock-legacy'
  const runbookBlock = {
    ...makeRunbookBlock('run-header-dock-legacy', turnId, 1_000_000),
    fileChanges: [{
      filePath: 'legacy.tmp',
      changeType: 'delete',
      addedLines: 0,
      removedLines: 1,
    }],
  }
  const messageBlock = {
    kind: 'entry',
    id: 'assistant-header-dock-legacy',
    entry: {
      kind: 'message',
      id: 'assistant-header-dock-legacy',
      message: {
        id: 'assistant-header-dock-legacy',
        role: 'assistant',
        content: 'Legacy final answer.',
        status: 'done',
        streamMeta: { turnId },
      },
    },
  }
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      timelineBlocks: [runbookBlock, messageBlock],
      liveExecutionTurns: {
        [turnId]: {
          turnId,
          status: 'done',
          createdAt: 1_000_000,
          updatedAt: 1_021_000,
          eventOrder: ['reasoning-header-dock-legacy'],
          eventsById: {
            'reasoning-header-dock-legacy': {
              id: 'reasoning-header-dock-legacy',
              kind: 'reasoning',
              status: 'done',
              detail: 'Verified legacy ordering.',
            },
          },
        },
      },
      visibleTimelineLength: 2,
    })),
  )

  const messageIndex = html.indexOf('Legacy final answer.')
  const shellIndex = html.indexOf('data-turn-shell="true"')
  const executionIndex = html.indexOf('data-turn-header-dock-row="execution"')
  const filesIndex = html.indexOf('data-turn-header-dock-row="files"')
  assert.ok(messageIndex >= 0)
  assert.ok(shellIndex >= 0)
  assert.ok(executionIndex > shellIndex)
  assert.ok(executionIndex < messageIndex)
  assert.ok(filesIndex > messageIndex)
})

test('ChatPanelTimelineArea keeps assistant commentary in the execution stream and out of the conclusion bubble', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const commentary = 'I will inspect the workspace first.'
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      timelineBlocks: [{
        kind: 'entry',
        entry: {
          id: 'msg-commentary-surface',
          kind: 'message',
          message: {
            id: 'assistant-commentary-surface',
            role: 'assistant',
            content: 'Conclusion: the files are now in sync.',
            reasoning: commentary,
            reasoningDone: true,
            status: 'done',
            streamMeta: { turnId: 'turn-commentary-surface' },
          },
        },
      }],
      liveExecutionTurns: {
        'turn-commentary-surface': {
          turnId: 'turn-commentary-surface',
          status: 'done',
          createdAt: 1_000_000,
          updatedAt: 1_001_000,
          eventOrder: ['commentary:1'],
          eventsById: {
            'commentary:1': {
              id: 'commentary:1',
              kind: 'reasoning',
              status: 'done',
              detail: commentary,
              activity: {
                id: 'assistant_commentary:turn-commentary-surface:1',
                type: 'reasoning',
                eventKind: 'assistant_commentary',
                label: 'Assistant update',
                detail: commentary,
                createdAt: 1_000_100,
              },
            },
          },
        },
      },
      visibleTimelineLength: 1,
    })),
  )

  const commentaryMatches = html.match(/I will inspect the workspace first\./g) || []
  assert.equal(commentaryMatches.length, 1)
  const streamIndex = html.indexOf('data-live-execution-stream-root="true"')
  const commentaryIndex = html.indexOf(commentary)
  const conclusionIndex = html.indexOf('Conclusion: the files are now in sync.')
  assert.ok(streamIndex >= 0)
  assert.ok(commentaryIndex > streamIndex)
  assert.ok(commentaryIndex < conclusionIndex)
})

test('ChatPanelTimelineArea hides stale token-only reasoning placeholders from the execution stream', () => {
  assert.equal(typeof ChatPanelTimelineArea, 'function')
  const html = renderToStaticMarkup(
    React.createElement(ChatPanelTimelineArea, baseProps({
      timelineBlocks: [{
        kind: 'entry',
        entry: {
          id: 'msg-token-only-reasoning',
          kind: 'message',
          message: {
            id: 'assistant-token-only-reasoning',
            role: 'assistant',
            content: 'Final answer after hidden reasoning.',
            reasoning: '',
            reasoningDone: true,
            status: 'done',
            streamMeta: { turnId: 'turn-token-only-reasoning' },
          },
        },
      }],
      liveExecutionTurns: {
        'turn-token-only-reasoning': {
          turnId: 'turn-token-only-reasoning',
          status: 'done',
          createdAt: 1_000_000,
          updatedAt: 1_001_000,
          eventOrder: ['reasoning-token-only'],
          eventsById: {
            'reasoning-token-only': {
              id: 'reasoning-token-only',
              kind: 'reasoning',
              status: 'done',
              detail: 'reasoning tokens: 82',
              activity: {
                id: 'reasoning_done:turn-token-only-reasoning',
                type: 'reasoning',
                eventKind: 'reasoning_done',
                label: 'Reasoning summary captured',
                detail: 'reasoning tokens: 82',
                createdAt: 1_000_100,
              },
            },
          },
        },
      },
      visibleTimelineLength: 1,
    })),
  )

  assert.doesNotMatch(html, /data-live-execution-stream-root="true"/)
  assert.doesNotMatch(html, /reasoning tokens: 82/)
  assert.match(html, /Final answer after hidden reasoning\./)
})
