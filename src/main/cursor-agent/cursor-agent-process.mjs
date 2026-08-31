import { spawn } from 'node:child_process'
import path from 'node:path'
import { CURSOR_AGENT_MODEL_ID } from '../../common/api-clients/cursor-agent-provider.mjs'
import { createCursorAgentStreamParser } from './cursor-agent-protocol.mjs'
import { sanitizeCursorAgentError, sanitizeCursorAgentText } from './cursor-agent-sanitization.mjs'

const INHERITED_ENV_KEYS = [
  'SystemRoot', 'WINDIR', 'ComSpec', 'PATH', 'PATHEXT', 'TEMP', 'TMP',
  'LANG', 'LC_ALL', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY',
]

function buildEnvironment({ env = process.env, profilePaths = null, apiKey = '' } = {}) {
  const result = {}
  for (const key of INHERITED_ENV_KEYS) {
    if (env?.[key] !== undefined) result[key] = String(env[key])
  }
  if (profilePaths) {
    result.USERPROFILE = profilePaths.profilePath
    result.HOME = profilePaths.profilePath
    result.LOCALAPPDATA = profilePaths.profileLocalAppDataPath
    result.APPDATA = profilePaths.profileRoamingAppDataPath
  }
  if (apiKey) result.CURSOR_API_KEY = String(apiKey)
  return result
}

const trackedCursorAgentPids = new Set()

function trackCursorAgentPid(pid) {
  const numericPid = Number(pid)
  if (!Number.isFinite(numericPid) || numericPid <= 0) return
  trackedCursorAgentPids.add(numericPid)
}

function untrackCursorAgentPid(pid) {
  const numericPid = Number(pid)
  if (!Number.isFinite(numericPid) || numericPid <= 0) return
  trackedCursorAgentPids.delete(numericPid)
}

export function listTrackedCursorAgentPids() {
  return [...trackedCursorAgentPids]
}

export function __resetTrackedCursorAgentPidsForTests() {
  trackedCursorAgentPids.clear()
}

export function killCursorAgentProcessTree(pid) {
  const numericPid = Number(pid)
  if (!Number.isFinite(numericPid) || numericPid <= 0) return Promise.resolve(false)
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/PID', String(numericPid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      })
      killer.once('error', () => {
        untrackCursorAgentPid(numericPid)
        resolve(false)
      })
      killer.once('close', (code) => {
        untrackCursorAgentPid(numericPid)
        resolve(code === 0)
      })
      return
    }
    try {
      process.kill(-numericPid, 'SIGTERM')
      untrackCursorAgentPid(numericPid)
      resolve(true)
    } catch {
      try {
        process.kill(numericPid, 'SIGTERM')
        untrackCursorAgentPid(numericPid)
        resolve(true)
      } catch {
        untrackCursorAgentPid(numericPid)
        resolve(false)
      }
    }
  })
}

export async function killAllTrackedCursorAgentProcesses({
  killProcessTree = killCursorAgentProcessTree,
} = {}) {
  const pids = listTrackedCursorAgentPids()
  if (pids.length === 0) return { killed: 0 }
  await Promise.all(pids.map((pid) => killProcessTree(pid)))
  trackedCursorAgentPids.clear()
  return { killed: pids.length }
}

function resolveSpawn(commandPath, args) {
  if (process.platform !== 'win32' || !commandPath.toLowerCase().endsWith('.cmd')) {
    return { command: commandPath, args }
  }
  const powershellScript = path.join(path.dirname(commandPath), 'cursor-agent.ps1')
  return {
    command: `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', powershellScript, ...args],
  }
}

export function createCursorAgentProcessRunner({
  spawnProcess = spawn,
  killProcessTree = killCursorAgentProcessTree,
  env = process.env,
} = {}) {
  return {
    start({
      commandPath = '', cwd = '', prompt = '', model = CURSOR_AGENT_MODEL_ID, sessionId = '',
      apiKey = '', profilePaths = null, extraArgs = [], onEvent = null,
    } = {}) {
      const args = [
        '--print', '--force', '--trust', '--output-format', 'stream-json',
        '--stream-partial-output', '--model', model, '--workspace', cwd,
      ]
      if (sessionId) args.push('--resume', sessionId)
      args.push(...extraArgs.map(String))
      const resolved = resolveSpawn(String(commandPath || ''), args)
      const child = spawnProcess(resolved.command, resolved.args, {
        cwd,
        env: buildEnvironment({ env, profilePaths, apiKey }),
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      trackCursorAgentPid(child?.pid)
      const parser = createCursorAgentStreamParser()
      const events = []
      let stderr = ''
      let settled = false
      let cancelPromise = null
      let streamError = null
      let streamKillRequested = false
      const stopMalformedStream = () => {
        if (streamKillRequested) return
        streamKillRequested = true
        void Promise.resolve(killProcessTree(child.pid))
      }
      const recordEvents = (nextEvents = []) => {
        for (const event of nextEvents) {
          events.push(event)
          try { onEvent?.(event) } catch (error) {
            streamError ||= error
            stopMalformedStream()
          }
        }
      }
      child.stdout?.setEncoding?.('utf8')
      child.stderr?.setEncoding?.('utf8')
      child.stdout?.on?.('data', (chunk) => {
        if (streamError) return
        try { recordEvents(parser.push(chunk)) } catch (error) {
          streamError = error
          stopMalformedStream()
        }
      })
      child.stderr?.on?.('data', (chunk) => { stderr += sanitizeCursorAgentText(chunk) })
      child.stdin?.end?.(String(prompt || ''))
      const completed = new Promise((resolve) => {
        const finish = (code = null, signal = null, spawnError = null) => {
          if (settled) return
          settled = true
          untrackCursorAgentPid(child?.pid)
          if (!streamError) {
            try { recordEvents(parser.finish()) } catch (error) { streamError = error }
          }
          spawnError ||= streamError
          resolve({
            status: cancelPromise ? 'cancelled' : (code === 0 && !spawnError ? 'completed' : 'failed'),
            code: Number.isFinite(code) ? code : null,
            signal: signal ? String(signal) : '',
            events,
            stderr,
            error: spawnError ? sanitizeCursorAgentError(spawnError) : null,
          })
        }
        child.once?.('error', (error) => finish(null, null, error))
        child.once?.('close', (code, signal) => finish(code, signal, null))
      })
      const cancel = () => {
        if (!cancelPromise) cancelPromise = Promise.resolve(killProcessTree(child.pid)).then(Boolean)
        return cancelPromise
      }
      return { pid: Number(child.pid || 0) || null, child, completed, cancel }
    },
  }
}

export const __testCursorAgentProcessInternals = Object.freeze({ buildEnvironment, resolveSpawn })
