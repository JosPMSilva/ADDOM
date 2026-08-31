import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { closeViteSsrLoader, ssrLoadRendererModule } from '../helpers/vite-ssr-loader.mjs'

let ToolActivityLine = null
const ESC = String.fromCharCode(0x1b)

before(async () => {
  const mod = await ssrLoadRendererModule('/components/chat/ToolActivityLine.jsx')
  ToolActivityLine = mod?.ToolActivityLine || null
})

after(async () => {
  await closeViteSsrLoader()
})

test('ToolActivityLine renders continuity violations as warning styling even for legacy error-shaped entries', () => {
  assert.equal(typeof ToolActivityLine, 'function')
  const html = renderToStaticMarkup(React.createElement(ToolActivityLine, {
    activity: {
      type: 'result',
      isError: true,
      decision: 'approved',
      eventKind: 'continuity_invariant_violated',
      label: 'Continuity invariant violated',
      detail: 'violations: 1',
    },
  }))

  assert.match(html, /\[warn\]/)
  assert.doesNotMatch(html, /\[err\]/)
})

test('ToolActivityLine keeps regular tool errors as error styling', () => {
  const html = renderToStaticMarkup(React.createElement(ToolActivityLine, {
    activity: {
      type: 'result',
      isError: true,
      decision: 'approved',
      eventKind: 'tool_result',
      toolName: 'run_command',
      label: 'Command failed',
      detail: 'exit code 1',
    },
  }))

  assert.match(html, /\[err\]/)
})

test('ToolActivityLine hides provider compaction activities so they only render in the execution stream', () => {
  const html = renderToStaticMarkup(React.createElement(ToolActivityLine, {
    activity: {
      type: 'info',
      eventKind: 'openai_compaction_event',
      label: 'OpenAI manual compaction applied',
      detail: 'compaction mode: provider chain compaction',
      compactionMilestone: true,
      compactionMilestoneTitle: 'Context compacted before the next turn',
      compactionMilestoneDetail: 'OpenAI manual server-side compaction',
      compactionMilestoneTone: 'provider',
    },
  }))

  assert.equal(html, '')
})

test('ToolActivityLine strips ANSI control sequences from detail output', () => {
  const html = renderToStaticMarkup(React.createElement(ToolActivityLine, {
    activity: {
      type: 'result',
      isError: false,
      decision: 'approved',
      toolName: 'run_command',
      label: 'Command finished',
      detail: 'Installing:\n- \u001b[36mnext\u001b[39m',
    },
  }))

  assert.match(html, /Installing:/)
  assert.match(html, /next/)
  assert.doesNotMatch(html, new RegExp(`${ESC}\\[`))
  assert.doesNotMatch(html, /\[36m/)
  assert.doesNotMatch(html, /\[39m/)
})

test('ToolActivityLine summarizes delegation agent labels instead of dumping raw role ids', () => {
  const html = renderToStaticMarkup(React.createElement(ToolActivityLine, {
    activity: {
      type: 'executing',
      toolName: 'delegate_to_agents',
      toolInput: {
        taskCount: 3,
        roles: [
          'API Security Reviewer',
          'Architecture Reviewer',
          'role_1773349380737_0baab9c0',
        ],
      },
      moa: {
        taskCount: 3,
      },
    },
  }))

  assert.match(html, /agents: API Security Reviewer, Architecture Reviewer, Agent 0baab9c0/)
  assert.doesNotMatch(html, /role_1773349380737_0baab9c0/)
})
