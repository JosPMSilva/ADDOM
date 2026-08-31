import { useEffect, useRef } from 'react'
import { CHAT_PERF_SAMPLE_LIMIT } from './chat-utils.js'

export function useChatPanelPerfDebug({ composerDraftText = '' } = {}) {
  const keydownStartRef = useRef(0)
  const renderCountRef = useRef(0)
  const perfSamplesRef = useRef([])
  const devPerfEnabled = import.meta.env.DEV && import.meta.env.VITE_CHAT_PERF_DEBUG === '1'

  useEffect(() => {
    if (!devPerfEnabled || !keydownStartRef.current) return
    const startedAt = keydownStartRef.current
    const raf = requestAnimationFrame(() => {
      keydownStartRef.current = 0
      const elapsed = performance.now() - startedAt
      const next = [...perfSamplesRef.current, elapsed]
      perfSamplesRef.current = next.length > CHAT_PERF_SAMPLE_LIMIT
        ? next.slice(next.length - CHAT_PERF_SAMPLE_LIMIT)
        : next

      if (perfSamplesRef.current.length > 0 && perfSamplesRef.current.length % 40 === 0) {
        const sorted = [...perfSamplesRef.current].sort((a, b) => a - b)
        const median = sorted[Math.floor(sorted.length * 0.5)] || 0
        const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0
        console.debug(
          `[ADDOM perf] key->paint median=${median.toFixed(1)}ms p95=${p95.toFixed(1)}ms renders=${renderCountRef.current}`,
        )
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [composerDraftText, devPerfEnabled])

  renderCountRef.current += 1

  return {
    devPerfEnabled,
    keydownStartRef,
  }
}
