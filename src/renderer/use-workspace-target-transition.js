import { useCallback, useRef, useState } from 'react'
import useAppStore, { requestAppAlert } from './store/useAppStore.js'
import useEditorStore from './store/useEditorStore.js'
import useTerminalStore from './store/useTerminalStore.js'
import useWorkspaceStore from './store/useWorkspaceStore.js'
import { createWorkspaceTargetTransitionController } from './workspace-target-transition.mjs'

export default function useWorkspaceTargetTransition({ onTargetActivated } = {}) {
  const [state, setState] = useState({
    busy: false,
    dirtyTabs: [],
    error: '',
    pendingTarget: null,
  })
  const dependenciesRef = useRef(null)
  dependenciesRef.current = {
    getActiveProjectId: () => useWorkspaceStore.getState().activeProjectId,
    getDirtyTabs: () => useEditorStore.getState().getDirtyTabs(),
    activateWorkspaceTarget: async (target) => {
      const workspace = useWorkspaceStore.getState()
      let result
      if (target.projectPath) {
        const opened = await workspace.openProjectPath(target.projectPath)
        if (!opened?.project) return null
        result = opened.activeThread ? { project: opened.project, thread: opened.activeThread } : null
      } else {
        result = await workspace.activateWorkspaceTarget(target)
      }
      if (result) useAppStore.getState().setActivePanel('chat')
      return result
    },
    saveAllDirtyTabs: () => {
      const projectFolder = useAppStore.getState().projectFolder
      return useEditorStore.getState().saveAllDirtyTabs(projectFolder)
    },
    discardAllDirtyTabs: () => useEditorStore.getState().discardAllDirtyTabs(),
    clearProjectPresentation: () => {
      useEditorStore.getState().clearAllTabs()
      useTerminalStore.getState().resetState?.()
    },
    onTargetActivated,
    reportSaveFailure: async (failed) => {
      const names = failed.map((row) => row.filePath).filter(Boolean).join('\n')
      await requestAppAlert({
        title: 'Failed to save files',
        message: `Failed to save ${failed.length} file(s):${names ? `\n${names}` : ''}`,
      })
    },
    reportActivationFailure: async () => {
      await requestAppAlert({
        title: 'Could not switch workspace',
        message: 'The current workspace is unchanged. Try again or cancel.',
      })
    },
  }

  const controllerRef = useRef(null)
  if (!controllerRef.current) {
    controllerRef.current = createWorkspaceTargetTransitionController({
      getActiveProjectId: () => dependenciesRef.current.getActiveProjectId(),
      getDirtyTabs: () => dependenciesRef.current.getDirtyTabs(),
      activateWorkspaceTarget: (target) => dependenciesRef.current.activateWorkspaceTarget(target),
      saveAllDirtyTabs: () => dependenciesRef.current.saveAllDirtyTabs(),
      discardAllDirtyTabs: () => dependenciesRef.current.discardAllDirtyTabs(),
      clearProjectPresentation: () => dependenciesRef.current.clearProjectPresentation(),
      onTargetActivated: (result) => dependenciesRef.current.onTargetActivated?.(result),
      reportSaveFailure: (failed) => dependenciesRef.current.reportSaveFailure(failed),
      reportActivationFailure: () => dependenciesRef.current.reportActivationFailure(),
      onStateChange: setState,
    })
  }

  const requestWorkspaceTarget = useCallback((target) => (
    controllerRef.current.requestTarget(target)
  ), [])
  const saveAndContinue = useCallback(() => controllerRef.current.saveAndContinue(), [])
  const discardAndContinue = useCallback(() => controllerRef.current.discardAndContinue(), [])
  const cancel = useCallback(() => controllerRef.current.cancel(), [])

  return { ...state, cancel, discardAndContinue, requestWorkspaceTarget, saveAndContinue }
}
