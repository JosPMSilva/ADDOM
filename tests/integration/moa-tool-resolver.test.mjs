import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { toAISDKTools } from '../../src/main/tools/tool-definitions.mjs'
import { resolveTurnTools } from '../../src/main/chat/turn-mode.mjs'
import { hasExplicitDelegationRequest } from '../../src/main/chat/delegation-tool-surface.mjs'
import { buildAgentMessages, buildAgentTools } from '../../src/main/moa/agent-runtime-helpers.mjs'

function requireSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

test('toAISDKTools only exposes delegation tools when delegation is available', () => {
  const withoutDelegation = toAISDKTools('ask', false)
  const withDelegation = toAISDKTools('ask', true)

  assert.equal(Boolean(withoutDelegation.delegate_to_agents), false)
  assert.equal(Boolean(withoutDelegation.delegate_tasks), false)
  assert.equal(Boolean(withoutDelegation.agent_catalog), false)
  assert.equal(Boolean(withoutDelegation.apply_artifact_revision), false)
  assert.equal(Boolean(withDelegation.delegate_to_agents), false)
  assert.equal(Boolean(withDelegation.delegate_tasks), true)
  assert.equal(Boolean(withDelegation.agent_catalog), true)
  assert.equal(Boolean(withDelegation.apply_artifact_revision), true)
})

test('compact delegation requires at least one context path when paths provide the task context', () => {
  const schema = toAISDKTools('ask', true).delegate_tasks?.inputSchema?.jsonSchema
  const taskSchema = schema?.properties?.tasks?.items
  const pathsBranch = taskSchema?.anyOf?.find((branch) => branch?.required?.includes('paths'))

  assert.equal(pathsBranch?.properties?.paths?.minItems, 1)
})

test('execute can delegate while Plan and Thinking stay within their read/research ceilings', () => {
  const executeTools = resolveTurnTools('execute', 'ask', true, toAISDKTools)
  const planTools = resolveTurnTools('plan', 'ask', true, toAISDKTools)
  const thinkingTools = resolveTurnTools('thinking', 'ask', true, toAISDKTools)

  assert.equal(Boolean(executeTools.delegate_to_agents), false)
  assert.equal(Boolean(executeTools.delegate_tasks), true)
  assert.equal(Boolean(executeTools.agent_catalog), true)
  assert.equal(Boolean(planTools.read_file), true)
  assert.equal(Boolean(planTools.fetch_page), true)
  assert.equal(Boolean(planTools.plan_direction_update), true)
  assert.equal(Boolean(planTools.plan_document_write), true)
  assert.equal(Boolean(planTools.write_file), false)
  assert.equal(Boolean(planTools.delegate_to_agents), false)
  assert.equal(Boolean(thinkingTools.read_file), true)
  assert.equal(Boolean(thinkingTools.fetch_page), true)
  assert.equal(Boolean(thinkingTools.plan_read), true)
  assert.equal(Boolean(thinkingTools.plan_direction_update), false)
  assert.equal(Boolean(thinkingTools.plan_document_write), false)
  assert.equal(Boolean(thinkingTools.write_file), false)
  assert.equal(Boolean(thinkingTools.delegate_to_agents), false)
})

test('explicit delegation detection excludes generic continuation requests', () => {
  assert.equal(hasExplicitDelegationRequest({ userMessage: 'Use multiple agents in parallel.' }), true)
  assert.equal(hasExplicitDelegationRequest({ userMessage: 'Continue with the remaining work.' }), false)
  assert.equal(hasExplicitDelegationRequest({ userMessage: 'Finish the work.' }), false)
})

test('backend delegation availability is capability-derived and no longer preference-gated', () => {
  const chatHandlerSource = requireSource('../../src/main/ipc-handlers/chat-stream-handler.mjs')
  const policySource = requireSource('../../src/main/chat/delegation-turn-policy.mjs')
  const agentsHandlerSource = requireSource('../../src/main/ipc-handlers/agents.mjs')
  const settingsSource = requireSource('../../src/main/settings.mjs')
  const settingsHandlerSource = requireSource('../../src/main/ipc-handlers/settings.mjs')

  assert.match(chatHandlerSource, /resolveDelegationTurnPolicy/)
  assert.match(policySource, /runtime_tool_capability/)
  assert.doesNotMatch(policySource, /resolveModelDelegationCapability/)
  assert.match(chatHandlerSource, /resolveModelCapabilitiesWithTimeout/)
  assert.match(chatHandlerSource, /model_delegation_unsupported/)
  assert.doesNotMatch(chatHandlerSource, /payload\.moaEnabled|settings\.moaEnabled/)
  assert.doesNotMatch(agentsHandlerSource, /direct-agent-dispatch|runtime-role/)
  assert.match(agentsHandlerSource, /agents:list-role-templates/)
  assert.doesNotMatch(settingsSource, /\bmoaEnabled\b/)
  assert.doesNotMatch(settingsHandlerSource, /\bmoaEnabled\b/)
})

