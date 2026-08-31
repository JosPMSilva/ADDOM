import path from 'node:path'
import { CURSOR_AGENT_MODEL_ID } from '../../common/api-clients/cursor-agent-provider.mjs'
import {
  ASSISTANT_PHASE_COMMENTARY,
  ASSISTANT_PHASE_FINAL_ANSWER,
} from '../../common/chat/assistant-phase.mjs'
import { REASONING_PHASE_BOUNDARY } from '../../common/chat/reasoning-phase-boundary.mjs'
import { endsWithSentenceBoundary } from '../../common/chat/reasoning-sentence-boundary.mjs'
import { buildCanonicalFinalDocument } from '../../common/chat/final-document-contract.mjs'
import { shouldAcceptCursorAssistantEvent } from './cursor-agent-protocol.mjs'
import { commitProjectedTimelineEvent } from '../chat/canonical-root-event-writer.mjs'

const PROVIDER_ID = 'cursor'

function text(value = '') {
  return String(value || '').trim()
}

function safeJson(value, maxLength = 2200) {
  try {
    const result = typeof value === 'string' ? value : JSON.stringify(value)
    return String(result || '').slice(0, maxLength)
  } catch {
    return String(value ?? '').slice(0, maxLength)
  }
}

function toolDescriptor(toolCall = {}) {
  const entry = Object.entries(toolCall || {}).find(([key]) => /toolcall$/i.test(key))
    || Object.entries(toolCall || {})[0]
    || ['toolCall', {}]
  const rawName = String(entry[0] || 'tool').replace(/ToolCall$/i, '')
  const name = rawName.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase() || 'tool'
  const detail = entry[1] && typeof entry[1] === 'object' ? entry[1] : {}
  const args = detail?.args && typeof detail.args === 'object' && !Array.isArray(detail.args)
    ? detail.args
    : {}
  return { name, detail, args }
}

function fileChangeType(toolName = '') {
  if (/delete|remove/.test(toolName)) return 'deleted'
  if (/write|create/.test(toolName)) return 'created'
  return 'modified'
}

function resolveProjectFilePath(candidate = '', projectPath = '') {
  const value = text(candidate)
  const root = text(projectPath)
  if (!value || !root) return ''
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, value)
  const relative = path.relative(resolvedRoot, resolved)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return ''
  return resolved
}

function resolveFilePath(toolName = '', detail = {}, result = {}, projectPath = '') {
  if (!/(^|_)(edit|write|create|delete|remove)(_|$)/.test(toolName)) return ''
  const args = detail?.args && typeof detail.args === 'object' ? detail.args : {}
  const inputCandidate = text(
    args.path || args.filePath || args.file_path || args.targetFile || args.target_file || args.relativePath,
  )
  const outputCandidate = text(
    result.path || result.filePath || result.file_path || result.targetFile || result.target_file,
  )
  const inputPath = inputCandidate ? resolveProjectFilePath(inputCandidate, projectPath) : ''
  const outputPath = outputCandidate ? resolveProjectFilePath(outputCandidate, projectPath) : ''
  if ((inputCandidate && !inputPath) || (outputCandidate && !outputPath)) return ''
  return outputPath || inputPath
}

function successfulToolResult(detail = {}) {
  const result = detail?.result
  if (!result || typeof result !== 'object' || Array.isArray(result)) return {}
  if (Object.hasOwn(result, 'failure') || result.success === false) return null
  if (result.success && typeof result.success === 'object' && !Array.isArray(result.success)) {
    return result.success
  }
  return result
}

function readLineCount(...values) {
  for (const value of values) {
    if (value === '' || value == null) continue
    const number = Number(value)
    if (Number.isFinite(number)) return Math.max(0, Math.trunc(number))
  }
  return null
}

function lineTotalsFromDiff(diffText = '') {
  let addedLines = 0
  let removedLines = 0
  let sawHunk = false
  for (const line of String(diffText || '').replace(/\r\n?/g, '\n').split('\n')) {
    if (line.startsWith('@@')) {
      sawHunk = true
      continue
    }
    if (!sawHunk || line === '\\ No newline at end of file') continue
    if (line.startsWith('+')) addedLines += 1
    else if (line.startsWith('-')) removedLines += 1
  }
  return { addedLines, removedLines }
}

function contentLineCount(value = '') {
  const normalized = String(value ?? '').replace(/\r\n?/g, '\n')
  if (!normalized) return 0
  const lines = normalized.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines.length
}

