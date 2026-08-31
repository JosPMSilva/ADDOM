import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const chatPanelSource = [
  'src/renderer/components/ChatPanel.jsx',
  'src/renderer/components/chat/ChatPanelView.jsx',
].map((sourcePath) => fs.readFileSync(path.resolve(sourcePath), 'utf8')).join('\n')

const chatHeaderControlsSource = fs.readFileSync(
  path.resolve('src/renderer/components/chat/ChatHeaderControls.jsx'),
  'utf8',
)

const providerNoticeSource = fs.readFileSync(
  path.resolve('src/renderer/components/chat/ProviderTermsNoticeModal.jsx'),
  'utf8',
)

test('chat panel wires provider/model compliance notices to chat notice store', () => {
  assert.match(chatPanelSource, /const pushNotice = useChatStore\(\(s\) => s\.pushNotice\)/)
  assert.match(chatPanelSource, /onComplianceNotice=\{pushNotice\}/)
})

test('provider model selector emits compliance notice callback on switches', () => {
  assert.match(chatHeaderControlsSource, /onComplianceNotice\s*=\s*\(\)\s*=>\s*\{\s*\}/)
  assert.match(chatHeaderControlsSource, /onComplianceNotice\(\{\s*type:\s*'warning'/)
  assert.match(chatHeaderControlsSource, /noticeType,\s*threadId:/)
})

test('provider notice is rail-anchored instead of viewport-centered', () => {
  assert.match(chatHeaderControlsSource, /relative flex min-w-0/)
  assert.match(providerNoticeSource, /absolute left-1\/2 bottom-\[calc\(100%\+0\.75rem\)\]/)
  assert.doesNotMatch(providerNoticeSource, /fixed inset-0/)
  assert.match(providerNoticeSource, /data-ui="provider-terms-notice"/)
  assert.doesNotMatch(providerNoticeSource, /type="checkbox"/)
  assert.doesNotMatch(providerNoticeSource, /border-border-strong/)
})
