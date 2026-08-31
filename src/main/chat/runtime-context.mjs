import { getGlobalRunCommandPolicyTelemetrySnapshot } from './run-command-policy-telemetry.mjs'

export function getRuntimeContextSnapshot() {
  const platform = String(process.platform || '')
  const isWindows = platform === 'win32'
  const isMacOS = platform === 'darwin'
  const osFamily = isWindows ? 'windows' : isMacOS ? 'macos' : 'linux'

  let shellHint = 'unknown'
  if (isWindows) {
    shellHint = 'powershell'
  } else {
    const rawShell = String(process.env.SHELL || '').trim()
    if (rawShell) {
      const normalized = rawShell.replace(/\\/g, '/')
      shellHint = normalized.split('/').pop() || rawShell
    }
  }

  const telemetry = getGlobalRunCommandPolicyTelemetrySnapshot()

  return {
    osFamily,
    platform,
    arch: String(process.arch || 'unknown'),
    pathStyle: isWindows ? 'windows' : 'posix',
    shellHint,
    runCommandDefaultShell: 'auto',
    terminalToolCycles: Number(telemetry?.counters?.terminalToolCycles || 0) || 0,
    terminalWaitTimeouts: Number(telemetry?.counters?.terminalWaitTimeouts || 0) || 0,
    terminalLoopAlerts: Number(telemetry?.counters?.terminalLoopAlerts || 0) || 0,
  }
}

export function buildRuntimeContextBlock() {
  const ctx = getRuntimeContextSnapshot()
  return [
    '[ADDOM Runtime Context]',
    `os_family=${ctx.osFamily}`,
    `platform=${ctx.platform}`,
    `arch=${ctx.arch}`,
    `path_style=${ctx.pathStyle}`,
    `shell_hint=${ctx.shellHint}`,
    `run_command_default_shell=${ctx.runCommandDefaultShell}`,
    `terminal_tool_cycles=${ctx.terminalToolCycles}`,
    `terminal_wait_timeouts=${ctx.terminalWaitTimeouts}`,
    `terminal_loop_alerts=${ctx.terminalLoopAlerts}`,
  ].join('\n')
}
