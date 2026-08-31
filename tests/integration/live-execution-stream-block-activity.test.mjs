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

test('LiveExecutionStreamBlock filters runbook-only events while keeping curated live flow rows', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-curated',
        status: 'active',
        createdAt: 100,
        updatedAt: 900,
        eventOrder: [
          'turn-start',
          'cost',
          'continuity',
          'reasoning:1',
          'reasoning-summary',
          'provider-input',
          'tool-start',
          'tool-result',
          'tool-output',
          'usage',
          'transport',
        ],
        eventsById: {
          'turn-start': {
            id: 'turn-start',
            kind: 'transport',
            summary: 'Turn started',
            activity: {
              id: 'turn-start',
              type: 'turn',
              eventKind: 'turn_started',
              label: 'Turn started',
              createdAt: 100,
            },
          },
          cost: {
            id: 'cost',
            kind: 'tool_progress',
            summary: 'Turn cost estimate: $0.40',
            activity: {
              id: 'cost',
              type: 'info',
              eventKind: 'chat_cost_estimate',
              label: 'Turn cost estimate: $0.40',
              createdAt: 110,
            },
          },
          continuity: {
            id: 'continuity',
            kind: 'tool_progress',
            summary: 'Continuity packet built (balanced)',
            activity: {
              id: 'continuity',
              type: 'info',
              eventKind: 'continuity_packet_built',
              label: 'Continuity packet built (balanced)',
              createdAt: 120,
            },
          },
          'reasoning:1': {
            id: 'reasoning:1',
            kind: 'reasoning',
            status: 'active',
            detail: 'Checking existing files',
          },
          'reasoning-summary': {
            id: 'reasoning-summary',
            kind: 'tool_progress',
            summary: 'Reasoning summary captured',
            activity: {
              id: 'reasoning-summary',
              type: 'reasoning',
              eventKind: 'reasoning_done',
              label: 'Reasoning summary captured',
              detail: 'Checking existing files',
              createdAt: 125,
            },
          },
          'provider-input': {
            id: 'provider-input',
            kind: 'tool_progress',
            summary: 'Provider tool input: tool',
            activity: {
              id: 'provider-input',
              type: 'provider_tool',
              eventKind: 'provider_tool_status',
              label: 'Provider tool input: tool',
              createdAt: 130,
            },
          },
          'tool-start': {
            id: 'tool-start',
            kind: 'tool_start',
            summary: 'run_command',
            activity: {
              id: 'tool-start',
              type: 'executing',
              toolName: 'list_directory',
              toolInput: { path: '.' },
              label: 'Executing list_directory',
              createdAt: 140,
            },
          },
          'tool-result': {
            id: 'tool-result',
            kind: 'tool_result',
            status: 'done',
            summary: 'list_directory done',
            activity: {
              id: 'tool-result',
              type: 'result',
              eventKind: 'tool_result',
              toolName: 'list_directory',
              toolInput: { path: '.' },
              label: 'list_directory done',
              result: 'Showing 2 entries from offset 0 (depth=1, limit=200).\n[file] clients.sql\n[file] user_info.sql',
              createdAt: 150,
              finishedAt: 160,
            },
          },
          'tool-output': {
            id: 'tool-output',
            kind: 'tool_output',
            status: 'done',
            summary: 'list_directory stdout',
            detail: 'clients.sql\nuser_info.sql',
            stream: 'stdout',
            toolName: 'list_directory',
          },
          usage: {
            id: 'usage',
            kind: 'usage',
            summary: 'Context usage: 9251 tokens this step',
            activity: {
              id: 'usage',
              type: 'usage',
              eventKind: 'chat_usage',
              label: 'Context usage: 9251 tokens this step',
              createdAt: 170,
            },
          },
          transport: {
            id: 'transport',
            kind: 'transport',
            summary: 'Using the standard OpenAI transport for this turn',
            activity: {
              id: 'transport',
              type: 'info',
              eventKind: 'openai_websocket_reconnect',
              label: 'Using the standard OpenAI transport for this turn',
              createdAt: 180,
            },
          },
        },
      },
    }),
  )

  assert.doesNotMatch(html, /Execution Stream/)
  assert.doesNotMatch(html, /4 events/)
  assert.match(html, /Checking existing files/)
  assert.match(html, /Listing files/)
  assert.match(html, /Listed 2 items in project root/)
  assert.match(html, /\[file\]\s*<a[^>]*data-chat-file-reference="true"[^>]*>clients\.sql<\/a>/)
  assert.match(html, /\[file\]\s*<a[^>]*data-chat-file-reference="true"[^>]*>user_info\.sql<\/a>/)
  assert.match(html, /Command output/)
  assert.match(html, /Open copy options/)
  assert.doesNotMatch(html, /Reasoning summary captured/)
  assert.doesNotMatch(html, /Turn cost estimate/)
  assert.doesNotMatch(html, /Continuity packet built/)
  assert.doesNotMatch(html, /Provider tool input: tool/)
  assert.doesNotMatch(html, /Context usage/)
  assert.doesNotMatch(html, /Using the standard OpenAI transport/)
  assert.doesNotMatch(html, /Starting turn/)
  assert.doesNotMatch(html, /---/)
  assert.doesNotMatch(html, /\[info\]|\[turn\]|\[ctx\]/)
})

