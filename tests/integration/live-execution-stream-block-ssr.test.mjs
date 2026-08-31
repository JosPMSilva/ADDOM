import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let LiveExecutionStreamBlock = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/LiveExecutionStreamBlock.jsx')
  LiveExecutionStreamBlock = mod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('canonical command sessions render as one collapsed calm row', () => {
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-canonical-command',
        status: 'active',
        createdAt: 100,
        updatedAt: 200,
        itemOrder: ['tool:command-1'],
        sessionsById: {
          'command-1': {
            id: 'command-1',
            toolKind: 'command',
            state: 'failed',
            inputDetail: 'npm test',
            detail: 'exit 1',
            outputs: [{ eventId: 'out-1', stream: 'stderr', detail: 'test failed' }],
          },
        },
        reasoningById: {},
      },
    }),
  )

  assert.match(html, /Working…/)
  assert.match(html, /chat-typo-exec-row-verb[^"]*text-text-tertiary[^"]*">Failed</)
  assert.match(html, /chat-typo-exec-row-identity[^"]*text-text-subtle[^"]*">npm test</)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /data-ui="execution-evidence-row"[\s\S]*<button[^>]*class="[^"]*\bpx-2\b/)
  assert.match(html, /Failed/)
  assert.match(html, />×</)
  assert.doesNotMatch(html, /test failed/)
  assert.doesNotMatch(html, /Execution Stream/)
  assert.doesNotMatch(html, /event/)
})

test('canonical commentary renders normalized markdown instead of tokenized bold fragments', () => {
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-canonical-commentary',
        status: 'active',
        createdAt: 100,
        updatedAt: 200,
        itemOrder: ['reasoning:execution_commentary:turn-canonical-commentary:1'],
        sessionsById: {},
        reasoningById: {
          'execution_commentary:turn-canonical-commentary:1': {
            id: 'execution_commentary:turn-canonical-commentary:1',
            role: 'commentary',
            detail: 'Rendering check passed.\n\n**Rendering\n check\n passed\n**',
          },
        },
      },
    }),
  )

  assert.match(html, /data-ui="execution-commentary"/)
  assert.match(html, /prose-chat/)
  assert.match(html, /Rendering check passed/)
  assert.doesNotMatch(html, />\*\*</)
  assert.doesNotMatch(html, />\.<\/strong>/)
})

test('canonical commentary coalesces legacy persisted token rows into one markdown row', () => {
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-legacy-token-rows',
        status: 'active',
        createdAt: 100,
        updatedAt: 200,
        itemOrder: [
          'reasoning:execution_commentary:turn-legacy-token-rows',
          'reasoning:persisted:40691:commentary',
          'reasoning:persisted:40692:commentary',
          'reasoning:persisted:40693:commentary',
          'reasoning:persisted:40694:commentary',
          'reasoning:persisted:40695:commentary',
        ],
        sessionsById: {},
        reasoningById: {
          'execution_commentary:turn-legacy-token-rows': {
            id: 'execution_commentary:turn-legacy-token-rows',
            role: 'commentary',
            detail: 'Rendering check passed.',
          },
          'persisted:40691:commentary': { id: 'persisted:40691:commentary', role: 'commentary', detail: '**' },
          'persisted:40692:commentary': { id: 'persisted:40692:commentary', role: 'commentary', detail: 'Rendering' },
          'persisted:40693:commentary': { id: 'persisted:40693:commentary', role: 'commentary', detail: ' check' },
          'persisted:40694:commentary': { id: 'persisted:40694:commentary', role: 'commentary', detail: ' passed' },
          'persisted:40695:commentary': { id: 'persisted:40695:commentary', role: 'commentary', detail: '.**' },
        },
      },
    }),
  )

  assert.equal((html.match(/data-ui="execution-commentary"/g) || []).length, 1)
  assert.match(html, /<strong[^>]*>Rendering check passed\.<\/strong>/)
  assert.doesNotMatch(html, />\*\*</)
})

test('settled canonical reasoning collapses to Reasoned briefly rows', () => {
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: false,
      turn: {
        turnId: 'turn-settled-thought',
        status: 'done',
        createdAt: 100,
        updatedAt: 200,
        itemOrder: ['reasoning:execution_reasoning:turn-settled-thought:1'],
        sessionsById: {},
        reasoningById: {
          'execution_reasoning:turn-settled-thought:1': {
            id: 'execution_reasoning:turn-settled-thought:1',
            role: 'reasoning',
            detail: 'All 12 tests pass. Preparing a concise summary.',
          },
        },
      },
    }),
  )

  assert.match(html, /data-thought-collapsed="true"/)
  assert.match(html, />Reasoned</)
  assert.match(html, />briefly</)
  assert.doesNotMatch(html, /Preparing a concise summary/)
})

