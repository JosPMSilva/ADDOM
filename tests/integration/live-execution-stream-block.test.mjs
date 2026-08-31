import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let LiveExecutionStreamBlock = null
let rendererUseAppStore = null

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/LiveExecutionStreamBlock.jsx')
  LiveExecutionStreamBlock = mod?.default || null
  const appStoreMod = await ssrLoadRendererModule('/store/useAppStore.js')
  rendererUseAppStore = appStoreMod?.default || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('LiveExecutionStreamBlock renders reasoning rows inline with emphasized typography', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-inline',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1', 'tool:1', 'reasoning:2'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'done',
            detail: '**Preparing** the `database` files',
          },
          'tool:1': {
            id: 'tool:1',
            kind: 'tool_progress',
            activity: {
              id: 'tool:1',
              type: 'pending',
              label: 'Preparing 1 action...',
              createdAt: 200,
            },
          },
          'reasoning:2': {
            id: 'reasoning:2',
            kind: 'reasoning',
            status: 'done',
            detail: '```sql\nselect * from users\n```',
          },
        },
      },
    }),
  )

  assert.doesNotMatch(html, /Execution Stream/)
  assert.match(html, /prose-chat/)
  assert.match(html, /chat-typo-exec-reasoning-prose/)
  assert.match(html, /chat-typo-exec-reasoning-prose max-w-none select-text/)
  assert.doesNotMatch(html, /chat-typo-exec-reasoning-prose max-w-none select-text text-\[16px\] leading-7/)
  assert.match(html, /data-chat-render="reasoning-rail"/)
  assert.match(html, /Preparing/)
  assert.match(html, /database/)
  assert.match(html, /language-sql/)
  assert.match(html, /users/)
  assert.match(html, /data-chat-render="code-block"/)
  assert.match(html, /data-chat-code-viewport="true"/)
  assert.match(html, />1 line</)
  assert.doesNotMatch(html, /\*\*Preparing\*\*/)
  assert.doesNotMatch(html, /```sql/)
  assert.doesNotMatch(html, /\[think\]/)
  assert.doesNotMatch(html, /Reasoning/)
  assert.doesNotMatch(html, /text-\[14px\] font-semibold leading-7/)
})

test('LiveExecutionStreamBlock offers Continue only for interrupted work', () => {
  const interrupted = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      onContinueInterruptedTurn: () => {},
      turn: {
        threadId: 'thread-1',
        turnId: 'turn-interrupted',
        status: 'interrupted',
        eventOrder: ['turn-interrupted'],
        eventsById: {
          'turn-interrupted': {
            id: 'turn-interrupted',
            kind: 'transport',
            status: 'interrupted',
            detail: 'The app closed before this turn completed.',
            activity: { eventKind: 'turn_interrupted', type: 'turn', status: 'interrupted' },
          },
        },
      },
    }),
  )
  assert.match(interrupted, /data-ui="interrupted-turn-continue"/)
  assert.match(interrupted, />Continue</)

  const completed = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      onContinueInterruptedTurn: () => {},
      turn: {
        threadId: 'thread-1',
        turnId: 'turn-completed',
        status: 'done',
        eventOrder: ['turn-completed'],
        eventsById: {
          'turn-completed': {
            id: 'turn-completed',
            kind: 'transport',
            status: 'done',
            detail: 'Completed.',
            activity: { eventKind: 'turn_completed', type: 'turn', status: 'done' },
          },
        },
      },
    }),
  )
  assert.doesNotMatch(completed, /data-ui="interrupted-turn-continue"/)
})

test('LiveExecutionStreamBlock renders pure bold reasoning prose without showing markdown markers', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-inline-bold-only',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'active',
            detail: '**Planning comprehensive schema and seed improvements**',
          },
        },
      },
    }),
  )

  assert.match(html, /Planning comprehensive schema and seed improvements/)
  assert.match(html, /<strong[^>]*>Planning comprehensive schema and seed improvements<\/strong>/)
  assert.doesNotMatch(html, /\*\*Planning comprehensive schema and seed improvements\*\*/)
})

test('LiveExecutionStreamBlock renders incomplete fenced reasoning as an inline pending tail instead of a stale code block', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-live-reasoning-code',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'active',
            detail: '```python\nprint("hello")\nprint("world")',
          },
        },
      },
    }),
  )

  assert.match(html, /data-chat-render="reasoning-pending-tail"/)
  assert.match(html, /```python/)
  assert.match(html, /print\(&quot;hello&quot;\)/)
  assert.match(html, /print\(&quot;world&quot;\)/)
  assert.doesNotMatch(html, /data-chat-render="code-block"/)
})

test('LiveExecutionStreamBlock renders stable markdown plus a pending tail inside the same live reasoning row', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-live-reasoning-mixed',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'active',
            detail: 'Intro paragraph.\n\n```python\nprint("hello")',
          },
        },
      },
    }),
  )

  assert.match(html, /Intro paragraph\./)
  assert.match(html, /data-chat-render="reasoning-pending-tail"/)
  assert.match(html, /```python/)
  assert.match(html, /print\(&quot;hello&quot;\)/)
  assert.equal((html.match(/chat-typo-exec-reasoning-prose/g) || []).length, 1)
})

test('LiveExecutionStreamBlock auto-upgrades live fenced reasoning into a formatted code block once the fence closes', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-live-reasoning-code-upgraded',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'active',
            detail: '```python\nprint("hello")\nprint("world")\n```',
          },
        },
      },
    }),
  )

  assert.match(html, /data-chat-render="code-block"/)
  assert.match(html, /data-chat-code-viewport="true"/)
  assert.match(html, />python<\/span>/i)
  assert.match(html, />2 lines</)
  assert.doesNotMatch(html, /data-chat-render="reasoning-pending-tail"/)
  assert.doesNotMatch(html, /```python/)
})

