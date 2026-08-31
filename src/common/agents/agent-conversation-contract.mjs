import {
  cloneContractInput,
  deepFreeze,
  validateEnum,
  validateInteger,
  validateInternalId,
  validateOptionalString,
  validateSchemaVersion,
  validateString,
  validateTerminalTimestamps,
  validateTimestamp,
} from './agent-contract-utils.mjs'
import { AGENT_ARTIFACT_KINDS } from './agent-artifact-contract.mjs'

const AUTHOR_KINDS = Object.freeze(['user', 'orchestrator', 'agent', 'system'])
const CONVERSATION_SCOPES = Object.freeze(['nested_agent'])
const CONVERSATION_STATUSES = Object.freeze(['idle', 'active', 'completed', 'unavailable', 'archived'])
const TURN_STATUSES = Object.freeze(['pending', 'queued', 'running', 'waiting', 'completed', 'failed', 'cancelled'])
const TURN_TERMINAL_STATUSES = Object.freeze(['completed', 'failed', 'cancelled'])
const MESSAGE_KINDS = Object.freeze(['authored', 'final', 'system'])
const MAILBOX_STATES = Object.freeze(['queued', 'leased', 'delivered', 'cancelled', 'failed'])
const CONTENT_PART_KINDS = Object.freeze(['markdown', 'text', 'link', 'file', 'citation', 'image'])
const CONTENT_PART_STATUSES = Object.freeze(['completed', 'failed', 'cancelled'])

function validateAuthor(kind, id, field) {
  return {
    kind: validateEnum(kind, `${field}Kind`, AUTHOR_KINDS),
    id: validateInternalId(id, `${field}Id`),
  }
}

function validateProviderRoute(value) {
  const route = cloneContractInput(value, 'conversation.providerRoute')
  return {
    providerId: validateString(route.providerId, 'conversation.providerRoute.providerId', { maxLength: 512 }),
    modelId: validateString(route.modelId, 'conversation.providerRoute.modelId', { maxLength: 1_024 }),
  }
}

function validateContentPart(value, index) {
  const part = cloneContractInput(value, `message.contentParts[${index}]`)
  const kind = validateEnum(part.kind, `message.contentParts[${index}].kind`, CONTENT_PART_KINDS)
  const metadata = {
    ...(part.partId == null ? {} : {
      partId: validateInternalId(part.partId, `message.contentParts[${index}].partId`),
    }),
    ...(part.appendOrder == null ? {} : {
      appendOrder: validateInteger(part.appendOrder, `message.contentParts[${index}].appendOrder`, { min: 1 }),
    }),
    ...(part.status == null ? {} : {
      status: validateEnum(part.status, `message.contentParts[${index}].status`, CONTENT_PART_STATUSES),
    }),
  }
  if (kind === 'markdown' || kind === 'text' || kind === 'citation') {
    return { kind, text: validateString(part.text, `message.contentParts[${index}].text`, {
      maxLength: 200_000,
      allowWhitespaceControl: true,
    }), ...metadata }
  }
  if (kind === 'link') {
    return {
      kind,
      label: validateString(part.label, `message.contentParts[${index}].label`, { maxLength: 4_000 }),
      href: validateString(part.href, `message.contentParts[${index}].href`, { maxLength: 8_000 }),
      ...metadata,
    }
  }
  return {
    kind,
    id: validateInternalId(part.id, `message.contentParts[${index}].id`),
    label: validateString(part.label, `message.contentParts[${index}].label`, { maxLength: 4_000 }),
    ...metadata,
  }
}

export function validateAgentConversation(input) {
  const source = cloneContractInput(input, 'agent conversation')
  validateSchemaVersion(source.schemaVersion)
  const owner = validateAuthor(source.ownerKind, source.ownerId, 'conversation.owner')
  const creator = validateAuthor(source.createdByKind, source.createdById, 'conversation.createdBy')
  const createdAt = validateTimestamp(source.createdAt, 'conversation.createdAt')
  const updatedAt = validateTimestamp(source.updatedAt, 'conversation.updatedAt')
  if (updatedAt < createdAt) throw new TypeError('conversation.updatedAt cannot be earlier than createdAt')
  return deepFreeze({
    schemaVersion: 1,
    id: validateInternalId(source.id, 'conversation.id'),
    projectId: validateInternalId(source.projectId, 'conversation.projectId'),
    rootThreadId: validateInternalId(source.rootThreadId, 'conversation.rootThreadId'),
    parentConversationId: validateOptionalString(source.parentConversationId, 'conversation.parentConversationId', { maxLength: 256 }),
    creatorTurnId: validateOptionalString(source.creatorTurnId, 'conversation.creatorTurnId', { maxLength: 256 }),
    ownerKind: owner.kind,
    ownerId: owner.id,
    createdByKind: creator.kind,
    createdById: creator.id,
    roleId: validateString(source.roleId, 'conversation.roleId', { maxLength: 256 }),
    providerRoute: validateProviderRoute(source.providerRoute),
    scope: validateEnum(source.scope, 'conversation.scope', CONVERSATION_SCOPES),
    status: validateEnum(source.status, 'conversation.status', CONVERSATION_STATUSES),
    createdAt,
    updatedAt,
  })
}