test('LiveExecutionStreamBlock keeps start rows generic while result rows carry explicit targets', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-copy',
        status: 'done',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['start-list', 'done-list', 'start-write', 'done-write'],
        eventsById: {
          'start-list': {
            id: 'start-list',
            kind: 'tool_start',
            activity: {
              id: 'start-list',
              type: 'executing',
              toolName: 'list_directory',
              toolInput: { path: '.' },
              createdAt: 100,
            },
          },
          'done-list': {
            id: 'done-list',
            kind: 'tool_result',
            status: 'done',
            detail: 'Showing 3 entries from offset 0 (depth=2, limit=200).',
            activity: {
              id: 'done-list',
              type: 'result',
              toolName: 'list_directory',
              toolInput: { path: '.' },
              result: 'Showing 3 entries from offset 0 (depth=2, limit=200).',
              createdAt: 110,
            },
          },
          'start-write': {
            id: 'start-write',
            kind: 'tool_start',
            activity: {
              id: 'start-write',
              type: 'executing',
              toolName: 'write_file',
              toolInput: { path: 'db/schema.sql' },
              createdAt: 120,
            },
          },
          'done-write': {
            id: 'done-write',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'done-write',
              type: 'result',
              toolName: 'write_file',
              toolInput: { path: 'db/schema.sql' },
              createdAt: 130,
            },
          },
        },
      },
    }),
  )

  assert.match(html, /Listing files/)
  assert.doesNotMatch(html, /Listing files in project root/)
  assert.match(html, /Listed(?:\s|<[^>]+>)*3 items in project root/)
  assert.match(html, /Writing file/)
  assert.doesNotMatch(html, /Writing db\/schema\.sql/)
  assert.match(html, /Wrote(?:\s|<[^>]+>)*db\/schema\.sql/)
})

test('LiveExecutionStreamBlock initially renders a bounded tail for long event lists', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const eventOrder = []
  const eventsById = {}
  for (let index = 1; index <= 90; index += 1) {
    const id = `write-${index}`
    eventOrder.push(id)
    eventsById[id] = {
      id,
      kind: 'tool_result',
      status: 'done',
      activity: {
        id,
        type: 'result',
        toolName: 'write_file',
        toolInput: { path: `src/file-${index}.js` },
      },
    }
  }

  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-bounded-tail',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder,
        eventsById,
      },
    }),
  )

  assert.doesNotMatch(html, />90 events</)
  assert.match(html, /Showing the latest 80 events\./)
  assert.match(html, /Show 10 earlier events/)
  assert.match(html, /src\/file-90\.js/)
  assert.doesNotMatch(html, /src\/file-1\.js/)
  assert.doesNotMatch(html, /src\/file-10\.js/)
  assert.match(html, /src\/file-11\.js/)
})

