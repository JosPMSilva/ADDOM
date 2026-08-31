import {
  cloneSerializable,
  deepFreeze,
  validateEnum,
  validateInteger,
  validateString,
} from '../../../common/agents/agent-contract-utils.mjs'

export const AGENT_PROVIDER_EVENT_KINDS = Object.freeze([
  'created',
  'node_discovered',
  'assistant_delta',
  'commentary',
  'reasoning',
  'tool_started',
  'tool_output',
  'tool_completed',
  'message',
  'status',
  'result',
  'error',
  'disconnected',
])

export const AGENT_PROVIDER_TERMINAL_STATUSES = Object.freeze([
  'completed',
  'failed',
  'cancelled',
  'interrupted',
])

function validateTerminalResult(input) {
  const source = cloneSerializable(input, 'provider terminal result')
  return deepFreeze({
    ...source,
    status: validateEnum(
      source.status,
      'provider terminal result.status',
      AGENT_PROVIDER_TERMINAL_STATUSES,
    ),
    summary: typeof source.summary === 'string' ? source.summary.trim() : null,
    errorCode: typeof source.errorCode === 'string' ? source.errorCode.trim() : null,
  })
}

function disconnectedResult(payload) {
  const reason = typeof payload?.reason === 'string' && payload.reason.trim()
    ? payload.reason.trim()
    : 'provider_disconnected'
  return validateTerminalResult({
    status: 'interrupted',
    summary: `Provider disconnected: ${reason}`,
    errorCode: 'PROVIDER_DISCONNECTED',
  })
}

export function createProviderEventNormalizer({ diagnosticsNamespace }) {
  const namespace = validateString(
    diagnosticsNamespace,
    'provider event diagnosticsNamespace',
    { maxLength: 256 },
  )
  const seenEventIds = new Set()
  let terminalResult = null

  function reject(reason, error = null) {
    return deepFreeze({ accepted: false, reason, event: null, error })
  }

  function normalize(input) {
    try {
      const providerEventId = validateString(
        input?.providerEventId,
        'provider event providerEventId',
        { maxLength: 1_024 },
      )
      if (seenEventIds.has(providerEventId)) return reject('duplicate')
      if (terminalResult) return reject('late_after_terminal')
      const kind = validateEnum(input.kind, 'provider event kind', AGENT_PROVIDER_EVENT_KINDS)
      const occurredAt = validateInteger(input.occurredAt, 'provider event occurredAt')
      const payload = kind === 'result'
        ? validateTerminalResult(input.payload)
        : kind === 'disconnected'
          ? disconnectedResult(input.payload)
          : cloneSerializable(input.payload ?? {}, 'provider event payload')
      const normalizedKind = kind === 'disconnected' ? 'result' : kind
      const diagnostics = input.providerMetadata === undefined
        ? null
        : { [namespace]: cloneSerializable(input.providerMetadata, 'provider event metadata') }
      const event = deepFreeze({
        providerEventId,
        kind: normalizedKind,
        occurredAt,
        payload,
        diagnostics,
      })
      seenEventIds.add(providerEventId)
      if (normalizedKind === 'result') terminalResult = payload
      return deepFreeze({ accepted: true, reason: null, event, error: null })
    } catch (error) {
      return reject('invalid', String(error?.message || error))
    }
  }

  function state() {
    return deepFreeze({
      terminal: terminalResult !== null,
      terminalResult,
      seenEventCount: seenEventIds.size,
    })
  }

  return Object.freeze({ normalize, state })
}
