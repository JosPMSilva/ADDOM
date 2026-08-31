import {
  CONTINUITY_SECTION_ORDER,
  createEmptyContinuityPacket,
  estimateTokensFromText,
} from './packet-schema.mjs'

function trimText(text, max = 240) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max)}...` : value
}

function sliceRows(rows, max) {
  if (!Array.isArray(rows)) return []
  return rows.slice(0, Math.max(0, max))
}

function buildSourceRefs(facts = [], invariants = [], snapshots = [], max = 20) {
  const refs = []
  for (const fact of facts) {
    if (refs.length >= max) break
    refs.push({
      id: String(fact.id || ''),
      kind: 'fact',
      turnId: String(fact.sourceTurnId || ''),
      ref: String(fact.sourceRef || ''),
    })
  }
  for (const inv of invariants) {
    if (refs.length >= max) break
    refs.push({
      id: String(inv.id || ''),
      kind: 'invariant',
      turnId: String(inv.sourceTurnId || ''),
      ref: '',
    })
  }
  for (const snap of snapshots) {
    if (refs.length >= max) break
    refs.push({
      id: String(snap.id || ''),
      kind: 'snapshot',
      turnId: String(snap.turnId || ''),
      ref: '',
    })
  }
  return refs
}

function buildSessionState(snapshot = null) {
  const meta = snapshot?.qualityMeta && typeof snapshot.qualityMeta === 'object'
    ? snapshot.qualityMeta
    : {}
  const lines = []
  const taskSummary = trimText(meta.taskSummary, 220)
  if (taskSummary) lines.push(`task: ${taskSummary}`)
  if (Number(meta.confirmedDecisionCount || 0) > 0) {
    lines.push(`confirmed decisions: ${Number(meta.confirmedDecisionCount || 0)}`)
  }
  if (Number(meta.openLoopCount || 0) > 0) {
    lines.push(`open loops: ${Number(meta.openLoopCount || 0)}`)
  }
  if (Number(meta.blockingQuestionCount || 0) > 0) {
    lines.push(`blocking questions: ${Number(meta.blockingQuestionCount || 0)}`)
  }
  if (String(meta.reducerVersion || '').trim()) {
    lines.push(`continuity: ${String(meta.reducerVersion).trim()} / epoch ${Number(meta.epoch || 1) || 1}`)
  }
  return lines.join(' | ')
}

function packetToText(packet) {
  const lines = [
    '[ADDOM Continuity Packet]',
    `profile: ${packet.profile} | budget: ${packet.tokenBudget} tokens`,
    '',
  ]

  for (const sectionKey of CONTINUITY_SECTION_ORDER) {
    if (sectionKey === 'source_refs') continue
    const section = packet.sections[sectionKey]
    if (!Array.isArray(section) || section.length === 0) continue
    lines.push(`## ${sectionKey}`)
    for (const row of section) {
      const text = trimText(row?.text || row?.factText || row?.invariantText || row?.summary || '', 260)
      if (!text) continue
      lines.push(`- ${text}`)
    }
    lines.push('')
  }

  if (packet.sourceRefs.length > 0) {
    lines.push('## source_refs')
    for (const ref of packet.sourceRefs) {
      lines.push(`- ${String(ref.kind || 'ref')}:${String(ref.id || '')} turn=${String(ref.turnId || '')}`)
    }
    lines.push('')
  }

  lines.push('Use this packet for continuity; prefer newest evidence if conflicts appear.')
  return lines.join('\n')
}

function boundPacketText(text, tokenBudget = 0) {
  const budget = Math.max(0, Number(tokenBudget || 0) || 0)
  if (budget <= 0) return { text: '', tokenCount: 0 }
  const estimate = estimateTokensFromText(text)
  if (estimate <= budget) return { text, tokenCount: estimate }

  const maxChars = Math.max(240, Math.floor(budget * 3.6))
  const compact = String(text || '').slice(0, maxChars)
  return {
    text: `${compact}\n\n[packet truncated to fit token budget]`,
    tokenCount: estimateTokensFromText(compact),
  }
}

export function buildContinuityPacket({
  packetId = '',
  threadId = '',
  turnId = '',
  profile = 'balanced',
  tokenBudget = 0,
  maxFacts = 16,
  maxSourceRefs = 18,
  retrieval = {},
  openLoops = [],
  drift = {},
} = {}) {
  const packet = createEmptyContinuityPacket({
    packetId,
    threadId,
    turnId,
    profile,
    tokenBudget,
  })

  const facts = Array.isArray(retrieval.facts) ? retrieval.facts : []
  const invariants = Array.isArray(retrieval.invariants) ? retrieval.invariants : []
  const snapshots = Array.isArray(retrieval.snapshots) ? retrieval.snapshots : []

  const decisions = facts.filter((fact) => String(fact.factType || '') === 'decision')
  const constraints = facts.filter((fact) => String(fact.factType || '') === 'constraint')
  const fileRefs = facts.filter((fact) => String(fact.factType || '') === 'file_intent')
  const criticalErrors = facts.filter((fact) => String(fact.factType || '') === 'error_pattern')

  packet.sections = {
    session_state: snapshots.slice(0, 1).map((snap) => ({
      summary: trimText(buildSessionState(snap), 260),
    })).filter((row) => row.summary),
    active_goals: constraints.slice(0, Math.max(2, Math.floor(maxFacts * 0.35))).map((fact) => ({
      text: trimText(fact.factText, 240),
      id: String(fact.id || ''),
    })),
    decisions: decisions.slice(0, Math.max(2, Math.floor(maxFacts * 0.4))).map((fact) => ({
      text: trimText(fact.factText, 240),
      id: String(fact.id || ''),
    })),
    open_loops: sliceRows(openLoops, Math.max(2, Math.floor(maxFacts * 0.35))).map((fact) => ({
      text: trimText(fact.factText, 220),
      id: String(fact.id || ''),
    })),
    critical_errors: sliceRows(criticalErrors, Math.max(2, Math.floor(maxFacts * 0.35))).map((fact) => ({
      text: trimText(fact.factText, 220),
      id: String(fact.id || ''),
    })),
    file_state_refs: sliceRows(fileRefs, Math.max(2, Math.floor(maxFacts * 0.3))).map((fact) => ({
      text: trimText(fact.factText, 220),
      id: String(fact.id || ''),
    })),
    invariants: sliceRows(invariants, Math.max(2, Math.floor(maxFacts * 0.35))).map((inv) => ({
      invariantText: trimText(inv.invariantText, 220),
      id: String(inv.id || ''),
    })),
  }
  packet.sourceRefs = buildSourceRefs(facts, invariants, snapshots, maxSourceRefs)
  packet.qualityMeta = {
    parsedOk: true,
    droppedFindings: Math.max(0, facts.length - maxFacts),
    driftRisk: String(drift?.driftRisk || 'low'),
    violationCount: Number(drift?.violationCount || 0) || 0,
    sourceRefCount: packet.sourceRefs.length,
  }

  const text = packetToText(packet)
  const bounded = boundPacketText(text, tokenBudget)

  return {
    packet,
    packetText: bounded.text,
    packetTokens: bounded.tokenCount,
    qualityMeta: packet.qualityMeta,
  }
}
