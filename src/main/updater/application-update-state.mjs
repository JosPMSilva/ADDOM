const UPDATE_PHASES = new Set([
  'hidden',
  'unavailable',
  'checking',
  'available',
  'downloading',
  'ready',
  'installing',
  'error',
])

const UPDATE_ERROR_CODES = new Set([
  'generic',
  'network',
  'operation_in_progress',
  'unavailable',
])

const INSTALL_BLOCKER_KINDS = new Set([
  'running-task',
  'pending-approval',
  'active-terminal',
  'unsaved-work',
])

function normalizeText(value, maxLength = 120) {
  const text = String(value ?? '').trim()
  return text ? text.slice(0, maxLength) : null
}

function normalizeTimestamp(value) {
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : null
}

function normalizeProgress(value) {
  const progress = Number(value)
  if (!Number.isFinite(progress)) return 0
  return Math.round(Math.max(0, Math.min(100, progress)))
}

function normalizeErrorCode(value) {
  const code = normalizeText(value, 40)
  if (!code) return null
  return UPDATE_ERROR_CODES.has(code) ? code : 'generic'
}

function normalizeInstallBlockers(value) {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    const kind = normalizeText(candidate?.kind, 40)
    const label = normalizeText(candidate?.label)
    if (!kind || !label || !INSTALL_BLOCKER_KINDS.has(kind)) return []
    return [{ kind, label, simulated: candidate?.simulated === true }]
  }).slice(0, 20)
}

function normalizeSimulation(value) {
  if (!value || value.enabled !== true) return null
  return {
    enabled: true,
    candidateVersion: normalizeText(value.candidateVersion, 80) || '99.0.0-dev',
  }
}

export function createInitialUpdateSnapshot() {
  return {
    phase: 'hidden',
    version: null,
    progressPercent: 0,
    errorCode: null,
    checkedAt: null,
    downloadedAt: null,
    installBlockers: [],
    simulation: null,
    revision: 0,
  }
}

export function createUnavailableUpdateSnapshot() {
  return {
    ...createInitialUpdateSnapshot(),
    phase: 'unavailable',
  }
}

export function normalizeUpdateSnapshot(value) {
  const source = value && typeof value === 'object' ? value : {}
  const phase = UPDATE_PHASES.has(source.phase) ? source.phase : 'hidden'
  const revision = Number(source.revision)
  return {
    phase,
    version: normalizeText(source.version, 80),
    progressPercent: normalizeProgress(source.progressPercent),
    errorCode: normalizeErrorCode(source.errorCode),
    checkedAt: normalizeTimestamp(source.checkedAt),
    downloadedAt: normalizeTimestamp(source.downloadedAt),
    installBlockers: normalizeInstallBlockers(source.installBlockers),
    simulation: normalizeSimulation(source.simulation),
    revision: Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
  }
}

export function reduceApplicationUpdateState(snapshot, event, now = Date.now()) {
  const current = normalizeUpdateSnapshot(snapshot)
  switch (event?.type) {
    case 'check_started':
      return { ...current, phase: 'checking', errorCode: null }
    case 'no_update':
      return {
        ...createInitialUpdateSnapshot(),
        checkedAt: normalizeTimestamp(now),
        simulation: current.simulation,
        revision: current.revision,
      }
    case 'update_available':
      return {
        ...current,
        phase: 'available',
        version: normalizeText(event.version, 80),
        progressPercent: 0,
        errorCode: null,
        checkedAt: normalizeTimestamp(now),
      }
    case 'download_started':
      return { ...current, phase: 'downloading', progressPercent: 0, errorCode: null }
    case 'download_progress':
      return { ...current, phase: 'downloading', progressPercent: normalizeProgress(event.percent) }
    case 'download_succeeded':
      return {
        ...current,
        phase: 'ready',
        version: normalizeText(event.version, 80) || current.version,
        progressPercent: 100,
        errorCode: null,
        downloadedAt: normalizeTimestamp(now),
      }
    case 'install_blockers_changed':
      return { ...current, installBlockers: normalizeInstallBlockers(event.blockers) }
    case 'install_started':
      return { ...current, phase: 'installing', errorCode: null, installBlockers: [] }
    case 'install_failed':
      return {
        ...current,
        phase: 'ready',
        errorCode: normalizeErrorCode(event.errorCode) || 'generic',
      }
    case 'operation_failed':
      return {
        ...current,
        phase: current.version ? 'error' : 'hidden',
        errorCode: normalizeErrorCode(event.errorCode) || 'generic',
        checkedAt: event.operation === 'check' ? normalizeTimestamp(now) : current.checkedAt,
      }
    case 'reset':
      return {
        ...createInitialUpdateSnapshot(),
        simulation: current.simulation,
        revision: current.revision,
      }
    case 'simulation_changed':
      return { ...current, simulation: normalizeSimulation(event.simulation) }
    default:
      return current
  }
}
