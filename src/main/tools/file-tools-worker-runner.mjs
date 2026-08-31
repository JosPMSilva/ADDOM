import { Worker } from 'worker_threads'
import crypto from 'node:crypto'

const WORKER_TIMEOUT_MS = 20_000
const WORKER_FAILURE_WINDOW_MS = 30_000
const WORKER_FAILURE_THRESHOLD = 3
const WORKER_BASE_COOLDOWN_MS = 60_000
const WORKER_MAX_COOLDOWN_MS = 900_000
const WORKER_TOOL_NAMES = new Set(['list_directory', 'search_code'])
const INPUT_FAILURE_WINDOW_MS = 600_000
const INPUT_QUARANTINE_THRESHOLD = 3
const INPUT_BASE_QUARANTINE_MS = 120_000
const INPUT_MAX_QUARANTINE_MS = 900_000

let fileToolsWorker = null
let nextWorkerRequestId = 1
const pendingRequests = new Map()
let workerFailureTimestamps = []
let workerDisabledUntilMs = 0
let lastWorkerFailureReason = 'file_tools_worker_error'
let workerCooldownLevel = 0
const inputFailureState = new Map()

function stableSerialize(value, depth = 0) {
  if (depth > 4) return '"[max_depth]"'
  if (value === null || value === undefined) return 'null'
  const type = typeof value
  if (type === 'string') return JSON.stringify(String(value).slice(0, 800))
  if (type === 'number' || type === 'boolean') return JSON.stringify(value)
  if (Array.isArray(value)) {
    const entries = value.slice(0, 60).map((entry) => stableSerialize(entry, depth + 1))
    return `[${entries.join(',')}]`
  }
  if (type === 'object') {
    const keys = Object.keys(value).sort().slice(0, 120)
    const pairs = keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key], depth + 1)}`)
    return `{${pairs.join(',')}}`
  }
  return JSON.stringify(String(value))
}

function createToolInputSignature(toolName = '', projectRoot = '', toolInput = {}) {
  const payload = {
    toolName: String(toolName || '').trim(),
    projectRoot: String(projectRoot || '').trim(),
    toolInput: toolInput && typeof toolInput === 'object' ? toolInput : {},
  }
  const digest = crypto
    .createHash('sha256')
    .update(stableSerialize(payload))
    .digest('hex')
    .slice(0, 24)
  return `${String(payload.toolName || 'tool')}:${digest}`
}

function clearPending(id) {
  const pending = pendingRequests.get(id)
  if (!pending) return null
  pendingRequests.delete(id)
  try { clearTimeout(pending.timer) } catch { /* best-effort pending timer cleanup */ }
  return pending
}

function rejectAllPending(reason, { noteFailure = false, nowMs = Date.now() } = {}) {
  for (const [id, pending] of pendingRequests.entries()) {
    pendingRequests.delete(id)
    try { clearTimeout(pending.timer) } catch { /* best-effort pending timer cleanup */ }
    if (noteFailure) {
      noteWorkerFailure(reason, { signature: pending.signature, nowMs })
    }
    pending.reject(new Error(String(reason || 'file_tools_worker_error')))
  }
}

function pruneWorkerFailures(nowMs = Date.now()) {
  workerFailureTimestamps = workerFailureTimestamps.filter((ts) => nowMs - ts <= WORKER_FAILURE_WINDOW_MS)
}

function isWorkerCircuitOpen(nowMs = Date.now()) {
  if (workerDisabledUntilMs <= 0) return false
  if (workerDisabledUntilMs > nowMs) return true
  workerDisabledUntilMs = 0
  workerCooldownLevel = 0
  workerFailureTimestamps = []
  lastWorkerFailureReason = 'file_tools_worker_error'
  return false
}

function pruneInputFailureState(nowMs = Date.now()) {
  for (const [signature, state] of inputFailureState.entries()) {
    const lastFailureAt = Number(state?.lastFailureAt || 0)
    const quarantinedUntilMs = Number(state?.quarantinedUntilMs || 0)
    if (quarantinedUntilMs > nowMs) continue
    if (nowMs - lastFailureAt > INPUT_FAILURE_WINDOW_MS) {
      inputFailureState.delete(signature)
    }
  }
}

function noteInputFailure(signature, reason, nowMs = Date.now()) {
  const key = String(signature || '').trim()
  if (!key) return
  const current = inputFailureState.get(key) || {
    count: 0,
    windowStartMs: nowMs,
    lastFailureAt: 0,
    lastReason: 'file_tools_worker_error',
    quarantinedUntilMs: 0,
  }
  if (nowMs - Number(current.windowStartMs || 0) > INPUT_FAILURE_WINDOW_MS) {
    current.count = 0
    current.windowStartMs = nowMs
  }
  current.count += 1
  current.lastFailureAt = nowMs
  current.lastReason = String(reason || 'file_tools_worker_error')
  if (current.count >= INPUT_QUARANTINE_THRESHOLD) {
    const exponent = Math.max(0, current.count - INPUT_QUARANTINE_THRESHOLD)
    const quarantineMs = Math.min(INPUT_MAX_QUARANTINE_MS, INPUT_BASE_QUARANTINE_MS * (2 ** exponent))
    current.quarantinedUntilMs = Math.max(Number(current.quarantinedUntilMs || 0), nowMs + quarantineMs)
    try {
      console.warn('[file-tools-worker] input quarantined after repeated failures', {
        signature: key,
        failures: current.count,
        quarantinedUntil: current.quarantinedUntilMs,
        reason: current.lastReason,
      })
    } catch {
      /* avoid recursive logging failures while quarantining inputs */
    }
  }
  inputFailureState.set(key, current)
  pruneInputFailureState(nowMs)
}

function noteInputSuccess(signature) {
  const key = String(signature || '').trim()
  if (!key) return
  inputFailureState.delete(key)
}

function getInputQuarantineState(signature, nowMs = Date.now()) {
  const key = String(signature || '').trim()
  if (!key) return { isQuarantined: false, remainingMs: 0, reason: '', signature: '' }
  pruneInputFailureState(nowMs)
  const state = inputFailureState.get(key)
  if (!state) return { isQuarantined: false, remainingMs: 0, reason: '', signature: key }
  const until = Number(state.quarantinedUntilMs || 0)
  if (until <= nowMs) {
    return { isQuarantined: false, remainingMs: 0, reason: '', signature: key }
  }
  return {
    isQuarantined: true,
    remainingMs: Math.max(1, until - nowMs),
    reason: String(state.lastReason || 'file_tools_worker_error'),
    signature: key,
  }
}

function noteWorkerFailure(reason, { signature = '', nowMs = Date.now() } = {}) {
  pruneWorkerFailures(nowMs)
  workerFailureTimestamps.push(nowMs)
  lastWorkerFailureReason = String(reason || 'file_tools_worker_error')
  noteInputFailure(signature, reason, nowMs)
  if (workerFailureTimestamps.length >= WORKER_FAILURE_THRESHOLD) {
    workerCooldownLevel = Math.max(1, workerCooldownLevel + 1)
    const cooldownMs = Math.min(WORKER_MAX_COOLDOWN_MS, WORKER_BASE_COOLDOWN_MS * (2 ** (workerCooldownLevel - 1)))
    workerDisabledUntilMs = Math.max(workerDisabledUntilMs, nowMs + cooldownMs)
    try {
      console.warn('[file-tools-worker] disabled after repeated failures', {
        failures: workerFailureTimestamps.length,
        cooldownLevel: workerCooldownLevel,
        cooldownMs,
        disabledUntil: workerDisabledUntilMs,
        reason: lastWorkerFailureReason,
      })
    } catch {
      /* avoid recursive logging failures while opening the circuit */
    }
  }
}

function noteWorkerSuccess(signature = '') {
  workerFailureTimestamps = []
  workerCooldownLevel = 0
  noteInputSuccess(signature)
  if (workerDisabledUntilMs <= Date.now()) {
    workerDisabledUntilMs = 0
    lastWorkerFailureReason = 'file_tools_worker_error'
  }
}

function createWorkerCircuitOpenError() {
  const nowMs = Date.now()
  const remainingMs = Math.max(0, workerDisabledUntilMs - nowMs)
  const reason = String(lastWorkerFailureReason || 'file_tools_worker_error')
  return new Error(`file_tools_worker_temporarily_disabled:${reason}:${remainingMs}:${workerCooldownLevel}`)
}

function createInputQuarantineError(signature = '', reason = '', remainingMs = 0) {
  const sig = String(signature || '').trim()
  const why = String(reason || 'file_tools_worker_error')
  const remaining = Math.max(1, Math.round(Number(remainingMs || 0)))
  return new Error(`file_tools_worker_input_quarantined:${sig}:${why}:${remaining}`)
}

function disposeWorker() {
  const worker = fileToolsWorker
  fileToolsWorker = null
  if (!worker) return
  try { worker.removeAllListeners() } catch { /* best-effort worker listener cleanup */ }
  try { void worker.terminate() } catch { /* best-effort worker termination */ }
}

function handleWorkerMessage(message = {}) {
  const id = Number(message?.id || 0)
  if (!id) return
  const pending = clearPending(id)
  if (!pending) return
  if (message?.ok) {
    noteWorkerSuccess(pending.signature)
    pending.resolve(message.result)
    return
  }
  noteWorkerFailure(message?.error || 'file_tools_worker_error', { signature: pending.signature })
  pending.reject(new Error(String(message?.error || 'file_tools_worker_error')))
}

function ensureWorker() {
  if (isWorkerCircuitOpen()) throw createWorkerCircuitOpenError()
  if (fileToolsWorker) return fileToolsWorker
  const worker = new Worker(new URL('./file-tools-worker.mjs', import.meta.url), {
    type: 'module',
  })
  worker.on('message', handleWorkerMessage)
  worker.on('error', (err) => {
    const reason = err?.message || 'file_tools_worker_error'
    noteWorkerFailure(reason)
    rejectAllPending(reason, { noteFailure: true })
    if (fileToolsWorker === worker) fileToolsWorker = null
  })
  worker.on('exit', (code) => {
    if (Number(code) !== 0) noteWorkerFailure(`file_tools_worker_exit:${code}`)
    if (fileToolsWorker === worker) fileToolsWorker = null
    if (pendingRequests.size > 0) {
      rejectAllPending(`file_tools_worker_exit:${code}`, { noteFailure: true })
    }
  })
  fileToolsWorker = worker
  return worker
}

function invokeWorker(toolName, projectRoot, toolInput = {}, { signature = '' } = {}) {
  return new Promise((resolve, reject) => {
    let worker
    try {
      worker = ensureWorker()
    } catch (error) {
      reject(error)
      return
    }

    const id = nextWorkerRequestId++
    const timer = setTimeout(() => {
      const pending = clearPending(id)
      if (!pending) return
      pending.reject(new Error('file_tools_worker_timeout'))
      noteWorkerFailure('file_tools_worker_timeout', { signature: pending.signature })
      disposeWorker()
      rejectAllPending('file_tools_worker_timeout', { noteFailure: true })
    }, WORKER_TIMEOUT_MS)

    pendingRequests.set(id, { resolve, reject, timer, signature: String(signature || '') })
    try {
      worker.postMessage({
        id,
        toolName,
        projectRoot,
        toolInput: toolInput && typeof toolInput === 'object' ? toolInput : {},
      })
    } catch (error) {
      const pending = clearPending(id)
      if (pending) pending.reject(error)
      noteWorkerFailure(error?.message || 'file_tools_worker_post_message_failed', { signature })
    }
  })
}

export function isWorkerTool(toolName) {
  return WORKER_TOOL_NAMES.has(String(toolName || '').trim())
}

export async function runFileToolInWorker(toolName, projectRoot, toolInput = {}) {
  const name = String(toolName || '').trim()
  if (!WORKER_TOOL_NAMES.has(name)) {
    throw new Error(`Tool is not configured for worker execution: ${name}`)
  }
  const signature = createToolInputSignature(name, projectRoot, toolInput)
  const quarantine = getInputQuarantineState(signature)
  if (quarantine.isQuarantined) {
    throw createInputQuarantineError(quarantine.signature, quarantine.reason, quarantine.remainingMs)
  }
  return invokeWorker(name, projectRoot, toolInput, { signature })
}

export function disposeFileToolWorker() {
  disposeWorker()
}

export function __recordFileToolWorkerFailureForTests(reason = 'test_failure', { signature = '', nowMs = Date.now() } = {}) {
  noteWorkerFailure(reason, { signature, nowMs })
}

export function __getFileToolWorkerCircuitStateForTests(nowMs = Date.now()) {
  pruneWorkerFailures(nowMs)
  pruneInputFailureState(nowMs)
  return {
    failuresInWindow: workerFailureTimestamps.length,
    disabledUntilMs: workerDisabledUntilMs,
    isCircuitOpen: isWorkerCircuitOpen(nowMs),
    lastFailureReason: lastWorkerFailureReason,
    cooldownLevel: workerCooldownLevel,
    quarantinedInputs: [...inputFailureState.entries()]
      .map(([signature, state]) => ({
        signature,
        count: Number(state?.count || 0),
        quarantinedUntilMs: Number(state?.quarantinedUntilMs || 0),
        remainingMs: Math.max(0, Number(state?.quarantinedUntilMs || 0) - nowMs),
        lastReason: String(state?.lastReason || ''),
      }))
      .filter((entry) => entry.remainingMs > 0)
      .sort((a, b) => b.remainingMs - a.remainingMs),
  }
}

export function __createFileToolInputSignatureForTests(toolName = '', projectRoot = '', toolInput = {}) {
  return createToolInputSignature(toolName, projectRoot, toolInput)
}

export function __resetFileToolWorkerRunnerForTests() {
  disposeWorker()
  rejectAllPending('file_tools_worker_test_reset')
  workerFailureTimestamps = []
  workerDisabledUntilMs = 0
  workerCooldownLevel = 0
  inputFailureState.clear()
  lastWorkerFailureReason = 'file_tools_worker_error'
  nextWorkerRequestId = 1
}
