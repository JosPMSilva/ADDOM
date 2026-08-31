import crypto from 'node:crypto'
import { listTimeline } from '../workspace/workspace-store.mjs'
import { recordGlobalTerminalToolContextTelemetry } from './run-command-policy-telemetry.mjs'

function normalizeText(value = '', maxLength = 400) {
  return String(value || '').trim().slice(0, maxLength)
}

function hashText(value = '') {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex')
}

function buildFileReadFact({ toolName = '', toolInput = {}, result = '' } = {}) {
  const filePath = normalizeText(toolInput?.path || '', 260)
  const content = String(result || '')
  if (!filePath || !content) return null
  const fact = {
    kind: 'file_read',
    toolName: String(toolName || '').trim(),
    filePath,
    contentHash: hashText(content),
  }
  const startLine = Number(toolInput?.start_line || 0)
  const endLine = Number(toolInput?.end_line || 0)
  if (Number.isFinite(startLine) && startLine > 0) fact.startLine = Math.round(startLine)
  if (Number.isFinite(endLine) && endLine > 0) fact.endLine = Math.round(endLine)
  return fact
}

function buildFileWriteFacts({ toolName = '', writeArtifactChanges = [] } = {}) {
  const source = Array.isArray(writeArtifactChanges) ? writeArtifactChanges : []
  return source
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const filePath = normalizeText(row.filePath || '', 260)
      if (!filePath) return null
      const fact = {
        kind: 'file_write',
        toolName: String(toolName || '').trim(),
        filePath,
        changeType: normalizeText(row.changeType || '', 40),
        newRevisionId: normalizeText(row.newRevId || '', 120),
        previousRevisionId: normalizeText(row.prevRevId || '', 120),
      }
      if (Number.isFinite(Number(row.contentBytes || 0)) && Number(row.contentBytes || 0) > 0) {
        fact.contentBytes = Number(row.contentBytes || 0)
      }
      if (row.renamedFrom) fact.renamedFrom = normalizeText(row.renamedFrom, 260)
      return fact
    })
    .filter(Boolean)
}

function buildCommandOutputFact({ toolName = '', toolInput = {}, result = '', isError = false, decision = '' } = {}) {
  if (String(toolName || '').trim().toLowerCase() !== 'run_command') return null
  if (isError === true || String(decision || '').trim().toLowerCase() !== 'approved') return null
  const command = normalizeText(toolInput?.command || '', 600)
  const output = String(result || '')
  if (!command || !output) return null
  return {
    kind: 'command_output',
    toolName: 'run_command',
    command,
    outputHash: hashText(output),
  }
}

function buildFailureClassFact({
  toolName = '',
  failureClass = '',
  lintCode = '',
  rerouteToolName = '',
  isError = false,
} = {}) {
  const normalizedFailureClass = normalizeText(failureClass, 120)
  if (!normalizedFailureClass || isError !== true) return null
  const fact = {
    kind: 'failure_class',
    toolName: String(toolName || '').trim(),
    failureClass: normalizedFailureClass,
  }
  const normalizedLintCode = normalizeText(lintCode, 120)
  const normalizedRerouteToolName = normalizeText(rerouteToolName, 80)
  if (normalizedLintCode) fact.lintCode = normalizedLintCode
  if (normalizedRerouteToolName) fact.rerouteToolName = normalizedRerouteToolName
  return fact
}

function normalizeTerminalCommandPreview(value = '') {
  const firstLine = String(value || '')
    .split(/\r?\n/)
    .map((line) => String(line || '').trim())
    .find(Boolean) || ''
  return normalizeText(firstLine, 200)
}