test('LiveExecutionStreamBlock renders shared markdown primitives for headings, lists, blockquotes, links, tables, and code', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-shared-markdown-registry',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'done',
            detail: [
              '# Shared heading',
              '',
              '1. Ordered parent',
              '2. Ordered sibling',
              '',
              '- Nested parent',
              '  - Nested child',
              '',
              '> Quoted context',
              '',
              '| URL | Note |',
              '| --- | --- |',
              '| [Safe](https://example.com) | ok |',
              '| [Unsafe](javascript:alert(1)) | blocked |',
              '',
              '```js',
              'console.log("shared")',
              '```',
            ].join('\n'),
          },
        },
      },
    }),
  )

  assert.match(html, /chat-markdown-heading-1/)
  assert.match(html, /<blockquote\b/i)
  assert.match(html, /<ul\b/i)
  assert.match(html, /chat-markdown-table-wrap/)
  assert.match(html, /href="https:\/\/example\.com"/i)
  assert.match(html, /href="#"/i)
  assert.doesNotMatch(html, /javascript:alert\(1\)/i)
  assert.match(html, /data-chat-render="code-block"/)
  assert.match(html, /data-chat-code-viewport="true"/)
})

test('LiveExecutionStreamBlock renders codex-style heading-only reasoning as milestone rows inline with tool rows', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: false,
      turn: {
        turnId: 'turn-codex-milestones',
        status: 'done',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1', 'tool:1', 'reasoning:2', 'tool:2'],
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
          'reasoning:2': {
            id: 'reasoning:2',
            kind: 'reasoning',
            status: 'done',
            detail: 'Creating tkinter calculator app',
            reasoningMeta: { model: 'gpt-5.3-codex' },
          },
          'tool:2': {
            id: 'tool:2',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'tool:2',
              type: 'result',
              toolName: 'write_file',
              label: 'Wrote calculator.py',
              fileChange: { filePath: 'calculator.py' },
            },
          },
        },
      },
    }),
  )

  assert.match(html, /Exploring project structure/)
  assert.match(html, /Creating tkinter calculator app/)
  assert.match(html, /Listed in project root/)
  assert.match(html, /Wrote(?:\s|<[^>]+>)*<a[^>]*data-chat-file-reference="true"[^>]*>calculator\.py<\/a>/)
  assert.equal((html.match(/data-chat-render="reasoning-milestone"/g) || []).length, 2)
  assert.doesNotMatch(html, /chat-typo-exec-reasoning-prose/)
})