test('LiveExecutionStreamBlock renders command-first output rows with a single copy menu trigger', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-ssr',
        status: 'done',
        createdAt: 1_000_000,
        updatedAt: 1_002_000,
        eventOrder: ['exec-1', 'result-1', 'output-1'],
        eventsById: {
          'exec-1': {
            id: 'exec-1',
            kind: 'tool_start',
            sessionId: 'session:turn-ssr:step-1',
            summary: 'Running command',
            activity: {
              id: 'exec-1',
              type: 'executing',
              turnId: 'turn-ssr',
              stepId: 'step-1',
              toolName: 'run_command',
              toolInput: {
                command: 'npm test',
              },
              createdAt: 1_000_000,
            },
          },
          'result-1': {
            id: 'result-1',
            kind: 'tool_result',
            sessionId: 'session:turn-ssr:step-1',
            summary: 'Command finished',
            activity: {
              id: 'result-1',
              type: 'result',
              turnId: 'turn-ssr',
              stepId: 'step-1',
              toolName: 'run_command',
              stdoutPreview: 'persisted stdout preview',
              createdAt: 1_001_000,
            },
          },
          'output-1': {
            id: 'output-1',
            kind: 'tool_output',
            sessionId: 'session:turn-ssr:step-1',
            status: 'done',
            toolName: 'run_command',
            stream: 'stdout',
            detail: 'visible stdout output',
            createdAt: 1_001_000,
            updatedAt: 1_002_000,
          },
        },
      },
    }),
  )

  assert.match(html, /data-live-execution-stream-root="true"/)
  assert.match(html, />Ran</)
  assert.match(html, /> command</)
  assert.match(html, /npm test/)
  assert.match(html, /Open copy options/)
  assert.match(html, /aria-haspopup="menu"/)
  assert.match(html, /data-ui="execution-output-copy-trigger"/)
  assert.doesNotMatch(html, /Copy command/)
  assert.doesNotMatch(html, /Copy visible output/)
  assert.doesNotMatch(html, /Copy persisted preview/)
  assert.doesNotMatch(html, /run_command/)
  assert.doesNotMatch(html, /stderr/)
  assert.doesNotMatch(html, /Command finished in project root/)
})

test('LiveExecutionStreamBlock falls back to a generic output title when command text is unavailable', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: false,
      turn: {
        turnId: 'turn-command-fallback',
        status: 'done',
        createdAt: 100,
        updatedAt: 200,
        eventOrder: ['output-fallback'],
        eventsById: {
          'output-fallback': {
            id: 'output-fallback',
            kind: 'tool_output',
            sessionId: 'session:turn-command-fallback:step-1',
            status: 'done',
            toolName: 'run_command',
            stream: 'stdout',
            detail: 'fallback output body',
            createdAt: 150,
            updatedAt: 200,
          },
        },
      },
    }),
  )

  assert.match(html, />Ran</)
  assert.match(html, /> command</)
  assert.match(html, /Command output/)
  assert.match(html, /fallback output body/)
  assert.match(html, /Open copy options/)
})

test('LiveExecutionStreamBlock strips ANSI control sequences from rendered output and previews', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-ansi',
        status: 'done',
        createdAt: 1_000_000,
        updatedAt: 1_002_000,
        eventOrder: ['result-ansi', 'output-ansi'],
        eventsById: {
          'result-ansi': {
            id: 'result-ansi',
            kind: 'tool_result',
            sessionId: 'session:turn-ansi:step-1',
            summary: 'Command finished',
            activity: {
              id: 'result-ansi',
              type: 'result',
              turnId: 'turn-ansi',
              stepId: 'step-1',
              toolName: 'run_command',
              stdoutPreview: '\u001b[36mnext\u001b[39m',
              createdAt: 1_001_000,
            },
          },
          'output-ansi': {
            id: 'output-ansi',
            kind: 'tool_output',
            sessionId: 'session:turn-ansi:step-1',
            status: 'done',
            toolName: 'run_command',
            stream: 'stdout',
            detail: '\u001b[32mSuccess!\u001b[39m Created app',
            createdAt: 1_001_000,
            updatedAt: 1_002_000,
          },
        },
      },
    }),
  )

  assert.match(html, /Success! Created app/)
  assert.match(html, /Open copy options/)
  assert.equal(html.includes('\u001b['), false)
  assert.equal(html.includes('[32m'), false)
  assert.equal(html.includes('[39m'), false)
})