test('toAISDKTools keeps local workspace tools available in both permission modes', () => {
  const askTools = toAISDKTools('ask', false)
  const autonomyTools = toAISDKTools('autonomy', false)

  assert.equal(Boolean(askTools.read_file), true)
  assert.equal(Boolean(askTools.write_file), true)
  assert.equal(Boolean(autonomyTools.read_file), true)
  assert.equal(Boolean(autonomyTools.write_file), true)
  assert.equal(Boolean(autonomyTools.list_directory), true)
  assert.equal(Boolean(autonomyTools.search_code), true)
})

test('buildAgentTools keeps execution ledger tools available and gates staged file mutation tools by capability', () => {
  const noWriteRole = buildAgentTools(false)
  assert.equal(Boolean(noWriteRole.write_file), false)
  assert.equal(Boolean(noWriteRole.apply_patch), false)
  assert.equal(Boolean(noWriteRole.create_directory), false)
  assert.equal(Boolean(noWriteRole.read_file), true)
  assert.equal(Boolean(noWriteRole.list_directory), true)
  assert.equal(Boolean(noWriteRole.search_code), true)
  assert.equal(Boolean(noWriteRole.plan_read), true)
  assert.equal(Boolean(noWriteRole.plan_update), true)
  assert.equal(Boolean(noWriteRole.question_user), false)

  const writeEnabled = buildAgentTools(true)
  assert.equal(Boolean(writeEnabled.read_file), true)
  assert.equal(Boolean(writeEnabled.list_directory), true)
  assert.equal(Boolean(writeEnabled.search_code), true)
  assert.equal(Boolean(writeEnabled.write_file), true)
  assert.equal(Boolean(writeEnabled.apply_patch), true)
  assert.equal(Boolean(writeEnabled.create_directory), true)
})

test('agent tool schemas are strict object schemas for provider compatibility', () => {
  const tools = buildAgentTools(false)

  for (const toolName of ['read_file', 'list_directory', 'search_code', 'plan_read', 'plan_update']) {
    const schema = tools[toolName]?.inputSchema?.jsonSchema
    assert.equal(schema?.type, 'object')
    assert.equal(schema?.additionalProperties, false)
  }
})

test('agent tool schemas satisfy OpenAI strict required-array rules for optional fields', () => {
  const tools = buildAgentTools(false)
  const schema = tools.list_directory?.inputSchema?.jsonSchema

  assert.deepEqual(schema?.required, ['path', 'depth', 'offset', 'limit'])
  assert.deepEqual(schema?.properties?.path?.type, ['string', 'null'])
  assert.deepEqual(schema?.properties?.depth?.type, ['integer', 'null'])
})

test('delegate_tasks is the single sealed model-facing delegation schema', () => {
  const tools = toAISDKTools('ask', true)
  const schema = tools.delegate_tasks?.inputSchema?.jsonSchema
  const taskItem = schema?.properties?.tasks?.items

  assert.equal(Boolean(tools.delegate_to_agents), false)
  assert.equal(schema?.type, 'object')
  assert.equal(schema?.additionalProperties, false)
  assert.equal(taskItem?.type, 'object')
  assert.equal(taskItem?.additionalProperties, false)
  assert.equal(schema?.properties?.selection_mode, undefined)
  assert.equal(schema?.properties?.role_keys, undefined)
  assert.equal(schema?.properties?.count, undefined)
  assert.equal(schema?.properties?.allow_role_reuse, undefined)
  assert.equal(taskItem?.properties?.agent_role_key, undefined)
  assert.ok(taskItem?.required?.includes('instruction'))
})

test('delegate_tasks accepts task briefs while ADDOM owns the execution plan', () => {
  const tools = toAISDKTools('ask', true)
  const desc = String(tools.delegate_tasks?.description || '')

  assert.match(desc, /ADDOM compiles the execution plan/i)
  assert.match(desc, /user-requested role and count constraints/i)
  assert.match(desc, /Do not choose or repeat roles/i)
})

test('agent_catalog exposes a read-only, provider-neutral catalog query', () => {
  const schema = toAISDKTools('ask', true).agent_catalog?.inputSchema?.jsonSchema

  assert.equal(schema?.type, 'object')
  assert.equal(schema?.additionalProperties, false)
  assert.deepEqual(schema?.properties?.include_unavailable?.type, ['boolean', 'null'])
})

test('buildAgentMessages reflects the resolved agent tool list', () => {
  const messages = buildAgentMessages(
    {
      instruction: 'Inspect files and search for failing tests.',
      injected_context: 'src/index.js',
      expected_output_format: 'Return a short summary.',
    },
    {
      name: 'Code Reviewer',
      systemPrompt: 'Be precise.',
    },
    {
      canWriteFiles: false,
      toolNames: ['read_file', 'search_code', 'shell'],
    },
  )

  assert.equal(Array.isArray(messages), true)
  assert.match(String(messages[0]?.content || ''), /You have tool access to: read_file, search_code, shell\./)
  assert.match(String(messages[0]?.content || ''), /If a shell tool is listed, keep commands tightly scoped/i)
  assert.doesNotMatch(String(messages[0]?.content || ''), /You do NOT run commands unless a listed tool explicitly allows it/i)
})
