import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isRoleCommand,
  parseRoleCommand,
  buildRoleGenerationPrompts,
} from '../../src/renderer/components/chat/role-command-parser.mjs'

test('detects slash and plain-language role creation requests', () => {
  assert.equal(isRoleCommand('/createrole UI reviewer for React dashboards'), true)
  assert.equal(isRoleCommand('create a new agent role to help you with this task'), true)
  assert.equal(isRoleCommand('suggest a new MoA role for desktop investigations'), true)
  assert.equal(isRoleCommand('we need a reviewer role for this'), true)
  assert.equal(isRoleCommand('make yourself a reviewer agent'), true)
  assert.equal(isRoleCommand('normal chat message about auth bugs'), false)
})

test('parseRoleCommand preserves slash descriptions and recognizes natural-language requests', () => {
  assert.deepEqual(
    parseRoleCommand('/createrole UI reviewer for React dashboards'),
    { description: 'UI reviewer for React dashboards', source: 'slash' },
  )

  assert.deepEqual(
    parseRoleCommand('create a new agent role to help you with this task'),
    { description: 'help you with this task', source: 'natural_language' },
  )

  assert.deepEqual(
    parseRoleCommand('suggest a new MoA role for desktop investigations'),
    { description: 'desktop investigations', source: 'natural_language' },
  )

  assert.deepEqual(
    parseRoleCommand('we need a reviewer role for this'),
    { description: 'reviewer role for this', source: 'natural_language' },
  )

  assert.deepEqual(
    parseRoleCommand('make yourself a reviewer agent'),
    { description: 'reviewer agent', source: 'natural_language' },
  )

  assert.deepEqual(
    parseRoleCommand('analyze the codebase for security flaws and create a new agent role to help you with this task'),
    { description: 'analyze the codebase for security flaws', source: 'composite_natural_language' },
  )

  assert.deepEqual(
    parseRoleCommand('Create an agent role for: analyze the codebase for security flaws'),
    { description: 'analyze the codebase for security flaws', source: 'natural_language' },
  )
})

test('buildRoleGenerationPrompts keeps the role-card json contract', () => {
  const prompts = buildRoleGenerationPrompts('desktop investigations', {
    providers: [
      {
        id: 'anthropic',
        name: 'Anthropic',
        apiKeyPresent: true,
        models: [{ id: 'claude-haiku-4-5' }],
      },
    ],
    selectedProvider: 'anthropic',
    selectedModel: 'claude-haiku-4-5',
  })

  assert.match(String(prompts.systemPrompt || ''), /Output ONLY valid JSON/i)
  assert.match(String(prompts.systemPrompt || ''), /suggestedProviderId/i)
  assert.match(String(prompts.systemPrompt || ''), /suggestedModel/i)
  assert.match(String(prompts.systemPrompt || ''), /Never ask clarifying questions/i)
  assert.match(String(prompts.systemPrompt || ''), /Never propose saving a file/i)
  assert.match(String(prompts.systemPrompt || ''), /Output the JSON object only/i)
})

test('buildRoleGenerationPrompts falls back to the selected provider when provider cache is unavailable', () => {
  const prompts = buildRoleGenerationPrompts('codebase analysis', {
    selectedProvider: 'anthropic',
    selectedModel: 'claude-haiku-4-5',
  })

  assert.match(String(prompts.systemPrompt || ''), /- anthropic \(anthropic\): models=\[claude-haiku-4-5\]/i)
  assert.match(String(prompts.systemPrompt || ''), /Current user selection: anthropic\/claude-haiku-4-5/i)
})
