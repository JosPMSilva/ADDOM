import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function readSource(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8')
}

test('completed agent markers expose one shared status hook across agent surfaces', () => {
  const navigatorSource = readSource('src/renderer/components/agents/AgentNavigatorRow.jsx')
  const conversationSource = readSource('src/renderer/components/agents/AgentConversationView.jsx')
  const streamSource = readSource('src/renderer/components/agents/AgentStreamReferenceGroup.jsx')

  assert.match(navigatorSource, /data-agent-status=\{row\.status\}/)
  assert.match(conversationSource, /data-agent-status=\{displayStatus\}/)
  assert.match(streamSource, /data-agent-status=\{reference\.status\}/)
})

test('light completed markers use a lighter solid semantic success fill', () => {
  const navigatorSource = readSource('src/renderer/components/agents/AgentNavigatorRow.jsx')
  const statusToneSource = readSource('src/renderer/components/agents/agent-status-tone.mjs')
  const runtimeStyles = readSource('src/renderer/styles/globals-runtime.css')

  assert.match(navigatorSource, /'mt-\[7px\] h-1\.5 w-1\.5 shrink-0 rounded-full'/)
  assert.match(statusToneSource, /completed:\s*'bg-success'/)
  assert.match(
    runtimeStyles,
    /\[data-app-theme=['"]light['"]\]\s+\[data-agent-status=['"]completed['"]\]\s*\{[^}]*background-color:\s*color-mix\(in srgb, var\(--color-success\) 68%, var\(--color-surface-raised\) 32%\);[^}]*\}/s,
  )
  assert.doesNotMatch(
    runtimeStyles,
    /\[data-app-theme=['"]light['"]\]\s+\[data-agent-status=['"]completed['"]\]\s*\{[^}]*box-shadow:/s,
  )
})

test('chat timeline owns the soft boundary and reserves the composer inset as bottom safety space', () => {
  const viewSource = readSource('src/renderer/components/chat/ChatPanelView.jsx')
  const composerSource = readSource('src/renderer/components/chat/ChatPanelComposerArea.jsx')
  const timelineSource = readSource('src/renderer/components/chat/ChatPanelTimelineArea.jsx')

  assert.match(composerSource, /className="shrink-0 px-4 pb-4 bg-transparent pointer-events-none"/)
  assert.match(timelineSource, /className="h-full overflow-y-auto px-4 pt-4 pb-8 flex flex-col items-center gap-2"/)
  assert.doesNotMatch(viewSource, /data-ui="chat-composer-transcript-fade"/)
})
