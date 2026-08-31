import test from 'node:test'
import assert from 'node:assert/strict'

import { SYSTEM_PROMPT } from '../../src/main/chat/prompt-constants.mjs'
import { toAISDKTools } from '../../src/main/tools/tool-definitions.mjs'

test('SYSTEM_PROMPT stays compact and action-oriented', () => {
  assert.match(SYSTEM_PROMPT, /\[ADDOM EXECUTION BRIEF\]/)
  assert.match(SYSTEM_PROMPT, /use the tool directly instead of asking for an extra "go" or confirmation/i)
  assert.match(SYSTEM_PROMPT, /Keep going until the task is complete or runtime policy blocks you/i)
  assert.match(SYSTEM_PROMPT, /background execution/i)
  assert.match(SYSTEM_PROMPT, /active permission mode/i)
  assert.match(SYSTEM_PROMPT, /Do not emit textual approval requests/i)
  assert.match(SYSTEM_PROMPT, /major transitions or blockers/i)
  assert.match(SYSTEM_PROMPT, /refer to the product as ADDOM/i)
  assert.match(SYSTEM_PROMPT, /Do not tell the user to restart, open, or use "Codex" when you mean the ADDOM app/i)
  assert.match(SYSTEM_PROMPT, /It is fine to mention the Codex runtime, Codex app-server, or other Codex internals/i)
  assert.match(SYSTEM_PROMPT, /generated image should be visible in chat/i)
  assert.match(SYSTEM_PROMPT, /standard Markdown image/i)
  assert.match(SYSTEM_PROMPT, /requested a project destination/i)
  assert.match(SYSTEM_PROMPT, /do not embed it/i)
  assert.doesNotMatch(SYSTEM_PROMPT, /Get-ChildItem -Force/i)
  assert.doesNotMatch(SYSTEM_PROMPT, /dir \/a/i)
  assert.doesNotMatch(SYSTEM_PROMPT, /install-sandbox routing/i)
  assert.doesNotMatch(SYSTEM_PROMPT, /after the tool call/i)
})

test('run_command tool description stays concise and defers policy mechanics to runtime', () => {
  const tools = toAISDKTools(true, false)
  const desc = String(tools?.run_command?.description || '')

  assert.match(desc, /runtime context/i)
  assert.match(desc, /background=true/i)
  assert.match(desc, /active permission mode/i)
  assert.match(desc, /textual approval requests/i)
  assert.match(desc, /project-local installs/i)
  assert.match(desc, /runtime policy blocks or reroutes/i)
  assert.doesNotMatch(desc, /Get-ChildItem -Force/i)
  assert.doesNotMatch(desc, /dir \/a/i)
  assert.doesNotMatch(desc, /install sandbox/i)
  assert.doesNotMatch(desc, /after the tool call/i)
})

test('write and edit tool descriptions no longer teach approval choreography', () => {
  const tools = toAISDKTools(true, false)
  const writeDesc = String(tools?.write_file?.description || '')
  const editDesc = String(tools?.edit_file?.description || '')

  assert.match(writeDesc, /Write complete content/i)
  assert.match(editDesc, /exact text replacement/i)
  assert.doesNotMatch(writeDesc, /after the tool call/i)
  assert.doesNotMatch(editDesc, /after the tool call/i)
  assert.doesNotMatch(writeDesc, /The user will see and approve/i)
  assert.doesNotMatch(editDesc, /The user will see and approve/i)
})