export function validateAgentTurn(input) {
  const source = cloneContractInput(input, 'agent turn')
  validateSchemaVersion(source.schemaVersion)
  const author = validateAuthor(source.authorKind, source.authorId, 'turn.author')
  const status = validateEnum(source.status, 'turn.status', TURN_STATUSES)
  const createdAt = validateTimestamp(source.createdAt, 'turn.createdAt')
  const startedAt = validateTimestamp(source.startedAt, 'turn.startedAt', { nullable: true })
  const finishedAt = validateTimestamp(source.finishedAt, 'turn.finishedAt', { nullable: true })
  if (startedAt !== null && startedAt < createdAt) throw new TypeError('turn.startedAt cannot be earlier than createdAt')
  validateTerminalTimestamps(status, TURN_TERMINAL_STATUSES, startedAt, finishedAt)
  return deepFreeze({
    schemaVersion: 1,
    id: validateInternalId(source.id, 'turn.id'),
    conversationId: validateInternalId(source.conversationId, 'turn.conversationId'),
    sequence: validateInteger(source.sequence, 'turn.sequence', { min: 1 }),
    authorKind: author.kind,
    authorId: author.id,
    sourceTurnId: validateOptionalString(source.sourceTurnId, 'turn.sourceTurnId', { maxLength: 256 }),
    requestedAction: validateString(source.requestedAction, 'turn.requestedAction', { maxLength: 128 }),
    idempotencyKey: validateString(source.idempotencyKey, 'turn.idempotencyKey', { maxLength: 512 }),
    status,
    finalMessageId: validateOptionalString(source.finalMessageId, 'turn.finalMessageId', { maxLength: 256 }),
    createdAt,
    startedAt,
    finishedAt,
  })
}

export function validateAgentMessage(input) {
  const source = cloneContractInput(input, 'agent message')
  validateSchemaVersion(source.schemaVersion)
  const author = validateAuthor(source.authorKind, source.authorId, 'message.author')
  if (!Array.isArray(source.contentParts) || source.contentParts.length === 0) {
    throw new TypeError('message.contentParts must contain at least one registered content part')
  }
  return deepFreeze({
    schemaVersion: 1,
    id: validateInternalId(source.id, 'message.id'),
    conversationId: validateInternalId(source.conversationId, 'message.conversationId'),
    turnId: validateInternalId(source.turnId, 'message.turnId'),
    sequence: validateInteger(source.sequence, 'message.sequence', { min: 1 }),
    kind: validateEnum(source.kind, 'message.kind', MESSAGE_KINDS),
    authorKind: author.kind,
    authorId: author.id,
    sourceConversationId: validateOptionalString(source.sourceConversationId, 'message.sourceConversationId', { maxLength: 256 }),
    sourceTurnId: validateOptionalString(source.sourceTurnId, 'message.sourceTurnId', { maxLength: 256 }),
    idempotencyKey: validateString(source.idempotencyKey, 'message.idempotencyKey', { maxLength: 512 }),
    contentParts: source.contentParts.map(validateContentPart),
    createdAt: validateTimestamp(source.createdAt, 'message.createdAt'),
  })
}

export function validateAgentMailboxEntry(input) {
  const source = cloneContractInput(input, 'agent mailbox entry')
  validateSchemaVersion(source.schemaVersion)
  const author = validateAuthor(source.authorKind, source.authorId, 'mailbox.author')
  const deliveryState = validateEnum(source.deliveryState, 'mailbox.deliveryState', MAILBOX_STATES)
  const createdAt = validateTimestamp(source.createdAt, 'mailbox.createdAt')
  const deliveredAt = validateTimestamp(source.deliveredAt, 'mailbox.deliveredAt', { nullable: true })
  const deliveryLeaseId = validateOptionalString(source.deliveryLeaseId, 'mailbox.deliveryLeaseId', { maxLength: 256 })
  const deliveryLeaseExpiresAt = validateTimestamp(source.deliveryLeaseExpiresAt ?? null, 'mailbox.deliveryLeaseExpiresAt', { nullable: true })
  const deliveryAttempts = validateInteger(source.deliveryAttempts ?? 0, 'mailbox.deliveryAttempts', { min: 0 })
  if (deliveryState === 'delivered' && deliveredAt === null) throw new TypeError('mailbox.deliveredAt is required for delivered entries')
  if (deliveryState !== 'delivered' && deliveredAt !== null) throw new TypeError('mailbox.deliveredAt is only valid for delivered entries')
  if (deliveryState === 'leased' && (!deliveryLeaseId || deliveryLeaseExpiresAt === null)) {
    throw new TypeError('leased mailbox entries require delivery lease identity and expiry')
  }
  if (deliveryState !== 'leased' && (deliveryLeaseId !== null || deliveryLeaseExpiresAt !== null)) {
    throw new TypeError('mailbox delivery lease fields are only valid for leased entries')
  }
  if (deliveredAt !== null && deliveredAt < createdAt) throw new TypeError('mailbox.deliveredAt cannot be earlier than createdAt')
  return deepFreeze({
    schemaVersion: 1,
    id: validateInternalId(source.id, 'mailbox.id'),
    messageId: validateInternalId(source.messageId, 'mailbox.messageId'),
    conversationId: validateInternalId(source.conversationId, 'mailbox.conversationId'),
    targetTurnId: validateOptionalString(source.targetTurnId, 'mailbox.targetTurnId', { maxLength: 256 }),
    authorKind: author.kind,
    authorId: author.id,
    enqueueSequence: validateInteger(source.enqueueSequence, 'mailbox.enqueueSequence', { min: 1 }),
    deliveryState,
    idempotencyKey: validateString(source.idempotencyKey, 'mailbox.idempotencyKey', { maxLength: 512 }),
    createdAt,
    deliveredAt,
    deliveryLeaseId,
    deliveryLeaseExpiresAt,
    deliveryAttempts,
  })
}

