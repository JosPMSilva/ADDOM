import path from 'node:path'
import * as vault from '../vault.mjs'
import { getSettings } from '../settings.mjs'
import { touchProjectUsageByThread } from '../workspace/workspace-store.mjs'
import { normalizeCursorProviderAuthMethod } from '../../common/api-clients/provider-credential-state.mjs'
import { resolveCursorAgentModelId } from '../../common/api-clients/cursor-agent-provider.mjs'
import { getCursorAgentAuthService } from './cursor-agent-auth-service.mjs'
import { createCursorAgentEventMapper } from './cursor-agent-event-mapper.mjs'
import { createCursorAgentProcessRunner } from './cursor-agent-process.mjs'
import { getCursorAgentSessionRegistry } from './cursor-agent-session-registry.mjs'
import { ensureCursorAgentStorage } from './cursor-agent-storage.mjs'
import { sanitizeCursorAgentText } from './cursor-agent-sanitization.mjs'
import { recordCursorAgentFileChange } from './cursor-agent-artifact-recorder.mjs'

function normalizedPath(value = '') {
  const raw = String(value || '').trim()
  if (!raw || !path.isAbsolute(raw)) return ''
  const resolved = path.resolve(raw)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function assertExecutionBoundary({
  mode = '', permissionMode = '', projectId = '', threadId = '',
  activeProjectPath = '', requestedProjectPath = '', prompt = '', model = '',
} = {}) {
  if (String(mode || '').trim().toLowerCase() !== 'execute') {
    throw new Error('Cursor Composer is available only in Chat Execute mode.')
  }
  if (String(permissionMode || '').trim().toLowerCase() !== 'full_access') {
    throw new Error('Cursor Composer requires Full Access because Cursor controls execution.')
  }
  const resolvedModel = resolveCursorAgentModelId(model)
  if (!String(projectId || '').trim() || !String(threadId || '').trim()) {
    throw new Error('Cursor Composer requires an active project and thread.')
  }
  const authoritativePath = normalizedPath(activeProjectPath)
  if (!authoritativePath) throw new Error('Cursor Composer requires an active project folder.')
  const requestedPath = String(requestedProjectPath || '').trim()
  if (requestedPath && normalizedPath(requestedPath) !== authoritativePath) {
    throw new Error('Cursor Composer can run only in the active project folder.')
  }
  if (!String(prompt || '').trim()) throw new Error('Cursor Composer requires a user message.')
  return {
    projectPath: path.resolve(String(activeProjectPath).trim()),
    modelId: resolvedModel,
  }
}

function isStaleSessionFailure(result = {}) {
  const detail = `${result?.stderr || ''}\n${result?.error?.message || ''}`
  return /session\s+(not found|does not exist|invalid|expired)|invalid\s+session|failed to resume/i.test(detail)
}

function buildFailure(result = {}) {
  const message = sanitizeCursorAgentText(
    result?.error?.message || result?.stderr || 'Cursor Composer did not complete the request.',
  ).trim()
  const error = new Error(message || 'Cursor Composer did not complete the request.')
  error.code = 'cursor_agent_run_failed'
  return error
}

export function createCursorAgentChatExecutor({
  readSettings = getSettings,
  getApiKey = (providerId) => vault.getKey(providerId),
  authService = getCursorAgentAuthService(),
  processRunner = createCursorAgentProcessRunner(),
  sessionRegistry = getCursorAgentSessionRegistry(),
  ensureStorage = ensureCursorAgentStorage,
  touchUsage = touchProjectUsageByThread,
  recordFileChange = recordCursorAgentFileChange,
} = {}) {
  return async function executeCursorAgentChatRun(input = {}) {
    const { projectPath, modelId } = assertExecutionBoundary(input)
    const settings = readSettings()
    const authMethod = normalizeCursorProviderAuthMethod(
      settings?.providerAuthSettings?.cursor?.authMethod,
      'account',
    )
    const state = await authService.getState({ forceRefresh: true })
    if (state?.runtime?.status !== 'runtime_ready' || !String(state?.runtime?.commandPath || '').trim()) {
      throw new Error('Cursor Agent runtime is not ready. Install it from Provider settings first.')
    }
    const apiKey = authMethod === 'api_key' ? String(getApiKey('cursor') || '') : ''
    if (authMethod === 'api_key' && !apiKey) {
      throw new Error('Cursor API key mode is selected, but no API key is configured.')
    }
    if (authMethod === 'account' && state?.account?.status !== 'authenticated') {
      throw new Error('Cursor account mode is selected, but no account is connected.')
    }

    const sessionInput = {
      projectId: String(input.projectId || '').trim(),
      threadId: String(input.threadId || '').trim(),
      projectPath,
    }
    let sessionId = String(sessionRegistry.get(sessionInput)?.sessionId || '').trim()
    const profilePaths = ensureStorage()
    input.sendTurnState?.('started', {
      providerId: 'cursor', model: modelId,
      executionOwner: 'cursor', providerOwned: true,
    })

    const runAttempt = async (resumeSessionId = '') => {
      const mapper = createCursorAgentEventMapper({
        send: input.send,
        persistTimelineEvent: input.persistTimelineEvent,
        commitFinalTurn: input.commitFinalTurn,
        projectPath,
        threadId: sessionInput.threadId,
        turnId: String(input.turnId || '').trim(),
        assistantMessageId: String(input.assistantMessageId || '').trim(),
        model: modelId,
        recordFileChange,
      })
      const run = processRunner.start({
        commandPath: state.runtime.commandPath,
        cwd: projectPath,
        prompt: String(input.prompt || '').trim(),
        model: modelId,
        sessionId: resumeSessionId,
        apiKey,
        profilePaths,
        onEvent: (event) => {
          if (event.kind === 'init') {
            if (normalizedPath(event.cwd) !== normalizedPath(projectPath)) {
              throw new Error('Cursor Agent reported a workspace outside the active project.')
            }
            sessionRegistry.set({ ...sessionInput, sessionId: event.sessionId })
          }
          mapper.handle(event)
        },
      })
      const abort = () => { void run.cancel() }
      const signal = input.loop?.abortController?.signal
      signal?.addEventListener?.('abort', abort, { once: true })
      if (signal?.aborted) abort()
      try {
        const result = await run.completed
        return { mapper, result, cancel: () => run.cancel() }
      } finally {
        signal?.removeEventListener?.('abort', abort)
      }
    }

    let attempt = await runAttempt(sessionId)
    if (
      sessionId
      && attempt.result?.status === 'failed'
      && !attempt.mapper.getText()
      && isStaleSessionFailure(attempt.result)
    ) {
      try { await attempt.cancel?.() } catch { /* best-effort cancel before retry */ }
      sessionRegistry.deleteThread(sessionInput.threadId)
      sessionId = ''
      attempt = await runAttempt('')
    }

    if (attempt.result?.status === 'cancelled' || input.loop?.cancelled === true) {
      attempt.mapper.flushPartial()
      const partial = attempt.mapper.getText()
      if (partial) {
        input.persistTimelineEvent?.('assistant_partial', {
          role: 'assistant',
          content: partial,
          meta: { providerId: 'cursor', model: modelId, status: 'cancelled' },
        })
      }
      input.sendCancelled?.(input.loop?.cancelReason || 'Stopped by user.')
      return { status: 'cancelled', partial }
    }
    const cursorResult = attempt.mapper.getResult()
    if (attempt.result?.status !== 'completed' || cursorResult?.isError === true) {
      attempt.mapper.flushPartial()
      const partial = attempt.mapper.getText()
      if (partial) {
        input.persistTimelineEvent?.('assistant_partial', {
          role: 'assistant',
          content: partial,
          meta: { providerId: 'cursor', model: modelId, status: 'error' },
        })
      }
      throw buildFailure(attempt.result)
    }

    const full = attempt.mapper.complete()
    touchUsage(sessionInput.threadId, 'cursor', modelId)
    if (typeof input.commitFinalTurn === 'function') {
      if (input.loop) input.loop.turnStateFinalized = true
    } else {
      input.sendTurnState?.('completed', {
        status: 'ok', providerId: 'cursor', model: modelId,
        executionOwner: 'cursor', providerOwned: true,
      })
    }
    return { status: 'completed', full, toolResults: attempt.mapper.getToolResults() }
  }
}

export const __testCursorAgentChatExecutionInternals = Object.freeze({
  assertExecutionBoundary,
  isStaleSessionFailure,
  normalizedPath,
})

let singleton = null

export function getCursorAgentChatExecutor() {
  if (!singleton) singleton = createCursorAgentChatExecutor()
  return singleton
}

export function __resetCursorAgentChatExecutorForTests() {
  singleton = null
}
