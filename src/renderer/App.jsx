import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import TitleBar from './components/TitleBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import WorkspaceProjectEntry from './components/WorkspaceProjectEntry.jsx'
import WorkspaceTargetDialog from './components/WorkspaceTargetDialog.jsx'
import WorkspaceRail from './components/workspace/WorkspaceRail.jsx'
import ToolApprovalOverlay from './components/ToolApprovalOverlay.jsx'
import ChatEventBridge from './components/ChatEventBridge.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import ChatCompanionShell from './components/chat/ChatCompanionShell.jsx'
import PanelErrorBoundary from './components/PanelErrorBoundary.jsx'
import AgentFanoutConfirmOverlay from './components/agents/AgentFanoutConfirmOverlay.jsx'
import CommandPalette from './components/CommandPalette.jsx'
import AppDecisionDialog from './components/ui/AppDecisionDialog.jsx'
import useAppStore, { requestAppAlert } from './store/useAppStore.js'
import useVaultStore from './store/useVaultStore.js'
import useWorkspaceStore from './store/useWorkspaceStore.js'
import useMemoryStore from './store/useMemoryStore.js'
import useSettingsStore from './store/useSettingsStore.js'
import useTerminalStore from './store/useTerminalStore.js'
import useWorkspaceBootStore from './store/useWorkspaceBootStore.js'
import { useRendererTranslation } from './i18n/use-renderer-translation.mjs'
import { useShallow } from 'zustand/react/shallow'
import { initializeRendererStateSync } from './startup/initialize-renderer-state-sync.mjs'
import { signalStartupReady } from './startup/startup-splash.mjs'
import useWorkspaceTargetTransition from './use-workspace-target-transition.js'
import {
  CHAT_COMPANION_AGENTS,
  CHAT_COMPANION_DOCUMENT,
  CHAT_COMPANION_GIT,
  CHAT_COMPANION_MODE_FOCUSED,
  shouldCloseAgentCompanionOnThreadChange,
} from './components/chat/chat-companion-state.mjs'
import useAgentRunStore from './store/useAgentRunStore.js'
import { selectAgentCompanionStatus } from './store/agents/agent-run-selectors.mjs'

function scheduleIdleWarmup(callback, timeout = 600) {
  if (typeof window === 'undefined') return () => {}
  if (typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(() => {
      callback?.()
    }, { timeout })
    return () => window.cancelIdleCallback?.(idleId)
  }
  const timer = window.setTimeout(() => {
    callback?.()
  }, timeout)
  return () => window.clearTimeout(timer)
}

function isPrimaryShortcut(event) {
  return event?.metaKey === true || event?.ctrlKey === true
}

const loadEditorPanel = () => import('./components/EditorPanel.jsx')
const loadSourceControlPanel = () => import('./components/SourceControlPanel.jsx')
const loadArtifactsPanel = () => import('./components/ArtifactsPanel.jsx')
const loadMemoryPanel = () => import('./components/MemoryPanel.jsx')
const loadSettingsPanel = () => import('./components/SettingsPanel.jsx')
const loadAgentNavigatorPanel = () => import('./components/agents/AgentNavigatorPanel.jsx')
const loadDocumentCompanionView = () => import('./components/chat/DocumentCompanionView.jsx')

function getPanelLabels(t) {
  return Object.freeze({
    chat: t('core:app.panelLabels.chat', { defaultValue: 'Chat panel' }),
    editor: t('core:app.panelLabels.editor', { defaultValue: 'Editor panel' }),
    git: t('core:app.panelLabels.sourceControl', { defaultValue: 'Git details' }),
    artifacts: t('core:app.panelLabels.artifacts', { defaultValue: 'Artifacts panel' }),
    memory: t('core:app.panelLabels.memory', { defaultValue: 'Memory panel' }),
    settings: t('core:app.panelLabels.settings', { defaultValue: 'Settings panel' }),
    projectEntry: t('core:app.panelLabels.projectEntry', { defaultValue: 'Project entry' }),
    agents: t('core:app.panelLabels.agents', { defaultValue: 'Agents panel' }),
  })
}

