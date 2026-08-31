import { stripAnsiControlSequences } from './ansi-output.mjs'

export function normalizeProviderCommandOutput(payload = {}) {
  if (String(payload?.toolName || '').trim() !== 'command_execution') return null
  const output = payload?.output
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null
  const suppliedToolInput = payload?.toolInput && typeof payload.toolInput === 'object'
    ? payload.toolInput
    : {}
  const exitCode = Number(output.exitCode)
  const durationMs = Number(output.durationMs)
  const status = String(output.status || '').trim().toLowerCase()
  return {
    toolName: 'run_command',
    toolInput: {
      ...suppliedToolInput,
      command: String(output.command || suppliedToolInput.command || ''),
      cwd: String(output.cwd || suppliedToolInput.cwd || ''),
    },
    detail: stripAnsiControlSequences(String(output.aggregatedOutput || output.output || '')).trim(),
    isError: ['failed', 'error', 'cancelled'].includes(status)
      || (Number.isFinite(exitCode) && exitCode !== 0),
    ...(Number.isFinite(exitCode) ? { exitCode } : {}),
    ...(Number.isFinite(durationMs) ? { durationMs } : {}),
  }
}