function mutationMetadata(toolName = '', result = {}) {
  const diffText = String(
    result.diffString ?? result.diffText ?? result.diff ?? result.patch ?? result.unifiedDiff ?? '',
  ).replace(/\r\n?/g, '\n').trim()
  const derived = lineTotalsFromDiff(diffText)
  const addedLines = readLineCount(result.linesAdded, result.addedLines, result.additions)
  const removedLines = readLineCount(result.linesRemoved, result.removedLines, result.deletions)
  let changeType = fileChangeType(toolName)
  const headerText = diffText.split(/^@@/m, 1)[0]
  if (/^---\s+\/dev\/null\s*$/m.test(headerText)) changeType = 'created'
  else if (/^\+\+\+\s+\/dev\/null\s*$/m.test(headerText)) changeType = 'deleted'
  const resolvedAddedLines = changeType === 'deleted'
    ? 0
    : (addedLines ?? derived.addedLines)
  const resolvedRemovedLines = changeType === 'created'
    ? 0
    : (removedLines ?? (derived.removedLines || contentLineCount(result.prevContent)))
  return {
    changeType,
    addedLines: resolvedAddedLines,
    removedLines: resolvedRemovedLines,
    ...(diffText ? { diffText } : {}),
  }
}

function firstOwnedString(source = {}, keys = []) {
  for (const key of keys) {
    if (Object.hasOwn(source, key) && typeof source[key] === 'string') return source[key]
  }
  return null
}

function mutationContents(detail = {}, result = {}, changeType = 'modified') {
  const args = detail?.args && typeof detail.args === 'object' ? detail.args : {}
  const prevContent = firstOwnedString(result, ['beforeFullFileContent', 'prevContent', 'previousContent'])
  if (changeType === 'deleted') return { newContent: '', prevContent }
  const newContent = firstOwnedString(result, ['afterFullFileContent', 'newContent', 'content'])
    ?? firstOwnedString(args, ['fileText', 'content', 'newContent'])
  if (newContent === null) return null
  return { newContent, prevContent }
}

function enrichToolInputFromResult(args = {}, result = {}) {
  const input = args && typeof args === 'object' && !Array.isArray(args) ? { ...args } : {}
  const success = result && typeof result === 'object' && !Array.isArray(result)
    ? (result.success && typeof result.success === 'object' && !Array.isArray(result.success)
      ? result.success
      : result)
    : {}
  const assignIfMissing = (key, ...candidates) => {
    if (text(input[key])) return
    for (const candidate of candidates) {
      const value = text(candidate)
      if (value) {
        input[key] = value
        return
      }
    }
  }
  assignIfMissing(
    'path',
    success.path,
    success.filePath,
    success.file_path,
    success.targetFile,
    success.target_file,
  )
  assignIfMissing('command', success.command, success.script)
  assignIfMissing('pattern', success.pattern, success.query, success.glob, success.globPattern)
  assignIfMissing('query', success.query, success.pattern)
  return input
}

function nextAssistantDelta(previous = '', incoming = '') {
  const prior = String(previous || '')
  const current = String(incoming || '')
  if (!current || current === prior) return { delta: '', full: prior }
  if (prior && current.startsWith(prior)) return { delta: current.slice(prior.length), full: current }
  return { delta: current, full: `${prior}${current}` }
}

function mergeAssistantSnapshot(previous = '', incoming = '') {
  const prior = String(previous || '')
  const current = String(incoming || '')
  if (!current || current === prior || prior.startsWith(current)) return prior
  if (current.startsWith(prior)) return current
  return `${prior}${current}`
}

// Cursor `result.result` concatenates every assistant segment. Prefer the
// post-tool snapshot (text-format semantics). If that is empty, peel flushed
// mid-turn commentary off the concat before accepting a leftover final answer.
export function resolveCursorFinalAssistantText({
  snapshot = '',
  resultText = '',
  flushedCommentary = [],
} = {}) {
  const snap = String(snapshot || '').trim()
  if (snap) return snap
  let remaining = String(resultText || '')
  for (const segment of flushedCommentary) {
    const seg = String(segment || '')
    if (!seg) continue
    if (remaining.startsWith(seg)) {
      remaining = remaining.slice(seg.length)
      continue
    }
    const withNl = `${seg}\n`
    if (remaining.startsWith(withNl)) remaining = remaining.slice(withNl.length)
  }
  return remaining.trim()
}

