import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(filePath) {
  return readFileSync(filePath, 'utf8')
}

test('chat exposes delete thread without a separate clear transcript action', () => {
  const sources = [
    'src/renderer/components/ChatPanel.jsx',
    'src/renderer/components/chat/ChatPanelView.jsx',
    'src/renderer/components/chat/ChatPanelTimelineArea.jsx',
    'src/renderer/components/chat/ChatThreadModals.jsx',
    'src/renderer/components/chat/use-chat-panel-thread-actions.mjs',
    'src/renderer/components/chat/chat-panel-helpers.mjs',
    'src/renderer/components/CommandPalette.jsx',
  ].map(readSource).join('\n')

  assert.match(sources, /deleteCurrentThread|delete-thread/)
  assert.doesNotMatch(sources, /clearCurrentThreadHistory|clear-thread|chat\.thread\.clear|Clear Transcript|Clear Current Conversation/)
})

test('settings data keeps transfer, key cleanup, and full reset without thread or project cleanup rows', () => {
  const blockSource = readSource('src/renderer/components/settings/SettingsDataResetBlock.jsx')
  const rootSource = readSource('src/renderer/components/settings/SettingsPanelRoot.jsx')
  const managementSource = readSource('src/renderer/components/settings/use-settings-panel-data-management.mjs')

  assert.match(blockSource, /onExportCurrentThread/)
  assert.match(blockSource, /onImportThread/)
  assert.match(blockSource, /onDeleteApiKeysNow/)
  assert.match(blockSource, /onResetLocalDataAndRestart/)
  assert.doesNotMatch(blockSource, /onClearCurrentThread|onClearCurrentProject|Current Conversation|Project Conversation History/)
  assert.doesNotMatch(rootSource, /clearCurrentThreadHistory|clearCurrentProjectHistory|clearAllWorkspaceHistory|clearTranscriptPersistence/)
  assert.doesNotMatch(managementSource, /useSettingsWorkspaceDisposalActions|clearCurrentThreadHistory|clearCurrentProjectHistory|clearAllWorkspaceHistory|clearTranscriptPersistence/)
})

test('obsolete clear-only renderer and IPC APIs are removed', () => {
  const storeSource = readSource('src/renderer/store/useWorkspaceStore.js')
  const mainStoreSource = readSource('src/main/workspace/workspace-store.mjs')
  const ipcSource = readSource('src/main/ipc-handlers/workspace.mjs')
  const preloadSource = readSource('src/preload/preload-workspace-api.cjs')

  assert.doesNotMatch(storeSource, /clearCurrentThreadHistory|clearCurrentProjectHistory|clearProjectHistoryById|clearAllWorkspaceHistory|workspace\.clearAll/)
  assert.doesNotMatch(mainStoreSource, /export async function clearThread|export async function clearProject/)
  assert.doesNotMatch(ipcSource, /workspace:clear-thread|workspace:clear-project|workspace:clear-all/)
  assert.doesNotMatch(preloadSource, /clearThread:|clearProject:|clearAll:|workspace:clear-thread|workspace:clear-project|workspace:clear-all/)
})

test('single-section settings categories do not repeat category copy as a section header', () => {
  const contentSource = readSource('src/renderer/components/settings/SettingsPanelContent.jsx')
  const layoutSource = readSource('src/renderer/components/settings/SettingsPanelLayout.jsx')

  assert.match(contentSource, /showHeading=\{activeSections\.length > 1\}/)
  assert.match(layoutSource, /showHeading = true/)
  assert.match(layoutSource, /showHeading \?/)
})
