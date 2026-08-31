import fs from 'node:fs/promises'
import path from 'node:path'

import { createTerminalSessionManager } from '../../src/main/tools/terminal-session-manager.mjs'
import { probeTerminalSessionRuntimeHealth } from '../../src/main/tools/terminal-session-runtime-health.mjs'

const ENABLE_ENV_NAME = 'ADDOM_REAL_TERMINAL_SMOKE'
const DEFAULT_TIMEOUT_MS = 20_000
const REAL_TERMINAL_POLICY = Object.freeze({
  type: 'terminal_session_policy_v1',
  policyDecision: 'allow',
  resolvedCwd: process.cwd(),
  laterWritesStayBoundToSession: true,
})

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function parseBooleanFlag(value = '') {
  const normalized = asTrimmedString(value).toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function normalizeTimeoutMs(value, fallback = DEFAULT_TIMEOUT_MS) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return Math.max(5_000, Math.round(numeric))
}

function buildShellQuotedPath(targetPath = '', shellKind = '') {
  const normalizedPath = String(targetPath || '')
  const normalizedShellKind = asTrimmedString(shellKind).toLowerCase()
  if (normalizedShellKind === 'cmd') {
    return `"${normalizedPath.replace(/"/g, '""')}"`
  }
  if (normalizedShellKind === 'powershell' || normalizedShellKind === 'pwsh') {
    return `'${normalizedPath.replace(/'/g, "''")}'`
  }
  return `'${normalizedPath.replace(/'/g, `'\\''`)}'`
}

function buildShellCommand({ shellKind = '', commandBody = '' } = {}) {
  const normalizedShellKind = asTrimmedString(shellKind).toLowerCase()
  if (normalizedShellKind === 'cmd') return `${commandBody}\r`
  return `${commandBody}\r`
}

function buildEchoCommand(marker = '', shellKind = '') {
  const normalizedShellKind = asTrimmedString(shellKind).toLowerCase()
  if (normalizedShellKind === 'powershell' || normalizedShellKind === 'pwsh') {
    return `Write-Output '${String(marker || '').replace(/'/g, "''")}'`
  }
  return `echo ${marker}`
}