test('LiveExecutionStreamBlock keeps collapsed earlier reasoning visible on long turns even when the tail is truncated', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const eventOrder = ['reasoning:turn-long:archive']
  const eventsById = {
    'reasoning:turn-long:archive': {
      id: 'reasoning:turn-long:archive',
      kind: 'reasoning',
      archived: true,
      summary: 'Earlier reasoning collapsed',
      blocks: [{
        id: 'reasoning:turn-long:archive-block:1',
        kind: 'reasoning',
        status: 'done',
        detail: 'Inspecting the repository layout before writing files.',
        reasoningBlock: true,
        reasoningChunks: ['Inspecting the repository layout before writing files.'],
      }],
    },
  }
  for (let index = 1; index <= 90; index += 1) {
    const id = `write-long-${index}`
    eventOrder.push(id)
    eventsById[id] = {
      id,
      kind: 'tool_result',
      status: 'done',
      activity: {
        id,
        type: 'result',
        toolName: 'write_file',
        toolInput: { path: `src/file-${index}.js` },
      },
    }
  }

  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-long-archive',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder,
        eventsById,
      },
    }),
  )

  assert.match(html, /Earlier reasoning collapsed/)
  assert.match(html, /Showing the latest 79 events plus 1 collapsed earlier reasoning block\./)
  assert.match(html, /Show 11 earlier events/)
  assert.match(html, /src\/file-90\.js/)
  assert.doesNotMatch(html, /src\/file-1\.js/)
  assert.doesNotMatch(html, /src\/file-10\.js/)
  assert.match(html, /src\/file-12\.js/)
})

test('LiveExecutionStreamBlock keeps collapsed earlier reasoning visible when long-turn tails include late tool output rows', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const eventOrder = ['reasoning:turn-mixed:archive']
  const eventsById = {
    'reasoning:turn-mixed:archive': {
      id: 'reasoning:turn-mixed:archive',
      kind: 'reasoning',
      archived: true,
      summary: 'Earlier reasoning collapsed',
      blocks: [{
        id: 'reasoning:turn-mixed:archive-block:1',
        kind: 'reasoning',
        status: 'done',
        detail: 'Inspecting prior tool output before running the final command.',
        reasoningBlock: true,
        reasoningChunks: ['Inspecting prior tool output before running the final command.'],
      }],
    },
  }

  for (let index = 1; index <= 88; index += 1) {
    const id = `write-mixed-${index}`
    eventOrder.push(id)
    eventsById[id] = {
      id,
      kind: 'tool_result',
      status: 'done',
      activity: {
        id,
        type: 'result',
        toolName: 'write_file',
        toolInput: { path: `src/file-${index}.js` },
      },
    }
  }

  eventOrder.push('tool-output:stdout:1', 'tool-output:stdout:2')
  eventsById['tool-output:stdout:1'] = {
    id: 'tool-output:stdout:1',
    kind: 'tool_output',
    status: 'done',
    summary: 'run_command stdout',
    detail: 'stdout line 1',
    stream: 'stdout',
    toolName: 'run_command',
  }
  eventsById['tool-output:stdout:2'] = {
    id: 'tool-output:stdout:2',
    kind: 'tool_output',
    status: 'done',
    summary: 'run_command stdout',
    detail: 'stdout line 2',
    stream: 'stdout',
    toolName: 'run_command',
  }

  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-long-mixed',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder,
        eventsById,
      },
    }),
  )

  assert.match(html, /Earlier reasoning collapsed/)
  assert.match(html, /stdout line 1/)
  assert.match(html, /stdout line 2/)
  assert.match(html, /Showing the latest 79 events plus 1 collapsed earlier reasoning block\./)
  assert.match(html, /Show 11 earlier events/)
  assert.match(html, /src\/file-88\.js/)
  assert.doesNotMatch(html, /src\/file-1\.js/)
  assert.doesNotMatch(html, /src\/file-10\.js/)
  assert.match(html, /src\/file-12\.js/)
})

