import {
  canonicalManagedUsage,
  clipAgentText,
} from './agent-managed-runtime-values.mjs'
import { buildChildFinalContinuation } from './agent-orchestrator-synthesis.mjs'

export function completeManagedAttemptWithFinalMessage({
  correlation,
  conversationRepository = null,
  db = null,
  draft,
  entry,
  eventStore,
  messageBroker,
  node,
  result,
  runService,
  syncRunCounts,
}) {
  const finalMessage = clipAgentText(result.summary, 200_000)
  let completedConversationTurn = null
  const persist = () => {
    eventStore.append(draft('agent_final_message', {
      runId: entry.runId,
      nodeId: node.id,
      parentNodeId: node.parentNodeId,
      attemptId: entry.attemptId,
      providerCorrelationKey: correlation,
      payload: { text: finalMessage },
      suffix: entry.attemptId,
    }))
    completedConversationTurn = conversationRepository?.appendFinalForAttempt({
      attemptId: entry.attemptId,
      text: finalMessage,
    })
    if (completedConversationTurn && node.parentNodeId) {
      messageBroker.returnChildFinal({
        runId: entry.runId,
        fromNodeId: node.id,
        toNodeId: node.parentNodeId,
        continuation: buildChildFinalContinuation({
          conversationId: completedConversationTurn.conversation.id,
          turnId: completedConversationTurn.turn.id,
          nodeId: node.id,
          finalMessageId: completedConversationTurn.message.id,
          status: completedConversationTurn.turn.status,
          provenance: { authorKind: 'agent', authorId: node.id },
          conclusion: finalMessage,
        }),
      })
    }
    runService.completeAttempt({
      attemptId: entry.attemptId,
      resultSummary: clipAgentText(finalMessage),
      usage: canonicalManagedUsage(result.usage),
    })
    syncRunCounts(entry.runId)
  }
  if (db?.transaction) db.transaction(persist)()
  else persist()
  return finalMessage
}

/** Return an inspectable terminal child result to the direct parent without prose-only transport. */
export function returnManagedTerminalContinuation({
  attemptId,
  conclusion,
  conversationRepository,
  messageBroker,
  repository,
  status,
} = {}) {
  const binding = conversationRepository?.getTurnBindingForAttempt(attemptId)
  if (!binding) return null
  const projection = conversationRepository.getConversationProjection(binding.conversationId)
  const turn = projection?.turns.find((candidate) => candidate.id === binding.turnId)
  if (!turn?.executionRunId || !turn.executionNodeId) return null
  const graph = turn.executionNodeId
  // The durable turn remains the source of displayed detail; the run graph
  // supplies only the direct parent routing identity.
  const parentNodeId = repository?.getRunGraph?.(turn.executionRunId)?.nodes
    .find((node) => node.id === graph)?.parentNodeId
  if (!parentNodeId) return null
  return messageBroker.returnChildFinal({
    runId: turn.executionRunId,
    fromNodeId: graph,
    toNodeId: parentNodeId,
    continuation: buildChildFinalContinuation({
      conversationId: binding.conversationId,
      turnId: binding.turnId,
      nodeId: graph,
      finalMessageId: turn.finalMessageId,
      status,
      provenance: { authorKind: 'agent', authorId: graph },
      conclusion,
    }),
  })
}
