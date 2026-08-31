import test from 'node:test'
import assert from 'node:assert/strict'

import { resolveToolIntentShadow } from '../../src/main/chat/tool-intent-router.mjs'

function buildTools(names = []) {
  return Object.fromEntries(names.map((name) => [name, { description: name, inputSchema: {} }]))
}

test('intent router classifies targeted edit turns in shadow mode', () => {
  const result = resolveToolIntentShadow({
    mode: 'execute',
    userMessage: 'Fix the auth bug and update the handler implementation.',
    activeTools: buildTools(['read_file', 'edit_file', 'write_file', 'apply_patch']),
  })

  assert.equal(result.intent, 'targeted_edit')
  assert.equal(result.confidence, 'medium')
  assert.deepEqual(result.suggestedHiddenToolNames, ['apply_patch'])
})

test('intent router classifies full rewrite turns in shadow mode', () => {
  const result = resolveToolIntentShadow({
    mode: 'execute',
    userMessage: 'Rewrite this file from scratch and overwrite it fully.',
    activeTools: buildTools(['read_file', 'write_file', 'edit_file', 'apply_patch']),
  })

  assert.equal(result.intent, 'full_rewrite')
  assert.deepEqual(result.suggestedVisibleToolNames, ['read_file', 'write_file'])
})

test('intent router classifies command turns when shell is available', () => {
  const result = resolveToolIntentShadow({
    mode: 'execute',
    userMessage: 'Run npm test and then execute the build.',
    activeTools: buildTools(['run_command', 'read_file']),
  })

  assert.equal(result.intent, 'command_execution')
})

test('intent router still classifies command turns when shell is not yet exposed', () => {
  const result = resolveToolIntentShadow({
    mode: 'execute',
    userMessage: 'Run npm test and then execute the build.',
    activeTools: buildTools(['read_file']),
  })

  assert.equal(result.intent, 'command_execution')
  assert.deepEqual(result.suggestedVisibleToolNames, [])
})

test('intent router classifies web research turns', () => {
  const result = resolveToolIntentShadow({
    mode: 'execute',
    userMessage: 'Look up the docs on this website and fetch the page contents.',
    activeTools: buildTools(['fetch_page', 'browser_action']),
  })

  assert.equal(result.intent, 'web_research')
  assert.deepEqual(result.suggestedHiddenToolNames, [])
})

test('intent router classifies browser interaction turns', () => {
  const result = resolveToolIntentShadow({
    mode: 'execute',
    userMessage: 'Open the browser, click the login button, and take a screenshot.',
    activeTools: buildTools(['fetch_page', 'browser_action']),
  })

  assert.equal(result.intent, 'browser_interaction')
  assert.deepEqual(result.suggestedHiddenToolNames, [])
})

test('intent router classifies MoA agent phrasing as delegation', () => {
  const result = resolveToolIntentShadow({
    mode: 'execute',
    userMessage: "Ask an agent of MoA to check how's your work.",
    activeTools: buildTools(['delegate_tasks']),
  })

  assert.equal(result.intent, 'delegation')
  assert.equal(result.confidence, 'medium')
  assert.deepEqual(result.suggestedVisibleToolNames, ['delegate_tasks'])
})

test('intent router falls back to mixed for conflicting signals', () => {
  const result = resolveToolIntentShadow({
    mode: 'execute',
    userMessage: 'Search the docs and then fix the code and run npm test.',
    activeTools: buildTools(['fetch_page', 'edit_file', 'write_file', 'run_command']),
  })

  assert.equal(result.intent, 'mixed')
  assert.equal(result.confidence, 'low')
})

test('intent router classifies full rewrite and targeted edit from text before visible-tool filtering', () => {
  const rewrite = resolveToolIntentShadow({
    mode: 'execute',
    userMessage: 'Rewrite this file from scratch and overwrite it fully.',
    activeTools: buildTools(['read_file']),
  })
  const edit = resolveToolIntentShadow({
    mode: 'execute',
    userMessage: 'Fix the auth bug and update the handler implementation.',
    activeTools: buildTools(['read_file']),
  })

  assert.equal(rewrite.intent, 'full_rewrite')
  assert.deepEqual(rewrite.suggestedVisibleToolNames, ['read_file'])
  assert.equal(edit.intent, 'targeted_edit')
  assert.deepEqual(edit.suggestedHiddenToolNames, [])
})

test('intent router treats live-session debugging turns as targeted edits instead of read-only exploration', () => {
  const result = resolveToolIntentShadow({
    mode: 'execute',
    userMessage: "Inspect the live session and debug why the model says it doesn't have file write tools to use.",
    activeTools: buildTools(['read_file', 'write_file', 'edit_file', 'apply_patch']),
  })

  assert.equal(result.intent, 'targeted_edit')
  assert.equal(result.confidence, 'medium')
  assert.deepEqual(result.suggestedVisibleToolNames, ['read_file', 'edit_file', 'write_file'])
  assert.deepEqual(result.suggestedHiddenToolNames, ['apply_patch'])
})

test('intent router does not suggest hiding core tools for vague continuation prompts', () => {
  const result = resolveToolIntentShadow({
    mode: 'execute',
    userMessage: 'Continue work and implement that phase.',
    activeTools: buildTools(['read_file', 'write_file', 'edit_file', 'run_command', 'apply_patch']),
  })

  assert.equal(result.intent, 'targeted_edit')
  assert.equal(result.confidence, 'medium')
  assert.deepEqual(result.suggestedVisibleToolNames, ['read_file', 'edit_file', 'write_file'])
  assert.deepEqual(result.suggestedHiddenToolNames, ['apply_patch'])
})

test('intent router does not suggest hiding core write or shell tools for exploration turns', () => {
  const result = resolveToolIntentShadow({
    mode: 'execute',
    userMessage: 'Explain the auth flow and inspect the related files.',
    activeTools: buildTools(['read_file', 'search_code', 'write_file', 'edit_file', 'run_command']),
  })

  assert.equal(result.intent, 'exploration_only')
  assert.equal(result.confidence, 'medium')
  assert.deepEqual(result.suggestedVisibleToolNames, ['read_file', 'search_code'])
  assert.deepEqual(result.suggestedHiddenToolNames, [])
})
