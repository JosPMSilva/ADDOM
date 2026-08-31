import { getDb } from '../../memory/db.mjs'
import {
  CONTINUITY_REDUCER_VERSION,
  containsQuotedComplaint,
  dedupeById,
  deleteRowsByThreadIds,
  extractQuestions,
  firstSentence,
  genId,
  hashText,
  isLowSignalSentence,
  listRecentThreadTurns,
  normalizeId,
  normalizeIdList,
  now,
  readThreadContinuityState,
  safeJson,
  trimText,
} from './continuity-store-support.mjs'
export { CONTINUITY_REDUCER_VERSION } from './continuity-store-support.mjs'

const OPEN_LOOP_HINTS = /\b(todo|next step|follow up|pending|remaining|still need|left to do|need you to|need your|please confirm|please choose)\b/i
const DECISION_HINTS = /\b(i(?:'ve| have)?\s+(?:decided|concluded|determined|identified|found|fixed|refactored|updated|created|added|removed)|the (?:issue|problem|bug|error|root cause|cause) (?:is|was|appears to be)|solution|approach|fix|change)\b/i
const CLOSE_HINTS = /\b(done|completed|fixed|resolved|implemented|applied|passed|finished)\b/i

function deriveIntentDelta(userMessage = '') {
  const summary = firstSentence(userMessage)
  if (!summary || isLowSignalSentence(summary)) {
    return { taskSummary: '', qualityFlags: summary ? ['low_signal_user_intent'] : [] }
  }
  return {
    taskSummary: trimText(summary, 280),
    qualityFlags: [],
  }
}

function deriveAssistantDecisionDelta(assistantText = '', toolResults = []) {
  const decisions = []
  const qualityFlags = []
  const first = firstSentence(assistantText)
  if (first && !isLowSignalSentence(first) && DECISION_HINTS.test(first)) {
    decisions.push({
      id: `decision:${hashText(first)}`,
      text: trimText(first, 260),
      sourceRef: 'assistant:first_sentence',
    })
  } else if (first && isLowSignalSentence(first)) {
    qualityFlags.push('low_signal_assistant_opening')
  }

  for (const toolResult of Array.isArray(toolResults) ? toolResults : []) {
    const toolName = normalizeId(toolResult?.toolName)
    const resultText = trimText(toolResult?.result, 220)
    if (!toolName || !resultText || toolResult?.isError) continue
    if (toolName === 'run_command' && /\b(test|build|lint)\b/i.test(resultText) && /\b(pass|success|ok|completed)\b/i.test(resultText)) {
      decisions.push({
        id: `decision:${hashText(`${toolName}:${resultText}`)}`,
        text: `Command passed: ${resultText}`,
        sourceRef: `tool_result:${toolName}`,
      })
    }
  }

  return { decisions, qualityFlags }
}

function deriveToolEffects(toolResults = []) {
  const toolEffects = []
  const workspaceRefs = []
  for (const toolResult of Array.isArray(toolResults) ? toolResults : []) {
    const toolName = normalizeId(toolResult?.toolName)
    if (!toolName) continue
    const path = trimText(toolResult?.input?.path || '', 260)
    if (path && ['write_file', 'edit_file', 'rollback_file'].includes(toolName)) {
      const ref = {
        id: `file:${hashText(path)}`,
        path,
        text: `${toolName.replace(/_/g, ' ')} ${path}`,
        sourceRef: `tool_result:${toolName}`,
      }
      workspaceRefs.push(ref)
      toolEffects.push({
        kind: 'workspace_event',
        toolName,
        path,
        summary: ref.text,
      })
      continue
    }
    if (toolResult?.isError) {
      toolEffects.push({
        kind: 'tool_error',
        toolName,
        summary: trimText(toolResult?.result, 220),
      })
    }
  }
  return { toolEffects, workspaceRefs }
}

function deriveOpenLoopDelta(assistantText = '', toolResults = []) {
  const sourceText = trimText(assistantText, 320)
  const candidate = firstSentence(assistantText)
  const shouldOpen = candidate && !isLowSignalSentence(candidate) && OPEN_LOOP_HINTS.test(sourceText)
  const closeCorpus = `${assistantText || ''}\n${(Array.isArray(toolResults) ? toolResults : []).map((row) => String(row?.result || '')).join('\n')}`
  return {
    opened: shouldOpen
      ? [{
          id: `open_loop:${hashText(candidate)}`,
          text: trimText(candidate, 240),
          sourceRef: 'assistant:open_loop',
        }]
      : [],
    closeHints: trimText(closeCorpus, 600),
  }
}

function deriveBlockingQuestions(assistantText = '') {
  return extractQuestions(assistantText, 3)
    .filter((question) => !isLowSignalSentence(question))
    .map((question) => ({
      id: `question:${hashText(question)}`,
      text: question,
    }))
}

function closeResolvedOpenLoops(existing = [], closeHints = '') {
  const corpus = String(closeHints || '').toLowerCase()
  if (!corpus || !CLOSE_HINTS.test(corpus)) return dedupeById(existing)
  return dedupeById(existing).filter((loop) => {
    const text = `${String(loop?.text || '').toLowerCase()} ${String(loop?.id || '').toLowerCase()}`
    const tokens = text.split(/\s+/).filter((token) => token.length >= 5)
    return !tokens.some((token) => corpus.includes(token))
  })
}

function buildReducerUpdate({
  existingState = null,
  userMessage = '',
  assistantText = '',
  toolResults = [],
} = {}) {
  const baseState = existingState || {
    epoch: 1,
    reducerVersion: CONTINUITY_REDUCER_VERSION,
    taskSummary: '',
    confirmedDecisions: [],
    openLoops: [],
    workspaceRefs: [],
    blockingQuestions: [],
    metadata: {},
  }

  const intentDelta = deriveIntentDelta(userMessage)
  const { decisions, qualityFlags: decisionFlags } = deriveAssistantDecisionDelta(assistantText, toolResults)
  const { toolEffects, workspaceRefs } = deriveToolEffects(toolResults)
  const openLoopDelta = deriveOpenLoopDelta(assistantText, toolResults)
  const blockingQuestions = deriveBlockingQuestions(assistantText)
  const qualityFlags = [
    ...intentDelta.qualityFlags,
    ...decisionFlags,
    ...(containsQuotedComplaint(userMessage) ? ['quoted_complaint_user_text'] : []),
    ...(containsQuotedComplaint(assistantText) ? ['quoted_complaint_assistant_text'] : []),
  ]

  const nextTaskSummary = intentDelta.taskSummary || baseState.taskSummary
  const nextDecisions = dedupeById([
    ...baseState.confirmedDecisions,
    ...decisions,
  ]).slice(-10)
  const nextWorkspaceRefs = dedupeById([
    ...baseState.workspaceRefs,
    ...workspaceRefs,
  ]).slice(-12)
  const nextOpenLoops = dedupeById([
    ...closeResolvedOpenLoops(baseState.openLoops, openLoopDelta.closeHints),
    ...openLoopDelta.opened,
  ]).slice(-8)
  const nextBlockingQuestions = dedupeById([
    ...baseState.blockingQuestions,
    ...blockingQuestions,
  ]).slice(-5)

  return {
    state: {
      ...baseState,
      reducerVersion: CONTINUITY_REDUCER_VERSION,
      taskSummary: nextTaskSummary,
      confirmedDecisions: nextDecisions,
      openLoops: nextOpenLoops,
      workspaceRefs: nextWorkspaceRefs,
      blockingQuestions: nextBlockingQuestions,
      metadata: {
        lastQualityFlags: qualityFlags,
      },
    },
    turnDigest: {
      intentDelta: intentDelta.taskSummary ? { taskSummary: intentDelta.taskSummary } : {},
      outcomeDelta: trimText(firstSentence(assistantText), 260)
        ? { summary: trimText(firstSentence(assistantText), 260) }
        : {},
      toolEffects,
      decisionDelta: decisions,
      openLoopDelta,
      qualityFlags,
    },
  }
}

function upsertThreadContinuityState({
  threadId = '',
  project = '',
  turnId = '',
  nextState = {},
} = {}) {
  const tid = normalizeId(threadId)
  if (!tid) return null
  const db = getDb()
  const ts = now()
  db.prepare(`
    INSERT INTO thread_continuity_state (
      thread_id,
      project,
      epoch,
      reducer_version,
      task_summary,
      confirmed_decisions_json,
      open_loops_json,
      workspace_refs_json,
      blocking_questions_json,
      last_turn_id,
      metadata_json,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET
      project = excluded.project,
      epoch = excluded.epoch,
      reducer_version = excluded.reducer_version,
      task_summary = excluded.task_summary,
      confirmed_decisions_json = excluded.confirmed_decisions_json,
      open_loops_json = excluded.open_loops_json,
      workspace_refs_json = excluded.workspace_refs_json,
      blocking_questions_json = excluded.blocking_questions_json,
      last_turn_id = excluded.last_turn_id,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `).run(
    tid,
    normalizeId(project),
    Math.max(1, Number(nextState.epoch || 1) || 1),
    normalizeId(nextState.reducerVersion) || CONTINUITY_REDUCER_VERSION,
    trimText(nextState.taskSummary, 320),
    safeJson(dedupeById(nextState.confirmedDecisions || []), '[]'),
    safeJson(dedupeById(nextState.openLoops || []), '[]'),
    safeJson(dedupeById(nextState.workspaceRefs || []), '[]'),
    safeJson(dedupeById(nextState.blockingQuestions || []), '[]'),
    normalizeId(turnId),
    safeJson(nextState.metadata || {}, '{}'),
    ts,
  )
  return readThreadContinuityState(tid)
}

function insertThreadContinuityTurn({
  threadId = '',
  turnId = '',
  project = '',
  turnDigest = {},
} = {}) {
  const tid = normalizeId(threadId)
  if (!tid) return null
  const id = genId('thread_continuity_turn')
  const ts = now()
  const db = getDb()
  db.prepare(`
    INSERT INTO thread_continuity_turns (
      id,
      thread_id,
      turn_id,
      project,
      intent_delta_json,
      outcome_delta_json,
      tool_effects_json,
      decision_delta_json,
      open_loop_delta_json,
      quality_flags_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    tid,
    normalizeId(turnId),
    normalizeId(project),
    safeJson(turnDigest.intentDelta || {}, '{}'),
    safeJson(turnDigest.outcomeDelta || {}, '{}'),
    safeJson(turnDigest.toolEffects || [], '[]'),
    safeJson(turnDigest.decisionDelta || [], '[]'),
    safeJson(turnDigest.openLoopDelta || {}, '{}'),
    safeJson(turnDigest.qualityFlags || [], '[]'),
    ts,
  )
  return id
}

function toFactRow({
  id = '',
  threadId = '',
  project = '',
  factType = '',
  factText = '',
  sourceTurnId = '',
  sourceRef = '',
  confidence = 0.8,
  updatedAt = 0,
} = {}) {
  const text = trimText(factText, 260)
  return {
    id: normalizeId(id) || `${factType}:${hashText(text)}`,
    threadId: normalizeId(threadId),
    project: normalizeId(project),
    factType: normalizeId(factType),
    factKey: `${factType}:${hashText(text)}`,
    factText: text,
    sourceTurnId: normalizeId(sourceTurnId),
    sourceRef: normalizeId(sourceRef),
    confidence,
    status: 'active',
    createdAt: Number(updatedAt || 0) || now(),
    updatedAt: Number(updatedAt || 0) || now(),
    lastUsedAt: Number(updatedAt || 0) || now(),
    metadata: {},
  }
}

function toInvariantRow({
  id = '',
  threadId = '',
  project = '',
  invariantType = 'goal',
  invariantText = '',
  sourceTurnId = '',
  confidence = 0.9,
  updatedAt = 0,
} = {}) {
  const text = trimText(invariantText, 240)
  return {
    id: normalizeId(id) || `${invariantType}:${hashText(text)}`,
    threadId: normalizeId(threadId),
    project: normalizeId(project),
    invariantType: normalizeId(invariantType),
    invariantKey: `${invariantType}:${hashText(text)}`,
    invariantText: text,
    status: 'active',
    confidence,
    sourceTurnId: normalizeId(sourceTurnId),
    createdAt: Number(updatedAt || 0) || now(),
    updatedAt: Number(updatedAt || 0) || now(),
    metadata: {},
  }
}

export function persistThreadContinuityTurn({
  threadId = '',
  turnId = '',
  project = '',
  userMessage = '',
  assistantText = '',
  toolResults = [],
} = {}) {
  const tid = normalizeId(threadId)
  if (!tid) return null
  const db = getDb()
  const result = db.transaction(() => {
    const existingState = readThreadContinuityState(tid)
    const reduced = buildReducerUpdate({
      existingState,
      userMessage,
      assistantText,
      toolResults,
    })
    const turnRowId = insertThreadContinuityTurn({
      threadId: tid,
      turnId,
      project,
      turnDigest: reduced.turnDigest,
    })
    const nextState = upsertThreadContinuityState({
      threadId: tid,
      project,
      turnId,
      nextState: reduced.state,
    })
    return {
      state: nextState,
      turnRowId,
      turnDigest: reduced.turnDigest,
    }
  })()
  return result
}

export function getThreadContinuityBridgeMeta(threadId = '') {
  const state = readThreadContinuityState(threadId)
  if (!state) {
    return {
      epoch: 1,
      reducerVersion: CONTINUITY_REDUCER_VERSION,
    }
  }
  return {
    epoch: Math.max(1, Number(state.epoch || 1) || 1),
    reducerVersion: normalizeId(state.reducerVersion) || CONTINUITY_REDUCER_VERSION,
  }
}

export function listContinuityFacts({
  threadId = '',
  limit = 80,
} = {}) {
  const state = readThreadContinuityState(threadId)
  if (!state) return []
  const recentTurns = listRecentThreadTurns(threadId, 3)
  const rows = []

  if (state.taskSummary) {
    rows.push(toFactRow({
      id: `constraint:${hashText(state.taskSummary)}`,
      threadId,
      project: state.project,
      factType: 'constraint',
      factText: state.taskSummary,
      sourceTurnId: state.lastTurnId,
      sourceRef: 'thread_state:task_summary',
      confidence: 0.95,
      updatedAt: state.updatedAt,
    }))
  }

  for (const decision of dedupeById(state.confirmedDecisions)) {
    rows.push(toFactRow({
      id: normalizeId(decision.id),
      threadId,
      project: state.project,
      factType: 'decision',
      factText: decision.text,
      sourceTurnId: state.lastTurnId,
      sourceRef: decision.sourceRef || 'thread_state:decision',
      confidence: 0.86,
      updatedAt: state.updatedAt,
    }))
  }

  for (const loop of dedupeById(state.openLoops)) {
    rows.push(toFactRow({
      id: normalizeId(loop.id),
      threadId,
      project: state.project,
      factType: 'open_loop',
      factText: loop.text,
      sourceTurnId: state.lastTurnId,
      sourceRef: loop.sourceRef || 'thread_state:open_loop',
      confidence: 0.78,
      updatedAt: state.updatedAt,
    }))
  }

  for (const ref of dedupeById(state.workspaceRefs)) {
    rows.push(toFactRow({
      id: normalizeId(ref.id),
      threadId,
      project: state.project,
      factType: 'file_intent',
      factText: ref.text || ref.path,
      sourceTurnId: state.lastTurnId,
      sourceRef: ref.sourceRef || 'thread_state:workspace_ref',
      confidence: 0.84,
      updatedAt: state.updatedAt,
    }))
  }

  for (const turn of recentTurns) {
    for (const toolEffect of Array.isArray(turn.toolEffects) ? turn.toolEffects : []) {
      if (toolEffect?.kind !== 'tool_error' || !toolEffect?.summary) continue
      rows.push(toFactRow({
        id: `error:${hashText(`${toolEffect.toolName}:${toolEffect.summary}`)}`,
        threadId,
        project: state.project,
        factType: 'error_pattern',
        factText: `${toolEffect.toolName} failed: ${toolEffect.summary}`,
        sourceTurnId: turn.turnId,
        sourceRef: `tool_result:${toolEffect.toolName}`,
        confidence: 0.8,
        updatedAt: turn.createdAt,
      }))
    }
  }

  return dedupeById(rows).slice(0, Math.max(1, Math.min(120, Math.round(Number(limit) || 80))))
}

export function listContinuityInvariants({
  threadId = '',
  limit = 60,
} = {}) {
  const state = readThreadContinuityState(threadId)
  if (!state) return []
  const rows = []
  if (state.taskSummary) {
    rows.push(toInvariantRow({
      id: `goal:${hashText(state.taskSummary)}`,
      threadId,
      project: state.project,
      invariantType: 'goal',
      invariantText: state.taskSummary,
      sourceTurnId: state.lastTurnId,
      confidence: 0.95,
      updatedAt: state.updatedAt,
    }))
  }
  for (const question of dedupeById(state.blockingQuestions)) {
    rows.push(toInvariantRow({
      id: normalizeId(question.id),
      threadId,
      project: state.project,
      invariantType: 'blocking_question',
      invariantText: question.text,
      sourceTurnId: state.lastTurnId,
      confidence: 0.75,
      updatedAt: state.updatedAt,
    }))
  }
  return dedupeById(rows).slice(0, Math.max(1, Math.min(80, Math.round(Number(limit) || 60))))
}

export function listContinuitySnapshots({
  threadId = '',
  limit = 8,
} = {}) {
  const state = readThreadContinuityState(threadId)
  if (!state) return []
  const recentTurns = listRecentThreadTurns(threadId, Math.max(1, Math.min(3, Math.round(Number(limit) || 1))))
  const summarySnapshot = {
    id: `thread_snapshot:${normalizeId(threadId)}`,
    threadId: normalizeId(threadId),
    turnId: state.lastTurnId,
    project: state.project,
    profile: 'thread_local',
    scope: 'thread_only',
    tokenBudget: 0,
    packetTokens: 0,
    packet: {},
    qualityMeta: {
      taskSummary: state.taskSummary,
      confirmedDecisionCount: state.confirmedDecisions.length,
      openLoopCount: state.openLoops.length,
      blockingQuestionCount: state.blockingQuestions.length,
      recentTurnCount: recentTurns.length,
      reducerVersion: state.reducerVersion,
      epoch: state.epoch,
    },
    providerNativeMeta: {},
    createdAt: state.updatedAt,
  }
  return [summarySnapshot].slice(0, Math.max(1, Math.min(8, Math.round(Number(limit) || 8))))
}

export function saveContinuitySnapshot() {
  return null
}

export function upsertContinuityFacts() {
  return 0
}

export function upsertContinuityInvariants() {
  return 0
}

export function markContinuityFactsUsed() {
  return 0
}

export function clearContinuityForProject({ project = '', threadIds = [] } = {}) {
  const db = getDb()
  const normalizedProject = normalizeId(project)
  const normalizedThreadIds = normalizeIdList(threadIds)

  const tx = db.transaction(() => {
    let deletedSnapshots = 0
    let deletedFacts = 0
    let deletedInvariants = 0
    let deletedThreadState = 0
    let deletedThreadTurns = 0

    if (normalizedProject) {
      deletedSnapshots += Number(db.prepare('DELETE FROM continuity_snapshots WHERE project = ?').run(normalizedProject)?.changes || 0)
      deletedFacts += Number(db.prepare('DELETE FROM continuity_facts WHERE project = ?').run(normalizedProject)?.changes || 0)
      deletedInvariants += Number(db.prepare('DELETE FROM continuity_invariants WHERE project = ?').run(normalizedProject)?.changes || 0)
      deletedThreadState += Number(db.prepare('DELETE FROM thread_continuity_state WHERE project = ?').run(normalizedProject)?.changes || 0)
      deletedThreadTurns += Number(db.prepare('DELETE FROM thread_continuity_turns WHERE project = ?').run(normalizedProject)?.changes || 0)
    }

    deletedSnapshots += deleteRowsByThreadIds(db, 'continuity_snapshots', normalizedThreadIds)
    deletedFacts += deleteRowsByThreadIds(db, 'continuity_facts', normalizedThreadIds)
    deletedInvariants += deleteRowsByThreadIds(db, 'continuity_invariants', normalizedThreadIds)
    deletedThreadState += deleteRowsByThreadIds(db, 'thread_continuity_state', normalizedThreadIds)
    deletedThreadTurns += deleteRowsByThreadIds(db, 'thread_continuity_turns', normalizedThreadIds)

    return {
      ok: true,
      deletedSnapshots,
      deletedFacts,
      deletedInvariants,
      deletedThreadState,
      deletedThreadTurns,
    }
  })

  return tx()
}

export function clearAllContinuityState() {
  const db = getDb()
  const tx = db.transaction(() => ({
    ok: true,
    deletedSnapshots: Number(db.prepare('DELETE FROM continuity_snapshots').run()?.changes || 0),
    deletedFacts: Number(db.prepare('DELETE FROM continuity_facts').run()?.changes || 0),
    deletedInvariants: Number(db.prepare('DELETE FROM continuity_invariants').run()?.changes || 0),
    deletedThreadState: Number(db.prepare('DELETE FROM thread_continuity_state').run()?.changes || 0),
    deletedThreadTurns: Number(db.prepare('DELETE FROM thread_continuity_turns').run()?.changes || 0),
  }))
  return tx()
}