export function createCursorAgentEventMapper({
  send = () => {},
  persistTimelineEvent = () => {},
  commitFinalTurn = null,
  projectPath = '',
  threadId = '',
  turnId = '',
  assistantMessageId = '',
  providerId = PROVIDER_ID,
  model = CURSOR_AGENT_MODEL_ID,
  recordFileChange = () => null,
} = {}) {
  const commitProjection = (kind, options, channel, payload) => commitProjectedTimelineEvent({
    persistTimelineEvent, send, kind, options, channel, payload,
  })
  let assistantText = ''
  let assistantSnapshot = ''
  let reasoningText = ''
  let sequence = 0
  let result = null
  const toolResults = []
  const flushedCommentary = []
  let commentaryRound = 0
  let sawStreamingTimestamp = false
  let reasoningSegment = 0
  let pendingReasoningSegmentBump = false
  let assistantChunkSent = false
  const base = () => ({
    threadId,
    turnId,
    ...(assistantMessageId ? { assistantMessageId } : {}),
    providerId,
    model,
    executionOwner: 'cursor',
    providerOwned: true,
    reasoningSegment,
  })
  const applyPendingReasoningSegmentBump = () => {
    if (!pendingReasoningSegmentBump) return
    if (!endsWithSentenceBoundary(reasoningText)) return
    reasoningSegment += 1
    pendingReasoningSegmentBump = false
  }
  const flushAssistantCommentary = () => {
    const commentary = String(assistantSnapshot || '').trim()
    assistantSnapshot = ''
    if (!commentary) return
    commentaryRound += 1
    flushedCommentary.push(commentary)
    const payload = {
      ...base(),
      text: commentary,
      round: commentaryRound,
      phase: ASSISTANT_PHASE_COMMENTARY,
      emittedAt: Date.now(),
    }
    commitProjection('execution_commentary_chunk', {
      role: 'assistant',
      content: commentary,
      meta: payload,
    }, 'chat:assistant-commentary', payload)
  }
  const flushAssistantAnswer = () => {
    const text = assistantText || assistantSnapshot
    if (!text || assistantChunkSent) return text
    send('chat:chunk', {
      ...base(),
      chunk: text,
      phase: ASSISTANT_PHASE_FINAL_ANSWER,
      sequence: ++sequence,
      emittedAt: Date.now(),
    })
    assistantChunkSent = true
    return text
  }
  return {
    handle(event = {}) {
      if (event.kind === 'thinking_delta') {
        const next = nextAssistantDelta(reasoningText, event.text)
        if (!next.delta) return
        reasoningText = next.full
        const payload = {
          ...base(),
          chunk: next.delta,
          sequence: ++sequence,
          emittedAt: Date.now(),
        }
        commitProjection('execution_reasoning_chunk', {
          role: 'assistant',
          content: next.delta,
          meta: payload,
        }, 'chat:reasoning-chunk', payload)
        // Bump only after emitting into the current segment so the completing
        // clause stays with pre-tool text.
        applyPendingReasoningSegmentBump()
        return
      }
      if (event.kind === 'thinking_completed') {
        // Mid-sentence phases must not force a hard paragraph break.
        if (!endsWithSentenceBoundary(reasoningText)) {
          applyPendingReasoningSegmentBump()
          return
        }
        const payload = {
          ...base(),
          chunk: REASONING_PHASE_BOUNDARY,
          sequence: ++sequence,
          emittedAt: Date.now(),
          phaseBoundary: true,
        }
        commitProjection('execution_reasoning_chunk', {
          role: 'assistant',
          content: REASONING_PHASE_BOUNDARY,
          meta: payload,
        }, 'chat:reasoning-chunk', payload)
        applyPendingReasoningSegmentBump()
        return
      }
      if (event.kind === 'assistant_delta') {
        if (!shouldAcceptCursorAssistantEvent(event, { sawStreamingTimestamp })) return
        if (event.timestampMs != null) sawStreamingTimestamp = true
        const next = nextAssistantDelta(assistantSnapshot, event.text)
        assistantSnapshot = next.full
        return
      }
      if (event.kind === 'tool_started' || event.kind === 'tool_completed') {
        // Mid-turn assistant narration belongs in the execution stream (Cursor
        // text-format: only the last post-tool assistant message is the answer).
        if (event.kind === 'tool_started') flushAssistantCommentary()
        const descriptor = toolDescriptor(event.toolCall)
        const mutationResult = event.kind === 'tool_completed'
          ? successfulToolResult(descriptor.detail)
          : {}
        const payload = {
          ...base(),
          toolCallId: text(event.callId),
          toolName: descriptor.name,
          type: event.kind === 'tool_started' ? 'tool-input-start' : 'tool-output',
          toolInput: descriptor.args,
          ...(event.kind === 'tool_completed' ? { isError: mutationResult === null } : {}),
        }
        if (event.kind === 'tool_started') {
          commitProjection('provider_tool_status', {
            role: 'assistant', content: `Cursor activity: ${descriptor.name}`, meta: payload,
            lifecycle: 'active', progressiveKey: `cursor_tool:${text(event.callId) || descriptor.name}`,
          }, 'chat:provider-tool-status', payload)
          if (!reasoningText.trim() || endsWithSentenceBoundary(reasoningText)) {
            reasoningSegment += 1
            pendingReasoningSegmentBump = false
          } else {
            pendingReasoningSegmentBump = true
          }
          return
        }
        const output = descriptor.detail?.result ?? descriptor.detail
        const toolInput = enrichToolInputFromResult(descriptor.args, output)
        const outputPayload = { ...payload, output, toolInput }
        commitProjection('provider_tool_output', {
          role: 'assistant',
          content: `Cursor activity: ${descriptor.name}`,
          meta: { ...payload, output: safeJson(output), toolInput },
        }, 'chat:provider-tool-output', outputPayload)
        const changedPath = mutationResult
          ? resolveFilePath(descriptor.name, descriptor.detail, mutationResult, projectPath)
          : ''
        if (changedPath) {
          const metadata = mutationMetadata(descriptor.name, mutationResult)
          const contents = mutationContents(descriptor.detail, mutationResult, metadata.changeType)
          let artifactRecord = null
          try {
            artifactRecord = recordFileChange({
              projectPath,
              filePath: changedPath,
              ...metadata,
              ...(contents || {}),
              threadId,
              turnId,
            })
          } catch {
            artifactRecord = null
          }
          const changePayload = {
            ...base(),
            stepId: text(event.callId),
            sequence: ++sequence,
            filePath: changedPath,
            source: 'cursor_agent',
            ...metadata,
            ...(artifactRecord || {}),
          }
          commitProjection('file_change', {
            role: 'assistant',
            content: `Cursor changed ${changedPath}.`,
            meta: changePayload,
          }, 'chat:file-change', changePayload)
          if (artifactRecord?.newRevId) {
            send('artifacts:updated', {
              threadId,
              turnId,
              filePath: artifactRecord.artifactFilePath || changedPath,
              newRevId: artifactRecord.newRevId,
            })
          }
          toolResults.push({
            toolName: descriptor.name,
            decision: 'provider_owned',
            providerOwned: true,
            executionOwner: 'cursor',
            source: 'cursor_agent',
            input: { path: artifactRecord?.artifactFilePath || path.relative(projectPath, changedPath).replace(/\\/g, '/') },
            result: `Cursor ${metadata.changeType} ${artifactRecord?.artifactFilePath || changedPath}.`,
            fileChange: changePayload,
          })
        }
        return
      }
      if (event.kind === 'result') {
        result = event
        assistantText = resolveCursorFinalAssistantText({
          snapshot: assistantSnapshot,
          resultText: event.result,
          flushedCommentary,
        })
        assistantSnapshot = ''
        flushAssistantAnswer()
      }
    },
    complete() {
      const finalDocument = assistantMessageId
        ? buildCanonicalFinalDocument({
          threadId,
          turnId,
          messageId: assistantMessageId,
          text: assistantText,
          hasAuthoritativeMessageBinding: true,
          allowEmptyText: true,
        })
        : null
      if (reasoningText) {
        const payload = {
          ...base(),
          full: reasoningText,
          emittedAt: Date.now(),
        }
        commitProjection('reasoning_done', {
          role: 'assistant',
          content: reasoningText,
          meta: payload,
        }, 'chat:reasoning-done', payload)
      }
      const donePayload = {
        ...base(),
        full: assistantText,
        phase: ASSISTANT_PHASE_FINAL_ANSWER,
        ...(finalDocument ? { finalDocument } : {}),
        emittedAt: Date.now(),
      }
      const assistantMeta = {
        ...base(),
        phase: ASSISTANT_PHASE_FINAL_ANSWER,
        stopReason: text(result?.status || 'success'),
        cursorSessionId: text(result?.sessionId),
        cursorRequestId: text(result?.requestId),
        ...(finalDocument ? { finalDocument } : {}),
      }
      if (typeof commitFinalTurn === 'function') {
        commitFinalTurn({
          donePayload,
          assistantMeta,
          terminalPayload: {
            status: 'ok',
            providerId,
            model,
            executionOwner: 'cursor',
            providerOwned: true,
          },
        })
      } else {
        persistTimelineEvent('assistant_message', {
          role: 'assistant',
          content: assistantText,
          meta: assistantMeta,
        })
        send('chat:done', donePayload)
      }
      return assistantText
    },
    flushPartial: flushAssistantAnswer,
    getText: () => assistantText || assistantSnapshot,
    getResult: () => result,
    getToolResults: () => [...toolResults],
  }
}

export const __testCursorAgentEventMapperInternals = Object.freeze({
  contentLineCount,
  lineTotalsFromDiff,
  mutationMetadata,
  mutationContents,
  mergeAssistantSnapshot,
  nextAssistantDelta,
  resolveCursorFinalAssistantText,
  resolveFilePath,
  successfulToolResult,
  toolDescriptor,
})
