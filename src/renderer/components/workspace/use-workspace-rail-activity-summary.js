import { useMemo } from 'react'
import { useWorkspaceThreadActivitySnapshot } from './useWorkspaceThreadActivity.js'
import { summarizeWorkspaceRailActivity } from './workspace-rail-activity-summary.mjs'

export function useWorkspaceRailActivitySummary(enabled) {
  const activity = useWorkspaceThreadActivitySnapshot(enabled)
  return useMemo(() => summarizeWorkspaceRailActivity(activity), [activity])
}
