import { commitProjectedTimelineEvent } from './canonical-root-event-writer.mjs'

export function createProviderToolStatusHandler({
  send = () => {},
  persistTimelineEvent = () => {},
  threadId = '',
  turnId = '',
  round = 0,
  providerId = '',
  model = '',
} = {}) {
  let sequence = 0
  return (statusPayload = {}) => {
    sequence += 1
    const payload = {
      threadId,
      turnId,
      round,
      sequence,
      providerId: String(providerId || ''),
      model: String(model || ''),
      ...statusPayload,
    }
    if (statusPayload?.durable !== true) {
      send('chat:provider-tool-status', payload)
      return
    }
    const statusKey = String(
      statusPayload.toolCallId || statusPayload.itemId || statusPayload.toolName || 'status',
    ).trim()
    commitProjectedTimelineEvent({
      persistTimelineEvent, send, kind: 'provider_tool_status',
      options: {
        role: 'assistant',
        content: String(statusPayload.delta || statusPayload.toolName || 'Provider activity'),
        meta: payload,
        lifecycle: 'active',
        progressiveKey: `provider_tool_status:${round}:${statusKey}`,
      },
      channel: 'chat:provider-tool-status', payload,
    })
  }
}

export function createProviderWarningHandler({
  providerId = '',
  sendNotice = () => {},
} = {}) {
  return (warningPayload = {}) => {
    const noticeKind = String(warningPayload?.meta?.noticeKind || '').trim().toLowerCase()
    const reason = String(warningPayload?.meta?.reason || '').trim().toLowerCase()
    if (noticeKind !== 'provider_protocol_drift' && reason !== 'unrecognized_provider_activity') {
      sendNotice(warningPayload)
      return
    }
    console.info('[provider-protocol-drift]', {
      providerId: String(warningPayload?.meta?.providerId || providerId || ''),
      protocolMethod: String(warningPayload?.meta?.protocolMethod || ''),
      protocolItemType: String(warningPayload?.meta?.protocolItemType || ''),
      runtimeVersion: String(warningPayload?.meta?.runtimeVersion || ''),
    })
  }
}
