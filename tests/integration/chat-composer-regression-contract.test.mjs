import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('chat composer restores code-block keymap and repeated-dispatch compliance wiring', () => {
  const actionsSource = fs.readFileSync(
    path.resolve('src/renderer/components/chat/use-chat-panel-composer-actions.mjs'),
    'utf8',
  )
  const composerSource = fs.readFileSync(
    path.resolve('src/renderer/components/chat/ChatComposer.jsx'),
    'utf8',
  )

  assert.match(actionsSource, /requestAppConfirm/)
  assert.match(actionsSource, /COMPLIANCE_MODE_STRICT/)
  assert.match(actionsSource, /repetitive_dispatch_pattern/)
  assert.match(composerSource, /applyCodeBlockKeymap/)
  assert.match(composerSource, /metaKey: !!event\.metaKey/)
  assert.match(composerSource, /source: 'code_editor'/)
  assert.match(composerSource, /createCodeComposerBlock/)
  assert.match(composerSource, /replaceComposerBlockPreservingIdentity/)
})

test('role generation flow uses the structured role prompt and keeps the turn tool-free', () => {
  const actionsSource = fs.readFileSync(
    path.resolve('src/renderer/components/chat/use-chat-panel-composer-actions.mjs'),
    'utf8',
  )

  assert.match(actionsSource, /const \{ systemPrompt: roleSysPrompt, userPrompt: roleUserPrompt \} = buildRoleGenerationPrompts\(/)
  assert.match(actionsSource, /historyContentOverride:\s*roleUserPrompt/)
  assert.match(actionsSource, /currentUserMessage:\s*roleUserPrompt/)
  assert.match(actionsSource, /preserveHistory:\s*false/)
  assert.match(actionsSource, /getLatestAssistantNote\(chatState\.messages\)\.note/)
  assert.match(actionsSource, /sendToolFreeCommandMessage\(/)
})
