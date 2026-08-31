import { useCallback, useState } from 'react'
import { buildArtifactReviewContext, buildMemoryReviewContext } from './context-builders.js'

export function useProviderSwitchContextAction({
  projectFolder = '',
  activeThreadId = '',
  includeGlobalMemoryInContext = false,
  setPendingContextPrefix = () => {},
  dismissProviderSwitchHint = () => {},
  pushToolActivity = () => {},
} = {}) {
  const [contextActionBusy, setContextActionBusy] = useState(false)
  const handleInjectSwitchContext = useCallback(async (kind) => {
    if (!projectFolder || contextActionBusy) return
    const targetThreadId = String(activeThreadId || '').trim()
    setContextActionBusy(true)
    try {
      const sections = []
      if (kind === 'memory' || kind === 'both') {
        const { context } = await buildMemoryReviewContext(projectFolder, {
          limit: 12,
          includeGlobal: !!includeGlobalMemoryInContext,
        })
        sections.push(`[Memory]\n${context}`)
      }
      if (kind === 'artifacts' || kind === 'both') {
        const { context } = await buildArtifactReviewContext(projectFolder, {
          limit: 12,
          includeRevisions: true,
          revisionsPerFile: 3,
        })
        sections.push(`[Artifacts]\n${context}`)
      }
      const block = sections.join('\n\n').trim()
      if (!block) return
      setPendingContextPrefix(block, targetThreadId ? { threadId: targetThreadId } : undefined)
      dismissProviderSwitchHint(targetThreadId ? { threadId: targetThreadId } : undefined)
      pushToolActivity({
        type: 'result', isError: false, decision: 'approved',
        label: `Context prepared for next turn (${kind})`,
        ...(targetThreadId ? { threadId: targetThreadId } : {}),
      })
    } catch (error) {
      pushToolActivity({
        type: 'result', isError: true, decision: 'approved',
        label: `Context bootstrap failed: ${String(error?.message || 'unknown error')}`,
        ...(targetThreadId ? { threadId: targetThreadId } : {}),
      })
    } finally {
      setContextActionBusy(false)
    }
  }, [
    activeThreadId, contextActionBusy, dismissProviderSwitchHint,
    includeGlobalMemoryInContext, projectFolder, pushToolActivity, setPendingContextPrefix,
  ])

  return { contextActionBusy, handleInjectSwitchContext }
}
