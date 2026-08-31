import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const STATUS_CACHE_TTL_MS = 15_000
const DEFAULT_PROBE_TIMEOUT_MS = 5_000
const DEFAULT_CONVERT_TIMEOUT_MS = 20_000

const WINDOWS_PYTHON_CANDIDATES = ['py', 'python', 'python3']
const POSIX_PYTHON_CANDIDATES = ['python3', 'python']
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const MARKITDOWN_CONVERT_SCRIPT_PATH = path.join(MODULE_DIR, 'markitdown_convert.py')

let runtimeStatusCache = null
let runtimeStatusCheckedAt = 0

function normalizeTimeout(value, fallback = DEFAULT_PROBE_TIMEOUT_MS, min = 500, max = 120_000) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.round(numeric)))
}

function safeTrim(value = '') {
  return String(value || '').trim()
}

function pickPythonCandidates() {
  return process.platform === 'win32'
    ? WINDOWS_PYTHON_CANDIDATES
    : POSIX_PYTHON_CANDIDATES
}

function parseJsonLine(text = '') {
  const raw = safeTrim(text)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function runCommand(executable = '', args = [], timeoutMs = DEFAULT_PROBE_TIMEOUT_MS) {
  const command = safeTrim(executable)
  if (!command) {
    return Promise.resolve({
      ok: false,
      code: null,
      timedOut: false,
      stdout: '',
      stderr: 'python_executable_missing',
      errorMessage: 'python_executable_missing',
    })
  }

  return new Promise((resolve) => {
    let child = null
    let done = false
    let stdout = ''
    let stderr = ''
    const safeTimeout = normalizeTimeout(timeoutMs)
    const timer = setTimeout(() => {
      if (done) return
      done = true
      try { child?.kill('SIGKILL') } catch { /* best-effort timeout kill */ }
      resolve({
        ok: false,
        code: null,
        timedOut: true,
        stdout,
        stderr,
        errorMessage: 'process_timeout',
      })
    }, safeTimeout)

    try {
      child = spawn(command, Array.isArray(args) ? args : [], {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (error) {
      clearTimeout(timer)
      resolve({
        ok: false,
        code: null,
        timedOut: false,
        stdout,
        stderr,
        errorMessage: String(error?.message || error || 'spawn_failed'),
      })
      return
    }

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk || '')
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk || '')
    })
    child.on('error', (error) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({
        ok: false,
        code: null,
        timedOut: false,
        stdout,
        stderr,
        errorMessage: String(error?.message || error || 'spawn_failed'),
      })
    })
    child.on('close', (code) => {
      if (done) return
      done = true
      clearTimeout(timer)
      const exitCode = Number(code)
      resolve({
        ok: Number.isFinite(exitCode) ? exitCode === 0 : false,
        code: Number.isFinite(exitCode) ? exitCode : null,
        timedOut: false,
        stdout,
        stderr,
        errorMessage: '',
      })
    })
  })
}

async function probeCandidate(candidate = '', timeoutMs = DEFAULT_PROBE_TIMEOUT_MS) {
  const infoScript = [
    'import json, sys',
    'print(json.dumps({"pythonVersion": sys.version.split()[0], "executable": sys.executable}))',
  ].join('; ')
  const infoResult = await runCommand(candidate, ['-c', infoScript], timeoutMs)
  if (!infoResult.ok) {
    return {
      executable: candidate,
      ok: false,
      reasonCode: 'runtime_missing',
      reason: safeTrim(infoResult.errorMessage || infoResult.stderr || 'python_runtime_unavailable'),
    }
  }

  const infoPayload = parseJsonLine(infoResult.stdout)
  const pythonVersion = safeTrim(infoPayload?.pythonVersion || '')
  const pythonExecutable = safeTrim(infoPayload?.executable || '')

  const packageScript = [
    'import importlib.util, json',
    'print(json.dumps({"installed": bool(importlib.util.find_spec("markitdown"))}))',
  ].join('; ')
  const packageResult = await runCommand(candidate, ['-c', packageScript], timeoutMs)
  if (!packageResult.ok) {
    return {
      executable: candidate,
      ok: false,
      reasonCode: 'probe_failed',
      reason: safeTrim(packageResult.errorMessage || packageResult.stderr || 'markitdown_probe_failed'),
      pythonVersion,
      pythonExecutable,
    }
  }

  const packagePayload = parseJsonLine(packageResult.stdout)
  const installed = packagePayload?.installed === true
  if (!installed) {
    return {
      executable: candidate,
      ok: false,
      reasonCode: 'package_missing',
      reason: 'Python is available but the markitdown package is not installed.',
      pythonVersion,
      pythonExecutable,
    }
  }

  const versionScript = [
    'import json',
    'from importlib import metadata as _m',
    'version = ""',
    'try: version = _m.version("markitdown")',
    'except Exception: version = ""',
    'print(json.dumps({"markitdownVersion": version}))',
  ].join('; ')
  const versionResult = await runCommand(candidate, ['-c', versionScript], timeoutMs)
  const versionPayload = versionResult.ok ? parseJsonLine(versionResult.stdout) : null

  return {
    executable: candidate,
    ok: true,
    reasonCode: 'ok',
    reason: '',
    pythonVersion,
    pythonExecutable,
    markitdownVersion: safeTrim(versionPayload?.markitdownVersion || ''),
  }
}

