import React from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import Icon from '../ui/Icon.jsx'

function activityLabelFor(activity, t) {
  if (activity === 'active') {
    return t('core:threadDrawer.activity.sessionActive', { defaultValue: 'Session active' })
  }
  if (activity === 'needs_input') {
    return t('core:threadDrawer.activity.needsInput', { defaultValue: 'Needs input' })
  }
  if (activity === 'blocked') {
    return t('core:threadDrawer.activity.sessionBlocked', { defaultValue: 'Session blocked' })
  }
  if (activity === 'failed') {
    return t('core:threadDrawer.activity.sessionFailed', { defaultValue: 'Failed' })
  }
  if (activity === 'completed') {
    return t('core:threadDrawer.activity.sessionCompleted', { defaultValue: 'Completed' })
  }
  return ''
}

export default function WorkspaceThreadRow({
  active = false,
  activity = 'idle',
  menuId,
  menuOpen = false,
  onMenuOpen,
  onOpen,
  thread,
}) {
  const { t } = useRendererTranslation(['core'])
  const title = String(thread?.title || t('core:threadDrawer.fallbackTitle', { defaultValue: 'Untitled thread' })).trim()
  const preview = String(thread?.previewText || '').trim()
  const activityLabel = activityLabelFor(activity, t)

  return (
    <div
      className={[
        'group/thread flex min-h-7 min-w-0 items-center rounded-md transition-colors',
        active ? 'bg-surface-panel-alt text-text-primary' : 'text-text-secondary hover:bg-surface-border/35 hover:text-text-primary',
      ].join(' ')}
      data-ui="project-entry-thread-row"
      data-active={active ? 'true' : 'false'}
    >
      <button
        type="button"
        aria-current={active ? 'page' : undefined}
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-border-hover"
        title={preview || title}
      >
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        {activityLabel && (
          <span
            className="shrink-0 text-[9px] font-medium text-text-secondary"
            data-activity={activity}
          >
            {activityLabel}
          </span>
        )}
      </button>
      <button
        type="button"
        aria-controls={menuId}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={`${t('core:threadDrawer.renameTitle', { defaultValue: 'Thread actions' })}: ${title}`}
        onClick={(event) => onMenuOpen?.(event.currentTarget)}
        className={[
          'mr-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted outline-none transition hover:bg-surface-border/45 hover:text-text-primary focus-visible:opacity-100 focus-visible:text-text-primary',
          menuOpen ? 'opacity-100 text-text-primary' : 'opacity-0 group-hover/thread:opacity-100',
        ].join(' ')}
        title={`${t('core:threadDrawer.renameTitle', { defaultValue: 'Thread actions' })}: ${title}`}
      >
        <Icon name="dots-three" className="text-[13px]" />
      </button>
    </div>
  )
}
