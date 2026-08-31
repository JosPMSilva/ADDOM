import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { MOA_ORCHESTRATOR_PROMPT } from '../../src/main/chat/moa-prompts.mjs'
import { buildMoaDelegationPreflightRepairPrompt } from '../../src/main/chat/moa-preflight-repair-prompt.mjs'

test('MoA agent routing contract removes legacy fallback policy surfaces', () => {
  const fallbackPolicyPath = path.resolve('src/main/moa/agent-fallback-policy.mjs')
  const agentRuntimeSource = fs.readFileSync(path.resolve('src/main/moa/agent-runtime.mjs'), 'utf8')
  const agentExecutorSource = fs.readFileSync(path.resolve('src/main/tools/agent-executor.mjs'), 'utf8')
  const preloadSource = fs.readFileSync(path.resolve('src/preload/index.mjs'), 'utf8')
  const dbSource = fs.readFileSync(path.resolve('src/main/memory/db.mjs'), 'utf8')
  const legacyFallbackEvent = ['moa:', 'w', 'orker', '-fallback-used'].join('')
  const legacyFallbackHook = ['on', 'W', 'orker', 'FallbackUsed'].join('')

  assert.equal(fs.existsSync(fallbackPolicyPath), false)
  assert.doesNotMatch(
    agentRuntimeSource,
    new RegExp(`agent-fallback-policy|${legacyFallbackEvent}|fallbackUsed|preferFallbackLean`),
  )
  assert.doesNotMatch(agentExecutorSource, /fallbackUsed|preferFallbackLean/)
  assert.doesNotMatch(preloadSource, new RegExp(`${legacyFallbackHook}|${legacyFallbackEvent}`))
  assert.doesNotMatch(dbSource, /worker_outputs/)
})

test('MoA prompts and tool copy keep role planning application-owned', () => {
  const toolDefinitionsSource = fs.readFileSync(path.resolve('src/main/tools/tool-definitions-moa.mjs'), 'utf8')
  const repairPrompt = buildMoaDelegationPreflightRepairPrompt({
    preflight: {
      errors: [{ code: 'role_not_found', message: 'Role missing.', taskId: 'task_1' }],
      tasks: [{ task_id: 'task_1', instruction: 'Review auth.', injected_context: 'src/auth.ts', expected_output_format: 'JSON findings' }],
    },
  })

  assert.match(MOA_ORCHESTRATOR_PROMPT, /Use delegate_tasks as the only model-facing delegation entry point/i)
  assert.match(MOA_ORCHESTRATOR_PROMPT, /Do not select, pin, order, or repeat roles/i)
  assert.match(MOA_ORCHESTRATOR_PROMPT, /ADDOM compiles the execution plan/i)
  assert.match(MOA_ORCHESTRATOR_PROMPT, /performs global specialist assignment/i)
  assert.match(MOA_ORCHESTRATOR_PROMPT, /Do NOT delegate simple, single-concern edits, greetings, lightweight Q&A, or vague requests/i)
  assert.match(MOA_ORCHESTRATOR_PROMPT, /Never copy catalog role keys into delegate_tasks/i)
  assert.match(repairPrompt, /Repair toward semantic routing hints/i)
  assert.match(repairPrompt, /Do not retry with empty strings, placeholder text, guessed role keys\/IDs, or missing semantic hints/i)
  assert.match(toolDefinitionsSource, /name: 'delegate_tasks'/i)
  assert.match(toolDefinitionsSource, /provider-neutral agent catalog/i)
  assert.match(toolDefinitionsSource, /ADDOM compiles the execution plan/i)
  assert.doesNotMatch(toolDefinitionsSource, /selection_mode/i)
  assert.doesNotMatch(toolDefinitionsSource, /role_keys/i)
  assert.match(toolDefinitionsSource, /name: 'agent_catalog'/i)
  assert.match(toolDefinitionsSource, /staged_write is granted only when both the selected role and ADDOM policy allow staged writes/i)
  assert.equal(fs.existsSync(path.resolve('src/main/chat/moa-role-catalog-prompt.mjs')), false)
  assert.doesNotMatch(toolDefinitionsSource, /legacy flow/i)
  assert.doesNotMatch(repairPrompt, /\[MoA ROLE CATALOG\]/)
})