test('LiveExecutionStreamBlock renders the in-progress provider compaction row', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const requestedHtml = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-compaction',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['provider-active'],
        eventsById: {
          'provider-active': {
            id: 'provider-active',
            kind: 'compaction',
            status: 'active',
            activity: {
              id: 'provider-active',
              type: 'info',
              eventKind: 'openai_compaction_event',
              status: 'running',
              label: 'Compacting context',
              createdAt: 100,
            },
          },
        },
      },
    }),
  )

  const appliedHtml = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-compaction',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['provider-done', 'local-done'],
        eventsById: {
          'provider-done': {
            id: 'provider-done',
            kind: 'compaction',
            status: 'done',
            activity: {
              id: 'provider-done',
              type: 'info',
              eventKind: 'openai_compaction_event',
              status: 'applied',
              label: 'OpenAI compaction applied',
              compactionMilestone: true,
              compactionMilestoneTitle: 'Context compacted before the next turn',
              compactionMilestoneDetail: 'Codex account thread compaction',
              compactionMilestoneTone: 'provider',
              createdAt: 200,
            },
          },
          'local-done': {
            id: 'local-done',
            kind: 'compaction',
            status: 'done',
            activity: {
              id: 'local-done',
              type: 'info',
              eventKind: 'context_compacted',
              label: 'Context compacted (4 older messages summarized)',
              compactionMilestone: true,
              compactionMilestoneTitle: 'Context automatically compacted',
              compactionMilestoneDetail: 'Local continuity summary | 4 messages summarized',
              compactionMilestoneTone: 'local',
              createdAt: 300,
            },
          },
        },
      },
    }),
  )

  assert.match(requestedHtml, /Compacting context/)
  assert.match(requestedHtml, /data-chat-render="timeline-compaction-active"/)
  assert.doesNotMatch(requestedHtml, /Starting turn/)
  assert.match(appliedHtml, /data-chat-render="timeline-compaction-milestone"/)
  assert.match(appliedHtml, /Context compacted before the next turn/)
  assert.match(appliedHtml, /Codex account thread compaction/)
  assert.match(appliedHtml, /Context automatically compacted/)
  assert.match(appliedHtml, /Local continuity summary/)
})

test('LiveExecutionStreamBlock hides generic pending rows and runtime diagnostics', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-filtered',
        status: 'done',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['pending', 'runtime-info', 'runtime-warning'],
        eventsById: {
          pending: {
            id: 'pending',
            kind: 'tool_progress',
            activity: {
              id: 'pending',
              type: 'pending',
              label: 'Preparing 1 action...',
              createdAt: 120,
            },
          },
          'runtime-info': {
            id: 'runtime-info',
            kind: 'tool_progress',
            activity: {
              id: 'runtime-info',
              type: 'info',
              eventKind: 'runtime_diagnostics',
              label: 'Runtime diagnostics captured',
              createdAt: 140,
            },
          },
          'runtime-warning': {
            id: 'runtime-warning',
            kind: 'warning',
            detail: 'mixed surface',
            activity: {
              id: 'runtime-warning',
              type: 'warning',
              eventKind: 'runtime_diagnostics',
              label: 'Tool surface needs attention',
              detail: 'mixed surface',
              createdAt: 160,
            },
          },
        },
      },
    }),
  )

  assert.doesNotMatch(html, /Tool surface needs attention/)
  assert.doesNotMatch(html, /Preparing 1 action/)
  assert.doesNotMatch(html, /Runtime diagnostics captured/)
})

test('LiveExecutionStreamBlock renders concrete tool targets and command detail', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-context',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['list', 'mkdir', 'write', 'rename', 'search', 'fetch', 'cmd'],
        eventsById: {
          list: {
            id: 'list',
            kind: 'tool_result',
            status: 'done',
            detail: 'Showing 3 entries from offset 0 (depth=2, limit=200).\n[file] schema.sql',
            activity: {
              id: 'list',
              type: 'result',
              toolName: 'list_directory',
              toolInput: { path: 'db', depth: 2 },
            },
          },
          mkdir: {
            id: 'mkdir',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'mkdir',
              type: 'result',
              toolName: 'create_directory',
              toolInput: { path: 'db/migrations' },
            },
          },
          write: {
            id: 'write',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'write',
              type: 'result',
              toolName: 'write_file',
              toolInput: { path: 'db/schema.sql' },
              fileChange: { filePath: 'db/schema.sql' },
            },
          },
          rename: {
            id: 'rename',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'rename',
              type: 'result',
              toolName: 'rename_file',
              toolInput: { old_path: 'db/schema.tmp.sql', new_path: 'db/schema.sql' },
            },
          },
          search: {
            id: 'search',
            kind: 'tool_result',
            status: 'done',
            detail: 'Showing 4 match(es) for "CREATE TABLE" from offset 0 (limit=50).',
            activity: {
              id: 'search',
              type: 'result',
              toolName: 'search_code',
              toolInput: { path: 'db', query: 'CREATE TABLE' },
            },
          },
          fetch: {
            id: 'fetch',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'fetch',
              type: 'result',
              toolName: 'fetch_page',
              toolInput: { url: 'https://example.com/docs/sqlite' },
            },
          },
          cmd: {
            id: 'cmd',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'cmd',
              type: 'result',
              toolName: 'run_command',
              toolInput: {
                cwd: 'db',
                command: 'npm run generate:schema -- --dialect sqlite --target db/schema.sql --with-seed-data',
              },
            },
          },
        },
      },
    }),
  )

  assert.match(html, /Listed(?:\s|<[^>]+>)*3 items in db/)
  assert.match(html, /Created folder(?:\s|<[^>]+>)*db\/migrations/)
  assert.match(html, /Wrote(?:\s|<[^>]+>)*db\/schema\.sql/)
  assert.match(html, /Renamed(?:\s|<[^>]+>)*<a[^>]*data-chat-file-reference="true"[^>]*>db\/schema\.tmp\.sql<\/a> to <a[^>]*data-chat-file-reference="true"[^>]*>db\/schema\.sql<\/a>/)
  assert.match(html, /Found(?:\s|<[^>]+>)*4 matches for &quot;CREATE TABLE&quot; in db/)
  assert.match(html, /Fetched(?:\s|<[^>]+>)*example\.com\/docs\/sqlite/)
  assert.match(html, /Command finished in db/)
  assert.match(html, /npm run generate:schema -- --dialect sqlite --target <a[^>]*data-chat-file-reference="true"[^>]*>db\/schema\.sql<\/a>/)
})

