import { AGENT_ARTIFACT_KINDS } from '../../common/agents/agent-artifact-contract.mjs'

const RESET_AUTHORITY = Object.freeze({
  permissions: 'reset', approvals: 'reset', providerContinuation: 'reset', workspace: 'reset', stagedWrites: 'reset', merge: 'reset',
})
const SAFE_PART_KINDS = new Set(['markdown', 'text', 'citation', 'link', 'file', 'image'])
const SAFE_ARTIFACT_KINDS = new Set(AGENT_ARTIFACT_KINDS)
const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])
const MAX_PROMOTION_TOOL_RESULTS = 100
const MAX_PROMOTION_ARTIFACTS = 100

function text(value, max = 200_000) {
  if (typeof value !== 'string') return ''
  return value.slice(0, max)
}

function label(value, fallback = 'Artifact') {
  const raw = text(value, 4_000).replace(/\\/g, '/')
  return raw.split('/').filter(Boolean).at(-1) || fallback
}

function frozen(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) frozen(child)
  return Object.freeze(value)
}

function latestCompletedTurn(projection = {}) {
  return [...(Array.isArray(projection.turns) ? projection.turns : [])]
    .filter((turn) => String(turn?.status || '') === 'completed')
    .sort((left, right) => Number(right.sequence || 0) - Number(left.sequence || 0))[0] || null
}

function safeHref(value) {
  const href = text(value, 8_000).trim()
  if (!href) return ''
  try {
    return SAFE_LINK_PROTOCOLS.has(new URL(href).protocol.toLowerCase()) ? href : ''
  } catch {
    return ''
  }
}

function sanitizePart(part = {}) {
  const kind = String(part?.kind || '')
  if (!SAFE_PART_KINDS.has(kind)) return null
  if (kind === 'markdown' || kind === 'text' || kind === 'citation') {
    const value = text(part.text)
    return value ? { kind, text: value } : null
  }
  if (kind === 'link') {
    const href = safeHref(part.href)
    const partLabel = text(part.label, 4_000)
    return href && partLabel ? { kind, label: partLabel, href } : null
  }
  const id = text(part.id, 256)
  const partLabel = text(part.label, 4_000)
  return id && partLabel ? { kind, id, label: partLabel } : null
}

function sanitizeMessage(message = {}, sourceConversationId, fallbackCreatedAt) {
  const parts = (Array.isArray(message.contentParts) ? message.contentParts : [])
    .map(sanitizePart)
    .filter(Boolean)
  if (parts.length === 0) return null
  const id = text(message.id, 256)
  const turnId = text(message.turnId, 256)
  if (!id || !turnId) return null
  return {
    schemaVersion: 1,
    id, conversationId: sourceConversationId, turnId,
    sequence: Number(message.sequence || 0) || 1,
    kind: String(message.kind || '') === 'final' ? 'final' : 'authored',
    authorKind: ['user', 'orchestrator', 'agent', 'system'].includes(message.authorKind) ? message.authorKind : 'system',
    authorId: text(message.authorId, 256) || 'promotion_source',
    sourceConversationId: text(message.sourceConversationId, 256) || sourceConversationId,
    sourceTurnId: text(message.sourceTurnId, 256) || turnId,
    idempotencyKey: text(message.idempotencyKey, 512) || `promotion:${id}`,
    contentParts: parts,
    createdAt: Number(message.createdAt || 0) || fallbackCreatedAt,
  }
}

function sanitizeToolResults(items = [], allowedTurnIds = new Set()) {
  const result = []
  const toolNamesByCall = new Map()
  const seen = new Set()
  for (const item of items) {
    if (allowedTurnIds.size > 0 && item?.turnId && !allowedTurnIds.has(String(item.turnId))) continue
    const kind = String(item?.kind || '')
    if (kind === 'agent_tool_started') {
      const callId = text(item?.toolCallId, 256)
      const toolName = text(item?.toolName, 256)
      if (callId && toolName) toolNamesByCall.set(callId, toolName)
      continue
    }
    if (kind !== 'agent_tool_completed' && kind !== 'tool_result') continue
    const summary = text(item?.content || item?.summary, 24_000)
    const toolName = text(item?.toolName, 256) || toolNamesByCall.get(text(item?.toolCallId, 256)) || ''
    const key = `${toolName}\u0000${summary}`
    if (summary && toolName && !seen.has(key)) {
      result.push({ toolName, summary })
      seen.add(key)
      if (result.length >= MAX_PROMOTION_TOOL_RESULTS) break
    }
  }
  return result
}

