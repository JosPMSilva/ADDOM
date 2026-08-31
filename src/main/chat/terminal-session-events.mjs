import crypto from 'node:crypto'
import { probeTerminalSessionRuntimeHealth } from '../tools/terminal-session-runtime-health.mjs'
import {
  buildTerminalSessionPolicy,
  isTerminalSessionTool as isTerminalSessionPolicyTool,
} from '../tools/terminal-session-policy.mjs'
import { inspectGlobalTerminalToolLoopState } from './run-command-policy-telemetry.mjs'
import {
  DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_MAX_CHARS,
  DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_PREVIEW_MAX_CHARS,
  DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_MODE,
  DEFAULT_TERMINAL_SESSION_WAIT_FOR_OUTPUT_TIMEOUT_MS,
} from '../tools/terminal-session-manager.mjs'

let terminalSessionManagerRef = null
let terminalSessionRuntimeHealthCache = null
let terminalSessionRuntimeHealthPromise = null

function asTrimmedString(value = '') {
  return String(value || '').trim()
}

function getPathTail(value = '') {
  const normalized = asTrimmedString(value)
  if (!normalized) return ''
  const parts = normalized.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || normalized
}

function clampOutputPreview(value = '', maxChars = DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_PREVIEW_MAX_CHARS) {
  const text = String(value || '')
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(0, maxChars - 16)).trimEnd()}... [truncated]`
}

function clampSnapshotOutput(chunks = [], maxChars = DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_MAX_CHARS) {
  const source = Array.isArray(chunks) ? chunks : []
  let totalChars = 0
  const kept = []
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const entry = source[index]
    const chunk = String(entry?.data || '')
    if (!chunk) continue
    const nextChars = totalChars + chunk.length
    if (kept.length > 0 && nextChars > maxChars) break
    kept.unshift({
      ...entry,
      data: chunk,
    })
    totalChars = nextChars
    if (totalChars >= maxChars) break
  }
  return kept
}

function buildTerminalWriteCommandHash(value = '') {
  const firstLine = String(value || '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean)
  if (!firstLine) return ''
  return crypto
    .createHash('sha256')
    .update(firstLine.toLowerCase(), 'utf8')
    .digest('hex')
}

function mergeSnapshotText(chunks = []) {
  return (Array.isArray(chunks) ? chunks : [])
    .map((entry) => String(entry?.data || ''))
    .join('')
}

function buildTerminalSessionDisplayName(session = {}, extras = {}) {
  const sessionId = asTrimmedString(session?.id || extras?.sessionId)
  const cwdTail = getPathTail(session?.cwd || extras?.cwd)
  if (sessionId && cwdTail) return `${sessionId} (${cwdTail})`
  if (sessionId) return sessionId
  if (cwdTail) return `terminal (${cwdTail})`
  return 'terminal session'
}

function buildTerminalSessionPanelIntent(action = '') {
  const normalizedAction = asTrimmedString(action).toLowerCase()
  if (normalizedAction === 'open' || normalizedAction === 'attach') return 'open'
  if (normalizedAction === 'write' || normalizedAction === 'wait_for_output') return 'attention'
  return 'none'
}

function buildVisibleTerminalSessionState(session = {}, attachPolicy = null) {
  const controlOwner = asTrimmedString(session?.controlOwner).toLowerCase()
  const policyDecision = asTrimmedString(attachPolicy?.policyDecision).toLowerCase()
  const reasons = Array.isArray(attachPolicy?.reasons)
    ? attachPolicy.reasons.map((value) => asTrimmedString(value).toLowerCase()).filter(Boolean)
    : []

  if (controlOwner === 'user') {
    return {
      access: 'locked_by_user',
      attachAllowed: false,
      suggestedUse: 'visible only until the user hands it back to AI',
    }
  }
  if (policyDecision === 'allow') {
    return {
      access: 'ai_reusable',
      attachAllowed: true,
      suggestedUse: Number(session?.outputSequence || 0) > 0
        ? 'reuse this session for the ongoing interactive workflow'
        : 'reuse this session and send the next command',
    }
  }
  if (reasons.includes('session_outside_workspace')) {
    return {
      access: 'requires_full_access',
      attachAllowed: false,
      suggestedUse: 'visible but outside the workspace; reuse only with full_access',
    }
  }
  return {
    access: 'visible_only',
    attachAllowed: false,
    suggestedUse: 'visible context only; open a new terminal if direct reuse is blocked',
  }
}

function buildTerminalSessionSummary(action = '', session = {}, extras = {}) {
  const displayName = buildTerminalSessionDisplayName(session, extras)
  const cwd = asTrimmedString(session?.cwd)
  const shell = asTrimmedString(session?.shell || session?.shellKind)
  const cols = Number(session?.cols || 0) || 0
  const rows = Number(session?.rows || 0) || 0
  const signal = asTrimmedString(extras?.signal)
  const inputBytes = Number(extras?.inputBytes || 0) || 0
  const sinceSequence = Number(extras?.sinceSequence || 0) || 0

  if (action === 'open') {
    return `Opened ${displayName} in the chat terminal dock${shell ? ` (${shell})` : ''}${cols > 0 && rows > 0 ? ` at ${cols}x${rows}` : ''}${cwd ? ` from ${cwd}` : ''}.`
  }
  if (action === 'list') {
    const count = Number(extras?.count || 0) || 0
    return count === 1
      ? 'Listed 1 visible terminal session for the current thread/workspace.'
      : `Listed ${count} visible terminal sessions for the current thread/workspace.`
  }
  if (action === 'attach') {
    return `Using ${displayName} in the chat terminal dock${sinceSequence > 0 ? ` from output ${sinceSequence}` : ''}.`
  }
  if (action === 'read_snapshot') {
    return `Read a terminal snapshot from ${displayName}${sinceSequence > 0 ? ` after output ${sinceSequence}` : ''}.`
  }
  if (action === 'wait_for_output') {
    if (extras?.matched === true) {
      return `Waited for expected output in ${displayName} and matched it${sinceSequence > 0 ? ` after output ${sinceSequence}` : ''}.`
    }
    if (extras?.timedOut === true) {
      return `Timed out waiting for expected output in ${displayName}.`
    }
    return `Waited for output in ${displayName}.`
  }
  if (action === 'write') {
    return `Continued in ${displayName}${inputBytes > 0 ? ` with ${inputBytes} input byte${inputBytes === 1 ? '' : 's'}` : ''}.`
  }
  if (action === 'resize') {
    return `Resized ${displayName} to ${cols}x${rows}.`
  }
  if (action === 'signal') {
    return `Sent ${signal || 'SIGTERM'} to ${displayName}.`
  }
  if (action === 'close') {
    return `Closed ${displayName}.`
  }
  return `Updated ${displayName}.`
}

function buildTerminalSessionActivityMeta(action = '', session = {}, extras = {}) {
  const outputPreview = clampOutputPreview(String(extras?.outputPreview || ''))
  const displayName = buildTerminalSessionDisplayName(session, extras)
  const panelIntent = buildTerminalSessionPanelIntent(action)
  const sessionId = asTrimmedString(session?.id || extras?.sessionId)
  return {
    terminalSession: {
      action,
      sessionId,
      displayName,
      status: asTrimmedString(session?.status || extras?.status),
      cwd: asTrimmedString(session?.cwd),
      shell: asTrimmedString(session?.shell),
      shellKind: asTrimmedString(session?.shellKind),
      cols: Number(session?.cols || 0) || 0,
      rows: Number(session?.rows || 0) || 0,
      outputSequence: Number(extras?.outputSequence || session?.outputSequence || 0) || 0,
      outputTruncated: extras?.outputTruncated === true,
      outputChunkCount: Number(extras?.outputChunkCount || 0) || 0,
      outputPreview,
      inputBytes: Number(extras?.inputBytes || 0) || 0,
      matched: extras?.matched === true,
      timedOut: extras?.timedOut === true,
      matchType: asTrimmedString(extras?.matchType),
      signal: asTrimmedString(extras?.signal),
      sinceSequence: Number(extras?.sinceSequence || 0) || 0,
      closeRequested: session?.closeRequested === true,
      exitCode: session?.exitCode ?? null,
      exitSignal: session?.exitSignal ?? null,
      liveSurface: 'chat_dock',
      lifecycleState: asTrimmedString(session?.lifecycleState || session?.status || extras?.status),
      approvalState: asTrimmedString(session?.approvalState || 'approved'),
      takeoverState: asTrimmedString(session?.takeoverState),
      controlState: asTrimmedString(session?.controlState),
      aiWriteBlocked: session?.aiWriteBlocked === true,
      focusedSurface: asTrimmedString(session?.focusedSurface || 'chat_dock') || 'chat_dock',
      pendingAiControlRequest: session?.pendingAiControlRequest === true,
      failureReason: asTrimmedString(session?.failureReason),
      panelIntent,
      userTakeoverAvailable: panelIntent === 'open' || panelIntent === 'attention',
      attentionMessage: (
        panelIntent === 'open'
          ? `Terminal dock opened for ${displayName}.`
          : (panelIntent === 'attention'
            ? `Terminal dock stays available for ${displayName}.`
            : '')
      ),
    },
  }
}

function emitTerminalSnapshotOutput({
  output = null,
  emitToolOutputChunk = () => {},
} = {}) {
  const rawChunks = Array.isArray(output?.chunks) ? output.chunks : []
  if (rawChunks.length <= 0) {
    return {
      outputChunkCount: 0,
      outputSequence: Number(output?.nextSequence || 0) || 0,
      outputText: '',
      outputPreview: '',
      outputTruncated: output?.truncated === true,
    }
  }
  const keptChunks = clampSnapshotOutput(rawChunks)
  const mergedText = mergeSnapshotText(keptChunks)
  if (mergedText) {
    emitToolOutputChunk({
      stream: 'stdout',
      chunk: mergedText,
      emittedAt: Number(keptChunks[keptChunks.length - 1]?.at || 0) || Date.now(),
    })
  }
  return {
    outputChunkCount: rawChunks.length,
    outputSequence: Number(output?.nextSequence || 0) || 0,
    outputText: mergedText,
    outputPreview: clampOutputPreview(mergedText),
    outputTruncated: output?.truncated === true || keptChunks.length !== rawChunks.length,
  }
}

function ensureTerminalSessionManager() {
  if (terminalSessionManagerRef && typeof terminalSessionManagerRef.createSession === 'function') {
    return terminalSessionManagerRef
  }
  throw new Error('terminal_session_manager_unavailable')
}

function resolveManagedTerminalSession(sessionId = '') {
  const manager = ensureTerminalSessionManager()
  if (typeof manager.getSession !== 'function') return null
  return manager.getSession(sessionId)
}

export function setTerminalSessionManagerForChat(manager = null) {
  terminalSessionManagerRef = manager && typeof manager.createSession === 'function'
    ? manager
    : null
}

export function __resetTerminalSessionRuntimeForTests() {
  terminalSessionManagerRef = null
  terminalSessionRuntimeHealthCache = null
  terminalSessionRuntimeHealthPromise = null
}

export function isTerminalSessionTool(toolName = '') {
  return isTerminalSessionPolicyTool(toolName)
}

export function resolveTerminalSessionForChat(sessionId = '') {
  return resolveManagedTerminalSession(sessionId)
}

export function listVisibleTerminalSessionsForChat({
  projectFolder = '',
  permissionMode = 'ask',
  activeThreadId = '',
  maxSessions = 6,
} = {}) {
  const normalizedThreadId = asTrimmedString(activeThreadId)
  if (!normalizedThreadId) return []

  let manager = null
  try {
    manager = ensureTerminalSessionManager()
  } catch {
    return []
  }
  if (!manager || typeof manager.listSessions !== 'function') return []

  const sessionLimit = Math.max(1, Math.min(12, Number(maxSessions || 0) || 6))
  return manager.listSessions()
    .filter((session) => (
      asTrimmedString(session?.threadId) === normalizedThreadId
      && asTrimmedString(session?.status).toLowerCase() === 'running'
    ))
    .sort((left, right) => Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0))
    .slice(0, sessionLimit)
    .map((session) => {
      const attachPolicy = buildTerminalSessionPolicy({
        toolName: 'terminal_session_attach',
        toolInput: { sessionId: session.id },
        projectFolder,
        permissionMode,
        resolveSession: resolveManagedTerminalSession,
      })
      const visibility = buildVisibleTerminalSessionState(session, attachPolicy)
      const controlOwner = asTrimmedString(session?.controlOwner).toLowerCase()
      return {
        sessionId: asTrimmedString(session?.id),
        sessionTitle: asTrimmedString(session?.sessionTitle),
        cwd: asTrimmedString(session?.cwd),
        shell: asTrimmedString(session?.shell || session?.shellKind),
        shellKind: asTrimmedString(session?.shellKind || session?.shell),
        outputSequence: Number(session?.outputSequence || 0) || 0,
        focusedSurface: asTrimmedString(session?.focusedSurface || 'chat_dock') || 'chat_dock',
        controlOwner,
        owner: controlOwner,
        threadId: asTrimmedString(session?.threadId),
        status: asTrimmedString(session?.status),
        access: visibility.access,
        attachAllowed: visibility.attachAllowed,
        suggestedUse: visibility.suggestedUse,
      }
    })
}

export async function getCachedTerminalSessionRuntimeHealth({
  forceRefresh = false,
  probeRuntimeHealth = probeTerminalSessionRuntimeHealth,
} = {}) {
  if (!forceRefresh && terminalSessionRuntimeHealthCache) return terminalSessionRuntimeHealthCache
  if (!forceRefresh && terminalSessionRuntimeHealthPromise) return terminalSessionRuntimeHealthPromise
  terminalSessionRuntimeHealthPromise = Promise.resolve()
    .then(() => probeRuntimeHealth())
    .then((health) => {
      terminalSessionRuntimeHealthCache = health && typeof health === 'object'
        ? health
        : { status: 'failed', reason: 'invalid_terminal_runtime_health' }
      return terminalSessionRuntimeHealthCache
    })
    .finally(() => {
      terminalSessionRuntimeHealthPromise = null
    })
  return terminalSessionRuntimeHealthPromise
}

export async function executeTerminalSessionToolStep({
  tc = {},
  toolInput = {},
  projectFolder = '',
  permissionMode = 'ask',
  activeThreadId = '',
  activeTurnId = '',
  emitToolOutputChunk = () => {},
} = {}) {
  const toolName = asTrimmedString(tc?.name).toLowerCase()
  if (!isTerminalSessionTool(toolName)) return null

  const sessionManager = ensureTerminalSessionManager()
  const policy = buildTerminalSessionPolicy({
    toolName,
    toolInput,
    projectFolder,
    permissionMode,
    resolveSession: resolveManagedTerminalSession,
  })
  const policyDecision = String(policy?.policyDecision || '').trim().toLowerCase()
  if (!policy || policyDecision === 'deny' || policyDecision === 'require_elevation') {
    throw new Error(`Terminal session policy denied ${toolName}.`)
  }

  if (toolName === 'terminal_session_list') {
    const sessions = listVisibleTerminalSessionsForChat({
      projectFolder,
      permissionMode,
      activeThreadId,
      maxSessions: toolInput?.maxSessions,
    })
    return {
      result: {
        summary: buildTerminalSessionSummary('list', {}, {
          count: sessions.length,
        }),
        sessions,
        count: sessions.length,
      },
      isError: false,
      terminalSessionActivityMeta: buildTerminalSessionActivityMeta('list', {}, {
        outputSequence: sessions.reduce((max, session) => Math.max(max, Number(session?.outputSequence || 0) || 0), 0),
      }),
    }
  }

  if (toolName === 'terminal_session_open') {
    const created = sessionManager.createSession({
      cwd: policy.resolvedCwd,
      shell: policy.resolvedShell || toolInput?.shell || 'default',
      cols: policy.cols,
      rows: policy.rows,
      envOverrides: null,
      policy,
      project: projectFolder,
      threadId: activeThreadId,
      turnId: activeTurnId,
      openedBy: 'model',
      sessionTitle: toolInput?.sessionTitle || toolInput?.title || '',
    })
    const snapshotMeta = emitTerminalSnapshotOutput({
      output: created.output,
      emitToolOutputChunk,
    })
    const session = created.session || {}
    return {
      result: {
        summary: buildTerminalSessionSummary('open', session),
        sessionId: session.id,
        session,
        output: {
          text: snapshotMeta.outputText,
          preview: snapshotMeta.outputPreview,
          nextSequence: snapshotMeta.outputSequence,
          truncated: snapshotMeta.outputTruncated,
          chunkCount: snapshotMeta.outputChunkCount,
        },
      },
      isError: false,
      terminalSessionActivityMeta: buildTerminalSessionActivityMeta('open', session, snapshotMeta),
    }
  }

  if (toolName === 'terminal_session_attach') {
    const attached = sessionManager.attachSession(toolInput?.sessionId, {
      sinceSequence: toolInput?.sinceSequence,
    })
    const snapshotMeta = emitTerminalSnapshotOutput({
      output: attached.output,
      emitToolOutputChunk,
    })
    const session = attached.session || {}
    return {
      result: {
        summary: buildTerminalSessionSummary('attach', session, {
          sinceSequence: Number(toolInput?.sinceSequence || 0) || 0,
        }),
        sessionId: session.id,
        session,
        output: {
          text: snapshotMeta.outputText,
          preview: snapshotMeta.outputPreview,
          nextSequence: snapshotMeta.outputSequence,
          truncated: snapshotMeta.outputTruncated,
          chunkCount: snapshotMeta.outputChunkCount,
        },
      },
      isError: false,
      terminalSessionActivityMeta: buildTerminalSessionActivityMeta('attach', session, {
        ...snapshotMeta,
        sinceSequence: Number(toolInput?.sinceSequence || 0) || 0,
      }),
    }
  }

  if (toolName === 'terminal_session_read_snapshot') {
    const snapshot = sessionManager.readSessionSnapshot(toolInput?.sessionId, {
      sinceSequence: toolInput?.sinceSequence,
      maxChars: toolInput?.maxChars,
      mode: toolInput?.mode || DEFAULT_TERMINAL_SESSION_READ_SNAPSHOT_MODE,
    })
    if (snapshot?.output?.text) {
      emitToolOutputChunk({
        stream: 'stdout',
        chunk: snapshot.output.text,
        emittedAt: snapshot.output.capturedAt,
      })
    }
    const session = snapshot.session || {}
    return {
      result: {
        summary: buildTerminalSessionSummary('read_snapshot', session, {
          sinceSequence: Number(toolInput?.sinceSequence || 0) || 0,
        }),
        sessionId: snapshot.sessionId,
        session,
        output: snapshot.output,
      },
      isError: false,
      terminalSessionActivityMeta: buildTerminalSessionActivityMeta('read_snapshot', session, {
        outputSequence: Number(snapshot?.output?.nextSequence || 0) || 0,
        outputChunkCount: Number(snapshot?.output?.chunkCount || 0) || 0,
        outputPreview: String(snapshot?.output?.preview || ''),
        outputTruncated: snapshot?.output?.truncated === true,
        sinceSequence: Number(toolInput?.sinceSequence || 0) || 0,
      }),
    }
  }

  if (toolName === 'terminal_session_wait_for_output') {
    const guard = inspectGlobalTerminalToolLoopState({
      sessionId: toolInput?.sessionId,
      action: 'wait_for_output',
    })
    if (guard.blocked) {
      throw new Error(`Terminal loop guard blocked terminal_session_wait_for_output for ${guard.sessionId}: ${guard.guidance}`)
    }
    const waitResult = await sessionManager.waitForOutput(toolInput?.sessionId, {
      pattern: toolInput?.pattern,
      text: toolInput?.text,
      sinceSequence: toolInput?.sinceSequence,
      timeoutMs: toolInput?.timeoutMs ?? DEFAULT_TERMINAL_SESSION_WAIT_FOR_OUTPUT_TIMEOUT_MS,
      maxChars: toolInput?.maxChars,
      mode: toolInput?.mode || 'plain_text_tail',
    })
    if (waitResult?.output?.text) {
      emitToolOutputChunk({
        stream: 'stdout',
        chunk: waitResult.output.text,
        emittedAt: waitResult.output.capturedAt,
      })
    }
    const session = waitResult.session || {}
    const wait = waitResult.wait || {}
    return {
      result: {
        summary: buildTerminalSessionSummary('wait_for_output', session, {
          matched: wait.matched === true,
          timedOut: wait.timedOut === true,
          sinceSequence: Number(toolInput?.sinceSequence || 0) || 0,
        }),
        sessionId: waitResult.sessionId,
        session,
        wait,
        output: waitResult.output,
      },
      isError: false,
      terminalSessionActivityMeta: buildTerminalSessionActivityMeta('wait_for_output', session, {
        outputSequence: Number(waitResult?.output?.nextSequence || 0) || 0,
        outputChunkCount: Number(waitResult?.output?.chunkCount || 0) || 0,
        outputPreview: String(waitResult?.output?.preview || ''),
        outputTruncated: waitResult?.output?.truncated === true,
        sinceSequence: Number(toolInput?.sinceSequence || 0) || 0,
        matched: wait.matched === true,
        timedOut: wait.timedOut === true,
        matchType: wait.matchType,
      }),
    }
  }

  if (toolName === 'terminal_session_write') {
    const text = String(toolInput?.data ?? '')
    const guard = inspectGlobalTerminalToolLoopState({
      sessionId: toolInput?.sessionId,
      action: 'write',
      commandHash: buildTerminalWriteCommandHash(text),
    })
    if (guard.blocked) {
      throw new Error(`Terminal loop guard blocked terminal_session_write for ${guard.sessionId}: ${guard.guidance}`)
    }
    const session = sessionManager.writeSession(toolInput?.sessionId, text, {
      actor: 'model',
      submit: toolInput?.submit === true,
    })
    return {
      result: {
        summary: buildTerminalSessionSummary('write', session, {
          inputBytes: Buffer.byteLength(text, 'utf8'),
        }),
        sessionId: session.id,
        session,
      },
      isError: false,
      terminalSessionActivityMeta: buildTerminalSessionActivityMeta('write', session, {
        inputBytes: Buffer.byteLength(text, 'utf8'),
      }),
    }
  }

  if (toolName === 'terminal_session_resize') {
    const session = sessionManager.resizeSession(toolInput?.sessionId, {
      cols: toolInput?.cols,
      rows: toolInput?.rows,
    })
    return {
      result: {
        summary: buildTerminalSessionSummary('resize', session),
        sessionId: session.id,
        session,
      },
      isError: false,
      terminalSessionActivityMeta: buildTerminalSessionActivityMeta('resize', session),
    }
  }

  if (toolName === 'terminal_session_signal') {
    const signaled = sessionManager.signalSession(toolInput?.sessionId, {
      signal: toolInput?.signal,
    })
    return {
      result: {
        summary: buildTerminalSessionSummary('signal', signaled.session, {
          signal: signaled.signal,
        }),
        sessionId: signaled.session?.id,
        session: signaled.session,
        signal: signaled.signal,
      },
      isError: false,
      terminalSessionActivityMeta: buildTerminalSessionActivityMeta('signal', signaled.session, {
        signal: signaled.signal,
      }),
    }
  }

  if (toolName === 'terminal_session_close') {
    const closed = sessionManager.closeSession(toolInput?.sessionId, {
      signal: toolInput?.signal,
      closedBy: 'model',
    })
    const sessionId = asTrimmedString(closed?.sessionId || toolInput?.sessionId)
    const resultSession = {
      id: sessionId,
      status: closed?.closed ? 'closed' : 'closing',
      closeRequested: true,
    }
    return {
      result: {
        summary: buildTerminalSessionSummary('close', resultSession),
        sessionId,
        session: resultSession,
        closing: closed?.closing === true,
        closed: closed?.closed === true,
      },
      isError: false,
      terminalSessionActivityMeta: buildTerminalSessionActivityMeta('close', resultSession, {
        signal: toolInput?.signal,
      }),
    }
  }

  throw new Error(`Unsupported terminal session tool: ${toolName}`)
}
