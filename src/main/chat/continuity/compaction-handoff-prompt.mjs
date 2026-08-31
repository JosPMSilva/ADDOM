import { estimateTextTokens } from '../token-utils.mjs'
import { normalizeCompactionHandoffPayload } from './compaction-handoff-state.mjs'
import { isContinuityPacketMessage } from './packet-injection.mjs'

export const COMPACTION_HANDOFF_HEADER = '[ADDOM Compaction Handoff]'
export const COMPACTION_VICINITY_MARKER_HEADER = '[ADDOM Compaction Marker]'

function isSystemMessage(row) {
  return String(row?.role || '').trim().toLowerCase() === 'system'
}

export function isCompactionHandoffMessage(row) {
  return isSystemMessage(row) && String(row?.content || '').includes(COMPACTION_HANDOFF_HEADER)
}

export function isCompactionVicinityMarkerMessage(row) {
  return isSystemMessage(row) && String(row?.content || '').includes(COMPACTION_VICINITY_MARKER_HEADER)
}

export function stripCompactionHandoffMessages(history = []) {
  const rows = Array.isArray(history) ? [...history] : []
  let removedCount = 0
  const next = rows.filter((row) => {
    if (isCompactionHandoffMessage(row)) {
      removedCount += 1
      return false
    }
    return true
  })
  return { history: next, removedCount }
}

export function stripCompactionVicinityMarkerMessages(history = []) {
  const rows = Array.isArray(history) ? [...history] : []
  let removedCount = 0
  const next = rows.filter((row) => {
    if (isCompactionVicinityMarkerMessage(row)) {
      removedCount += 1
      return false
    }
    return true
  })
  return { history: next, removedCount }
}

function findInsertionIndex(rows = []) {
  let lastPacketIdx = -1
  let lastHandoffIdx = -1
  for (let i = 0; i < rows.length; i += 1) {
    if (isContinuityPacketMessage(rows[i])) lastPacketIdx = i
    if (isCompactionHandoffMessage(rows[i])) lastHandoffIdx = i
  }
  if (lastHandoffIdx >= 0) return lastHandoffIdx + 1
  if (lastPacketIdx >= 0) return lastPacketIdx + 1
  const firstSystemIdx = rows.findIndex((row) => isSystemMessage(row))
  if (firstSystemIdx >= 0) return firstSystemIdx + 1
  return 0
}

export function upsertCompactionHandoffMessage(history = [], handoffText = '') {
  const text = String(handoffText || '').trim()
  const stripped = stripCompactionHandoffMessages(history)
  const rows = Array.isArray(stripped.history) ? [...stripped.history] : []
  if (!text) return rows
  const insertAt = findInsertionIndex(rows)
  rows.splice(insertAt, 0, { role: 'system', content: text })
  return rows
}

export function upsertCompactionVicinityMarkerMessage(history = [], markerText = '') {
  const text = String(markerText || '').trim()
  const stripped = stripCompactionVicinityMarkerMessages(history)
  const rows = Array.isArray(stripped.history) ? [...stripped.history] : []
  if (!text) return rows
  const insertAt = findInsertionIndex(rows)
  rows.splice(insertAt, 0, { role: 'system', content: text })
  return rows
}

function renderBulletSection(lines = [], title = '') {
  if (!Array.isArray(lines) || lines.length === 0) return []
  const out = [title]
  for (const line of lines) {
    out.push(`- ${line}`)
  }
  out.push('')
  return out
}

function boundPrompt(text, tokenBudget = 0) {
  const normalizedText = String(text || '').trim()
  if (!normalizedText) return ''
  const budget = Number(tokenBudget || 0) || 0
  if (budget <= 0) return normalizedText
  const estimate = estimateTextTokens(normalizedText)
  if (estimate <= budget) return normalizedText
  const maxChars = Math.max(240, Math.floor(budget * 3.4))
  const trimmed = normalizedText.slice(0, maxChars)
  return `${trimmed}\n\n[handoff truncated to fit token budget]`
}