test('LiveExecutionStreamBlock keeps terminal collaboration rows session-oriented and hides duplicated terminal output rows', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-terminal-collab',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['terminal-open', 'terminal-output', 'terminal-write'],
        eventsById: {
          'terminal-open': {
            id: 'terminal-open',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'terminal-open',
              type: 'result',
              toolName: 'terminal_session_open',
              toolInput: { cwd: '.', shell: 'powershell', cols: 120, rows: 40 },
              terminalSession: {
                action: 'open',
                sessionId: 'term_7',
                displayName: 'term_7 (ADDOM)',
                cwd: 'C:/Users/example/Documents/ADDOM',
                shell: 'powershell',
                cols: 120,
                rows: 40,
                outputPreview: 'Windows PowerShell\nPS C:/Users/example/Documents/ADDOM> ',
                liveSurface: 'terminal_panel',
                userTakeoverAvailable: true,
              },
            },
          },
          'terminal-output': {
            id: 'terminal-output',
            kind: 'tool_output',
            status: 'done',
            toolName: 'terminal_session_open',
            detail: 'Windows PowerShell\nPS C:/Users/example/Documents/ADDOM> ',
            stream: 'stdout',
          },
          'terminal-write': {
            id: 'terminal-write',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'terminal-write',
              type: 'result',
              toolName: 'terminal_session_write',
              toolInput: { sessionId: 'term_7', data: 'npm test\n' },
              terminalSession: {
                action: 'write',
                sessionId: 'term_7',
                displayName: 'term_7 (ADDOM)',
                cwd: 'C:/Users/example/Documents/ADDOM',
                shell: 'powershell',
                inputBytes: 9,
                liveSurface: 'terminal_panel',
                userTakeoverAvailable: true,
              },
            },
          },
        },
      },
    }),
  )

  assert.match(html, /Opened term_7 \(ADDOM\)/)
  assert.match(html, /surface: Terminal browser/)
  assert.match(html, /takeover: available/)
  assert.match(html, /Wrote to term_7 \(ADDOM\)/)
  assert.doesNotMatch(html, /Command output/)
  assert.doesNotMatch(html, /Windows PowerShell<\/pre>/)
})

test('LiveExecutionStreamBlock gives wait-for-output terminal rows explicit matched and timeout labels', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-terminal-waits',
        status: 'done',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['wait-match', 'wait-timeout'],
        eventsById: {
          'wait-match': {
            id: 'wait-match',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'wait-match',
              type: 'result',
              toolName: 'terminal_session_wait_for_output',
              toolInput: { sessionId: 'term_8', sinceSequence: 12, pattern: 'server ready' },
              terminalSession: {
                action: 'wait_for_output',
                sessionId: 'term_8',
                displayName: 'term_8 (ADDOM)',
                matched: true,
                timedOut: false,
                sinceSequence: 12,
                outputSequence: 18,
                liveSurface: 'terminal_panel',
              },
            },
          },
          'wait-timeout': {
            id: 'wait-timeout',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'wait-timeout',
              type: 'result',
              toolName: 'terminal_session_wait_for_output',
              toolInput: { sessionId: 'term_8', sinceSequence: 18, pattern: 'ready' },
              terminalSession: {
                action: 'wait_for_output',
                sessionId: 'term_8',
                displayName: 'term_8 (ADDOM)',
                matched: false,
                timedOut: true,
                sinceSequence: 18,
                outputSequence: 18,
                liveSurface: 'terminal_panel',
              },
            },
          },
        },
      },
    }),
  )

  assert.match(html, /Matched expected output in term_8 \(ADDOM\)/)
  assert.match(html, /Timed out waiting for term_8 \(ADDOM\)/)
  assert.match(html, /since: 12/)
  assert.match(html, /since: 18/)
})