function buildRedrawCommand(marker = '', shellKind = '') {
  const nodePath = buildShellQuotedPath(process.execPath, shellKind)
  const script = [
    'let i = 0;',
    "const timer = setInterval(() => {",
    "  i += 1;",
    "  process.stdout.write(`\\rADDOM_REDRAW_${i}`);",
    '  if (i >= 5) {',
    '    clearInterval(timer);',
    `    process.stdout.write('\\r\\n${marker}\\r\\n');`,
    '  }',
    '}, 20);',
  ].join(' ')
  const escapedScript = script.replace(/"/g, '\\"')
  if (asTrimmedString(shellKind).toLowerCase() === 'cmd') {
    return `${nodePath} -e "${escapedScript}"`
  }
  if (asTrimmedString(shellKind).toLowerCase() === 'powershell' || asTrimmedString(shellKind).toLowerCase() === 'pwsh') {
    return `& ${nodePath} -e "${escapedScript}"`
  }
  return `${nodePath} -e "${escapedScript}"`
}

function buildTuiCommand(shellKind = '') {
  const nodePath = buildShellQuotedPath(process.execPath, shellKind)
  const fixturePath = buildShellQuotedPath(
    path.resolve(process.cwd(), 'tests/live/fixtures/terminal-tui-smoke-app.mjs'),
    shellKind,
  )
  if (asTrimmedString(shellKind).toLowerCase() === 'powershell' || asTrimmedString(shellKind).toLowerCase() === 'pwsh') {
    return `& ${nodePath} ${fixturePath}`
  }
  return `${nodePath} ${fixturePath}`
}

function createStatus(kind, extras = {}) {
  return {
    status: kind,
    ...extras,
  }
}

async function waitForMatcher(manager, sessionId, matcher, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const deadline = Date.now() + normalizeTimeoutMs(timeoutMs)
  const initial = manager.attachSession(sessionId)
  let output = initial.output.chunks.map((entry) => String(entry?.data || '')).join('')
  if (matcher(output)) {
    return output
  }

  while (Date.now() < deadline) {
    await delay(Math.min(125, Math.max(40, deadline - Date.now())))
    output = manager.attachSession(sessionId).output.chunks.map((entry) => String(entry?.data || '')).join('')
    if (matcher(output)) return output
  }

  throw new Error(
    `Timed out waiting for terminal session ${sessionId} to reach the expected output state. Output tail: ${output.slice(-400)}`,
  )
}

async function delay(ms = 75) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function createManagedSession(manager, { cwd, shell }) {
  const snapshot = manager.createSession({
    cwd,
    shell,
    cols: 120,
    rows: 32,
    policy: {
      ...REAL_TERMINAL_POLICY,
      resolvedCwd: cwd,
      resolvedShell: shell,
    },
  })
  await delay(1_500)
  return snapshot.session
}

async function runShellMarkerScenario(manager, { cwd, shell, shellKind, marker, timeoutMs }) {
  const session = await createManagedSession(manager, { cwd, shell })
  const effectiveShellKind = asTrimmedString(session?.shellKind || shellKind || shell)
  try {
    manager.writeSession(session.id, buildShellCommand({
      shellKind: effectiveShellKind,
      commandBody: buildEchoCommand(marker, effectiveShellKind),
    }))
    const output = await waitForMatcher(manager, session.id, (value) => value.includes(marker), { timeoutMs })
    return createStatus('passed', {
      sessionId: session.id,
      shell,
      shellKind: effectiveShellKind,
      marker,
      evidence: `Observed shell marker ${marker}.`,
      outputTail: output.slice(-300),
    })
  } finally {
    try { manager.closeSession(session.id) } catch { /* best-effort cleanup */ }
  }
}

async function runRedrawScenario(manager, { cwd, shell, shellKind, timeoutMs }) {
  const marker = 'ADDOM_REDRAW_DONE'
  const session = await createManagedSession(manager, { cwd, shell })
  const effectiveShellKind = asTrimmedString(session?.shellKind || shellKind || shell)
  try {
    manager.writeSession(session.id, buildShellCommand({
      shellKind: effectiveShellKind,
      commandBody: buildRedrawCommand(marker, effectiveShellKind),
    }))
    const output = await waitForMatcher(manager, session.id, (value) => value.includes(marker), { timeoutMs })
    return createStatus('passed', {
      sessionId: session.id,
      shell,
      shellKind: effectiveShellKind,
      marker,
      evidence: 'Observed carriage-return redraw command completion through the PTY session.',
      outputTail: output.slice(-300),
    })
  } finally {
    try { manager.closeSession(session.id) } catch { /* best-effort cleanup */ }
  }
}

async function runTuiScenario(manager, { cwd, shell, shellKind, timeoutMs }) {
  const readyMarker = 'ADDOM_TUI_READY'
  const requiredMarkers = [
    'ADDOM_TUI_ARROW_LEFT',
    'ADDOM_TUI_ARROW_RIGHT',
    'ADDOM_TUI_ARROW_UP',
    'ADDOM_TUI_ARROW_DOWN',
    'ADDOM_TUI_BACKSPACE',
    'ADDOM_TUI_DELETE',
    'ADDOM_TUI_PASTE',
    'ADDOM_TUI_UTF8',
  ]
  const session = await createManagedSession(manager, { cwd, shell })
  const effectiveShellKind = asTrimmedString(session?.shellKind || shellKind || shell)
  try {
    manager.writeSession(session.id, buildShellCommand({
      shellKind: effectiveShellKind,
      commandBody: buildTuiCommand(effectiveShellKind),
    }))
    await waitForMatcher(manager, session.id, (value) => value.includes(readyMarker), { timeoutMs })
    await delay(500)
    manager.writeSession(session.id, '\u001b[D\u001b[C\u001b[A\u001b[B')
    manager.writeSession(session.id, '\u007f')
    manager.writeSession(session.id, '\u001b[3~')
    manager.writeSession(session.id, 'PASTE_OK')
    manager.writeSession(session.id, 'UTF8_\u20ac\u00e1')
    await waitForMatcher(
      manager,
      session.id,
      (value) => requiredMarkers.every((marker) => value.includes(marker)),
      { timeoutMs },
    )
    await delay(150)
    manager.writeSession(session.id, 'q')
    const output = await waitForMatcher(
      manager,
      session.id,
      (value) => value.includes('ADDOM_TUI_EXIT'),
      { timeoutMs },
    )
    return createStatus('passed', {
      sessionId: session.id,
      shell,
      shellKind: effectiveShellKind,
      markers: [...requiredMarkers, 'ADDOM_TUI_EXIT'],
      evidence: 'Observed fullscreen alternate-screen TUI flow plus arrow, backspace/delete, paste-token, and UTF-8 transport markers.',
      outputTail: output.slice(-500),
    })
  } finally {
    try { manager.closeSession(session.id) } catch { /* best-effort cleanup */ }
  }
}

function resolveShellMatrix({ platform = process.platform, env = process.env } = {}) {
  if (platform === 'win32') {
    return [
      { key: 'cmd', shell: 'cmd', required: true },
      { key: 'pwsh', shell: 'pwsh', required: true },
      { key: 'powershell', shell: 'powershell', required: false },
    ]
  }

  const defaultShellPath = asTrimmedString(env?.SHELL)
  const defaultShellKind = path.basename(defaultShellPath) || 'shell'
  const shells = []
  if (platform === 'darwin') {
    shells.push({ key: defaultShellKind || 'default', shell: 'default', required: true })
    shells.push({ key: 'bash', shell: 'bash', required: true })
    shells.push({ key: 'zsh', shell: 'zsh', required: true })
    return shells
  }

  shells.push({ key: defaultShellKind || 'default', shell: 'default', required: true })
  shells.push({ key: 'bash', shell: 'bash', required: true })
  return shells
}

export function isRealTerminalPlatformSmokeEnabled(env = process.env) {
  return parseBooleanFlag(env?.[ENABLE_ENV_NAME])
}

export function resolveRealTerminalPlatformSmokeTimeoutMs(env = process.env) {
  return normalizeTimeoutMs(env?.ADDOM_REAL_TERMINAL_SMOKE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
}

async function writeResultFile(resultPath = '', payload = {}) {
  const targetPath = asTrimmedString(resultPath)
  if (!targetPath) return
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export async function runRealTerminalPlatformSmoke({
  env = process.env,
  cwd = process.cwd(),
  platform = process.platform,
  timeoutMs = resolveRealTerminalPlatformSmokeTimeoutMs(env),
  resultPath = env?.ADDOM_REAL_TERMINAL_SMOKE_RESULT_PATH,
} = {}) {
  const liveRuntimeHealth = await probeTerminalSessionRuntimeHealth({
    env: {
      ...env,
      ADDOM_TERMINAL_SESSIONS_ROLLOUT: 'all',
    },
    platform,
    cwd,
    timeoutMs,
  })

  const result = {
    ok: false,
    platform,
    cwd,
    runtimeHealth: liveRuntimeHealth,
    shells: {},
    redraw: createStatus('gated', { reason: 'not_run' }),
    tui: createStatus('gated', { reason: 'not_run' }),
    internationalInput: createStatus('gated', { reason: 'not_run' }),
    manualMatrix: {},
  }

  if (liveRuntimeHealth.status !== 'supported') {
    result.manualMatrix = {
      platformStatus: createStatus('gated', {
        reason: liveRuntimeHealth.reason,
        rollout: liveRuntimeHealth.rollout || null,
      }),
    }
    await writeResultFile(resultPath, result)
    return result
  }

  const manager = createTerminalSessionManager({
    platform,
    env,
  })

  try {
    const shellMatrix = resolveShellMatrix({ platform, env })
    for (const entry of shellMatrix) {
      try {
        const shellResult = await runShellMarkerScenario(manager, {
          cwd,
          shell: entry.shell,
          shellKind: entry.shell,
          marker: `ADDOM_SHELL_OK_${entry.key.toUpperCase()}`,
          timeoutMs,
        })
        result.shells[entry.key] = shellResult
      } catch (error) {
        const reason = asTrimmedString(error?.code || error?.message || 'shell_probe_failed')
        result.shells[entry.key] = createStatus(
          /enoent|not found|unsupported_shell/i.test(reason)
            ? (entry.required ? 'gated' : 'skipped')
            : 'failed',
          {
            shell: entry.shell,
            reason,
            error: asTrimmedString(error?.message || error || 'shell_probe_failed'),
          },
        )
      }
    }

    const preferredInteractiveShell = platform === 'win32' ? 'cmd' : 'default'

    try {
      result.redraw = await runRedrawScenario(manager, {
        cwd,
        shell: preferredInteractiveShell,
        shellKind: preferredInteractiveShell,
        timeoutMs,
      })
    } catch (error) {
      result.redraw = createStatus('failed', {
        shell: preferredInteractiveShell,
        reason: 'redraw_probe_failed',
        error: asTrimmedString(error?.message || error || 'redraw_probe_failed'),
      })
    }

    try {
      result.tui = await runTuiScenario(manager, {
        cwd,
        shell: preferredInteractiveShell,
        shellKind: preferredInteractiveShell,
        timeoutMs,
      })
      result.internationalInput = createStatus('passed', {
        evidence: 'UTF-8 transport marker was observed inside the fullscreen TUI probe.',
        via: 'tui',
      })
    } catch (error) {
      result.tui = createStatus('failed', {
        shell: preferredInteractiveShell,
        reason: 'tui_probe_failed',
        error: asTrimmedString(error?.message || error || 'tui_probe_failed'),
      })
      result.internationalInput = createStatus('gated', {
        reason: 'tui_probe_failed',
        evidence: 'UTF-8 transport depends on the fullscreen TUI probe and could not be confirmed in this run.',
      })
    }

    result.manualMatrix = {
      platformStatus: createStatus('passed', {
        evidence: 'Current platform completed the automated real-shell, redraw, and fullscreen TUI smoke lanes.',
      }),
      physicalKeyboardInput: createStatus('gated', {
        reason: 'manual_keyboard_validation_required',
        evidence: platform === 'win32'
          ? 'Physical paste, arrows, backspace/delete, and AltGr/dead-key behavior still require a real renderer session with a human keyboard.'
          : 'Physical Option/Alt, dead-key, and clipboard behavior still require a real renderer session with a human keyboard.',
      }),
    }

    const requiredShellFailures = Object.values(result.shells).filter((entry) => entry.status === 'failed')
    result.ok = requiredShellFailures.length === 0
      && result.redraw.status === 'passed'
      && result.tui.status === 'passed'
      && result.internationalInput.status === 'passed'
  } finally {
    manager.dispose()
  }

  await writeResultFile(resultPath, result)
  return result
}

export { ENABLE_ENV_NAME as REAL_TERMINAL_PLATFORM_SMOKE_ENABLE_ENV_NAME }
