import React from 'react'
import { MonacoPane } from './EditorMonacoPane.jsx'
import {
  EDITOR_OUTLINE_PANEL_WIDTH,
} from './editor-diagnostics-panel-utils.mjs'
import {
  ProblemsPanel,
  OutlinePanel,
} from './EditorDiagnosticsPanels.jsx'
import { FileTree, EmptyEditor, LoadingPane, ErrorPane } from './EditorFileTree.jsx'
import EditorMarkdownPreviewPane from './EditorMarkdownPreviewPane.jsx'
import EditorTabBar from './EditorTabBar.jsx'
import Icon from '../ui/Icon.jsx'

const EDITOR_SERVICE_NOTICE_AUTO_DISMISS_MS = 3_000

function dismissServiceNoticeByKey(setDismissedServiceNoticeByTabKey, noticeKey) {
  if (!noticeKey) return
  setDismissedServiceNoticeByTabKey((prev) => (
    prev[noticeKey]
      ? prev
      : {
        ...prev,
        [noticeKey]: true,
      }
  ))
}

export default function EditorPanelView({
  t,
  projectFolder,
  fileTreeContainerRef,
  fileTreeWidth,
  handleTreePointerDown,
  tree,
  treeLoading,
  openFile,
  loadTree,
  currentTab,
  tabs,
  tabSnapshots,
  activeTab,
  problemsByTab,
  outlinePanelCollapsed,
  formatSupportedForCurrentTab,
  fixSupportedForCurrentTab,
  currentEditorApi,
  markdownPreviewEligible,
  markdownPreviewOpen,
  formatOnSaveEnabled,
  formatActionTitle,
  fixActionTitle,
  setActiveTab,
  moveTab,
  handleCloseTab,
  handleSaveTab,
  handleFormatTab,
  handleFixTab,
  toggleMarkdownPreviewForCurrentTab,
  handleAiSelectionAction,
  updateFormatOnSaveEnabled,
  watcherStatus,
  currentLanguageServiceNoticeVisible,
  currentLanguageServiceNotice,
  currentLanguageServiceNoticeKey,
  setDismissedServiceNoticeByTabKey,
  reloadTab,
  dismissExternalChangeFlag,
  previewSplitHostRef,
  monacoHiddenInPreview,
  previewSplitRatio,
  activeThreadId,
  gitNoRepoNoticeSeenForThread,
  markGitNoRepoNoticeSeenForThread,
  selectedProvider,
  selectedModel,
  inlineCompletionEnabled,
  updateContent,
  setPreviewContentByTabId,
  setProblemsByTab,
  setOutlineByTab,
  normalizeOutlineState,
  setEditorApiByTab,
  setTabServiceState,
  handlePreviewSplitPointerDown,
  currentPreviewContent,
  handleOpenMarkdownPreviewWorkspaceFile,
  setMonacoHiddenInPreview,
  currentOutline,
  setOutlinePanelCollapsed,
  currentSetupHints,
  dismissSetupHint,
  currentProblems,
  problemsPanelCollapsed,
  setProblemsPanelCollapsed,
}) {
  React.useEffect(() => {
    if (!currentLanguageServiceNoticeVisible || !currentLanguageServiceNoticeKey) return undefined

    const timerId = setTimeout(() => {
      dismissServiceNoticeByKey(setDismissedServiceNoticeByTabKey, currentLanguageServiceNoticeKey)
    }, EDITOR_SERVICE_NOTICE_AUTO_DISMISS_MS)

    return () => clearTimeout(timerId)
  }, [
    currentLanguageServiceNoticeKey,
    currentLanguageServiceNoticeVisible,
    setDismissedServiceNoticeByTabKey,
  ])

  const dismissCurrentLanguageServiceNotice = () => {
    dismissServiceNoticeByKey(setDismissedServiceNoticeByTabKey, currentLanguageServiceNoticeKey)
  }

  if (!projectFolder) {
    return (
      <div className="flex items-center justify-center h-full text-text-muted text-sm bg-surface-panel-alt">
        {t('editor.panel.emptyProject', { defaultValue: 'Open a project folder to use the editor.' })}
      </div>
    )
  }

  return (
    <div className="flex h-full bg-surface-panel-alt overflow-hidden">

      {/* File tree */}
      <div
        ref={fileTreeContainerRef}
        style={{ width: fileTreeWidth }}
        className="flex shrink-0 min-h-0 h-full border-r border-surface-border bg-surface-panel-alt"
      >
        <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <FileTree
            tree={tree}
            loading={treeLoading}
            projectFolder={projectFolder}
            onOpenFile={(fp) => openFile(projectFolder, fp, { source: 'editor_tree' })}
            activeFilePath={currentTab?.filePath ?? null}
            onOpenProjectFolder={() => {
              void window.addom?.shell?.openPath?.(projectFolder)
            }}
            onRefresh={() => loadTree(projectFolder)}
            width="100%"
          />
        </div>
        <button
          type="button"
          onPointerDown={handleTreePointerDown}
          className="w-1.5 shrink-0 h-full cursor-col-resize hover:bg-accent/40 transition-colors z-20"
          title={t('editor.panel.resizeFileTree', { defaultValue: 'Resize file tree' })}
          aria-label={t('editor.panel.resizeFileTree', { defaultValue: 'Resize file tree' })}
        />
      </div>

      {/* Editor area */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Tab bar */}
        {tabs.length > 0 && (
          <EditorTabBar
            tabs={tabSnapshots}
            activeTab={activeTab}
            problemsByTab={problemsByTab}
            actionRailWidth={outlinePanelCollapsed ? null : EDITOR_OUTLINE_PANEL_WIDTH}
            canFormatActive={formatSupportedForCurrentTab}
            canFixActive={fixSupportedForCurrentTab}
            canAiSelectionActive={!!currentTab && !!currentEditorApi?.getSelectionContext}
            canPreviewActive={markdownPreviewEligible}
            previewOpen={markdownPreviewOpen}
            formatOnSaveEnabled={formatOnSaveEnabled}
            formatActionTitle={formatActionTitle}
            fixActionTitle={fixActionTitle}
            onActivate={setActiveTab}
            onMoveTab={moveTab}
            onClose={(tabId) => { void handleCloseTab(tabId) }}
            onSave={handleSaveTab}
            onFormatActive={() => { if (currentTab) void handleFormatTab(currentTab.id) }}
            onFixActive={() => { if (currentTab) void handleFixTab(currentTab.id) }}
            onTogglePreview={() => toggleMarkdownPreviewForCurrentTab(null)}
            onAiSelectionAction={handleAiSelectionAction}
            onToggleFormatOnSave={() => updateFormatOnSaveEnabled((value) => !value)}
          />
        )}

        {/* Monaco / empty state */}
        {!currentTab ? (
          <EmptyEditor />
        ) : currentTab.loading ? (
          <LoadingPane />
        ) : currentTab.error ? (
          <ErrorPane message={currentTab.error} />
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {watcherStatus && (
              <div className="shrink-0 px-3 py-2 border-b border-surface-border bg-surface-panel-alt text-text-secondary text-xs flex items-center gap-2">
                <Icon name="warning" weight="fill" className="text-[14px] text-warning-soft" />
                <span className="truncate">
                  {t('editor.panel.fileWatcherCap', {
                    defaultValue: 'File watcher reached directory cap ({{watchedCount}}/{{maxDirectories}}). Some folders are not actively watched for external edits.',
                    watchedCount: watcherStatus.watchedCount,
                    maxDirectories: watcherStatus.maxDirectories,
                  })}
                </span>
              </div>
            )}
            {currentLanguageServiceNoticeVisible && (
              <div className="shrink-0 px-3 py-2 border-b border-surface-border bg-surface-panel-alt text-text-secondary text-xs flex items-center gap-2">
                <Icon name="warning" weight="fill" className="text-[14px] text-warning-soft" />
                <span className="truncate">
                  {currentLanguageServiceNotice?.text}
                </span>
                <button
                  type="button"
                  onClick={dismissCurrentLanguageServiceNotice}
                  className="btn btn-secondary px-2 py-1 ml-auto max-h-[26px]"
                >
                  {t('editor.panel.dismiss', { defaultValue: 'Dismiss' })}
                </button>
              </div>
            )}
            {currentTab.externalChanged && (
              <div className="shrink-0 px-3 py-2 border-b border-danger-border bg-danger-bg text-danger-soft text-xs flex items-center gap-2">
                <Icon name="warning" weight="fill" className="text-[14px]" />
                <span className="truncate">
                  {t('editor.panel.externalChangeDetected', {
                    defaultValue: 'External change detected for {{filePath}}. Your unsaved edits were preserved.',
                    filePath: currentTab.filePath,
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void reloadTab(projectFolder, currentTab.filePath, { force: true })
                    dismissExternalChangeFlag(currentTab.id)
                  }}
                  className="btn px-2 py-1 ml-auto max-h-[26px] bg-danger-bg hover:bg-danger-bg-hover text-danger border-danger-border"
                >
                  {t('editor.panel.reloadFromDisk', { defaultValue: 'Reload From Disk' })}
                </button>
                <button
                  type="button"
                  onClick={() => dismissExternalChangeFlag(currentTab.id)}
                  className="btn btn-secondary px-2 py-1 max-h-[26px]"
                >
                  {t('editor.panel.dismiss', { defaultValue: 'Dismiss' })}
                </button>
              </div>
            )}
            <div className="flex-1 min-h-0 flex items-stretch overflow-hidden">
              <div ref={previewSplitHostRef} className="flex-1 min-w-0 min-h-0 h-full flex items-stretch overflow-hidden">
                <div
                  className="flex h-full min-h-0 min-w-0 overflow-hidden"
                  style={{ width: markdownPreviewOpen
                    ? (monacoHiddenInPreview ? '0%' : `${Math.round(previewSplitRatio * 10000) / 100}%`)
                    : '100%' }}
                >
                  <MonacoPane
                    tab={currentTab}
                    initialValue={currentTab.content}
                    projectFolder={projectFolder}
                    activeThreadId={activeThreadId}
                    gitNoRepoNoticeSeenForThread={gitNoRepoNoticeSeenForThread}
                    markGitNoRepoNoticeSeenForThread={markGitNoRepoNoticeSeenForThread}
                    providerId={selectedProvider}
                    modelId={selectedModel}
                    inlineCompletionEnabled={inlineCompletionEnabled && !currentTab.readOnly}
                    onChange={(v) => {
                      const nextContent = v ?? ''
                      updateContent(currentTab.id, nextContent)
                      if (markdownPreviewOpen) {
                        setPreviewContentByTabId((prev) => (
                          prev[currentTab.id] === nextContent
                            ? prev
                            : {
                              ...prev,
                              [currentTab.id]: nextContent,
                            }
                        ))
                      }
                    }}
                    onSave={() => handleSaveTab(currentTab.id)}
                    onFormat={() => handleFormatTab(currentTab.id)}
                    onToggleMarkdownPreview={() => { if (markdownPreviewEligible) toggleMarkdownPreviewForCurrentTab(null) }}
                    onProblemsChange={(problems) => {
                      setProblemsByTab(prev => ({
                        ...prev,
                        [currentTab.id]: Array.isArray(problems) ? problems : [],
                      }))
                    }}
                    onOutlineChange={(outline) => {
                      setOutlineByTab(prev => ({
                        ...prev,
                        [currentTab.id]: normalizeOutlineState(outline),
                      }))
                    }}
                    onEditorApiChange={(api) => {
                      setEditorApiByTab(prev => ({
                        ...prev,
                        [currentTab.id]: api,
                      }))
                    }}
                    onServiceStateChange={(serviceState) => {
                      setTabServiceState(currentTab.id, serviceState)
                    }}
                  />
                </div>
                {markdownPreviewOpen && (
                  <>
                    {!monacoHiddenInPreview && (
                      <button
                        type="button"
                        onPointerDown={handlePreviewSplitPointerDown}
                        className="w-1.5 shrink-0 h-full cursor-col-resize bg-surface-panel shadow-[inset_1px_0_0_0_var(--color-surface-border)] hover:bg-accent/40 transition-colors"
                        title={t('editor.panel.resizeMarkdownPreview', { defaultValue: 'Resize markdown preview pane' })}
                        aria-label={t('editor.panel.resizeMarkdownPreview', { defaultValue: 'Resize markdown preview pane' })}
                      />
                    )}
                    <div className="flex-1 min-w-0 min-h-0 h-full overflow-hidden">
                      <EditorMarkdownPreviewPane
                        markdownText={currentPreviewContent}
                        currentFilePath={currentTab.filePath}
                        projectFolder={projectFolder}
                        onOpenWorkspaceFile={handleOpenMarkdownPreviewWorkspaceFile}
                        monacoHidden={monacoHiddenInPreview}
                        onToggleMonaco={() => setMonacoHiddenInPreview((v) => !v)}
                      />
                    </div>
                  </>
                )}
              </div>
              <OutlinePanel
                filePath={currentTab.filePath}
                outline={currentOutline}
                collapsed={outlinePanelCollapsed}
                onToggleCollapsed={setOutlinePanelCollapsed}
                onSelectSymbol={(symbol) => currentEditorApi?.revealSymbol?.(symbol)}
                setupHints={currentSetupHints}
                onDismissSetupHint={dismissSetupHint}
              />
            </div>
            <ProblemsPanel
              filePath={currentTab.filePath}
              problems={currentProblems}
              collapsed={problemsPanelCollapsed}
              onToggleCollapsed={setProblemsPanelCollapsed}
              onSelectProblem={(problem) => currentEditorApi?.revealProblem?.(problem)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
