import React, { useCallback } from 'react'
import WorkspaceProjectTree from './WorkspaceProjectTree.jsx'
import WorkspaceRailShell from './WorkspaceRailShell.jsx'
import {
  useWorkspaceRailControl,
  useWorkspaceRailNarrow,
} from './use-workspace-rail-hooks.mjs'
import { shouldCloseWorkspaceRailAfterTarget } from './workspace-rail-interactions.mjs'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import Icon from '../ui/Icon.jsx'

export default function WorkspaceRail({
  activeProjectId = '',
  activeThreadId = '',
  enabled = false,
  narrow: narrowOverride,
  onRequestTarget,
  onCreateProject,
  open,
  width,
  onOpenChange,
  onWidthChange,
}) {
  const { t } = useRendererTranslation(['core'])
  const narrow = useWorkspaceRailNarrow(narrowOverride)
  const control = useWorkspaceRailControl({ open, width, onOpenChange, onWidthChange })
  const requestOpen = control.requestOpen

  const handleSelectThread = useCallback(async (projectId, threadId) => {
    const selected = await onRequestTarget?.({ kind: 'select-thread', projectId, threadId })
    if (shouldCloseWorkspaceRailAfterTarget({ narrow, kind: 'select-thread', result: selected })) requestOpen(false)
    return selected
  }, [narrow, onRequestTarget, requestOpen])

  const handleCreateThread = useCallback(async (projectId) => {
    const created = await onRequestTarget?.({ kind: 'create-thread', projectId })
    if (shouldCloseWorkspaceRailAfterTarget({ narrow, kind: 'create-thread', result: created })) requestOpen(false)
    return created
  }, [narrow, onRequestTarget, requestOpen])

  return (
    <WorkspaceRailShell
      control={control}
      enabled={enabled}
      narrow={narrow}
      headerActions={(
        <button
          type="button"
          aria-label={t('core:projectEntry.newProject', { defaultValue: 'New project' })}
          title={t('core:projectEntry.newProject', { defaultValue: 'New project' })}
          onClick={onCreateProject}
          className="flex h-11 w-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-border/40 hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong md:h-7 md:w-7"
          data-ui="workspace-rail-new-project"
        >
          <Icon aria-hidden="true" name="plus" className="text-[14px]" />
        </button>
      )}
    >
      <WorkspaceProjectTree
        activeProjectId={activeProjectId}
        activeThreadId={activeThreadId}
        enabled={enabled}
        onCreateThread={handleCreateThread}
        onSelectThread={handleSelectThread}
      />
    </WorkspaceRailShell>
  )
}
