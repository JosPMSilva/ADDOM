import {
  buildSessionSummaryFromBridge,
  normalizeAuthMode,
} from './openai-account-auth-session-summary.mjs'
import { mapBridgeError } from './openai-account-auth-bridge-errors.mjs'

export async function refreshOpenAIAccountServiceState(service) {
  service.reloadFromDisk({ emit: false })
  service.reconcileTimedOutLogin({ emit: true })
  const availability = await service.probeBridgeAvailability()
  const bridge = availability.supported === true ? service.getBridge() : null
  if (availability.supported !== true || !bridge || typeof bridge.readAccount !== 'function') {
    service.syncAvailability(availability, { emit: true })
    return service.getState()
  }

  try {
    const account = await bridge.readAccount({})
    let rateLimitSummary = null
    let collaborationModes = service.sessionSummary?.collaborationModes
    try {
      rateLimitSummary = await bridge.readRateLimits()
    } catch {
      // Non-fatal. Account summary should still update.
    }
    if (normalizeAuthMode(account) === 'chatgpt' && typeof bridge.listCollaborationModes === 'function') {
      try {
        collaborationModes = await bridge.listCollaborationModes({ forceReload: false })
      } catch {
        // Non-fatal. Account summary should still update.
      }
    }
    service.setSessionSummary(buildSessionSummaryFromBridge(account, {
      rateLimitSummary,
      collaborationModes,
      availability,
      now: service.now(),
    }))
    return service.getState()
  } catch (error) {
    const mapped = mapBridgeError(
      error,
      'bridge_account_read_failed',
      'OpenAI account state could not be refreshed.',
    )
    service.setSessionSummary({
      ...service.sessionSummary,
      hasSession: false,
      status: 'error',
      updatedAt: service.now(),
      lastErrorCode: mapped.reason,
      lastErrorMessage: mapped.message,
    })
    return service.getState()
  }
}