function buildTerminalSessionFact({ toolName = '', toolInput = {}, result = '', isError = false, decision = '' } = {}) {
  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  if (!normalizedToolName.startsWith('terminal_session_')) return null
  if (isError === true || String(decision || '').trim().toLowerCase() !== 'approved') return null

  const payload = result && typeof result === 'object' ? result : {}
  const session = payload?.session && typeof payload.session === 'object' ? payload.session : {}
  const wait = payload?.wait && typeof payload.wait === 'object' ? payload.wait : {}
  const output = payload?.output && typeof payload.output === 'object' ? payload.output : {}
  const action = normalizeText(normalizedToolName.replace(/^terminal_session_/, ''), 80)
  const sessionId = normalizeText(payload?.sessionId || session?.id || toolInput?.sessionId || '', 120)
  if (!action) return null

  const fact = {
    kind: 'terminal_session',
    toolName: normalizedToolName,
    action,
    sessionId,
  }

  const outputSequence = Number(output?.nextSequence || session?.outputSequence || 0) || 0
  const sinceSequence = Number(toolInput?.sinceSequence || wait?.sinceSequence || 0) || 0
  if (outputSequence > 0) fact.outputSequence = outputSequence
  if (sinceSequence > 0) fact.sinceSequence = sinceSequence
  if (
    action === 'attach'
    || action === 'read_snapshot'
    || action === 'wait_for_output'
  ) {
    fact.outputProgress = outputSequence > sinceSequence
  }

  const commandPreview = normalizeTerminalCommandPreview(toolInput?.data || '')
  if (commandPreview) {
    fact.commandPreview = commandPreview
    fact.commandHash = hashText(commandPreview.toLowerCase())
  }

  const inputBytes = Number(Buffer.byteLength(String(toolInput?.data || ''), 'utf8') || 0) || 0
  if (inputBytes > 0) fact.inputBytes = inputBytes

  if (action === 'wait_for_output') {
    fact.matched = wait?.matched === true
    fact.timedOut = wait?.timedOut === true
    const matchType = normalizeText(wait?.matchType || '', 40)
    if (matchType) fact.matchType = matchType
    const expectedPattern = normalizeText(wait?.pattern || toolInput?.pattern || '', 120)
    if (expectedPattern) fact.expectedPattern = expectedPattern
  }

  return fact
}

export function buildToolContextFacts({
  toolName = '',
  toolInput = {},
  result = '',
  isError = false,
  decision = '',
  writeArtifactChanges = [],
  failureClass = '',
  lintCode = '',
  rerouteToolName = '',
} = {}) {
  const normalizedToolName = String(toolName || '').trim().toLowerCase()
  const facts = []

  if ((normalizedToolName === 'read_file' || normalizedToolName === 'view_file_range') && isError !== true) {
    const fileReadFact = buildFileReadFact({ toolName: normalizedToolName, toolInput, result })
    if (fileReadFact) facts.push(fileReadFact)
  }

  facts.push(...buildFileWriteFacts({
    toolName: normalizedToolName,
    writeArtifactChanges,
  }))

  const commandOutputFact = buildCommandOutputFact({
    toolName: normalizedToolName,
    toolInput,
    result,
    isError,
    decision,
  })
  if (commandOutputFact) facts.push(commandOutputFact)

  const terminalSessionFact = buildTerminalSessionFact({
    toolName: normalizedToolName,
    toolInput,
    result,
    isError,
    decision,
  })
  if (terminalSessionFact) facts.push(terminalSessionFact)

  const failureClassFact = buildFailureClassFact({
    toolName: normalizedToolName,
    failureClass,
    lintCode,
    rerouteToolName,
    isError,
  })
  if (failureClassFact) facts.push(failureClassFact)

  return facts
}

