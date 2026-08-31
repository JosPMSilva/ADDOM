import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

function readSource(relPath) {
  return fs.readFileSync(path.resolve(relPath), 'utf8')
}

test('App routes major panels through PanelErrorBoundary', () => {
  const source = readSource('src/renderer/App.jsx')

  assert.match(source, /import PanelErrorBoundary from '\.\/components\/PanelErrorBoundary\.jsx'/)
  assert.match(source, /import WorkspaceProjectEntry from '\.\/components\/WorkspaceProjectEntry\.jsx'/)
  assert.match(source, /import WorkspaceRail from '\.\/components\/workspace\/WorkspaceRail\.jsx'/)
  assert.match(source, /const panelLabels = React\.useMemo\(\(\) => getPanelLabels\(t\), \[t\]\)/)
  assert.match(source, /panelKey=\{activePanel === 'settings' \? 'workspace:settings' : 'workspace:chat'\}/)
  assert.match(source, /<WorkspaceProjectEntry[\s\S]*onRequestTarget=\{requestWorkspaceTarget\}/)
  assert.match(source, /<PanelErrorBoundary[\s\S]*panelKey=\{`workspace:\$\{String\(activePanel \|\| 'chat'\)\}`\}/)
  assert.match(source, /<PanelErrorBoundary panelKey="workspace:git-companion" panelLabel=\{panelLabels\.git\}>/)
  assert.match(source, /<PanelErrorBoundary panelKey="workspace:agents-companion" panelLabel=\{panelLabels\.agents\}>/)
})

test('modal overlays expose dialog semantics and focus trapping', () => {
  const appSource = readSource('src/renderer/App.jsx')
  const appDecisionDialogSource = readSource('src/renderer/components/ui/AppDecisionDialog.jsx')
  const workspaceTargetDialogSource = readSource('src/renderer/components/WorkspaceTargetDialog.jsx')
  const chatThreadModalsSource = readSource('src/renderer/components/chat/ChatThreadModals.jsx')
  const backgroundJobsSource = readSource('src/renderer/components/chat/BackgroundJobsModal.jsx')
  const memoryPanelSource = [
    readSource('src/renderer/components/MemoryPanel.jsx'),
    readSource('src/renderer/components/memory/MemoryPanelLeafComponents.jsx'),
  ].join('\n')
  const composerAdvancedEditorSource = readSource('src/renderer/components/chat/ComposerCodeBlockAdvancedEditorModal.jsx')
  const settingsExportSource = readSource('src/renderer/components/settings/SettingsExportPreflightModal.jsx')
  const settingsImportSource = readSource('src/renderer/components/settings/SettingsImportThreadModal.jsx')
  const dialogShellSource = readSource('src/renderer/components/ui/DialogShell.jsx')
  const agentOverlaySource = readSource('src/renderer/components/agents/AgentFanoutConfirmOverlay.jsx')
  const generatedImageSource = readSource(
    'src/renderer/components/chat/final-document/GeneratedArtifactImage.jsx',
  )

  assert.match(workspaceTargetDialogSource, /useDialogFocusTrap\(open,\s*dialogRef\)/)
  assert.match(workspaceTargetDialogSource, /useDialogEscapeDismiss\(open && !busy,\s*dialogRef,\s*onCancel\)/)
  assert.match(workspaceTargetDialogSource, /role="dialog"/)
  assert.match(workspaceTargetDialogSource, /aria-modal="true"/)
  assert.match(workspaceTargetDialogSource, /aria-labelledby="workspace-target-dialog-title"/)
  assert.match(generatedImageSource, /useDialogFocusTrap\(!!image,\s*dialogRef\)/)
  assert.match(generatedImageSource, /useDialogEscapeDismiss\(!!image,\s*dialogRef,\s*onClose\)/)
  assert.match(generatedImageSource, /role="dialog"/)
  assert.match(generatedImageSource, /aria-modal="true"/)
  assert.match(appSource, /<AppDecisionDialog/)
  assert.match(appDecisionDialogSource, /aria-labelledby=\{titleId\}/)
  assert.match(appDecisionDialogSource, /aria-describedby=\{descriptionId\}/)
  assert.match(appDecisionDialogSource, /useDialogFocusTrap\(open,\s*dialogRef\)/)
  assert.match(appDecisionDialogSource, /useDialogEscapeDismiss\(open,\s*dialogRef,\s*onCancel\)/)

  assert.match(chatThreadModalsSource, /useDialogFocusTrap\(true,\s*dialogRef\)/)
  assert.match(chatThreadModalsSource, /useDialogEscapeDismiss\(true,\s*dialogRef,\s*onClose\)/)
  assert.match(chatThreadModalsSource, /role="dialog"/)
  assert.match(chatThreadModalsSource, /aria-modal="true"/)
  assert.match(chatThreadModalsSource, /aria-labelledby=\{titleId\}/)

  assert.match(backgroundJobsSource, /useDialogFocusTrap\(true,\s*dialogRef\)/)
  assert.match(backgroundJobsSource, /useDialogEscapeDismiss\(true,\s*dialogRef,\s*onClose\)/)
  assert.match(backgroundJobsSource, /role="dialog"/)
  assert.match(backgroundJobsSource, /aria-modal="true"/)
  assert.match(backgroundJobsSource, /aria-labelledby="background-jobs-modal-title"/)

  assert.match(memoryPanelSource, /useDialogFocusTrap\(true,\s*dialogRef\)/)
  assert.match(memoryPanelSource, /useDialogEscapeDismiss\(true,\s*dialogRef,\s*onClose\)/)
  assert.match(memoryPanelSource, /role="dialog"/)
  assert.match(memoryPanelSource, /aria-modal="true"/)
  assert.match(memoryPanelSource, /aria-labelledby="memory-edit-node-title"/)

  assert.match(composerAdvancedEditorSource, /useDialogFocusTrap\(open,\s*dialogRef\)/)
  assert.match(composerAdvancedEditorSource, /useDialogEscapeDismiss\(open,\s*dialogRef,\s*onCancel\)/)
  assert.match(composerAdvancedEditorSource, /role="dialog"/)
  assert.match(composerAdvancedEditorSource, /aria-modal="true"/)
  assert.match(composerAdvancedEditorSource, /aria-labelledby="composer-advanced-editor-title"/)

  assert.match(settingsExportSource, /useDialogFocusTrap\(open,\s*dialogRef\)/)
  assert.match(settingsExportSource, /useDialogEscapeDismiss\(open,\s*dialogRef,\s*onCancel\)/)
  assert.match(settingsExportSource, /import DialogShell/)
  assert.match(settingsImportSource, /useDialogFocusTrap\(open,\s*dialogRef\)/)
  assert.match(settingsImportSource, /useDialogEscapeDismiss\(open,\s*dialogRef,\s*onCancel\)/)
  assert.match(settingsImportSource, /import DialogShell/)
  assert.match(dialogShellSource, /role="dialog"/)
  assert.match(dialogShellSource, /aria-modal="true"/)
  assert.match(dialogShellSource, /aria-labelledby=\{titleId\}/)

  assert.match(agentOverlaySource, /useDialogFocusTrap\(!!viewModel,\s*dialogRef\)/)
  assert.match(agentOverlaySource, /role="dialog"/)
  assert.match(agentOverlaySource, /aria-modal="true"/)
  assert.match(agentOverlaySource, /aria-labelledby="agent-fanout-confirm-title"/)
})