test('LiveExecutionStreamBlock falls back to generic copy when tool context is missing', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-fallback',
        status: 'active',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['evt-1'],
        eventsById: {
          'evt-1': {
            id: 'evt-1',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'evt-1',
              type: 'result',
              toolName: 'write_file',
            },
          },
        },
      },
    }),
  )

  assert.match(html, /File(?:\s|<[^>]+>)*written/)
})

test('LiveExecutionStreamBlock hides continuity retrieval rows from the execution stream', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-continuity',
        status: 'done',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['retrieval', 'write'],
        eventsById: {
          retrieval: {
            id: 'retrieval',
            kind: 'tool_progress',
            activity: {
              id: 'retrieval',
              type: 'info',
              eventKind: 'continuity_retrieval_used',
              label: 'Continuity retrieval used (4 facts, 2 invariants).',
            },
          },
          write: {
            id: 'write',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'write',
              type: 'result',
              toolName: 'write_file',
              toolInput: { path: 'db/schema.sql' },
            },
          },
        },
      },
    }),
  )

  assert.match(html, /Wrote(?:\s|<[^>]+>)*db\/schema\.sql/)
  assert.doesNotMatch(html, /Continuity retrieval used/)
})

test('LiveExecutionStreamBlock upgrades exact execution labels, details, and previews into file-reference links', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  assert.equal(typeof rendererUseAppStore?.getState, 'function')
  const previousProjectFolder = rendererUseAppStore.getState().projectFolder

  try {
    rendererUseAppStore.setState({ projectFolder: 'C:/Users/example/Documents/ADDOM' })
    const html = renderToStaticMarkup(
      React.createElement(LiveExecutionStreamBlock, {
        isLiveTurn: true,
        turn: {
          turnId: 'turn-file-refs',
          status: 'done',
          createdAt: 100,
          updatedAt: 500,
          eventOrder: ['write', 'preview'],
          eventsById: {
            write: {
              id: 'write',
              kind: 'tool_result',
              status: 'done',
              activity: {
                id: 'write',
                type: 'result',
                toolName: 'write_file',
                toolInput: { path: 'src/renderer/components/chat/live-execution-stream-activity.jsx' },
                fileChange: { filePath: 'src/renderer/components/chat/live-execution-stream-activity.jsx' },
              },
            },
            preview: {
              id: 'preview',
              kind: 'tool_result',
              status: 'done',
              activity: {
                id: 'preview',
                type: 'result',
                toolName: 'browser_action',
                toolInput: { action: 'click' },
                result: [
                  'README.md',
                  'src/main/index.mjs#L810',
                  'src/renderer/components/chat/chat-rich-content-renderer.jsx:164',
                ].join('\n'),
              },
            },
          },
        },
      }),
    )

    const fileReferenceMatches = html.match(/data-chat-file-reference="true"/g) || []
    assert.equal(fileReferenceMatches.length, 5)
    assert.match(html, /Wrote(?:\s|<[^>]+>)*<a[^>]*data-chat-file-reference="true"[^>]*>src\/renderer\/components\/chat\/live-execution-stream-activity\.jsx<\/a>/)
    assert.match(html, /path:\s*<a[^>]*data-chat-file-reference="true"[^>]*>src\/renderer\/components\/chat\/live-execution-stream-activity\.jsx<\/a>/)
    assert.match(html, /<a[^>]*data-chat-file-reference="true"[^>]*>README\.md<\/a>/)
    assert.match(html, /<a[^>]*data-chat-file-reference="true"[^>]*>src\/main\/index\.mjs#L810<\/a>/)
    assert.match(html, /<a[^>]*data-chat-file-reference="true"[^>]*>src\/renderer\/components\/chat\/chat-rich-content-renderer\.jsx:164<\/a>/)
  } finally {
    rendererUseAppStore.setState({ projectFolder: previousProjectFolder })
  }
})