function buildFactSummary(fact = {}) {
  switch (String(fact.kind || '').trim()) {
    case 'file_read':
      return `Read ${fact.filePath} (hash ${String(fact.contentHash || '').slice(0, 12)})`
    case 'file_write':
      return `Wrote ${fact.filePath}${fact.changeType ? ` (${fact.changeType})` : ''}`
    case 'command_output':
      return `Command output captured for ${fact.command}`
    case 'failure_class':
      return `Failure class recorded: ${fact.failureClass}`
    case 'terminal_session': {
      const sessionId = normalizeText(fact.sessionId, 120) || 'terminal'
      if (fact.action === 'write') {
        return fact.commandPreview
          ? `Terminal ${sessionId}: wrote ${fact.commandPreview}`
          : `Terminal ${sessionId}: wrote input`
      }
      if (fact.action === 'wait_for_output') {
        if (fact.matched === true) return `Terminal ${sessionId}: wait matched`
        if (fact.timedOut === true) return `Terminal ${sessionId}: wait timed out`
        return `Terminal ${sessionId}: waiting for output`
      }
      return `Terminal ${sessionId}: ${fact.action}`
    }
    default:
      return 'Tool context fact recorded.'
  }
}

export function persistToolContextFacts({
  persistTimelineEvent = () => {},
  threadId = '',
  turnId = '',
  stepId = '',
  sequence = 0,
  startedAt = 0,
  finishedAt = 0,
  durationMs = 0,
  facts = [],
} = {}) {
  const source = Array.isArray(facts) ? facts : []
  for (const fact of source) {
    if (!fact || typeof fact !== 'object') continue
    if (String(fact.kind || '').trim() === 'terminal_session') {
      recordGlobalTerminalToolContextTelemetry(fact)
    }
    persistTimelineEvent('tool_context_fact', {
      role: 'system',
      content: buildFactSummary(fact),
      meta: {
        threadId,
        turnId,
        stepId,
        sequence,
        startedAt,
        finishedAt,
        durationMs,
        fact,
      },
    })
  }
}

export function collectRecentToolContextFacts(threadId = '', { limit = 250 } = {}) {
  const rows = listTimeline(threadId, { limit })
  return rows
    .filter((row) => String(row?.kind || '').trim() === 'tool_context_fact')
    .map((row) => {
      const meta = row?.meta && typeof row.meta === 'object' ? row.meta : {}
      const fact = meta.fact && typeof meta.fact === 'object' ? meta.fact : null
      return fact ? { ...fact } : null
    })
    .filter(Boolean)
}

function buildFactKey(fact = {}) {
  const kind = normalizeText(fact.kind, 40)
  switch (kind) {
    case 'file_read':
      return `${kind}:${normalizeText(fact.filePath, 260)}:${normalizeText(fact.contentHash, 24)}`
    case 'file_write':
      return `${kind}:${normalizeText(fact.filePath, 260)}:${normalizeText(fact.newRevisionId, 80)}:${normalizeText(fact.changeType, 40)}`
    case 'command_output':
      return `${kind}:${normalizeText(fact.command, 260)}:${normalizeText(fact.outputHash, 24)}`
    case 'failure_class':
      return `${kind}:${normalizeText(fact.toolName, 80)}:${normalizeText(fact.failureClass, 120)}:${normalizeText(fact.lintCode, 120)}`
    case 'terminal_session':
      return [
        kind,
        normalizeText(fact.sessionId, 120),
        normalizeText(fact.action, 80),
        normalizeText(fact.commandHash, 24),
        normalizeText(fact.outputSequence, 24),
        normalizeText(fact.sinceSequence, 24),
        fact.matched === true ? 'matched' : '',
        fact.timedOut === true ? 'timeout' : '',
      ].filter(Boolean).join(':')
    default:
      return ''
  }
}

