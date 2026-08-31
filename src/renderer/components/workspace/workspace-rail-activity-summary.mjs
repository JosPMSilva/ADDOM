import { highestWorkspaceThreadActivity } from './workspace-thread-activity-state.mjs'

export function summarizeWorkspaceRailActivity(activityByThreadId = {}) {
  const activities = Object.values(
    activityByThreadId && typeof activityByThreadId === 'object' ? activityByThreadId : {},
  )
  const activity = highestWorkspaceThreadActivity(activities)
  if (activity === 'idle') return { activity: 'idle', count: 0 }
  return {
    activity,
    count: activities.filter((value) => value === activity).length,
  }
}

export function workspaceRailActivityLabel(activity, t) {
  if (activity === 'needs_input') return t('core:threadDrawer.activity.needsInput', { defaultValue: 'Needs input' })
  if (activity === 'blocked') return t('core:threadDrawer.activity.sessionBlocked', { defaultValue: 'Session blocked' })
  if (activity === 'failed') return t('core:threadDrawer.activity.sessionFailed', { defaultValue: 'Failed' })
  if (activity === 'active') return t('core:threadDrawer.activity.sessionActive', { defaultValue: 'Session active' })
  if (activity === 'completed') return t('core:threadDrawer.activity.sessionCompleted', { defaultValue: 'Completed' })
  return ''
}

export function formatWorkspaceRailOpenLabel(t, summary = {}) {
  const baseLabel = t('core:workspaceRail.show', { defaultValue: 'Show projects and threads' })
  const count = Math.max(0, Number(summary?.count || 0) || 0)
  const status = workspaceRailActivityLabel(summary?.activity, t)
  if (!count || !status) return baseLabel
  const key = count === 1
    ? 'core:workspaceRail.showWithActivityOne'
    : 'core:workspaceRail.showWithActivityOther'
  const defaultValue = count === 1
    ? '{{baseLabel}}. 1 hidden thread; highest priority: {{activity}}.'
    : '{{baseLabel}}. {{count}} hidden threads; highest priority: {{activity}}.'
  return t(key, { baseLabel, count, activity: status, defaultValue })
}