test('LiveExecutionStreamBlock collapses verbose inline previews behind the detail toggle by default', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-preview-collapse',
        status: 'done',
        createdAt: 100,
        updatedAt: 200,
        eventOrder: ['read-result'],
        eventsById: {
          'read-result': {
            id: 'read-result',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'read-result',
              type: 'result',
              toolName: 'read_file',
              toolInput: { path: 'README.md' },
              result: '# Starter Website\nA simple scaffold.\n## Files\n- index.html\n- styles.css\n- script.js',
            },
          },
        },
      },
    }),
  )

  assert.match(html, />Read</)
  assert.match(html, /data-chat-file-reference="true"[^>]*>README\.md<\/a>/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /Expand Read README\.md details/)
  assert.match(html, /# Starter Website/)
  assert.match(html, /A simple scaffold\./)
  assert.match(html, /## Files/)
  assert.doesNotMatch(html, /- index\.html/)
})

test('LiveExecutionStreamBlock SSR renders heading-only codex reasoning as milestone rows instead of prose cards', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: false,
      turn: {
        turnId: 'turn-ssr-codex-reasoning',
        status: 'done',
        createdAt: 100,
        updatedAt: 200,
        eventOrder: ['reasoning:1', 'tool:1'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'done',
            detail: 'Exploring project structure',
            reasoningMeta: { model: 'gpt-5.3-codex' },
          },
          'tool:1': {
            id: 'tool:1',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'tool:1',
              type: 'result',
              toolName: 'list_directory',
              label: 'Listed in project root',
              toolInput: { path: '.' },
            },
          },
        },
      },
    }),
  )

  assert.match(html, /data-chat-render="reasoning-milestone"/)
  assert.match(html, /Exploring project structure/)
  assert.match(html, /Listed in project root/)
  assert.doesNotMatch(html, /prose-chat-stream/)
})

test('LiveExecutionStreamBlock SSR renders completed fenced reasoning through the shared code block viewport', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: false,
      turn: {
        turnId: 'turn-ssr-fenced-reasoning',
        status: 'done',
        createdAt: 100,
        updatedAt: 200,
        eventOrder: ['reasoning:1'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'done',
            detail: '```js\nconsole.log("shared")\n```',
          },
        },
      },
    }),
  )

  assert.match(html, /data-chat-render="code-block"/)
  assert.match(html, /data-chat-code-viewport="true"/)
  assert.match(html, />js<\/span>/i)
  assert.match(html, />1 line</)
  assert.doesNotMatch(html, /chat-typo-exec-code-header/)
  assert.doesNotMatch(html, /chat-typo-exec-code-body/)
})

test('LiveExecutionStreamBlock SSR collapses long completed reasoning into Reasoned briefly rows', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: false,
      turn: {
        turnId: 'turn-ssr-long-reasoning',
        status: 'done',
        createdAt: 100,
        updatedAt: 200,
        itemOrder: ['reasoning:execution_reasoning:turn-ssr-long-reasoning'],
        sessionsById: {},
        reasoningById: {
          'execution_reasoning:turn-ssr-long-reasoning': {
            id: 'execution_reasoning:turn-ssr-long-reasoning',
            role: 'reasoning',
            detail: [
              'We are in a Windows environment and the user asked to create a calculator with UI.',
              'The execution state is advisory-only, so tools are unavailable and we cannot write files.',
              'We can still explain the approach, compare frameworks, and provide code as plain text.',
              'The final response should stay concise and avoid implying code execution.',
              'This trailing sentence should stay hidden behind the completed-state collapse control.',
            ].join('\n\n'),
          },
        },
      },
    }),
  )

  assert.match(html, /data-thought-collapsed="true"/)
  assert.match(html, />Reasoned</)
  assert.match(html, />briefly</)
  assert.doesNotMatch(html, /trailing sentence should stay hidden/)
  assert.doesNotMatch(html, /Windows environment/)
})
