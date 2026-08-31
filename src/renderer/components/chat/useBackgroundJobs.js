import { useCallback, useEffect, useState } from 'react'

export default function useBackgroundJobs({
  jobsModalOpen,
  pushToolActivity,
}) {
  const [backgroundJobs, setBackgroundJobs] = useState([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobsError, setJobsError] = useState('')
  const [jobsLastUpdated, setJobsLastUpdated] = useState(0)
  const [jobsStoppingId, setJobsStoppingId] = useState('')

  const refreshBackgroundJobs = useCallback(async () => {
    setJobsLoading(true)
    try {
      const payload = await window.addom.processes.listBackground('')
      setBackgroundJobs(Array.isArray(payload?.jobs) ? payload.jobs : [])
      setJobsLastUpdated(Number(payload?.serverTime) || Date.now())
      setJobsError('')
    } catch (err) {
      setJobsError(String(err?.message ?? 'Failed to load background jobs.'))
    } finally {
      setJobsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!jobsModalOpen) return undefined
    refreshBackgroundJobs()
    const timer = setInterval(() => {
      refreshBackgroundJobs()
    }, 3000)
    return () => clearInterval(timer)
  }, [jobsModalOpen, refreshBackgroundJobs])

  const handleStopBackgroundJob = useCallback(async (jobId) => {
    const id = String(jobId ?? '').trim()
    if (!id) return
    setJobsStoppingId(id)
    try {
      const result = await window.addom.processes.stopBackground(id)
      const stopped = !!result?.stopped
      pushToolActivity({
        type: 'result',
        isError: !stopped,
        decision: 'approved',
        label: stopped
          ? `Stopped background job ${id}`
          : `Could not stop background job ${id}`,
      })
      await refreshBackgroundJobs()
    } catch (err) {
      setJobsError(String(err?.message ?? 'Failed to stop background job.'))
    } finally {
      setJobsStoppingId('')
    }
  }, [refreshBackgroundJobs, pushToolActivity])

  const handleStopAllBackgroundJobs = useCallback(async () => {
    setJobsStoppingId('__all__')
    try {
      const result = await window.addom.processes.stopAllBackground('')
      pushToolActivity({
        type: 'result',
        isError: false,
        decision: 'approved',
        label: `Stop all requested: ${result?.requested ?? 0}, stopped: ${result?.stopped ?? 0}`,
      })
      await refreshBackgroundJobs()
    } catch (err) {
      setJobsError(String(err?.message ?? 'Failed to stop background jobs.'))
    } finally {
      setJobsStoppingId('')
    }
  }, [refreshBackgroundJobs, pushToolActivity])

  return {
    backgroundJobs,
    jobsLoading,
    jobsError,
    jobsLastUpdated,
    jobsStoppingId,
    refreshBackgroundJobs,
    handleStopBackgroundJob,
    handleStopAllBackgroundJobs,
  }
}
