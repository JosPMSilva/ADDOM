import React, { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'
import useWorkspaceStore from '../store/useWorkspaceStore.js'
import { WORKSPACE_RAIL_OPEN_CONTROL_ID } from './workspace/workspace-rail-interactions.mjs'
import Icon from './ui/Icon.jsx'
import ProjectEntryHomeSurface from './ProjectEntryHomeSurface.jsx'
import { useWorkspaceThreadActivitySnapshot } from './workspace/useWorkspaceThreadActivity.js'
import {
  formatWorkspaceRailOpenLabel,
  summarizeWorkspaceRailActivity,
} from './workspace/workspace-rail-activity-summary.mjs'

export default function WorkspaceProjectEntry({
  onOpenFolder,
  onOpenWorkspaceRail,
  onRequestTarget,
  workspaceRailOpen = true,
}) {
  const { t } = useRendererTranslation(['core'])
  const { initialized, loadingProjects, projects } = useWorkspaceStore(useShallow((state) => ({
    initialized: state.initialized,
    loadingProjects: state.loadingProjects,
    projects: state.projects,
  })))
  const railActivity = useWorkspaceThreadActivitySnapshot(true)
  const railActivitySummary = useMemo(
    () => summarizeWorkspaceRailActivity(railActivity),
    [railActivity],
  )
  const workspaceRailOpenLabel = formatWorkspaceRailOpenLabel(t, railActivitySummary)
  const handleStartInProject = useCallback((projectId) => (
    onRequestTarget?.({ projectId, createThread: true })
  ), [onRequestTarget])

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface" data-ui="workspace-project-entry">
      <header className="flex min-h-[52px] shrink-0 items-center border-b border-chat-border/60 px-4">
        {!workspaceRailOpen && (
          <button
            id={WORKSPACE_RAIL_OPEN_CONTROL_ID}
            type="button"
            onClick={onOpenWorkspaceRail}
            title={workspaceRailOpenLabel}
            aria-label={workspaceRailOpenLabel}
            data-ui="workspace-rail-open"
            className="flex h-11 items-center gap-1.5 rounded-md border border-surface-border px-3 text-xs text-text-secondary outline-none hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong md:h-7"
          >
            <Icon aria-hidden="true" name="sidebar-simple" className="text-[14px]" />
            {t('core:workspaceRail.title', { defaultValue: 'Projects' })}
          </button>
        )}
      </header>
      <ProjectEntryHomeSurface
        projects={projects}
        loading={!initialized || loadingProjects}
        onOpenProject={handleStartInProject}
        onOpenFolder={onOpenFolder}
      />
    </div>
  )
}
