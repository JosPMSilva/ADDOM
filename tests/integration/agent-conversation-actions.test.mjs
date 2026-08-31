import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  isOpaqueAgentNode,
  listAgentConversationActions,
  runAgentConversationAction,
} from '../../src/renderer/components/agents/agent-conversation-actions.mjs'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(TEST_DIR, '../..')

test('opaque nodes expose no conversation overflow actions', () => {
  assert.deepEqual(listAgentConversationActions({
    status: 'running',
    capabilitySnapshot: {
      mode: 'provider_opaque',
      childMessaging: false,
      childCancellation: false,
      childRetry: false,
    },
  }), [])
  assert.equal(isOpaqueAgentNode({ capabilitySnapshot: { mode: 'provider_opaque' } }), true)
})

test('managed nodes only list capability-gated actions for the current status', () => {
  assert.deepEqual(
    listAgentConversationActions({
      status: 'running',
      capabilitySnapshot: {
        mode: 'managed_hierarchy',
        childMessaging: true,
        childCancellation: true,
        childRetry: true,
      },
    }).map((action) => action.id),
    ['interrupt'],
  )
  assert.deepEqual(
    listAgentConversationActions({
      status: 'approval_required',
      capabilitySnapshot: {
        mode: 'managed_hierarchy',
        childMessaging: true,
        childCancellation: true,
        childRetry: true,
      },
    }).map((action) => action.id),
    ['interrupt'],
  )
  assert.deepEqual(
    listAgentConversationActions({
      status: 'failed',
      capabilitySnapshot: {
        mode: 'managed_hierarchy',
        childMessaging: true,
        childCancellation: true,
        childRetry: true,
      },
    }).map((action) => action.id),
    ['retry'],
  )
})

test('completed inspectable conversations expose promotion even when the leaf cannot address children', () => {
  const node = {
    status: 'running',
    capabilitySnapshot: {
      mode: 'managed_hierarchy', addressableChildren: false,
      childMessaging: true, childCancellation: true, childRetry: true,
    },
  }
  assert.equal(listAgentConversationActions(node, { hasCompletedTurn: true }).at(-1).id, 'promote')
  assert.equal(listAgentConversationActions(node, { hasCompletedTurn: false }).some((action) => action.id === 'promote'), false)
})

test('promotion actions use the scoped promotion boundary', async () => {
  const calls = []
  await runAgentConversationAction({
    agentRunsApi: { async promoteConversation(input) { calls.push(input); return { supported: true } } },
    scope: { projectId: 'project_01', threadId: 'thread_01', runId: 'run_01', nodeId: 'node_01' },
    action: { id: 'promote', kind: 'promote' },
  })
  assert.deepEqual(calls[0], { projectId: 'project_01', threadId: 'thread_01', runId: 'run_01', nodeId: 'node_01' })
})

test('agent messaging uses the scoped composer rather than a dialog or browser prompt', () => {
  const viewSource = fs.readFileSync(
    path.join(ROOT, 'src/renderer/components/agents/AgentConversationView.jsx'),
    'utf8',
  )
  const composerSource = fs.readFileSync(
    path.join(ROOT, 'src/renderer/components/agents/AgentConversationComposer.jsx'),
    'utf8',
  )
  const foundationSource = fs.readFileSync(
    path.join(ROOT, 'src/renderer/components/chat/ConversationComposerFoundation.jsx'),
    'utf8',
  )

  assert.doesNotMatch(viewSource, /window\.prompt/)
  assert.doesNotMatch(viewSource, /AgentMessageDialog/)
  assert.match(viewSource, /<AgentConversationComposer/)
  assert.match(viewSource, /route=\{routePresentation\}/)
  assert.match(viewSource, /followupSupported/)
  assert.match(viewSource, /queuedCount/)
  assert.match(composerSource, /data-ui="agent-conversation-composer"/)
  assert.match(composerSource, /--app-chat-composer-max-width/)
  assert.match(composerSource, /<ConversationComposerFoundation variant="agent">/)
  assert.match(composerSource, /<ChatComposerDraftTextarea/)
  assert.match(composerSource, /slashCommandsEnabled=\{false\}/)
  assert.match(foundationSource, /data-composer-variant/)
  assert.doesNotMatch(composerSource, /ProviderModelSelector|ChatModeToggle|ReasoningEffort/)
})

test('root and agent composers share the same shell and control-rail surfaces', () => {
  const composerSource = fs.readFileSync(
    path.join(ROOT, 'src/renderer/components/agents/AgentConversationComposer.jsx'),
    'utf8',
  )
  const foundationSource = fs.readFileSync(
    path.join(ROOT, 'src/renderer/components/chat/ConversationComposerFoundation.jsx'),
    'utf8',
  )
  const rootComposerSource = fs.readFileSync(
    path.join(ROOT, 'src/renderer/components/chat/ChatPanelComposerArea.jsx'),
    'utf8',
  )
  const rootRailSource = fs.readFileSync(
    path.join(ROOT, 'src/renderer/components/chat/ChatComposerControlRailView.jsx'),
    'utf8',
  )

  assert.match(foundationSource, /export function ConversationComposerInputSurface/)
  assert.match(foundationSource, /export const ConversationComposerControlSurface/)
  assert.match(foundationSource, /export const ConversationComposerActionButton/)
  assert.match(composerSource, /<ConversationComposerInputSurface/)
  assert.match(composerSource, /<ConversationComposerControlSurface/)
  assert.match(composerSource, /<ConversationComposerActionButton/)
  assert.match(composerSource, /data-ui="agent-conversation-composer-route"/)
  assert.match(rootComposerSource, /<ConversationComposerInputSurface/)
  assert.match(rootRailSource, /<ConversationComposerControlSurface/)
  assert.match(rootRailSource, /<ConversationComposerActionButton/)
  assert.doesNotMatch(composerSource, /items-end|rounded-xl bg-surface-panel/)
})

test('the public one-shot message route is absent while canonical follow-up remains available', () => {
  const preloadSource = fs.readFileSync(path.join(ROOT, 'src/preload/preload-agent-runs-api.cjs'), 'utf8')
  const ipcSource = fs.readFileSync(path.join(ROOT, 'src/main/ipc-handlers/agent-runs.mjs'), 'utf8')

  assert.doesNotMatch(preloadSource, /agent-runs:message/)
  assert.doesNotMatch(ipcSource, /agent-runs:message/)
  assert.match(preloadSource, /agent-runs:followup/)
})
