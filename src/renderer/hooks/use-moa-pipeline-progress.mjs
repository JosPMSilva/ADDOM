/**
 * use-moa-pipeline-progress.mjs
 *
 * React hook that subscribes to MoA pipeline lifecycle events
 * and exposes real-time pipeline progress state.
 *
 * Usage:
 *   const progress = useMoaPipelineProgress()
 *   // progress.active, progress.pipelineId, progress.currentStep,
 *   // progress.totalSteps, progress.stepName, progress.status
 */

import { useState, useEffect, useCallback, useRef } from 'react'

export default function useMoaPipelineProgress() {
    const [state, setState] = useState({
        active: false,
        executionId: '',
        pipelineId: '',
        pipelineName: '',
        currentStep: 0,
        totalSteps: 0,
        stepName: '',
        stepNames: [],
        status: 'idle', // idle | running | step_running | completed | failed | aborted
    })

    const timeoutRef = useRef(null)

    const clearAutoReset = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }
    }, [])

    // Auto-clear completed/failed state after 8 seconds
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

        // Pipeline started
        if (moa.onPipelineStart) {
            unsubs.push(moa.onPipelineStart((data) => {
                clearAutoReset()
                setState({
                    active: true,
                    executionId: data?.executionId || '',
                    pipelineId: data?.pipelineId || '',
                    pipelineName: data?.pipelineName || '',
                    currentStep: 0,
                    totalSteps: data?.totalSteps || 0,
                    stepName: data?.stepNames?.[0] || '',
                    stepNames: data?.stepNames || [],
                    status: 'running',
                })
            }))
        }

        // Step started
        if (moa.onPipelineStepStart) {
            unsubs.push(moa.onPipelineStepStart((data) => {
                setState((prev) => ({
                    ...prev,
                    active: true,
                    executionId: data?.executionId || prev.executionId,
                    currentStep: (data?.stepIndex ?? prev.currentStep) + 1,
                    stepName: data?.roleName || '',
                    status: 'step_running',
                }))
            }))
        }

        // Step completed
        if (moa.onPipelineStepComplete) {
            unsubs.push(moa.onPipelineStepComplete((data) => {
                setState((prev) => ({
                    ...prev,
                    currentStep: (data?.stepIndex ?? prev.currentStep - 1) + 1,
                    status: 'running',
                }))
            }))
        }

        // Pipeline completed
        if (moa.onPipelineDone) {
            unsubs.push(moa.onPipelineDone(() => {
                setState((prev) => ({ ...prev, status: 'completed' }))
                scheduleAutoReset()
            }))
        }

        // Pipeline failed
        if (moa.onPipelineFailed) {
            unsubs.push(moa.onPipelineFailed((data) => {
                setState((prev) => ({
                    ...prev,
                    status: 'failed',
                    stepName: data?.stepId || prev.stepName,
                }))
                scheduleAutoReset()
            }))
        }

        // Pipeline aborted
        if (moa.onPipelineAborted) {
            unsubs.push(moa.onPipelineAborted(() => {
                setState((prev) => ({ ...prev, status: 'aborted' }))
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
