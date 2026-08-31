import {
  normalizeGeneratedArtifacts,
  stageGeneratedArtifactsFromProviderOutput,
} from './generated-artifact-contract.mjs'
import { commitProjectedTimelineEvent } from './canonical-root-event-writer.mjs'

export function createProviderGeneratedArtifactRuntime({
  projectId = '',
  threadId = '',
  turnId = '',
  round = 0,
  providerId = '',
  model = '',
  send = () => {},
  persistTimelineEvent = () => {},
} = {}) {
  const generatedArtifacts = []
  const pendingTasks = []

  const handleProviderToolOutput = (outputPayload = {}) => {
    const task = (async () => {
      let staged = { artifacts: [], errors: [] }
      try {
        staged = await stageGeneratedArtifactsFromProviderOutput({
          projectId,
          threadId,
          turnId,
          providerToolOutput: outputPayload,
        })
      } catch (error) {
        staged = {
          artifacts: [],
          errors: [{ error: 'generated_artifact_stage_failed' }],
        }
        console.warn('[generated-artifact] failed to cache provider output:', error?.message || error)
      }
      if (staged.errors.length > 0) {
        console.info('[generated-artifact] provider output was retained without a cached preview', {
          providerId: String(providerId || ''),
          toolName: String(outputPayload?.toolName || ''),
          errorCodes: staged.errors.map((entry) => String(entry?.error || '')).filter(Boolean),
        })
      }
      generatedArtifacts.push(...staged.artifacts)
      const payload = {
        threadId,
        turnId,
        round,
        providerId: String(providerId || ''),
        model: String(model || ''),
        ...outputPayload,
        ...(staged.artifacts.length > 0 ? { generatedArtifacts: staged.artifacts } : {}),
      }
      commitProjectedTimelineEvent({
        persistTimelineEvent, send, kind: 'provider_tool_output',
        options: {
          role: 'assistant',
          content: String(outputPayload.toolName || 'Provider tool output'),
          meta: payload,
        },
        channel: 'chat:provider-tool-output', payload,
      })
    })()
    pendingTasks.push(task)
  }

  return {
    handleProviderToolOutput,
    async settle() {
      await Promise.allSettled(pendingTasks)
    },
    snapshot() {
      return normalizeGeneratedArtifacts(generatedArtifacts)
    },
  }
}