function sanitizeStatus(status = {}) {
  const source = status && typeof status === 'object' ? status : {}
  return {
    ok: source.ok === true,
    ready: source.ready === true,
    reasonCode: safeTrim(source.reasonCode || '') || (source.ready ? 'ok' : 'runtime_missing'),
    reason: safeTrim(source.reason || ''),
    executable: safeTrim(source.executable || ''),
    pythonVersion: safeTrim(source.pythonVersion || ''),
    pythonExecutable: safeTrim(source.pythonExecutable || ''),
    markitdownVersion: safeTrim(source.markitdownVersion || ''),
    checkedAt: Number(source.checkedAt || Date.now()) || Date.now(),
    attempts: Array.isArray(source.attempts)
      ? source.attempts.map((row) => ({
        executable: safeTrim(row?.executable || ''),
        reasonCode: safeTrim(row?.reasonCode || ''),
        reason: safeTrim(row?.reason || ''),
      }))
      : [],
  }
}

export function clearMarkItDownRuntimeStatusCache() {
  runtimeStatusCache = null
  runtimeStatusCheckedAt = 0
}

export function resolveMarkItDownConvertScriptPath() {
  return MARKITDOWN_CONVERT_SCRIPT_PATH
}

export async function getMarkItDownRuntimeStatus({
  forceRefresh = false,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
} = {}) {
  const now = Date.now()
  if (!forceRefresh && runtimeStatusCache && (now - runtimeStatusCheckedAt) <= STATUS_CACHE_TTL_MS) {
    return sanitizeStatus(runtimeStatusCache)
  }

  const attempts = []
  const candidates = pickPythonCandidates()
  const safeTimeout = normalizeTimeout(timeoutMs, DEFAULT_PROBE_TIMEOUT_MS, 500, 30_000)
  for (const candidate of candidates) {
    const probe = await probeCandidate(candidate, safeTimeout)
    attempts.push({
      executable: safeTrim(probe.executable || candidate),
      reasonCode: safeTrim(probe.reasonCode || ''),
      reason: safeTrim(probe.reason || ''),
    })
    if (probe.ok) {
      runtimeStatusCache = sanitizeStatus({
        ok: true,
        ready: true,
        reasonCode: 'ok',
        reason: '',
        executable: safeTrim(probe.executable || candidate),
        pythonVersion: safeTrim(probe.pythonVersion || ''),
        pythonExecutable: safeTrim(probe.pythonExecutable || ''),
        markitdownVersion: safeTrim(probe.markitdownVersion || ''),
        checkedAt: Date.now(),
        attempts,
      })
      runtimeStatusCheckedAt = Date.now()
      return sanitizeStatus(runtimeStatusCache)
    }
  }

  const lastAttempt = attempts[attempts.length - 1] || { reasonCode: 'runtime_missing', reason: '' }
  runtimeStatusCache = sanitizeStatus({
    ok: false,
    ready: false,
    reasonCode: safeTrim(lastAttempt.reasonCode || 'runtime_missing'),
    reason: safeTrim(lastAttempt.reason || 'Python runtime not found or markitdown is not installed.'),
    checkedAt: Date.now(),
    attempts,
  })
  runtimeStatusCheckedAt = Date.now()
  return sanitizeStatus(runtimeStatusCache)
}

export async function convertFileWithMarkItDown({
  inputPath = '',
  timeoutMs = DEFAULT_CONVERT_TIMEOUT_MS,
  executable = '',
  scriptPath = '',
  runCommandFn = runCommand,
} = {}) {
  const sourcePath = safeTrim(inputPath)
  if (!sourcePath) {
    return { ok: false, reasonCode: 'conversion_failed', message: 'input_path_missing', text: '' }
  }

  let runtime = null
  if (safeTrim(executable)) {
    runtime = sanitizeStatus({
      ready: true,
      executable: executable,
      reasonCode: 'ok',
      checkedAt: Date.now(),
    })
  } else {
    runtime = await getMarkItDownRuntimeStatus({
      timeoutMs: Math.min(10_000, normalizeTimeout(timeoutMs, DEFAULT_CONVERT_TIMEOUT_MS)),
    })
  }

  if (!runtime?.ready || !runtime.executable) {
    return {
      ok: false,
      reasonCode: safeTrim(runtime?.reasonCode || 'runtime_missing'),
      message: safeTrim(runtime?.reason || 'markitdown runtime is unavailable'),
      text: '',
      runtimeStatus: runtime,
    }
  }

  const conversionScriptPath = safeTrim(scriptPath) || resolveMarkItDownConvertScriptPath()
  if (!conversionScriptPath || !fs.existsSync(conversionScriptPath)) {
    return {
      ok: false,
      reasonCode: 'runtime_script_missing',
      message: 'MarkItDown conversion script is missing.',
      text: '',
      runtimeStatus: runtime,
    }
  }

  const run = typeof runCommandFn === 'function' ? runCommandFn : runCommand
  const safeTimeout = normalizeTimeout(timeoutMs, DEFAULT_CONVERT_TIMEOUT_MS, 1_000, 120_000)
  const result = await run(runtime.executable, [conversionScriptPath, sourcePath], safeTimeout)
  if (!result.ok) {
    return {
      ok: false,
      reasonCode: result.timedOut ? 'runtime_timeout' : 'conversion_failed',
      message: safeTrim(result.errorMessage || result.stderr || 'markitdown conversion failed'),
      text: '',
      runtimeStatus: runtime,
    }
  }

  const payload = parseJsonLine(result.stdout)
  if (!payload || payload.ok !== true) {
    return {
      ok: false,
      reasonCode: 'conversion_failed',
      message: safeTrim(payload?.error || result.stderr || 'markitdown returned invalid output'),
      text: '',
      runtimeStatus: runtime,
    }
  }

  return {
    ok: true,
    reasonCode: 'ok',
    message: '',
    text: String(payload.text || ''),
    runtimeStatus: runtime,
  }
}