function summarizeFact(fact = {}) {
  switch (String(fact.kind || '').trim()) {
    case 'file_read':
      return `read ${fact.filePath}${fact.contentHash ? ` @ ${String(fact.contentHash).slice(0, 12)}` : ''}`
    case 'file_write': {
      const changeType = normalizeText(fact.changeType, 40)
      const revisionId = normalizeText(fact.newRevisionId, 80)
      return `wrote ${fact.filePath}${changeType ? ` (${changeType})` : ''}${revisionId ? ` rev ${revisionId}` : ''}`
    }
    case 'command_output':
      return `command ${fact.command}${fact.outputHash ? ` @ ${String(fact.outputHash).slice(0, 12)}` : ''}`
    case 'failure_class':
      return `failure ${fact.toolName}${fact.failureClass ? ` (${fact.failureClass})` : ''}`
    case 'terminal_session': {
      const sessionId = normalizeText(fact.sessionId, 120) || 'terminal'
      if (fact.action === 'write') {
        return fact.commandPreview
          ? `terminal ${sessionId} write "${fact.commandPreview}"`
          : `terminal ${sessionId} write`
      }
      if (fact.action === 'wait_for_output') {
        if (fact.matched === true) {
          return `terminal ${sessionId} wait matched @ ${Number(fact.outputSequence || 0) || 0}`
        }
        if (fact.timedOut === true) {
          const suffix = fact.outputProgress === false ? ' (no progress)' : ''
          return `terminal ${sessionId} wait timeout @ ${Number(fact.sinceSequence || 0) || 0}${suffix}`
        }
        return `terminal ${sessionId} wait`
      }
      if (fact.action === 'read_snapshot') return `terminal ${sessionId} read @ ${Number(fact.outputSequence || 0) || 0}`
      if (fact.action === 'open') return `terminal ${sessionId} open`
      if (fact.action === 'close') return `terminal ${sessionId} close`
      return `terminal ${sessionId} ${fact.action}`
    }
    default:
      return ''
  }
}

export function summarizeToolContextFacts(facts = [], { maxItems = 4 } = {}) {
  const rows = Array.isArray(facts) ? facts : []
  const out = []
  const seen = new Set()
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    if (out.length >= maxItems) break
    const fact = rows[index]
    if (!fact || typeof fact !== 'object') continue
    const key = buildFactKey(fact)
    if (!key || seen.has(key)) continue
    const summary = summarizeFact(fact)
    if (!summary) continue
    seen.add(key)
    out.push(summary)
  }
  return out
}

export function buildRecentTerminalSessionInsights(facts = [], { visibleTerminalSessions = [] } = {}) {
  const rows = Array.isArray(facts) ? facts : []
  const visibleSessions = Array.isArray(visibleTerminalSessions) ? visibleTerminalSessions : []
  const perSession = new Map()
  let lastTerminalFact = null

  for (const fact of rows) {
    if (!fact || typeof fact !== 'object' || String(fact.kind || '').trim() !== 'terminal_session') continue
    const sessionId = normalizeText(fact.sessionId, 120)
    if (!sessionId) continue
    lastTerminalFact = fact
    const state = perSession.get(sessionId) || {
      sessionId,
      lastOutputSequence: 0,
      lastWriteCommandHash: '',
      lastWriteOutputSequence: 0,
      repeatedWritesWithoutProgress: 0,
      waitTimeoutsWithoutProgress: 0,
      lastCommandPreview: '',
    }
    const outputSequence = Number(fact.outputSequence || 0) || 0
    const sinceSequence = Number(fact.sinceSequence || 0) || 0
    const hasExplicitOutputProgress = typeof fact.outputProgress === 'boolean'
    const outputProgress = hasExplicitOutputProgress
      ? fact.outputProgress === true
      : outputSequence > 0 && outputSequence > sinceSequence
    if (outputProgress) {
      state.lastOutputSequence = Math.max(state.lastOutputSequence, outputSequence)
      state.waitTimeoutsWithoutProgress = 0
      state.repeatedWritesWithoutProgress = 0
    }
    if (fact.action === 'write') {
      const commandHash = normalizeText(fact.commandHash, 80)
      if (
        commandHash
        && commandHash === state.lastWriteCommandHash
        && !outputProgress
        && outputSequence === state.lastWriteOutputSequence
      ) {
        state.repeatedWritesWithoutProgress += 1
      } else {
        state.repeatedWritesWithoutProgress = 0
      }
      state.lastWriteCommandHash = commandHash
      state.lastWriteOutputSequence = outputSequence
      state.lastCommandPreview = normalizeText(fact.commandPreview, 200)
    }
    if (fact.action === 'wait_for_output') {
      if (fact.timedOut === true && !outputProgress) {
        state.waitTimeoutsWithoutProgress += 1
      } else {
        state.waitTimeoutsWithoutProgress = 0
      }
    }
    perSession.set(sessionId, state)
  }

  const recentSessionId = normalizeText(lastTerminalFact?.sessionId, 120)
  const recentSessionState = recentSessionId ? perSession.get(recentSessionId) || null : null
  const reusableRecentSession = visibleSessions.find((session) => (
    normalizeText(session?.sessionId, 120) === recentSessionId
    && normalizeText(session?.access, 80) === 'ai_reusable'
  )) || null
  const reusableVisibleSession = reusableRecentSession || visibleSessions.find((session) => (
    normalizeText(session?.access, 80) === 'ai_reusable'
  )) || null

  let loopRisk = ''
  if (recentSessionState?.waitTimeoutsWithoutProgress >= 2) {
    loopRisk = 'wait_timeout_streak'
  } else if (recentSessionState?.repeatedWritesWithoutProgress >= 1) {
    loopRisk = 'repeated_write_no_output_progress'
  }

  return {
    recentSessionId,
    recentAction: normalizeText(lastTerminalFact?.action, 80),
    recentCommandPreview: normalizeText(recentSessionState?.lastCommandPreview || '', 200),
    recentOutputSequence: Number(lastTerminalFact?.outputSequence || recentSessionState?.lastOutputSequence || 0) || 0,
    reusableSessionId: normalizeText(reusableVisibleSession?.sessionId, 120),
    reusableSessionReason: normalizeText(reusableVisibleSession?.suggestedUse || '', 200),
    loopRisk,
    waitTimeoutsWithoutProgress: Number(recentSessionState?.waitTimeoutsWithoutProgress || 0) || 0,
    repeatedWritesWithoutProgress: Number(recentSessionState?.repeatedWritesWithoutProgress || 0) || 0,
  }
}