export function renderCompactionAwarenessMarker({
  occurred = false,
  type = 'local_summary',
  phase = 'imminent',
  source = 'local',
  confidence = 'explicit',
  providerId = '',
  turnId = '',
  occupancyRatio = null,
  note = '',
} = {}, {
  tokenBudget = 80,
} = {}) {
  const normalizedType = String(type || 'local_summary').trim().toLowerCase() || 'local_summary'
  const normalizedPhase = String(phase || 'imminent').trim().toLowerCase() || 'imminent'
  const normalizedSource = String(source || 'local').trim().toLowerCase() || 'local'
  const normalizedConfidence = String(confidence || 'explicit').trim().toLowerCase() || 'explicit'
  const ratio = Number.isFinite(Number(occupancyRatio))
    ? Math.max(0, Math.min(2, Number(occupancyRatio)))
    : null
  const normalizedNote = String(note || '').trim()
  const defaultNote = normalizedPhase === 'imminent'
    ? 'Compaction is likely soon; preserve current objective, active files, and next step explicitly.'
    : 'Compaction boundary awareness marker.'
  const lines = [
    COMPACTION_VICINITY_MARKER_HEADER,
    `event: occurred=${occurred === true ? 'true' : 'false'} type=${normalizedType} phase=${normalizedPhase} source=${normalizedSource} confidence=${normalizedConfidence}${providerId ? ` provider=${String(providerId || '').trim().toLowerCase()}` : ''}${turnId ? ` turn=${String(turnId || '').trim()}` : ''}`,
    ...(ratio !== null ? [`occupancy_ratio: ${ratio.toFixed(3)}`] : []),
    normalizedNote || defaultNote,
  ]
  const text = lines.join('\n').trim()
  return boundPrompt(text, tokenBudget)
}

export function renderCompactionVicinityMarker({
  providerId = '',
  turnId = '',
  occupancyRatio = null,
} = {}, {
  tokenBudget = 80,
} = {}) {
  return renderCompactionAwarenessMarker({
    occurred: false,
    type: 'local_summary',
    phase: 'imminent',
    source: 'local',
    confidence: 'explicit',
    providerId,
    turnId,
    occupancyRatio,
    note: 'Compaction is likely soon; preserve current objective, active files, and next step explicitly.',
  }, { tokenBudget })
}

export function renderCompactionHandoffPrompt(payload = {}, { tokenBudget = 280 } = {}) {
  const normalized = normalizeCompactionHandoffPayload(payload)
  const event = normalized.compactionEvent || {}
  const workState = normalized.workState || {}
  const lines = [
    COMPACTION_HANDOFF_HEADER,
    `event: occurred=${event.occurred ? 'true' : 'false'} type=${event.type} phase=${event.phase} source=${event.source} confidence=${event.confidence}${event.providerId ? ` provider=${event.providerId}` : ''}${event.turnId ? ` turn=${event.turnId}` : ''}`,
    '',
  ]

  if (workState.objective) lines.push(`objective: ${workState.objective}`)
  if (workState.nextStep) lines.push(`next_step: ${workState.nextStep}`)
  if (workState.objective || workState.nextStep) lines.push('')
  lines.push(...renderBulletSection(workState.constraints, 'constraints:'))
  lines.push(...renderBulletSection(workState.activeFiles, 'active_files:'))
  lines.push(...renderBulletSection(workState.lastConcreteEdits, 'last_concrete_edits:'))
  lines.push(...renderBulletSection(workState.recentToolOutcomes, 'recent_tool_outcomes:'))
  lines.push(...renderBulletSection(workState.toolContextFacts, 'tool_context_facts:'))
  lines.push(...renderBulletSection(workState.blockers, 'blockers:'))
  lines.push(...renderBulletSection(workState.verificationStatus, 'verification_status:'))
  lines.push(...renderBulletSection(workState.openLoops, 'open_loops:'))

  lines.push('Use this handoff as the compaction-boundary source of truth; do not reset task intent.')
  const prompt = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return boundPrompt(prompt, tokenBudget)
}