const EditorPanelLazy = lazy(loadEditorPanel)
const SourceControlPanelLazy = lazy(loadSourceControlPanel)
const ArtifactsPanelLazy = lazy(loadArtifactsPanel)
const MemoryPanelLazy = lazy(loadMemoryPanel)
const SettingsPanelLazy = lazy(loadSettingsPanel)
const AgentNavigatorPanelLazy = lazy(loadAgentNavigatorPanel)
const DocumentCompanionViewLazy = lazy(loadDocumentCompanionView)

export default function App() {
  const { t } = useRendererTranslation(['core'])
  const panelLabels = React.useMemo(() => getPanelLabels(t), [t])
  const {
    projectFolder,
    activeProjectId,
    activePanel,
    activeChatCompanion,
    chatCompanionViews,
    chatCompanionMode,
    chatCompanionWidth,
    activeThreadId,
    permissionMode,
    workspaceViewMode,
    confirmDialog,
    resolveConfirmDialog,
    clearConfirmDialog,
    emitCommandPaletteEvent,
    setActivePanel,
    setActiveChatCompanion,
    activateChatCompanionView,
    moveChatCompanionView,
    closeChatCompanionView,
    openSettingsTarget,
    toggleChatCompanionMode,
    setChatCompanionWidth,
  } = useAppStore(useShallow((s) => ({
    projectFolder: s.projectFolder,
    activeProjectId: s.activeProjectId,
    activePanel: s.activePanel,
    activeChatCompanion: s.activeChatCompanion,
    chatCompanionViews: s.chatCompanionViews,
    chatCompanionMode: s.chatCompanionMode,
    chatCompanionWidth: s.chatCompanionWidth,
    activeThreadId: s.activeThreadId,
    permissionMode: s.permissionMode,
    workspaceViewMode: s.workspaceViewMode,
    confirmDialog: s.confirmDialog,
    resolveConfirmDialog: s.resolveConfirmDialog,
    clearConfirmDialog: s.clearConfirmDialog,
    emitCommandPaletteEvent: s.emitCommandPaletteEvent,
    setActivePanel: s.setActivePanel,
    setActiveChatCompanion: s.setActiveChatCompanion,
    activateChatCompanionView: s.activateChatCompanionView,
    moveChatCompanionView: s.moveChatCompanionView,
    closeChatCompanionView: s.closeChatCompanionView,
    openSettingsTarget: s.openSettingsTarget,
    toggleChatCompanionMode: s.toggleChatCompanionMode,
    setChatCompanionWidth: s.setChatCompanionWidth,
  })))

  const loadProviders = useVaultStore((s) => s.loadProviders)
  const initializeOpenAIAccountBridge = useVaultStore((s) => s.initializeOpenAIAccountBridge)
  const prepareOpenAIAccountRuntime = useVaultStore((s) => s.prepareOpenAIAccountRuntime)
  const checkOpenAIAccountRuntimeUpdate = useVaultStore((s) => s.checkOpenAIAccountRuntimeUpdate)
  const bootstrapWorkspace = useWorkspaceStore((s) => s.bootstrap)
  const workspaceRailOpen = useWorkspaceStore((s) => s.workspaceRailOpen)
  const setWorkspaceRailOpen = useWorkspaceStore((s) => s.setWorkspaceRailOpen)
  const startWorkspaceBoot = useWorkspaceBootStore((s) => s.startWorkspaceBoot)
  const resetWorkspaceBoot = useWorkspaceBootStore((s) => s.resetBoot)
  const workspaceBootStatus = useWorkspaceBootStore((s) => s.status)
  const workspaceBootError = useWorkspaceBootStore((s) => s.error)
  const agentCompanionActiveCount = useAgentRunStore((s) => selectAgentCompanionStatus(s, {
    projectId: activeProjectId,
    threadId: activeThreadId,
  }).activeCount)

  const selectedOpenAIAuthMethod = useSettingsStore((s) => (
    String(s.coreSettings?.providerAuthSettings?.openai?.authMethod || '').trim().toLowerCase() || 'api_key'
  ))

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const chatPanelRef = useRef(null)
  const activeWorkspacePanelRef = useRef(null)
  const previousWorkspacePanelRef = useRef('chat')
  const agentCompanionOwnerThreadRef = useRef('')
  const handleWorkspaceTargetActivated = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches) {
      setWorkspaceRailOpen(false)
    }
  }, [setWorkspaceRailOpen])
  const workspaceTargetTransition = useWorkspaceTargetTransition({
    onTargetActivated: handleWorkspaceTargetActivated,
  })
  const { requestWorkspaceTarget } = workspaceTargetTransition

  useEffect(() => {
    const cleanupRendererSync = initializeRendererStateSync()
    const settingsState = useSettingsStore.getState()
    const cleanupSettingsBridge = settingsState.initializeBridge()
    let cleanupStartupProbe = null
    void settingsState.ensureCoreSettingsHydrated()
      .then((settings) => {
        if (!settings) return null
        cleanupStartupProbe?.()
        cleanupStartupProbe = scheduleIdleWarmup(() => {
          void settingsState.refreshStartupCommandSafetyProbe()
        }, 220)
        return null
      })
    void bootstrapWorkspace()
    const cleanupNonCriticalHydration = [
      scheduleIdleWarmup(() => { void loadProviders() }, 120),
      scheduleIdleWarmup(() => { void settingsState.hydrateAppSettingsCaches() }, 320),
      scheduleIdleWarmup(() => { void useMemoryStore.getState().refreshEmbedderStatus() }, 420),
    ]
    return () => {
      cleanupRendererSync?.()
      cleanupSettingsBridge?.()
      cleanupStartupProbe?.()
      cleanupNonCriticalHydration.forEach((cleanup) => cleanup?.())
    }
  }, [loadProviders, bootstrapWorkspace])

  useEffect(() => {
    signalStartupReady()
  }, [])

  useEffect(() => {
    const cleanupOpenAIAccountBridge = initializeOpenAIAccountBridge()
    return () => {
      cleanupOpenAIAccountBridge?.()
    }
  }, [initializeOpenAIAccountBridge])

  useEffect(() => {
    if (selectedOpenAIAuthMethod !== 'account') return
    return scheduleIdleWarmup(() => {
      void prepareOpenAIAccountRuntime({ background: true })
        .then(() => checkOpenAIAccountRuntimeUpdate({ background: true }))
        .catch(() => {})
    }, 520)
  }, [selectedOpenAIAuthMethod, prepareOpenAIAccountRuntime, checkOpenAIAccountRuntimeUpdate])

  useEffect(() => {
    if (!projectFolder || workspaceViewMode !== 'workspace') {
      resetWorkspaceBoot()
      return
    }
    void startWorkspaceBoot({
      projectFolder,
      activeProjectId,
    })
  }, [projectFolder, workspaceViewMode, activeProjectId, startWorkspaceBoot, resetWorkspaceBoot])

  useEffect(() => {
    const cleanups = [
      scheduleIdleWarmup(() => { void loadEditorPanel() }, 120),
      scheduleIdleWarmup(() => { void loadSourceControlPanel() }, 180),
      scheduleIdleWarmup(() => { void loadArtifactsPanel() }, 220),
      scheduleIdleWarmup(() => { void loadMemoryPanel() }, 340),
      scheduleIdleWarmup(() => { void loadSettingsPanel() }, 460),
      scheduleIdleWarmup(() => { void loadAgentNavigatorPanel() }, 520),
      scheduleIdleWarmup(() => { void loadDocumentCompanionView() }, 560),
    ]
    return () => {
      cleanups.forEach((cleanup) => cleanup?.())
    }
  }, [])

  const renderOtherPanel = () => {
    switch (activePanel) {
      case 'editor':
        return (
          <Suspense fallback={<WorkspacePanelSkeleton panelLabel={panelLabels.editor} />}>
            <EditorPanelLazy />
          </Suspense>
        )
      case 'artifacts':
        return (
          <Suspense fallback={<WorkspacePanelSkeleton panelLabel={panelLabels.artifacts} />}>
            <ArtifactsPanelLazy />
          </Suspense>
        )
      case 'memory':
        return (
          <Suspense fallback={<WorkspacePanelSkeleton panelLabel={panelLabels.memory} />}>
            <MemoryPanelLazy />
          </Suspense>
        )
      case 'settings':
        return (
          <Suspense fallback={<WorkspacePanelSkeleton panelLabel={panelLabels.settings} />}>
            <SettingsPanelLazy />
          </Suspense>
        )
      default:
        return null
    }
  }

  const workspaceActive = !!projectFolder && workspaceViewMode === 'workspace'

  const openWorkspaceRail = useCallback(() => {
    setActivePanel('chat')
    setWorkspaceRailOpen(true)
  }, [setActivePanel, setWorkspaceRailOpen])

  const handleCreateProject = useCallback(async () => {
    const openFolder = window?.addom?.dialog?.openFolder
    if (typeof openFolder !== 'function') {
      await requestAppAlert({
        title: 'Desktop workspace required',
        message: 'Opening a project requires the Electron workspace bridge.',
        tone: 'warning',
      })
      return null
    }
    const folder = await openFolder()
    return folder
      ? requestWorkspaceTarget({ projectPath: folder, createThread: true })
      : null
  }, [requestWorkspaceTarget])

  useEffect(() => {
    const handleGlobalShortcut = (event) => {
      const key = String(event.key || '').toLowerCase()
      if (isPrimaryShortcut(event) && event.shiftKey && key === 'p') {
        event.preventDefault()
        setCommandPaletteOpen(true)
        return
      }
      if (!isPrimaryShortcut(event) || event.shiftKey || !event.altKey) return
      if (key === 'c') {
        event.preventDefault()
        setActivePanel('chat')
        emitCommandPaletteEvent('chat.focusComposer')
        return
      }
      if (key === 't') {
        event.preventDefault()
        setActivePanel('chat')
        void useTerminalStore.getState().openThreadTerminal({
          threadId: activeThreadId,
          projectFolder,
          cwd: projectFolder || '.',
          permissionMode,
        })
      }
    }
    window.addEventListener('keydown', handleGlobalShortcut, true)
    return () => window.removeEventListener('keydown', handleGlobalShortcut, true)
  }, [activeThreadId, emitCommandPaletteEvent, permissionMode, projectFolder, setActivePanel])

  const chatPanelActive = activePanel === 'chat' || !activePanel
  const chatCompanionVisible = workspaceActive && chatPanelActive && Boolean(activeChatCompanion)
  const chatCompanionFocused = chatCompanionVisible && chatCompanionMode === CHAT_COMPANION_MODE_FOCUSED

  const renderCompanionView = (view) => {
    if (view.type === CHAT_COMPANION_GIT) {
      return (
        <PanelErrorBoundary panelKey="workspace:git-companion" panelLabel={panelLabels.git}>
          <Suspense fallback={<WorkspacePanelSkeleton panelLabel={panelLabels.git} compact />}>
            <SourceControlPanelLazy embeddedInCompanion />
          </Suspense>
        </PanelErrorBoundary>
      )
    }
    if (view.type === CHAT_COMPANION_AGENTS) {
      return (
        <PanelErrorBoundary panelKey="workspace:agents-companion" panelLabel={panelLabels.agents}>
          <Suspense fallback={<WorkspacePanelSkeleton panelLabel={panelLabels.agents} compact />}>
            <AgentNavigatorPanelLazy embeddedInCompanion />
          </Suspense>
        </PanelErrorBoundary>
      )
    }
    if (view.type === CHAT_COMPANION_DOCUMENT) {
      return (
        <PanelErrorBoundary panelKey={`workspace:${view.key}`} panelLabel={view.label}>
          <Suspense fallback={<WorkspacePanelSkeleton panelLabel={view.label} compact />}>
            <DocumentCompanionViewLazy view={view} />
          </Suspense>
        </PanelErrorBoundary>
      )
    }
    return null
  }

  useEffect(() => {
    if (!workspaceActive) {
      agentCompanionOwnerThreadRef.current = ''
      if (activeChatCompanion) setActiveChatCompanion('')
      return
    }

    if (activeChatCompanion !== CHAT_COMPANION_AGENTS) {
      agentCompanionOwnerThreadRef.current = ''
      return
    }

    const ownerThreadId = agentCompanionOwnerThreadRef.current
    if (!ownerThreadId) {
      agentCompanionOwnerThreadRef.current = activeThreadId
      return
    }

    if (shouldCloseAgentCompanionOnThreadChange({
      ownerThreadId,
      activeThreadId,
      hasActiveAgents: agentCompanionActiveCount > 0,
    })) {
      agentCompanionOwnerThreadRef.current = ''
      setActiveChatCompanion('')
      return
    }

    if (ownerThreadId !== activeThreadId) {
      agentCompanionOwnerThreadRef.current = activeThreadId
    }
  }, [
    activeChatCompanion,
    activeThreadId,
    agentCompanionActiveCount,
    setActiveChatCompanion,
    workspaceActive,
  ])

  useEffect(() => {
    if (workspaceActive) return
    if (activePanel === 'chat' || activePanel === 'settings') return
    setActivePanel('chat')
  }, [activePanel, setActivePanel, workspaceActive])

  useLayoutEffect(() => {
    const nextWorkspacePanel = chatPanelActive ? 'chat' : String(activePanel || 'chat')
    const previousWorkspacePanel = previousWorkspacePanelRef.current
    previousWorkspacePanelRef.current = nextWorkspacePanel

    if (!workspaceActive || previousWorkspacePanel === nextWorkspacePanel) return
    if (previousWorkspacePanel !== 'chat' || nextWorkspacePanel === 'chat') return

    const chatPanelElement = chatPanelRef.current
    const nextPanelElement = activeWorkspacePanelRef.current
    const activeElement = typeof document !== 'undefined' ? document.activeElement : null
    if (!(chatPanelElement instanceof HTMLElement) || !(nextPanelElement instanceof HTMLElement)) return
    if (!(activeElement instanceof HTMLElement) || !chatPanelElement.contains(activeElement)) return

    nextPanelElement.focus({ preventScroll: true })
  }, [activePanel, chatPanelActive, workspaceActive])

  return (
    <div className="flex flex-col h-full bg-surface text-text-primary">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <WorkspaceRail
            activeProjectId={activeProjectId || ''}
            activeThreadId={activeThreadId || ''}
            enabled={chatPanelActive}
            onCreateProject={handleCreateProject}
            onRequestTarget={requestWorkspaceTarget}
          />
          <main className={[
            'overflow-hidden relative',
            chatCompanionFocused ? 'hidden' : 'flex-1',
          ].join(' ')}
            data-chat-workspace-main="true"
            data-companion-visible={chatCompanionVisible ? 'true' : 'false'}
            aria-hidden={chatCompanionFocused ? true : undefined}
            inert={chatCompanionFocused ? true : undefined}
          >
            {!workspaceActive ? (
              <PanelErrorBoundary
                panelKey={activePanel === 'settings' ? 'workspace:settings' : 'workspace:chat'}
                panelLabel={activePanel === 'settings' ? panelLabels.settings : panelLabels.projectEntry}
              >
                <div
                  ref={activeWorkspacePanelRef}
                  className="w-full h-full relative z-20 flex flex-col bg-surface"
                  role="region"
                  aria-label={activePanel === 'settings' ? panelLabels.settings : panelLabels.projectEntry}
                  tabIndex={-1}
                >
                  {activePanel === 'settings'
                    ? (
                      <Suspense fallback={<WorkspacePanelSkeleton panelLabel={panelLabels.settings} />}>
                        <SettingsPanelLazy />
                      </Suspense>
                      )
                    : <WorkspaceProjectEntry
                        onOpenFolder={handleCreateProject}
                        onOpenWorkspaceRail={openWorkspaceRail}
                        onRequestTarget={requestWorkspaceTarget}
                        workspaceRailOpen={workspaceRailOpen}
                      />}
                </div>
              </PanelErrorBoundary>
            ) : (
              <>
                <div
                  ref={chatPanelRef}
                  className={chatPanelActive ? 'w-full h-full relative z-10 flex flex-col' : 'hidden'}
                  inert={chatPanelActive ? undefined : true}
                  role="region"
                  aria-label={panelLabels.chat}
                  tabIndex={chatPanelActive ? -1 : undefined}
                >
                  <PanelErrorBoundary panelKey="workspace:chat" panelLabel={panelLabels.chat}>
                    <ChatPanel
                      onOpenWorkspaceRail={openWorkspaceRail}
                      workspaceRailEnabled
                      workspaceRailOpen={workspaceRailOpen}
                    />
                  </PanelErrorBoundary>
                </div>
                <PanelErrorBoundary
                  panelKey={`workspace:${String(activePanel || 'chat')}`}
                  panelLabel={panelLabels[String(activePanel || 'chat')] || panelLabels.chat}
                >
                  {activePanel !== 'chat' && (
                    <div
                      ref={activeWorkspacePanelRef}
                      className="w-full h-full relative z-20 flex flex-col bg-surface"
                      role="region"
                      aria-label={panelLabels[String(activePanel || 'chat')] || panelLabels.chat}
                      tabIndex={-1}
                    >
                      {workspaceBootStatus === 'error'
                        ? (
                          <WorkspaceBootErrorState
                            message={workspaceBootError}
                            onRetry={() => startWorkspaceBoot({ projectFolder, activeProjectId })}
                          />
                          )
                        : renderOtherPanel()}
                    </div>
                  )}
                </PanelErrorBoundary>
              </>
            )}
          </main>
          <ChatCompanionShell
            activeCompanion={activeChatCompanion}
            views={chatCompanionViews}
            visible={chatCompanionVisible}
            mode={chatCompanionMode}
            width={chatCompanionWidth}
            workspaceRailOpen={workspaceRailOpen}
            onActivate={activateChatCompanionView}
            onMoveView={moveChatCompanionView}
            onClose={closeChatCompanionView}
            onToggleMode={toggleChatCompanionMode}
            onResize={setChatCompanionWidth}
            headerAction={activeChatCompanion === CHAT_COMPANION_AGENTS
              ? {
                  key: 'agent-settings',
                  icon: 'gear',
                  label: t('core:agentNavigator.settings', { defaultValue: 'Agent settings' }),
                  onSelect: () => openSettingsTarget({ categoryId: 'agents', sectionId: 'moa-agents' }),
                }
              : null}
          >
            {chatCompanionViews.map((view) => {
              const active = view.key === activeChatCompanion
              return (
                <div
                  key={view.key}
                  data-companion-view-key={view.key}
                  className={active ? 'h-full min-h-0' : 'hidden'}
                  aria-hidden={active ? undefined : true}
                  inert={active ? undefined : true}
                >
                  {renderCompanionView(view)}
                </div>
              )
            })}
          </ChatCompanionShell>
        </div>

      <WorkspaceTargetDialog
        busy={workspaceTargetTransition.busy}
        dirtyTabs={workspaceTargetTransition.dirtyTabs}
        error={workspaceTargetTransition.error}
        onCancel={workspaceTargetTransition.cancel}
        onDiscard={workspaceTargetTransition.discardAndContinue}
        onSave={workspaceTargetTransition.saveAndContinue}
        open={Boolean(workspaceTargetTransition.pendingTarget)}
      />

      <ChatEventBridge />
      <ToolApprovalOverlay />
      <AgentFanoutConfirmOverlay />
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenWorkspaceRail={openWorkspaceRail}
      />
      <AppDecisionDialog
        dialog={confirmDialog}
        onConfirm={() => resolveConfirmDialog(true)}
        onCancel={() => clearConfirmDialog()}
      />
    </div>
  )
}

