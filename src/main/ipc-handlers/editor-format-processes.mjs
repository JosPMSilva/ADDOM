import { spawn } from 'child_process'

const FORMATTER_TIMEOUT_MS = 8_000

export function runProcess({ command, args, cwd, env: envOverrides = {} }) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    let child
    try {
      child = spawn(command, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, ...envOverrides },
      })
    } catch (err) {
      resolve({
        ok: false,
        error: String(err?.message || 'Failed to start process'),
        stdout: '',
        stderr: '',
        code: null,
        timedOut: false,
      })
      return
    }

    const timeout = setTimeout(() => {
      timedOut = true
      try { child.kill() } catch { /* best-effort tool termination on timeout */ }
    }, FORMATTER_TIMEOUT_MS)

    child.stdout?.setEncoding?.('utf8')
    child.stderr?.setEncoding?.('utf8')
    child.stdout?.on?.('data', (chunk) => { stdout += String(chunk) })
    child.stderr?.on?.('data', (chunk) => { stderr += String(chunk) })

    child.on('error', (err) => {
      clearTimeout(timeout)
      resolve({
        ok: false,
        error: String(err?.message || 'Process error'),
        stdout,
        stderr,
        code: null,
        timedOut,
      })
    })

    child.on('close', (code) => {
      clearTimeout(timeout)
      resolve({
        ok: !timedOut && code === 0,
        stdout,
        stderr,
        code,
        timedOut,
        error: timedOut ? 'Process timed out.' : '',
      })
    })
  })
}

export function runProcessWithStdin({ command, args, cwd, stdin, env: envOverrides = {} }) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false

    let child
    try {
      child = spawn(command, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { ...process.env, ...envOverrides },
      })
    } catch (err) {
      resolve({
        ok: false,
        error: String(err?.message || 'Failed to start formatter process'),
        stdout: '',
        stderr: '',
        code: null,
        timedOut: false,
      })
      return
    }

    const timeout = setTimeout(() => {
      timedOut = true
      try { child.kill() } catch { /* best-effort formatter termination on timeout */ }
    }, FORMATTER_TIMEOUT_MS)

    child.stdout?.setEncoding?.('utf8')
    child.stderr?.setEncoding?.('utf8')
    child.stdout?.on?.('data', (chunk) => { stdout += String(chunk) })
    child.stderr?.on?.('data', (chunk) => { stderr += String(chunk) })

    child.on('error', (err) => {
      clearTimeout(timeout)
      resolve({
        ok: false,
        error: String(err?.message || 'Formatter process error'),
        stdout,
        stderr,
        code: null,
        timedOut,
      })
    })

    child.on('close', (code) => {
      clearTimeout(timeout)
      resolve({
        ok: !timedOut && code === 0,
        stdout,
        stderr,
        code,
        timedOut,
        error: timedOut ? 'Formatter timed out.' : '',
      })
    })

    try {
      child.stdin.write(String(stdin ?? ''))
      child.stdin.end()
    } catch {
      try { child.stdin.end() } catch { /* best-effort stdin closure after write failure */ }
    }
  })
}