test('LiveExecutionStreamBlock upgrades exact codex reasoning milestone file references into file links', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  assert.equal(typeof rendererUseAppStore?.getState, 'function')
  const previousProjectFolder = rendererUseAppStore.getState().projectFolder

  try {
    rendererUseAppStore.setState({ projectFolder: 'C:/Users/example/Documents/ADDOM' })
    const html = renderToStaticMarkup(
      React.createElement(LiveExecutionStreamBlock, {
        isLiveTurn: false,
        turn: {
          turnId: 'turn-codex-file-milestone',
          status: 'done',
          createdAt: 100,
          updatedAt: 500,
          eventOrder: ['reasoning:1'],
          eventsById: {
            'reasoning:1': {
              id: 'reasoning:1',
              kind: 'reasoning',
              status: 'done',
              detail: 'src/main/index.mjs#L810',
              reasoningMeta: { model: 'gpt-5.3-codex' },
            },
          },
        },
      }),
    )

    assert.match(html, /data-chat-render="reasoning-milestone"/)
    assert.match(html, /data-chat-file-reference="true"/)
    assert.match(html, /src\/main\/index\.mjs#L810/)
  } finally {
    rendererUseAppStore.setState({ projectFolder: previousProjectFolder })
  }
})

test('LiveExecutionStreamBlock keeps ambiguous codex reasoning colon text non-interactive', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  assert.equal(typeof rendererUseAppStore?.getState, 'function')
  const previousProjectFolder = rendererUseAppStore.getState().projectFolder

  try {
    rendererUseAppStore.setState({ projectFolder: 'C:/Users/example/Documents/ADDOM' })
    const html = renderToStaticMarkup(
      React.createElement(LiveExecutionStreamBlock, {
        isLiveTurn: false,
        turn: {
          turnId: 'turn-codex-ambiguous-colon',
          status: 'done',
          createdAt: 100,
          updatedAt: 500,
          eventOrder: ['reasoning:1'],
          eventsById: {
            'reasoning:1': {
              id: 'reasoning:1',
              kind: 'reasoning',
              status: 'done',
              detail: 'src/main/index.mjs: pending review',
              reasoningMeta: { model: 'gpt-5.3-codex' },
            },
          },
        },
      }),
    )

    assert.match(html, /data-chat-render="reasoning-milestone"/)
    assert.match(html, /src\/main\/index\.mjs: pending review/)
    assert.equal((html.match(/data-chat-file-reference="true"/g) || []).length, 0)
  } finally {
    rendererUseAppStore.setState({ projectFolder: previousProjectFolder })
  }
})

test('LiveExecutionStreamBlock renders execution row detail and preview file refs while leaving ambiguous preview text plain', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  assert.equal(typeof rendererUseAppStore?.getState, 'function')
  const previousProjectFolder = rendererUseAppStore.getState().projectFolder

  try {
    rendererUseAppStore.setState({ projectFolder: 'C:/Users/example/Documents/ADDOM' })
    const html = renderToStaticMarkup(
      React.createElement(LiveExecutionStreamBlock, {
        isLiveTurn: false,
        turn: {
          turnId: 'turn-exec-detail-preview-file-refs',
          status: 'done',
          createdAt: 100,
          updatedAt: 500,
          eventOrder: ['tool:1'],
          eventsById: {
            'tool:1': {
              id: 'tool:1',
              kind: 'tool_result',
              status: 'done',
              activity: {
                id: 'tool:1',
                type: 'result',
                toolName: 'read_file',
                toolInput: { path: 'src/main/index.mjs' },
                result: [
                  'src/renderer/components/chat/chat-rich-content-renderer.jsx:164',
                  'src/main/index.mjs:810: export const value = true',
                ].join('\n'),
              },
            },
          },
        },
      }),
    )

    assert.match(html, /font-medium text-text-secondary[^>]*>Read<\/span><span class="font-normal text-text-tertiary[^"]*">\s*<a[^>]*data-chat-file-reference="true"[^>]*>src\/main\/index\.mjs<\/a>/)
    assert.match(html, /path:\s*<a[^>]*data-chat-file-reference="true"[^>]*>src\/main\/index\.mjs<\/a>/)
    assert.match(html, /<a[^>]*data-chat-file-reference="true"[^>]*>src\/renderer\/components\/chat\/chat-rich-content-renderer\.jsx:164<\/a>/)
    assert.match(html, /src\/main\/index\.mjs:810: export const value = true/)
    assert.equal((html.match(/data-chat-file-reference="true"/g) || []).length, 3)
  } finally {
    rendererUseAppStore.setState({ projectFolder: previousProjectFolder })
  }
})

