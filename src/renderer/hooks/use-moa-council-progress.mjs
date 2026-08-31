import { useState, useEffect, useCallback, useRef } from 'react'

export default function useMoaCouncilProgress() {
  const [state, setState] = useState({
    active: false,
    executionId: '',
    councilId: '',
    memberCount: 0,
    successCount: 0,
    status: 'idle', // idle | running | completed | failed | aborted
  })

  const timeoutRef = useRef(null)

  const clearAutoReset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const scheduleAutoReset = useCallback(() => {
    clearAutoReset()
    timeoutRef.current = setTimeout(() => {
      setState((prev) => prev.active ? { ...prev, active: false, status: 'idle' } : prev)
    }, 8000)
  }, [clearAutoReset])

  useEffect(() => {
    const moa = window.addom?.moa
    if (!moa) return

    const unsubs = []

    if (moa.onCouncilStart) {
      unsubs.push(moa.onCouncilStart((data) => {
        clearAutoReset()
        setState({
          active: true,
          executionId: data?.executionId || '',
          councilId: data?.councilId || '',
          memberCount: Number(data?.memberCount || 0) || 0,
          successCount: 0,
          status: 'running',
        })
      }))
    }

    if (moa.onCouncilDone) {
      unsubs.push(moa.onCouncilDone((data) => {
        setState((prev) => ({
          ...prev,
          active: true,
          executionId: data?.executionId || prev.executionId,
          councilId: data?.councilId || prev.councilId,
          memberCount: Number(data?.memberCount || prev.memberCount || 0) || 0,
          successCount: Number(data?.successCount || prev.successCount || 0) || 0,
          status: 'completed',
        }))
        scheduleAutoReset()
      }))
    }

    if (moa.onCouncilFailed) {
      unsubs.push(moa.onCouncilFailed((data) => {
        setState((prev) => ({
          ...prev,
          active: true,
          executionId: data?.executionId || prev.executionId,
          councilId: data?.councilId || prev.councilId,
          status: 'failed',
        }))
        scheduleAutoReset()
      }))
    }

    if (moa.onCouncilAborted) {
      unsubs.push(moa.onCouncilAborted((data) => {
        setState((prev) => ({
          ...prev,
          active: true,
          executionId: data?.executionId || prev.executionId,
          councilId: data?.councilId || prev.councilId,
          status: 'aborted',
        }))
        scheduleAutoReset()
      }))
    }

    return () => {
      clearAutoReset()
      unsubs.forEach((unsub) => { if (typeof unsub === 'function') unsub() })
    }
  }, [clearAutoReset, scheduleAutoReset])

  return state
}