export function validateAgentPromotionSnapshot(input) {
  const source = cloneContractInput(input, 'agent promotion snapshot')
  validateSchemaVersion(source.schemaVersion)
  const providerProvenance = validateProviderRoute({ providerId: source.providerProvenance?.providerId, modelId: source.providerProvenance?.modelId })
  const sourceRoute = cloneContractInput(source.sourceRoute, 'promotion.sourceRoute')
  const content = cloneContractInput(source.content, 'promotion.content')
  if (!Array.isArray(content.messages)) throw new TypeError('promotion.content.messages must be an array')
  const toolResults = Array.isArray(content.toolResults) ? content.toolResults.map((entry, index) => {
    const item = cloneContractInput(entry, `promotion.content.toolResults[${index}]`)
    return {
      toolName: validateString(item.toolName, `promotion.content.toolResults[${index}].toolName`, { maxLength: 256 }),
      summary: validateString(item.summary, `promotion.content.toolResults[${index}].summary`, { maxLength: 24_000, allowWhitespaceControl: true }),
    }
  }) : []
  const artifacts = Array.isArray(content.artifacts) ? content.artifacts.map((entry, index) => {
    const item = cloneContractInput(entry, `promotion.content.artifacts[${index}]`)
    const status = validateEnum(item.status, `promotion.content.artifacts[${index}].status`, ['unmerged', 'merged', 'discarded'])
    return {
      id: validateInternalId(item.id, `promotion.content.artifacts[${index}].id`),
      kind: validateEnum(item.kind, `promotion.content.artifacts[${index}].kind`, AGENT_ARTIFACT_KINDS),
      label: validateString(item.label, `promotion.content.artifacts[${index}].label`, { maxLength: 4_000 }),
      digest: validateOptionalString(item.digest, `promotion.content.artifacts[${index}].digest`, { maxLength: 256 }),
      sizeBytes: validateInteger(item.sizeBytes, `promotion.content.artifacts[${index}].sizeBytes`, { min: 0 }),
      status,
    }
  }) : []
  const authority = cloneContractInput(source.authority, 'promotion.authority')
  for (const field of ['permissions', 'approvals', 'providerContinuation', 'workspace', 'stagedWrites', 'merge']) {
    if (authority[field] !== 'reset') throw new TypeError(`promotion.authority.${field} must reset at the root-thread boundary`)
  }
  return deepFreeze({
    schemaVersion: 1,
    id: validateInternalId(source.id, 'promotion.id'),
    sourceConversationId: validateInternalId(source.sourceConversationId, 'promotion.sourceConversationId'),
    sourceTurnId: validateInternalId(source.sourceTurnId, 'promotion.sourceTurnId'),
    sourceSequence: validateInteger(source.sourceSequence, 'promotion.sourceSequence', { min: 1 }),
    sourceRoleId: validateString(source.sourceRoleId, 'promotion.sourceRoleId', { maxLength: 256 }),
    sourceRoleLabel: validateOptionalString(source.sourceRoleLabel, 'promotion.sourceRoleLabel', { maxLength: 256 })
      || validateString(source.sourceRoleId, 'promotion.sourceRoleId', { maxLength: 256 }),
    sourceRoute: {
      projectId: validateInternalId(sourceRoute.projectId, 'promotion.sourceRoute.projectId'),
      threadId: validateInternalId(sourceRoute.threadId, 'promotion.sourceRoute.threadId'),
      runId: validateInternalId(sourceRoute.runId, 'promotion.sourceRoute.runId'),
      nodeId: validateInternalId(sourceRoute.nodeId, 'promotion.sourceRoute.nodeId'),
    },
    providerProvenance,
    content: { messages: content.messages.map(validateAgentMessage), toolResults, artifacts },
    authority: {
      permissions: 'reset', approvals: 'reset', providerContinuation: 'reset', workspace: 'reset', stagedWrites: 'reset', merge: 'reset',
    },
    idempotencyKey: validateString(source.idempotencyKey, 'promotion.idempotencyKey', { maxLength: 512 }),
    createdAt: validateTimestamp(source.createdAt, 'promotion.createdAt'),
  })
}