test('LiveExecutionStreamBlock marks only the latest active reasoning row as live', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-live',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1', 'reasoning:2'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'active',
            detail: 'first thought',
          },
          'reasoning:2': {
            id: 'reasoning:2',
            kind: 'reasoning',
            status: 'active',
            detail: 'latest thought',
          },
        },
      },
    }),
  )

  const liveRowMatches = html.match(/data-reasoning-live="true"/g) || []
  assert.equal(liveRowMatches.length, 1)
  assert.match(html, /latest thought/)
})

test('LiveExecutionStreamBlock coalesces adjacent reasoning fragments into one readable row', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-fragments',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1', 'reasoning:2', 'reasoning:3'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'active',
            detail: 'Using Verc',
          },
          'reasoning:2': {
            id: 'reasoning:2',
            kind: 'reasoning',
            status: 'active',
            detail: 'el and ',
          },
          'reasoning:3': {
            id: 'reasoning:3',
            kind: 'reasoning',
            status: 'active',
            detail: 'Next.js',
          },
        },
      },
    }),
  )

  assert.match(html, /Using Vercel and Next\.js/)
  assert.doesNotMatch(html, />Using Verc<\/div>/)
  assert.doesNotMatch(html, />el and<\/div>/)
  assert.doesNotMatch(html, />1 event</)
})

test('LiveExecutionStreamBlock keeps stable reasoning blocks split when the store marks them as block events', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-stable-blocks',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1', 'reasoning:2'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'active',
            detail: 'Reviewing the current implementation',
            reasoningBlock: true,
            reasoningChunks: ['Reviewing the current implementation'],
          },
          'reasoning:2': {
            id: 'reasoning:2',
            kind: 'reasoning',
            status: 'active',
            detail: 'This second block should stay separate.',
            reasoningBlock: true,
            reasoningChunks: ['This second block should stay separate.'],
          },
        },
      },
    }),
  )

  assert.match(html, /Reviewing the current implementation/)
  assert.match(html, /This second block should stay separate\./)
  assert.doesNotMatch(html, />2 events</)
})

test('LiveExecutionStreamBlock still merges store-backed reasoning continuations when the next block is only a trailing fragment', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-store-block-continuation',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1', 'reasoning:2'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'active',
            detail: '**Requesting clarification on stack and requirements**\n\nThe repo appears empty with no files, so I will ask for the preferred language, framework, and details about the automotive stand database and client list to clarify requirements before designing or scaff',
            reasoningBlock: true,
            reasoningChunks: ['**Requesting clarification on stack and requirements**\n\nThe repo appears empty with no files, so I will ask for the preferred language, framework, and details about the automotive stand database and client list to clarify requirements before designing or scaff'],
          },
          'reasoning:2': {
            id: 'reasoning:2',
            kind: 'reasoning',
            status: 'active',
            detail: 'olding.',
            reasoningBlock: true,
            reasoningChunks: ['olding.'],
          },
        },
      },
    }),
  )

  assert.match(html, /before designing or scaff\s*olding\./)
  assert.equal((html.match(/chat-typo-exec-reasoning-prose/g) || []).length, 1)
})

test('LiveExecutionStreamBlock keeps title-like reasoning chunks in one readable block when no tool interrupts them', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-sections',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1', 'reasoning:2', 'reasoning:3', 'reasoning:4'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'active',
            detail: 'Evaluating options for a project',
          },
          'reasoning:2': {
            id: 'reasoning:2',
            kind: 'reasoning',
            status: 'active',
            detail: "\n\nI'm looking at options for a project.",
          },
          'reasoning:3': {
            id: 'reasoning:3',
            kind: 'reasoning',
            status: 'active',
            detail: 'Choosing the project path',
          },
          'reasoning:4': {
            id: 'reasoning:4',
            kind: 'reasoning',
            status: 'active',
            detail: "\n\nIâ€™m considering the recommended path.",
          },
        },
      },
    }),
  )

  assert.match(html, /Evaluating options for a project/)
  assert.match(html, /I&#x27;m looking at options for a project\./)
  assert.match(html, /Choosing the project path/)
  assert.match(html, /Iâ€™m considering the recommended path\./)
  assert.doesNotMatch(html, />1 event</)
})

