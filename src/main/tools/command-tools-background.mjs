import { spawn } from 'child_process'
import { truncateInline } from './command-tools-core.mjs'

const MAX_BACKGROUND_JOB_RETENTION = 200
const BACKGROUND_JOB_GRACE_MS = 120_000

const backgroundJobs = new Map()
let backgroundJobSeq = 1

export async function killProcessTreeByPid(pid, force = false) {
  const n = Number(pid)
  if (!Number.isFinite(n) || n <= 0) return false

  if (process.platform === 'win32') {
    return await new Promise((resolve) => {
      const args = ['/PID', String(n), '/T']
      if (force) args.push('/F')
      const killer = spawn('taskkill', args, { windowsHide: true, stdio: 'ignore' })
      killer.on('error', () => resolve(false))
      killer.on('close', (code) => resolve(code === 0))
    })
  }

  try {
    process.kill(-n, force ? 'SIGKILL' : 'SIGTERM')
    return true
  } catch {
    /* fall back to a direct pid kill when process-group termination is unavailable */
  }
  try {
    process.kill(n, force ? 'SIGKILL' : 'SIGTERM')
    return true
  } catch {
    return false
  }
}

function normalizeBackgroundJobStatus(job) {
  if (!job) return null
  if (job.status !== 'running') return job.status
  if (job.child && job.child.exitCode !== null) return 'exited'
  return 'running'
}

function buildBackgroundJobView(job) {
  const status = normalizeBackgroundJobStatus(job)
  return {
    id: job.id,
    pid: Number(job.pid || 0) || null,
    status,
    command: job.command,
    commandPreview: truncateInline(job.command, 420),
    cwd: job.cwd,
    projectRoot: job.projectRoot,
    shell: job.shell,
    startedAt: job.startedAt,
    stoppedAt: job.stoppedAt ?? null,
    exitCode: Number.isFinite(job.exitCode) ? job.exitCode : null,
    signal: job.signal ? String(job.signal) : null,
    killReason: job.killReason ? String(job.killReason) : '',
  }
}

function finalizeBackgroundJob(jobId, patch = {}) {
  const job = backgroundJobs.get(jobId)
  if (!job) return null
  const next = {
    ...job,
    ...patch,
    status: patch.status || 'exited',
    stoppedAt: patch.stoppedAt ?? job.stoppedAt ?? Date.now(),
  }
  backgroundJobs.set(jobId, next)
  setTimeout(() => {
    const current = backgroundJobs.get(jobId)
    if (!current) return
    if (normalizeBackgroundJobStatus(current) === 'running') return
    backgroundJobs.delete(jobId)
  }, BACKGROUND_JOB_GRACE_MS)
  return next
}

export function registerBackgroundJob({ child, projectRoot, command, cwd, shell }) {
  const id = `bg-${Date.now()}-${backgroundJobSeq++}`
  const now = Date.now()
  const record = {
    id,
    child,
    pid: child?.pid ?? null,
    projectRoot: String(projectRoot ?? ''),
    command: String(command ?? ''),
    cwd: String(cwd ?? '.'),
    shell: String(shell ?? 'auto'),
    startedAt: now,
    stoppedAt: null,
    exitCode: null,
    signal: null,
    status: 'running',
    killReason: '',
  }
  backgroundJobs.set(id, record)
  child.once('close', (code, signal) => {
    const current = backgroundJobs.get(id)
    const status = current?.status === 'stopped' ? 'stopped' : 'exited'
    finalizeBackgroundJob(id, {
      status,
      exitCode: Number.isFinite(code) ? code : null,
      signal: signal ? String(signal) : null,
      stoppedAt: Date.now(),
      killReason: current?.killReason || '',
    })
  })
  if (backgroundJobs.size > MAX_BACKGROUND_JOB_RETENTION) {
    const stale = [...backgroundJobs.values()]
      .filter((job) => normalizeBackgroundJobStatus(job) !== 'running')
      .sort((a, b) => (a.stoppedAt ?? a.startedAt) - (b.stoppedAt ?? b.startedAt))
    const toDrop = backgroundJobs.size - MAX_BACKGROUND_JOB_RETENTION
    stale.slice(0, toDrop).forEach((job) => backgroundJobs.delete(job.id))
  }
  return record
}

export function listBackgroundCommands({ projectRoot = '' } = {}) {
  const root = String(projectRoot ?? '').trim()
  const rows = [...backgroundJobs.values()]
    .map((job) => {
      const status = normalizeBackgroundJobStatus(job)
      if (status !== job.status) {
        const next = { ...job, status }
        backgroundJobs.set(job.id, next)
        return next
      }
      return job
    })
    .filter((job) => {
      if (normalizeBackgroundJobStatus(job) !== 'running') return false
      if (!root) return true
      return String(job.projectRoot || '') === root
    })
    .sort((a, b) => b.startedAt - a.startedAt)
  return rows.map(buildBackgroundJobView)
}

export async function stopBackgroundCommand(jobId, { reason = 'Stopped by user.', force = true } = {}) {
  const id = String(jobId ?? '').trim()
  if (!id) throw new Error('Background command id is required.')
  const job = backgroundJobs.get(id)
  if (!job) throw new Error(`Background command not found: ${id}`)
  if (normalizeBackgroundJobStatus(job) !== 'running') {
    return { stopped: false, alreadyStopped: true, job: buildBackgroundJobView(job) }
  }
  const pid = Number(job.pid || 0)
  const ok = await killProcessTreeByPid(pid, !!force)
  if (ok) {
    finalizeBackgroundJob(id, {
      status: 'stopped',
      killReason: String(reason ?? '').trim() || 'Stopped by user.',
      stoppedAt: Date.now(),
    })
  } else {
    backgroundJobs.set(id, {
      ...job,
      status: 'running',
      killReason: 'Stop request failed; process may still be running.',
    })
  }
  const updated = backgroundJobs.get(id)
  return {
    stopped: !!ok,
    alreadyStopped: false,
    job: updated ? buildBackgroundJobView(updated) : null,
  }
}

export async function stopAllBackgroundCommands({ projectRoot = '', reason = 'Stopped by user.' } = {}) {
  const rows = listBackgroundCommands({ projectRoot })
  let stopped = 0
  for (const row of rows) {
    try {
      const result = await stopBackgroundCommand(row.id, { reason, force: true })
      if (result?.stopped) stopped += 1
    } catch {
      /* best-effort shutdown across the remaining background jobs */
    }
  }
  return { requested: rows.length, stopped }
}