export function buildRecentExecutionBriefContextFromFacts(facts = []) {
  const rows = Array.isArray(facts) ? facts : []
  let lastFilePath = ''
  let lastFailedToolName = ''
  let lastFailureClass = ''
  let lastToolFamily = ''
  let lastTerminalSessionId = ''
  let lastTerminalAction = ''
  let lastTerminalCommand = ''

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const fact = rows[index]
    if (!fact || typeof fact !== 'object') continue
    const kind = normalizeText(fact.kind, 40)
    const toolName = normalizeText(fact.toolName, 80)
    if (!lastToolFamily && toolName) lastToolFamily = toolName
    if (!lastFilePath && (kind === 'file_read' || kind === 'file_write')) {
      lastFilePath = normalizeText(fact.filePath, 260)
    }
    if (!lastFailedToolName && kind === 'failure_class') {
      lastFailedToolName = toolName
      lastFailureClass = normalizeText(fact.failureClass, 120)
    }
    if (kind === 'terminal_session') {
      const sessionId = normalizeText(fact.sessionId, 120)
      if (!lastTerminalSessionId && sessionId) {
        lastTerminalSessionId = sessionId
        lastTerminalAction = normalizeText(fact.action, 80)
      }
      if (!lastTerminalCommand) {
        const commandPreview = normalizeText(fact.commandPreview, 200)
        if (commandPreview && (!lastTerminalSessionId || sessionId === lastTerminalSessionId)) {
          lastTerminalCommand = commandPreview
        }
      }
    }
    if (lastFilePath && lastFailedToolName && lastToolFamily && lastTerminalSessionId && lastTerminalCommand) break
  }

  const result = {
    lastFilePath,
    lastFailedToolName,
    lastFailureClass,
    lastToolFamily,
  }
  if (lastTerminalSessionId) result.lastTerminalSessionId = lastTerminalSessionId
  if (lastTerminalAction) result.lastTerminalAction = lastTerminalAction
  if (lastTerminalCommand) result.lastTerminalCommand = lastTerminalCommand
  return result
}