test('LiveExecutionStreamBlock can mix short reasoning rows with narrative reasoning blocks', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-mixed-reasoning',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1', 'tool:1', 'reasoning:2', 'reasoning:3'],
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
          'reasoning:2': {
            id: 'reasoning:2',
            kind: 'reasoning',
            status: 'active',
            detail: 'Choosing the project path',
          },
          'reasoning:3': {
            id: 'reasoning:3',
            kind: 'reasoning',
            status: 'active',
            detail: '\n\nIÃ¢â‚¬â„¢m considering the recommended path.',
          },
        },
      },
    }),
  )

  assert.match(html, /data-chat-render="reasoning-milestone"/)
  assert.match(html, /Exploring project structure/)
  assert.match(html, /Listed in project root/)
  assert.match(html, /prose-chat/)
  assert.match(html, /chat-typo-exec-reasoning-prose/)
  assert.match(html, /Choosing the project path/)
  assert.match(html, /IÃ¢â‚¬â„¢m considering the recommended path\./)
})

test('LiveExecutionStreamBlock coalesces adjacent codex reasoning headings into one milestone row after tools complete', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: false,
      turn: {
        turnId: 'turn-adjacent-milestones',
        status: 'done',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['tool:1', 'tool:2', 'reasoning:1', 'reasoning:2'],
        eventsById: {
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
          'tool:2': {
            id: 'tool:2',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'tool:2',
              type: 'result',
              toolName: 'write_file',
              label: 'Wrote calculator.py',
              fileChange: { filePath: 'calculator.py' },
              result: 'File written successfully: calculator.py',
            },
          },
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'done',
            detail: 'Exploring project structure',
            reasoningMeta: { model: 'gpt-5.3-codex' },
          },
          'reasoning:2': {
            id: 'reasoning:2',
            kind: 'reasoning',
            status: 'done',
            detail: 'Creating tkinter calculator app',
            reasoningMeta: { model: 'gpt-5.3-codex' },
          },
        },
      },
    }),
  )

  const milestoneMatches = html.match(/data-chat-render="reasoning-milestone"/g) || []
  assert.equal(milestoneMatches.length, 1)
  assert.match(html, /Exploring project structureCreating tkinter calculator app/)
  assert.doesNotMatch(html, /chat-markdown-heading-2/)
  assert.doesNotMatch(html, /chat-typo-exec-reasoning-prose/)
})

test('LiveExecutionStreamBlock repairs inline sentence boundaries that arrive inside one reasoning chunk', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-inline-heading',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'active',
            detail: "I need to avoid making assumptions.Choosing the project path\n\nIâ€™m considering the recommended path.",
          },
        },
      },
    }),
  )

  assert.match(html, /I need to avoid making assumptions\./)
  assert.match(html, /Choosing the project path/)
  assert.match(html, /Iâ€™m considering the recommended path\./)
  assert.doesNotMatch(html, /assumptions\.Choosing/)
})

test('LiveExecutionStreamBlock repairs stream-broken framework names and wrapped words', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-word-breaks',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'active',
            detail: 'AI Saa\n\nS with a dark luxury design. Type\nScript or JavaScript? API routes with Node\n\n.js and a Next\n\n.js frontend.',
          },
        },
      },
    }),
  )

  assert.match(html, /AI SaaS with a dark luxury design\./)
  assert.match(html, /TypeScript or JavaScript\?/)
  assert.match(html, /API routes with Node\.js and a Next\.js frontend\./)
  assert.doesNotMatch(html, /Saa\s+S/)
  assert.doesNotMatch(html, /Type\s+Script/)
  assert.doesNotMatch(html, /Node\s+\.js/)
  assert.doesNotMatch(html, /Next\s+\.js/)
})

test('LiveExecutionStreamBlock renders emphasized inline reasoning text without promoting it to a heading', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-emphasis-heading',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'active',
            detail: 'I need to avoid making assumptions.**Clarifying project details**\n\nI need to clarify a few things.',
          },
        },
      },
    }),
  )

  assert.match(html, /I need to avoid making assumptions\./)
  assert.match(html, /<strong[^>]*>Clarifying project details<\/strong>/)
  assert.match(html, /I need to clarify a few things\./)
  assert.doesNotMatch(html, /chat-markdown-heading-2/)
})

