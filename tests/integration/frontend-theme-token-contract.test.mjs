import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('globals theme layer defines shared semantic renderer tokens', () => {
  const source = readSource('src/renderer/styles/globals-foundation.css')

  assert.match(source, /--color-surface-panel:/)
  assert.match(source, /--color-overlay-scrim:/)
  assert.match(source, /--color-overlay-scrim-strong:/)
  assert.match(source, /--color-accent-soft:/)
  assert.match(source, /--color-text-subtle:/)
  assert.match(source, /--color-text-tertiary:/)
  assert.match(source, /--color-success-bg:/)
  assert.match(source, /--color-warning-bg:/)
  assert.match(source, /--color-info-bg:/)
  assert.match(source, /--color-danger-strong:/)
  assert.match(source, /--color-border-strong:/)
})

test('shared shells and dialogs use semantic token classes instead of raw palette hexes', () => {
  const sourceByPath = {
    'src/renderer/App.jsx': readSource('src/renderer/App.jsx'),
    'src/renderer/components/ui/AppDecisionDialog.jsx': readSource('src/renderer/components/ui/AppDecisionDialog.jsx'),
    'src/renderer/components/AppErrorBoundary.jsx': readSource('src/renderer/components/AppErrorBoundary.jsx'),
    'src/renderer/components/PanelErrorBoundary.jsx': readSource('src/renderer/components/PanelErrorBoundary.jsx'),
    'src/renderer/components/chat/ChatThreadModals.jsx': readSource('src/renderer/components/chat/ChatThreadModals.jsx'),
    'src/renderer/components/chat/BackgroundJobsModal.jsx': readSource('src/renderer/components/chat/BackgroundJobsModal.jsx'),
    'src/renderer/components/chat/ComposerCodeBlockAdvancedEditorModal.jsx': readSource('src/renderer/components/chat/ComposerCodeBlockAdvancedEditorModal.jsx'),
    'src/renderer/components/chat/MessageBubbleUserAttachments.jsx': readSource('src/renderer/components/chat/MessageBubbleUserAttachments.jsx'),
    'src/renderer/components/settings/SettingsSection.jsx': readSource('src/renderer/components/settings/SettingsSection.jsx'),
    'src/renderer/components/settings/SettingsPanelLayout.jsx': readSource('src/renderer/components/settings/SettingsPanelLayout.jsx'),
    'src/renderer/components/settings/SettingsImportThreadModal.jsx': readSource('src/renderer/components/settings/SettingsImportThreadModal.jsx'),
    'src/renderer/components/settings/SettingsExportPreflightModal.jsx': readSource('src/renderer/components/settings/SettingsExportPreflightModal.jsx'),
    'src/renderer/components/agents/AgentFanoutConfirmOverlay.jsx': readSource('src/renderer/components/agents/AgentFanoutConfirmOverlay.jsx'),
  }

  assert.match(sourceByPath['src/renderer/App.jsx'], /bg-surface text-text-primary/)
  assert.match(sourceByPath['src/renderer/components/ui/AppDecisionDialog.jsx'], /bg-overlay-scrim/)

  assert.match(sourceByPath['src/renderer/components/AppErrorBoundary.jsx'], /border-danger-border bg-surface-raised/)
  assert.match(sourceByPath['src/renderer/components/PanelErrorBoundary.jsx'], /border-danger-border bg-surface-raised/)
  assert.match(sourceByPath['src/renderer/components/chat/ChatThreadModals.jsx'], /bg-surface-raised/)
  assert.match(sourceByPath['src/renderer/components/chat/ChatThreadModals.jsx'], /text-text-primary/)
  assert.match(sourceByPath['src/renderer/components/chat/BackgroundJobsModal.jsx'], /bg-surface-raised/)
  assert.match(sourceByPath['src/renderer/components/chat/BackgroundJobsModal.jsx'], /text-text-primary/)
  assert.match(sourceByPath['src/renderer/components/chat/ComposerCodeBlockAdvancedEditorModal.jsx'], /bg-surface-panel\/80/)
  assert.match(sourceByPath['src/renderer/components/chat/ComposerCodeBlockAdvancedEditorModal.jsx'], /bg-surface\/30/)
  assert.match(sourceByPath['src/renderer/components/chat/ComposerCodeBlockAdvancedEditorModal.jsx'], /text-text-(?:muted|tertiary|subtle)/)
  assert.match(sourceByPath['src/renderer/components/chat/MessageBubbleUserAttachments.jsx'], /bg-overlay-scrim/)
  assert.doesNotMatch(sourceByPath['src/renderer/components/chat/MessageBubbleUserAttachments.jsx'], /bg-black\/(?:72|75)/)
  assert.match(sourceByPath['src/renderer/components/settings/SettingsSection.jsx'], /text-text-primary/)
  assert.match(sourceByPath['src/renderer/components/settings/SettingsSection.jsx'], /text-text-secondary/)
  assert.match(sourceByPath['src/renderer/components/settings/SettingsPanelLayout.jsx'], /bg-surface-panel\/55/)
  assert.doesNotMatch(sourceByPath['src/renderer/components/settings/SettingsPanelLayout.jsx'], /from-surface to-surface-panel/)
  assert.match(sourceByPath['src/renderer/components/settings/SettingsImportThreadModal.jsx'], /bg-overlay-scrim/)
  assert.doesNotMatch(sourceByPath['src/renderer/components/settings/SettingsExportPreflightModal.jsx'], /bg-warning-bg/)
  assert.match(sourceByPath['src/renderer/components/agents/AgentFanoutConfirmOverlay.jsx'], /bg-danger-bg/)
  assert.match(sourceByPath['src/renderer/components/agents/AgentFanoutConfirmOverlay.jsx'], /bg-accent/)

  const rawPalettePattern = /#(?:0f1117|111827|0b1220|161b27|1e2535|334155|64748b|5b8dee|93c5fd|e2e8f0|cbd5e1|94a3b8|172554|1e3a8a|3b2a0f|4a3412|0f2f24|134032|7f1d1d|991b1b|fecaca|fee2e2)\b/i

  for (const [filePath, source] of Object.entries(sourceByPath)) {
    assert.doesNotMatch(source, rawPalettePattern, `${filePath} still contains raw palette hex values`)
  }
})
