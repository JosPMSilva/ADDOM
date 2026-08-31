import { getManagedAgentRuntime } from '../agents/managed-agent-runtime-singleton.mjs'

export async function settleProviderStreamWithCollaboration(streamPromise, collaborationIngest) {
  let streamResult
  try {
    streamResult = await streamPromise
  } catch (providerError) {
    try {
      await collaborationIngest.drain()
    } catch (ingestError) {
      throw new AggregateError(
        [providerError, ingestError],
        'Provider stream and collaboration persistence both failed',
      )
    }
    throw providerError
  }
  await collaborationIngest.complete()
  return streamResult
}

/**
 * Builds a per-turn serialized OpenAI account collaboration → agent-run ingest hook.
 * Callers assign the returned chain holder so overlapping events cannot race ensureRun.
 */
export function createOpenAICollaborationIngestHandler({
  providerId = '',
  projectId = '',
  threadId = '',
  turnId = '',
  modelId = '',
  getRuntime = getManagedAgentRuntime,
} = {}) {
  let collaborationIngestChain = Promise.resolve()
  const onEvent = (collaborationEvent = {}) => {
    if (String(providerId || '').trim().toLowerCase() !== 'openai') return
    if (!projectId || !threadId || !turnId) {
      console.warn('[chat] OpenAI collaboration event dropped: missing project/thread/turn scope', {
        hasProjectId: Boolean(projectId),
        hasThreadId: Boolean(threadId),
        hasTurnId: Boolean(turnId),
      })
      return
    }
    collaborationIngestChain = collaborationIngestChain.then(() => (
      getRuntime().ingestOpenAIAccountCollaboration({
        projectId,
        threadId,
        turnId,
        modelId,
        event: collaborationEvent,
      })
    ))
    void collaborationIngestChain.catch(() => {})
  }
  onEvent.drain = () => collaborationIngestChain
  onEvent.complete = async () => {
    if (String(providerId || '').trim().toLowerCase() !== 'openai') return null
    await collaborationIngestChain
    return getRuntime().finalizeOpenAIAccountCollaboration({
      projectId,
      threadId,
      turnId,
    })
  }
  return onEvent
}