test('LiveExecutionStreamBlock preserves historical addom_plan prose while preserving following emphasized prose', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: false,
      turn: {
        turnId: 'turn-code-like-snippet',
        status: 'done',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'done',
            detail: 'Iâ€™ll ensure to include the final output structure too.\n\n``addom_plan { ... } ``\n\n**Reviewing and summarizing decisions**\n\nThe instructions still apply.',
          },
        },
      },
    }),
  )

  assert.match(html, /addom_plan \{ \.\.\. \}/)
  assert.match(html, /<strong[^>]*>Reviewing and summarizing decisions<\/strong>/)
})

test('LiveExecutionStreamBlock preserves adjacent historical addom_plan prose', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: false,
      turn: {
        turnId: 'turn-code-like-adjacent-heading',
        status: 'done',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'done',
            detail: 'Iâ€™ll ensure to include the final output structure too.  \n``addom_plan { ... } ``**Reviewing and summarizing decisions**\n\nThe instructions still apply.',
          },
        },
      },
    }),
  )

  assert.match(html, /addom_plan \{ \.\.\. \}/)
  assert.match(html, /<strong[^>]*>Reviewing and summarizing decisions<\/strong>/)
  assert.match(html, /addom_plan/)
})

test('LiveExecutionStreamBlock preserves malformed historical addom_plan prose', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: false,
      turn: {
        turnId: 'turn-inline-triple-backtick-plan',
        status: 'done',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'done',
            detail: 'Iâ€™ll ensure to include the final output structure too.  \n```addom_plan { ... } ```**Reviewing and summarizing decisions**\n\nThe instructions still apply.',
          },
        },
      },
    }),
  )

  assert.match(html, /addom_plan \{ \.\.\. \}/)
  assert.match(html, /<strong[^>]*>Reviewing and summarizing decisions<\/strong>/)
  assert.match(html, /addom_plan/)
})

test('LiveExecutionStreamBlock does not mistake sentence fragments for new reasoning headings', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-fragment-false-headings',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: [
          'reasoning:1',
          'reasoning:2',
          'reasoning:3',
          'reasoning:4',
          'reasoning:5',
          'reasoning:6',
        ],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'active',
            detail: '**Reviewing and summarizing decisions**\n\nThe instructions state I should use a memory review when needed.',
          },
          'reasoning:2': {
            id: 'reasoning:2',
            kind: 'reasoning',
            status: 'active',
            detail: ' I should offer',
          },
          'reasoning:3': {
            id: 'reasoning:3',
            kind: 'reasoning',
            status: 'active',
            detail: ' 2-3 distinct path options while keeping the recommended path as the Next.js-only approach, where the app uses frontend and backend',
          },
          'reasoning:4': {
            id: 'reasoning:4',
            kind: 'reasoning',
            status: 'active',
            detail: ' API routes with Node.js.',
          },
          'reasoning:5': {
            id: 'reasoning:5',
            kind: 'reasoning',
            status: 'active',
            detail: ' Outlining recommended options',
          },
          'reasoning:6': {
            id: 'reasoning:6',
            kind: 'reasoning',
            status: 'active',
            detail: '\n\nIâ€™m planning to recommend a couple of options.',
          },
        },
      },
    }),
  )

  assert.match(html, /I should offer 2-3 distinct path options while keeping the recommended path as the Next\.js-only approach, where the app uses frontend and backend API routes with Node\.js\./)
  assert.match(html, /Outlining recommended options/)
  assert.match(html, /Iâ€™m planning to recommend a couple of options\./)
  assert.match(html, /<strong[^>]*>Reviewing and summarizing decisions<\/strong>/)
  assert.doesNotMatch(html, />1 event</)
  assert.doesNotMatch(html, />2 events</)
})