test('LiveExecutionStreamBlock leaves ambiguous multi-colon execution preview text as plain text', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  assert.equal(typeof rendererUseAppStore?.getState, 'function')
  const previousProjectFolder = rendererUseAppStore.getState().projectFolder

  try {
    rendererUseAppStore.setState({ projectFolder: 'C:/Users/example/Documents/ADDOM' })
    const html = renderToStaticMarkup(
      React.createElement(LiveExecutionStreamBlock, {
        isLiveTurn: true,
        turn: {
          turnId: 'turn-ambiguous-file-ref',
          status: 'done',
          createdAt: 100,
          updatedAt: 500,
          eventOrder: ['preview'],
          eventsById: {
            preview: {
              id: 'preview',
              kind: 'tool_result',
              status: 'done',
              activity: {
                id: 'preview',
                type: 'result',
                toolName: 'browser_action',
                toolInput: { action: 'click' },
                result: 'src/main/index.mjs:810: export const value = true',
              },
            },
          },
        },
      }),
    )

    assert.match(html, /src\/main\/index\.mjs:810: export const value = true/)
    assert.equal((html.match(/data-chat-file-reference="true"/g) || []).length, 0)
  } finally {
    rendererUseAppStore.setState({ projectFolder: previousProjectFolder })
  }
})

test('LiveExecutionStreamBlock surfaces browser discovery and diagnostic action context', () => {
  assert.equal(typeof LiveExecutionStreamBlock, 'function')
  const html = renderToStaticMarkup(
    React.createElement(LiveExecutionStreamBlock, {
      isLiveTurn: true,
      turn: {
        turnId: 'turn-browser-discovery',
        status: 'done',
        createdAt: 100,
        updatedAt: 500,
        eventOrder: ['inspect', 'find', 'options', 'console', 'network'],
        eventsById: {
          inspect: {
            id: 'inspect',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'inspect',
              type: 'result',
              toolName: 'browser_action',
              toolInput: { action: 'inspect', selector: '#app', limit: 20 },
              result: 'Browser inspection\nElements returned: 12 of 12',
            },
          },
          find: {
            id: 'find',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'find',
              type: 'result',
              toolName: 'browser_action',
              toolInput: { action: 'find_elements', query: 'Save', mode: 'text', limit: 10 },
              result: 'Browser element matches for "Save"',
            },
          },
          options: {
            id: 'options',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'options',
              type: 'result',
              toolName: 'browser_action',
              toolInput: { action: 'list_options', element_index: 3 },
              result: 'Options for select[name="mode"]',
            },
          },
          console: {
            id: 'console',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'console',
              type: 'result',
              toolName: 'browser_action',
              toolInput: { action: 'console_messages', level: 'error' },
              result: 'Recent console messages (error)',
            },
          },
          network: {
            id: 'network',
            kind: 'tool_result',
            status: 'done',
            activity: {
              id: 'network',
              type: 'result',
              toolName: 'browser_action',
              toolInput: { action: 'network_errors', type: 'fetch', status: 500 },
              result: 'Recent network errors',
            },
          },
        },
      },
    }),
  )

  assert.match(html, /Browser action complete(?:\s|<[^>]+>)*\(inspect\)/)
  assert.match(html, /Browser action complete(?:\s|<[^>]+>)*\(find_elements\)/)
  assert.match(html, /Browser action complete(?:\s|<[^>]+>)*\(list_options\)/)
  assert.match(html, /Browser action complete(?:\s|<[^>]+>)*\(console_messages\)/)
  assert.match(html, /Browser action complete(?:\s|<[^>]+>)*\(network_errors\)/)
  assert.match(html, /action:\s*inspect\s*\|\s*selector:\s*#app\s*\|\s*limit:\s*20/)
  assert.match(html, /action:\s*find_elements\s*\|\s*query:\s*Save\s*\|\s*mode:\s*text\s*\|\s*limit:\s*10/)
  assert.match(html, /action:\s*list_options\s*\|\s*element:\s*3/)
  assert.match(html, /action:\s*console_messages\s*\|\s*level:\s*error/)
  assert.match(html, /action:\s*network_errors\s*\|\s*status:\s*500\s*\|\s*type:\s*fetch/)
  assert.match(html, /Browser inspection/)
  assert.match(html, /Recent network errors/)
})
