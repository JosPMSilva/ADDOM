import { estimateTextTokens } from '../token-utils.mjs'

export const CONTINUITY_SECTION_ORDER = Object.freeze([
  'session_state',
  'active_goals',
  'decisions',
  'open_loops',
  'critical_errors',
  'file_state_refs',
  'invariants',
  'source_refs',
])

export const CONTINUITY_FACT_TYPES = Object.freeze([
  'decision',
  'constraint',
  'open_loop',
  'file_intent',
  'error_pattern',
])

export const CONTINUITY_FACT_STATUSES = Object.freeze([
  'active',
  'resolved',
  'stale',
])

export function createEmptyContinuityPacket({
  packetId = '',
  threadId = '',
  turnId = '',
  profile = 'balanced',
  tokenBudget = 0,
} = {}) {
  return {
    packetId: String(packetId || ''),
    threadId: String(threadId || ''),
    turnId: String(turnId || ''),
    profile: String(profile || 'balanced'),
    tokenBudget: Number(tokenBudget || 0) || 0,
    sections: {},
    sourceRefs: [],
    qualityMeta: {
      parsedOk: true,
      droppedFindings: 0,
      driftRisk: 'low',
      sourceRefCount: 0,
    },
  }
}

export function estimateTokensFromText(text) {
  return estimateTextTokens(text)
}