test('LiveExecutionStreamBlock keeps uppercase continuation fragments in one reasoning card when the previous chunk ends mid-sentence', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-uppercase-fragments',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1', 'reasoning:2'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'active',
            detail: 'Planning schema and handler creation\n\nThe repo appears empty, so I\'ll plan tasks to design a data schema, create JSON data files, build handler code for',
          },
          'reasoning:2': {
            id: 'reasoning:2',
            kind: 'reasoning',
            status: 'active',
            detail: 'CRUD operations, and add a README, focusing on a simple automotive client management domain without dependencies or runtime needs.',
          },
        },
      },
    }),
  )

  assert.match(html, /build handler code for\s*CRUD operations, and add a README/)
  assert.equal((html.match(/chat-typo-exec-reasoning-prose/g) || []).length, 1)
  assert.doesNotMatch(html, />1 event</)
})

test('LiveExecutionStreamBlock streams only the latest active reasoning row while rendering earlier rows as settled prose', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-latest-stream-only',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1', 'reasoning:2'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'done',
            detail: 'Settled earlier reasoning line',
          },
          'reasoning:2': {
            id: 'reasoning:2',
            kind: 'reasoning',
            status: 'active',
            detail: 'Latest active reasoning line',
          },
        },
      },
    }),
  )

  assert.match(html, /Settled earlier reasoning line/)
  assert.match(html, /Latest active reasoning line/)
  assert.equal((html.match(/data-reasoning-live="true"/g) || []).length, 1)
})

test('LiveExecutionStreamBlock starts a new reasoning card when a contiguous reasoning fragment begins with a new bold title', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-titled-reasoning-steps',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1', 'reasoning:2'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'active',
            detail: '**Assessing project context**\n\nI am checking the repo layout before deciding on the implementation path.',
          },
          'reasoning:2': {
            id: 'reasoning:2',
            kind: 'reasoning',
            status: 'active',
            detail: '**Planning schema and handler creation**\n\nI will prepare the data shape and CRUD flow next.',
          },
        },
      },
    }),
  )

  assert.match(html, /<strong[^>]*>Assessing project context<\/strong>/)
  assert.match(html, /<strong[^>]*>Planning schema and handler creation<\/strong>/)
  assert.equal((html.match(/chat-typo-exec-reasoning-prose/g) || []).length, 2)
})

test('LiveExecutionStreamBlock flushes the current titled reasoning card before a tool row and starts a new card after the tool', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-tool-breaks-titled-reasoning',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1', 'tool:1', 'reasoning:2'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'done',
            detail: '**Assessing project context**\n\nI checked the repo contents before deciding what to build.',
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
          'reasoning:2': {
            id: 'reasoning:2',
            kind: 'reasoning',
            status: 'active',
            detail: '**Planning schema and handler creation**\n\nI am now outlining the next implementation step.',
          },
        },
      },
    }),
  )

  const firstTitleIndex = html.indexOf('Assessing project context')
  const toolIndex = html.indexOf('Listed in project root')
  const secondTitleIndex = html.indexOf('Planning schema and handler creation')

  assert.ok(firstTitleIndex >= 0)
  assert.ok(toolIndex > firstTitleIndex)
  assert.ok(secondTitleIndex > toolIndex)
  assert.equal((html.match(/chat-typo-exec-reasoning-prose/g) || []).length, 2)
})

test('LiveExecutionStreamBlock keeps one reasoning block when provider compaction lands mid-continuation', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-compaction-mid-reasoning',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['reasoning:1', 'compaction:1', 'reasoning:2'],
        eventsById: {
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'done',
            detail: 'I verified the flow end to end',
          },
          'compaction:1': {
            id: 'compaction:1',
            kind: 'compaction',
            status: 'done',
            activity: {
              id: 'compaction:1',
              type: 'info',
              eventKind: 'openai_compaction_event',
              label: 'OpenAI compaction applied',
              compactionMilestone: true,
              compactionMilestoneTitle: 'Context compacted before the next turn',
              compactionMilestoneDetail: 'Codex account thread compaction',
              compactionMilestoneTone: 'provider',
            },
          },
          'reasoning:2': {
            id: 'reasoning:2',
            kind: 'reasoning',
            status: 'active',
            detail: ', availability returned success, and the booking was cancelled successfully.',
          },
        },
      },
    }),
  )

  assert.equal((html.match(/chat-typo-exec-reasoning-prose/g) || []).length, 1)
  assert.match(html, /I verified the flow end to end, availability returned success, and the booking was cancelled successfully\./)
  assert.match(html, /data-chat-render="timeline-compaction-milestone"/)
})
