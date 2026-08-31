import { normalizeId } from './openai-account-bridge-shared.mjs'

export function mapSpawnFailureReason(error) {
  const code = normalizeId(error?.code).toUpperCase()
  if (code === 'ENOENT') {
    return {
      reason: 'bridge_executable_not_found',
      message: 'Codex app-server could not be started because the Codex executable was not found.',
    }
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return {
      reason: 'bridge_executable_not_accessible',
      message: 'Codex app-server could not be started because the Codex executable is not launchable from this environment.',
    }
  }
  return {
    reason: 'bridge_spawn_failed',
    message: normalizeId(error?.message) || 'Codex app-server failed to start.',
  }
}

export function mapProbeFailureReason(error) {
  const mapped = mapSpawnFailureReason(error)
  if (mapped.reason === 'bridge_spawn_failed') {
    return {
      reason: 'bridge_probe_failed',
      message: mapped.message,
    }
  }
  return mapped
}

export function mapProcessExitReason(code, signal) {
  const normalizedSignal = normalizeId(signal)
  if (normalizedSignal) {
    return {
      reason: 'bridge_process_exited',
      message: `Codex app-server exited with signal ${normalizedSignal}.`,
    }
  }
  return {
    reason: 'bridge_process_exited',
    message: `Codex app-server exited with code ${Number(code ?? 0) || 0}.`,
  }
}
