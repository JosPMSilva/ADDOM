import { createAgentMessageBroker } from './agent-message-broker.mjs'
import { returnManagedTerminalContinuation } from './agent-managed-final-message.mjs'

export function createManagedTerminalContinuations({
  conversationLifecycle,
  conversationRepository,
  eventStore,
  executionInputs,
  idFactory,
  now,
  repository,
} = {}) {
  const messageBroker = createAgentMessageBroker({
    eventStore,
    repository,
    now,
    messageIdFactory: () => idFactory('message'),
    onContinuation({ toNodeId, continuation }) {
      const input = executionInputs.get(toNodeId)
      if (input) input.inbox.push({ kind: 'child_turn_final', continuation })
    },
  })
  const returnTerminal = ({ attemptId, status, conclusion }) => returnManagedTerminalContinuation({
    attemptId,
    conclusion,
    conversationRepository,
    messageBroker,
    repository,
    status,
  })
  return Object.freeze({
    fail({ attemptId, conclusion }) {
      conversationLifecycle.fail(attemptId)
      return returnTerminal({ attemptId, status: 'failed', conclusion })
    },
    messageBroker,
    cancelMany(attemptIds) {
      conversationLifecycle.cancelMany(attemptIds)
      for (const attemptId of attemptIds) {
        returnTerminal({
          attemptId,
          status: 'cancelled',
          conclusion: 'Child turn was cancelled before it could complete.',
        })
      }
    },
  })
}