function sanitizeArtifacts(items = []) {
  const result = []
  for (const item of items) {
    const id = text(item?.id, 256)
    const kind = text(item?.kind, 64)
    if (!id || !SAFE_ARTIFACT_KINDS.has(kind)) continue
    result.push({
      id,
      kind,
      label: label(item?.label || item?.path || item?.originalPath),
      digest: text(item?.digest, 256),
      sizeBytes: Math.max(0, Math.round(Number(item?.sizeBytes) || 0)),
      status: 'unmerged',
    })
    if (result.length >= MAX_PROMOTION_ARTIFACTS) break
  }
  return result
}

export function sanitizeAgentPromotionSnapshot({
  id,
  idempotencyKey,
  createdAt,
  sourceRoute = {},
  sourceRoleLabel = '',
  projection,
  artifacts = [],
  transcript = [],
} = {}) {
  const conversation = projection?.conversation
  const turn = latestCompletedTurn(projection)
  if (!conversation || !turn) throw new TypeError('A completed agent turn is required for promotion')
  const includedTurnIds = new Set((Array.isArray(projection.turns) ? projection.turns : [])
    .filter((candidate) => Number(candidate?.sequence || 0) <= Number(turn.sequence || 0))
    .map((candidate) => String(candidate?.id || ''))
    .filter(Boolean))
  const messages = (Array.isArray(projection.messages) ? projection.messages : [])
    .filter((message) => includedTurnIds.has(String(message?.turnId || '')))
    .sort((left, right) => Number(left?.sequence || 0) - Number(right?.sequence || 0))
    .map((message) => sanitizeMessage(message, conversation.id, Number(createdAt || 0)))
    .filter(Boolean)
  if (messages.length === 0) throw new TypeError('The completed agent turn has no promotable messages')
  return frozen({
    schemaVersion: 1, id: text(id, 256), sourceConversationId: conversation.id, sourceTurnId: turn.id,
    sourceSequence: Number(turn.sequence || 0), sourceRoleId: text(conversation.roleId, 256),
    sourceRoleLabel: text(sourceRoleLabel, 256) || text(conversation.roleId, 256),
    sourceRoute: {
      projectId: text(sourceRoute.projectId, 256) || text(conversation.projectId, 256),
      threadId: text(sourceRoute.threadId, 256) || text(conversation.rootThreadId, 256),
      runId: text(sourceRoute.runId, 256),
      nodeId: text(sourceRoute.nodeId, 256),
    },
    providerProvenance: { providerId: text(conversation.providerRoute?.providerId, 512), modelId: text(conversation.providerRoute?.modelId, 1_024) },
    content: { messages, toolResults: sanitizeToolResults(transcript, includedTurnIds), artifacts: sanitizeArtifacts(artifacts) },
    authority: { ...RESET_AUTHORITY }, idempotencyKey: text(idempotencyKey, 512), createdAt: Number(createdAt || 0),
  })
}

export function createAgentConversationPromotionService({
  conversationRepository,
  getArtifacts = () => [],
  getTranscript = () => [],
  createProjectThreadFromPromotion,
  idFactory = (prefix) => `${prefix}_${Date.now()}`,
  now = Date.now,
} = {}) {
  if (!conversationRepository?.getConversationProjection || !conversationRepository?.createPromotionSnapshot) throw new TypeError('conversationRepository is required')
  if (typeof createProjectThreadFromPromotion !== 'function') throw new TypeError('createProjectThreadFromPromotion is required')

  async function promote({ conversationId, title = '', sourceRoute = {}, sourceRoleLabel = '' } = {}) {
    const projection = conversationRepository.getConversationProjection(text(conversationId, 256))
    if (!projection) throw new TypeError('Agent conversation was not found')
    const turn = latestCompletedTurn(projection)
    if (!turn) return { supported: false, reason: 'completed_snapshot_unavailable' }
    const idempotencyKey = `${projection.conversation.id}:${turn.id}:promotion`
    const snapshot = sanitizeAgentPromotionSnapshot({
      id: idFactory('promotion'), idempotencyKey, createdAt: now(), sourceRoute, sourceRoleLabel, projection,
      artifacts: getArtifacts({ projection, turn }) || [], transcript: getTranscript({ projection, turn }) || [],
    })
    const stored = conversationRepository.createPromotionSnapshot(snapshot).item
    const result = await createProjectThreadFromPromotion({ snapshot: stored, title })
    return { supported: true, ...result, snapshot: stored, source: {
      conversationId: stored.sourceConversationId, turnId: stored.sourceTurnId, roleId: stored.sourceRoleId,
    } }
  }
  return Object.freeze({ promote })
}
