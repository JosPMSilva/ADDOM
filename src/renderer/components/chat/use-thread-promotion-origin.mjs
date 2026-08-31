import { useCallback, useEffect, useMemo, useState } from 'react'
import useAgentRunStore from '../../store/useAgentRunStore.js'

export function useThreadPromotionOrigin({
  threads,
  activeThreadId,
  setActiveThread,
  t,
}) {
  const [inspectionBusy, setInspectionBusy] = useState(false)
  const [inspectionError, setInspectionError] = useState('')
  const activeThread = useMemo(
    () => (Array.isArray(threads) ? threads.find((thread) => thread?.id === activeThreadId) || null : null),
    [threads, activeThreadId],
  )
  const origin = activeThread?.origin?.kind === 'agent_promotion' ? activeThread.origin : null

  useEffect(() => {
    setInspectionBusy(false)
    setInspectionError('')
  }, [activeThreadId])

  const inspectOrigin = useCallback(async () => {
    const route = origin?.sourceRoute
    if (!origin?.sourceAvailable || !route || inspectionBusy) return
    setInspectionBusy(true)
    setInspectionError('')
    try {
      const thread = await setActiveThread(route.threadId)
      if (!thread?.id) throw new Error('Source thread is unavailable')
      const snapshot = await window.addom.agentRuns.get({
        projectId: route.projectId,
        threadId: route.threadId,
        runId: route.runId,
      })
      const agents = useAgentRunStore.getState()
      agents.hydrateRun(snapshot)
      agents.selectNavigatorNode({
        threadId: route.threadId,
        runId: route.runId,
        nodeId: route.nodeId,
      })
    } catch {
      setInspectionError(t('core:agentConversation.origin.failure', {
        defaultValue: 'Could not open the source agent.',
      }))
    } finally {
      setInspectionBusy(false)
    }
  }, [inspectionBusy, origin, setActiveThread, t])

  return {
    activeThread,
    activeThreadOrigin: origin,
    originInspectionBusy: inspectionBusy,
    originInspectionError: inspectionError,
    handleInspectThreadOrigin: inspectOrigin,
  }
}
