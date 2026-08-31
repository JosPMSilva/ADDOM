import {
  cloneContractInput,
  deepFreeze,
  validateEnum,
  validateInternalId,
  validateOptionalString,
  validateSchemaVersion,
  validateString,
} from './agent-contract-utils.mjs'

const TERMINAL_CHILD_STATUSES = Object.freeze(['completed', 'failed', 'cancelled'])

function validateProvenance(value) {
  const source = cloneContractInput(value, 'orchestration continuation provenance')
  return {
    authorKind: validateEnum(source.authorKind, 'orchestration continuation provenance.authorKind', [
      'user', 'orchestrator', 'agent', 'system',
    ]),
    authorId: validateInternalId(source.authorId, 'orchestration continuation provenance.authorId'),
  }
}

export function validateChildFinalContinuation(input) {
  const source = cloneContractInput(input, 'child final continuation')
  validateSchemaVersion(source.schemaVersion)
  const reference = cloneContractInput(source.source, 'child final continuation.source')
  if (source.kind !== 'child_turn_final') {
    throw new TypeError('child final continuation.kind must be child_turn_final')
  }
  return deepFreeze({
    schemaVersion: 1,
    kind: 'child_turn_final',
    source: {
      conversationId: validateInternalId(reference.conversationId, 'child final continuation.source.conversationId'),
      turnId: validateInternalId(reference.turnId, 'child final continuation.source.turnId'),
      nodeId: validateInternalId(reference.nodeId, 'child final continuation.source.nodeId'),
      finalMessageId: validateOptionalString(reference.finalMessageId, 'child final continuation.source.finalMessageId', { maxLength: 256 }),
    },
    status: validateEnum(source.status, 'child final continuation.status', TERMINAL_CHILD_STATUSES),
    provenance: validateProvenance(source.provenance),
    conclusion: validateString(source.conclusion, 'child final continuation.conclusion', {
      maxLength: 2_000,
      allowWhitespaceControl: true,
    }),
    artifacts: Object.freeze([]),
    inspectable: source.inspectable === true,
  })
}

export function validateAgentOrchestrationContinuation(input) {
  return validateChildFinalContinuation(input)
}