test('chat controls expose the new accessibility attributes', () => {
  const turnRunbookSource = readSource('src/renderer/components/chat/TurnRunbook.jsx')
  const liveExecutionSource = readSource('src/renderer/components/chat/LiveExecutionStreamBlock.jsx')
  const liveExecutionHeaderSource = readSource('src/renderer/components/chat/LiveExecutionStreamHeader.jsx')

  assert.match(turnRunbookSource, /aria-label=\{expanded[\s\S]*core:chat\.runbook\.aria\.collapse[\s\S]*core:chat\.runbook\.aria\.expand/s)
  assert.match(turnRunbookSource, /aria-expanded=\{expanded\}/)
  assert.match(turnRunbookSource, /aria-pressed=\{filter === chip\.id\}/)

  assert.match(liveExecutionSource, /panelId=\{turnPanelId\}/)
  assert.match(liveExecutionHeaderSource, /aria-controls=\{panelId\}/)
  assert.match(liveExecutionSource, /aria-controls=\{detailPanelId\}/)
})

test('attachment actions provide keyboard context-menu access and nested menu semantics', () => {
  const attachmentSource = readSource('src/renderer/components/chat/MessageBubbleUserAttachments.jsx')
  const menuSource = readSource('src/renderer/components/chat/AttachmentActionsMenu.jsx')
  assert.match(attachmentSource, /onContextMenu=/)
  assert.match(attachmentSource, /ContextMenu/)
  assert.match(attachmentSource, /shiftKey[\s\S]*F10/)
  assert.match(menuSource, /aria-label=/)
  assert.match(menuSource, /role="menu"/)
  assert.match(menuSource, /aria-haspopup=\{action === 'open_with' \? 'menu' : undefined\}/)
  assert.match(menuSource, /aria-expanded=\{action === 'open_with' \? submenuOpen : undefined\}/)
  assert.match(menuSource, /querySelectorAll\('\[role="menuitem"\]:not\(:disabled\)'\)/)
})

test('icon-only controls expose labels and global motion/focus accessibility policies', () => {
  const composerSource = readSource('src/renderer/components/chat/ChatComposer.jsx')
  const composerAddContentSource = readSource('src/renderer/components/chat/ChatComposerAddContentControls.jsx')
  const draftTextareaSource = readSource('src/renderer/components/chat/ChatComposerDraftTextarea.jsx')
  const railSource = [
    readSource('src/renderer/components/chat/ChatComposerControlRail.jsx'),
    readSource('src/renderer/components/chat/ChatComposerControlRailView.jsx'),
  ].join('\n')
  const slashMenuSource = readSource('src/renderer/components/chat/SlashCommandMenu.jsx')
  const headerControlsSource = readSource('src/renderer/components/chat/ChatHeaderControls.jsx')
  const headerBarSource = readSource('src/renderer/components/chat/ChatPanelHeaderBar.jsx')
  const permissionToggleSource = readSource('src/renderer/components/chat/PermissionModeToggle.jsx')
  const globalStylesSource = [
    readSource('src/renderer/styles/globals.css'),
    readSource('src/renderer/styles/globals-runtime.css'),
  ].join('\n')

  assert.match(`${composerSource}\n${composerAddContentSource}`, /aria-label=\{t\('core:chat\.composer\.addContent', \{ defaultValue: 'Add content' \}\)\}/)
  assert.match(composerAddContentSource, /disabled=\{attachDisabled\}/)
  assert.match(railSource, /aria-label=\{t\('core:chat\.controlRail\.moreActions', \{ defaultValue: 'More actions' \}\)\}/)
  assert.match(railSource, /aria-label=\{t\('core:chat\.controlRail\.stopResponse', \{ defaultValue: 'Stop response' \}\)\}/)
  assert.match(railSource, /aria-label=\{t\('core:chat\.controlRail\.sendMessage', \{ defaultValue: 'Send message' \}\)\}/)
  assert.match(composerSource, /<ChatComposerDraftTextarea/)
  assert.match(draftTextareaSource, /data-ui="chat-composer-input"/)
  assert.match(draftTextareaSource, /aria-haspopup="listbox"/)
  assert.match(draftTextareaSource, /aria-expanded=\{slashMenuOpen\}/)
  assert.match(draftTextareaSource, /aria-controls=\{slashMenuOpen \? slashListId : undefined\}/)
  assert.match(draftTextareaSource, /aria-activedescendant=\{slashMenuOpen \? activeSlashOptionId : undefined\}/)
  assert.match(slashMenuSource, /role="listbox"/)
  assert.match(slashMenuSource, /role="option"/)
  assert.match(headerControlsSource, /aria-label=\{activeThreadId \? 'Rename thread' : 'Select a thread to rename'\}/)
  assert.match(headerBarSource, /aria-label=\{workspaceRailOpenLabel\}/)
  assert.match(headerBarSource, /data-ui="workspace-rail-open"/)
  assert.match(permissionToggleSource, /aria-label=\{t\('core:chat\.permissionMode\.groupAriaLabel', \{ defaultValue: '\[\[canon:permission_mode\]\]' \}\)\}/)
  assert.match(permissionToggleSource, /aria-disabled=\{buttonsDisabled \? 'true' : undefined\}/)
  assert.match(permissionToggleSource, /aria-haspopup="listbox"/)
  assert.match(permissionToggleSource, /aria-expanded=\{menuOpen\}/)
  assert.match(permissionToggleSource, /role="listbox"/)
  assert.match(permissionToggleSource, /disabled=\{buttonsDisabled\}/)

  assert.match(globalStylesSource, /:focus-visible/)
  assert.match(globalStylesSource, /@media \(prefers-reduced-motion: reduce\)/)
})

test('settings ledger supports responsive navigation and focused-view focus return', () => {
  const settingsContentSource = readSource('src/renderer/components/settings/SettingsPanelContent.jsx')
  const settingsDetailSource = readSource('src/renderer/components/settings/SettingsDetailView.jsx')
  const openRouterSource = readSource('src/renderer/components/settings/OpenRouterCatalogVisibilitySection.jsx')

  assert.match(settingsContentSource, /lg:grid-cols-\[12rem_minmax\(0,1fr\)\]/)
  assert.match(settingsContentSource, /overflow-x-auto/)
  assert.match(settingsContentSource, /hidden=\{Boolean\(activeDetailView\)\}/)
  assert.match(settingsContentSource, /querySelector/)
  assert.match(settingsContentSource, /focus\(\)/)
  assert.match(settingsDetailSource, /data-ui="settings-detail-view"/)
  assert.match(settingsDetailSource, /aria-label=/)
  assert.match(openRouterSource, /Escape/)
})

test('workspace project actions expose a labelled menu and focus its first action', () => {
  const treeSource = readSource('src/renderer/components/workspace/WorkspaceProjectTree.jsx')
  const menuSource = readSource('src/renderer/components/ProjectEntryActionsMenu.jsx')

  assert.match(treeSource, /aria-haspopup="menu"/)
  assert.match(treeSource, /aria-controls=\{menuOpen \? menuId : undefined\}/)
  assert.match(treeSource, /menuId=\{menuId\}/)
  assert.match(menuSource, /id=\{menuId\}/)
  assert.match(menuSource, /role="menu"/)
  assert.match(menuSource, /aria-label=\{t\('core:projectEntry\.projectActions\.ariaLabel'/)
  assert.match(menuSource, /role="menuitem"/)
  assert.match(menuSource, /querySelector\('\[role="menuitem"\]:not\(:disabled\)'\)/)
  assert.match(menuSource, /\.focus\(\)/)
})