function WorkspacePanelSkeleton({ panelLabel, compact = false }) {
  const { t } = useRendererTranslation(['core'])
  const resolvedPanelLabel = String(panelLabel || 'panel')
  return (
    <div
      className={`w-full h-full flex items-center justify-center ${compact ? 'px-2' : 'px-6'} py-4 text-text-tertiary text-xs`}
      aria-label={t('core:app.workspacePanelSkeleton.ariaLabel', {
        defaultValue: 'Loading {{panelLabel}}',
        panelLabel: resolvedPanelLabel,
      })}
      data-ui="workspace-panel-skeleton"
    >
      {t('core:app.workspacePanelSkeleton.text', {
        defaultValue: 'Loading {{panelLabel}}...',
        panelLabel: resolvedPanelLabel,
      })}
    </div>
  )
}

function WorkspaceBootErrorState({ message, onRetry }) {
  const { t } = useRendererTranslation(['core'])
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="space-y-2 max-w-md">
        <p className="text-sm font-semibold text-danger-soft">
          {t('core:app.workspaceBootError.title', {
            defaultValue: 'Workspace boot failed',
          })}
        </p>
        <p className="text-xs text-text-secondary">
          {String(message || t('core:app.workspaceBootError.message', {
            defaultValue: 'ADDOM could not prepare the workspace caches required for this panel.',
          }))}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="px-3 py-1.5 text-xs rounded-lg border border-danger/30 bg-danger-bg/10 text-danger-soft hover:bg-danger-bg/20"
      >
        {t('core:app.workspaceBootError.retry', {
          defaultValue: 'Retry boot',
        })}
      </button>
    </div>
  )
}
