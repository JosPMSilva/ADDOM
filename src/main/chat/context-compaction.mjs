import { createStreamWithTools } from '../api-clients/ai-provider.mjs'
import { estimateTextTokens } from './token-utils.mjs'

const DEFAULT_SOFT_THRESHOLD = 0.85
const DEFAULT_HARD_THRESHOLD = 0.92
const DEFAULT_TARGET_AFTER_COMPACT = 0.72
const DEFAULT_PRESERVE_RECENT_MESSAGES = 14
const DEFAULT_MIN_COMPACT_CANDIDATES = 6
const MAX_SUMMARY_ITEMS = 30
const MAX_LINE_CHARS = 280
const MAX_COMPACTION_BODY_CHARS = 1_800
const MAX_COMPACTION_MESSAGE_CHARS = 220
const MAX_COMPACTION_TOOL_INPUT_CHARS = 180
const MAX_COMPACTION_TOOL_RESULT_CHARS = 180
const LLM_SUMMARY_MAX_INPUT_CHARS = 12_000
const COMPACTION_SUMMARY_VERSION = 3
const COMPACTION_SUMMARY_HEADER = '[ADDOM Context Compaction]'
const COMPACTION_SUMMARY_POLICY = 'stripped_history_v3'
const TRUNCATED_TOOL_RESULT_HEADER = '[Tool result truncated for model context]'
const PRUNED_TOOL_RESULT_HEADER = '[Old tool result cleared for prompt budget]'
const CONTINUITY_PACKET_HEADER = '[ADDOM Continuity Packet]'
const COMPACTION_HANDOFF_HEADER = '[ADDOM Compaction Handoff]'
const COMPACTION_MARKER_HEADER = '[ADDOM Compaction Marker]'
const EMPTY_TOOL_SURFACE = Object.freeze({})

function clampRatio(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(0.98, Math.max(0.2, n))
}

function flattenMessageContent(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object') return ''
        if (typeof part.text === 'string') return part.text
        if (typeof part.input === 'string') return part.input
        if (part.input && typeof part.input === 'object') {
          try {
            return JSON.stringify(part.input)
          } catch {
            return String(part.input)
          }
        }
        if (part.output && typeof part.output === 'object') {
          try {
            return JSON.stringify(part.output)
          } catch {
            return String(part.output)
          }
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content && typeof content === 'object') {
    try {
      return JSON.stringify(content)
    } catch {
      return String(content)
    }
  }
  return ''
}

function messageTokenEstimate(message) {
  if (!message || typeof message !== 'object') return 0
  const role = String(message.role ?? '')
  const payload = flattenMessageContent(message.content)
  return estimateTextTokens(`${role}\n${payload}`) + 3
}

function truncateLine(text, max = MAX_LINE_CHARS) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max)}...` : value
}

function truncateBlock(text, max = MAX_COMPACTION_BODY_CHARS) {
  const value = String(text ?? '').trim()
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max).trimEnd()}\n...` : value
}

function stringifyCompactValue(value, maxChars = MAX_COMPACTION_MESSAGE_CHARS) {
  if (typeof value === 'string') return truncateLine(value, maxChars)
  if (value == null) return ''
  try {
    return truncateLine(JSON.stringify(value), maxChars)
  } catch {
    return truncateLine(String(value), maxChars)
  }
}

function parseCompactMetadataBlock(text = '', expectedHeader = '') {
  const value = String(text || '')
  if (!value.startsWith(expectedHeader)) return null
  const metadata = {}
  const lines = value.split(/\r?\n/)
  for (const line of lines.slice(1)) {
    const trimmed = String(line || '').trim()
    if (!trimmed) break
    const separator = trimmed.indexOf(':')
    if (separator <= 0) continue
    const key = trimmed.slice(0, separator).trim()
    const rawValue = trimmed.slice(separator + 1).trim()
    if (!key || !rawValue) continue
    metadata[key] = rawValue
  }
  return metadata
}

function summarizeSystemMessageForCompaction(text = '') {
  const value = String(text || '').trim()
  if (!value) return ''
  if (value.includes(CONTINUITY_PACKET_HEADER)) return '[continuity packet omitted from compaction source]'
  if (value.includes(COMPACTION_HANDOFF_HEADER)) return '[compaction handoff omitted from compaction source]'
  if (value.includes(COMPACTION_MARKER_HEADER)) return '[compaction marker omitted from compaction source]'
  if (value.includes(COMPACTION_SUMMARY_HEADER)) return '[prior compaction note omitted from compaction source]'
  return truncateLine(value, MAX_COMPACTION_MESSAGE_CHARS)
}

function summarizeToolResultPartForCompaction(part = {}) {
  const toolName = String(part?.toolName || part?.name || part?.tool || 'unknown').trim() || 'unknown'
  const outputText = typeof part?.output?.value === 'string'
    ? part.output.value
    : stringifyCompactValue(part?.output?.value ?? part?.output ?? '', MAX_COMPACTION_TOOL_RESULT_CHARS)
  const decision = String(part?.decision || '').trim().toLowerCase()
  const isError = part?.isError === true || String(part?.output?.type || '').trim().toLowerCase() === 'error-text'
  const status = isError
    ? 'error'
    : (decision && decision !== 'approved' ? `decision_${decision}` : 'success')
  const prunedMetadata = part?.toolResultHistoryPruned && typeof part.toolResultHistoryPruned === 'object'
    ? part.toolResultHistoryPruned
    : null

  if (prunedMetadata?.pruned === true || outputText.startsWith(PRUNED_TOOL_RESULT_HEADER)) {
    const parsed = parseCompactMetadataBlock(outputText, PRUNED_TOOL_RESULT_HEADER) || {}
    const reason = String(prunedMetadata?.reason || parsed.reason || 'old_noncritical_tool_output').trim()
    const originalChars = Number(prunedMetadata?.originalChars || parsed.original_chars || 0) || 0
    const retentionClass = String(prunedMetadata?.retentionClass || '').trim()
    const outputSha = String(prunedMetadata?.outputSha256 || parsed.output_sha256 || '').trim()
    return {
      text: [
        `tool_result ${toolName} ${status} [history_pruned]`,
        reason ? `reason=${reason}` : '',
        originalChars > 0 ? `original_chars=${originalChars}` : '',
        retentionClass ? `retention=${retentionClass}` : '',
        outputSha ? `sha=${outputSha}` : '',
      ].filter(Boolean).join(' '),
      toolResultCount: 1,
      truncatedToolResultCount: 0,
      prunedToolResultCount: 1,
      persistedToolResultCount: 0,
    }
  }

  if (outputText.startsWith(TRUNCATED_TOOL_RESULT_HEADER)) {
    const parsed = parseCompactMetadataBlock(outputText, TRUNCATED_TOOL_RESULT_HEADER) || {}
    const originalChars = Number(parsed.original_chars || 0) || 0
    const omittedChars = Number(parsed.omitted_chars || 0) || 0
    const previewDirection = String(parsed.preview || '').trim()
    const persistence = String(parsed.full_output_persistence || 'disabled').trim().toLowerCase()
    const spilloverPersistenceState = String(parsed.spillover_persistence_state || '').trim().toLowerCase()
    const spilloverCleanupState = String(parsed.spillover_cleanup_state || '').trim().toLowerCase()
    const spilloverCleanupDeletedFiles = Number(parsed.spillover_cleanup_deleted_files || 0) || 0
    const spilloverRetentionExceeded = String(parsed.spillover_retention_exceeded || '').trim().toLowerCase() === 'true'
    return {
      text: [
        `tool_result ${toolName} ${status} [truncated_for_model_context]`,
        originalChars > 0 ? `original_chars=${originalChars}` : '',
        omittedChars > 0 ? `omitted_chars=${omittedChars}` : '',
        previewDirection ? `preview=${previewDirection}` : '',
        persistence === 'enabled' ? 'persistence=enabled' : '',
        spilloverPersistenceState ? `spillover_state=${spilloverPersistenceState}` : '',
        spilloverCleanupState && spilloverCleanupState !== 'none'
          ? `cleanup=${spilloverCleanupState}`
          : '',
        spilloverRetentionExceeded ? 'retention_exceeded=true' : '',
        spilloverCleanupDeletedFiles > 0
          ? `cleanup_deleted_files=${spilloverCleanupDeletedFiles}`
          : '',
      ].filter(Boolean).join(' '),
      toolResultCount: 1,
      truncatedToolResultCount: 1,
      prunedToolResultCount: 0,
      persistedToolResultCount: persistence === 'enabled' ? 1 : 0,
    }
  }

  return {
    text: `tool_result ${toolName} ${status}: ${truncateLine(outputText, MAX_COMPACTION_TOOL_RESULT_CHARS)}`,
    toolResultCount: 1,
    truncatedToolResultCount: 0,
    prunedToolResultCount: 0,
    persistedToolResultCount: 0,
  }
}

function summarizeMessageForCompaction(message = {}) {
  const role = String(message?.role ?? 'unknown').trim().toUpperCase() || 'UNKNOWN'
  const roleLower = role.toLowerCase()
  const content = message?.content
  let text = ''
  let toolResultCount = 0
  let truncatedToolResultCount = 0
  let prunedToolResultCount = 0
  let persistedToolResultCount = 0

  if (typeof content === 'string') {
    text = roleLower === 'system' || roleLower === 'developer'
      ? summarizeSystemMessageForCompaction(content)
      : truncateLine(content, MAX_COMPACTION_MESSAGE_CHARS)
  } else if (Array.isArray(content)) {
    const partSummaries = []
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const type = String(part.type || '').trim().toLowerCase()
      if (type === 'tool-result') {
        const summarized = summarizeToolResultPartForCompaction(part)
        if (summarized.text) partSummaries.push(summarized.text)
        toolResultCount += Number(summarized.toolResultCount || 0) || 0
        truncatedToolResultCount += Number(summarized.truncatedToolResultCount || 0) || 0
        prunedToolResultCount += Number(summarized.prunedToolResultCount || 0) || 0
        persistedToolResultCount += Number(summarized.persistedToolResultCount || 0) || 0
        continue
      }
      if (type === 'tool-call') {
        const toolName = String(part.toolName || part.name || 'unknown').trim() || 'unknown'
        const inputSummary = stringifyCompactValue(part.input ?? {}, MAX_COMPACTION_TOOL_INPUT_CHARS)
        partSummaries.push(inputSummary
          ? `tool_call ${toolName} input=${inputSummary}`
          : `tool_call ${toolName}`)
        continue
      }
      if (typeof part.text === 'string' && part.text.trim()) {
        partSummaries.push(truncateLine(part.text, MAX_COMPACTION_MESSAGE_CHARS))
        continue
      }
      if (typeof part.input === 'string' && part.input.trim()) {
        partSummaries.push(`input=${truncateLine(part.input, MAX_COMPACTION_TOOL_INPUT_CHARS)}`)
        continue
      }
      const partSummary = stringifyCompactValue(part, MAX_COMPACTION_MESSAGE_CHARS)
      if (partSummary) partSummaries.push(partSummary)
    }
    text = partSummaries.join(' | ')
  } else if (content && typeof content === 'object') {
    text = stringifyCompactValue(content, MAX_COMPACTION_MESSAGE_CHARS)
  }

  if (!text) {
    return {
      text: '',
      toolResultCount,
      truncatedToolResultCount,
      prunedToolResultCount,
      persistedToolResultCount,
    }
  }

  return {
    text: `${role}: ${text}`,
    toolResultCount,
    truncatedToolResultCount,
    prunedToolResultCount,
    persistedToolResultCount,
  }
}

function buildCompactionSource(messages = []) {
  const sourceRows = []
  let toolResultCount = 0
  let truncatedToolResultCount = 0
  let prunedToolResultCount = 0
  let persistedToolResultCount = 0

  for (const message of Array.isArray(messages) ? messages : []) {
    const summarized = summarizeMessageForCompaction(message)
    if (summarized.text) sourceRows.push(summarized.text)
    toolResultCount += Number(summarized.toolResultCount || 0) || 0
    truncatedToolResultCount += Number(summarized.truncatedToolResultCount || 0) || 0
    prunedToolResultCount += Number(summarized.prunedToolResultCount || 0) || 0
    persistedToolResultCount += Number(summarized.persistedToolResultCount || 0) || 0
  }

  return {
    sourceRows,
    stats: {
      removedMessages: Array.isArray(messages) ? messages.length : 0,
      toolResultCount,
      truncatedToolResultCount,
      prunedToolResultCount,
      persistedToolResultCount,
    },
  }
}

function buildCompactionSummaryNote(summaryBody = '', {
  summaryMethod = 'fallback',
  stats = {},
} = {}) {
  const body = truncateBlock(summaryBody, MAX_COMPACTION_BODY_CHARS)
    || '- Continuity preserved with a stripped local summary.'
  return [
    COMPACTION_SUMMARY_HEADER,
    `version: ${COMPACTION_SUMMARY_VERSION}`,
    `summary_method: ${String(summaryMethod || 'fallback').trim() || 'fallback'}`,
    `payload_policy: ${COMPACTION_SUMMARY_POLICY}`,
    'tool_surface: empty',
    `removed_messages: ${Number(stats?.removedMessages || 0) || 0}`,
    `tool_results: ${Number(stats?.toolResultCount || 0) || 0}`,
    `truncated_tool_results: ${Number(stats?.truncatedToolResultCount || 0) || 0}`,
    `pruned_tool_results: ${Number(stats?.prunedToolResultCount || 0) || 0}`,
    `persisted_tool_results: ${Number(stats?.persistedToolResultCount || 0) || 0}`,
    '',
    'summary:',
    body,
  ].join('\n')
}

function buildFallbackSummaryFromMessages(messages = []) {
  const { sourceRows, stats } = buildCompactionSource(messages)
  const lines = []
  for (const row of sourceRows.slice(0, MAX_SUMMARY_ITEMS)) {
    lines.push(`- ${row}`)
  }
  if (sourceRows.length > MAX_SUMMARY_ITEMS) {
    lines.push(`- ... ${sourceRows.length - MAX_SUMMARY_ITEMS} earlier message(s) omitted`)
  }
  return buildCompactionSummaryNote(lines.join('\n'), {
    summaryMethod: 'fallback',
    stats,
  })
}

async function buildLLMSummary(messages = [], {
  providerId = '',
  model = '',
  apiKey = '',
  abortSignal = null,
} = {}) {
  if (!providerId || !apiKey || !model) {
    return null
  }

  const { sourceRows, stats } = buildCompactionSource(messages)
  const inputLines = []
  let totalChars = 0
  for (const row of sourceRows) {
    if (totalChars >= LLM_SUMMARY_MAX_INPUT_CHARS) break
    const line = row.length > 600 ? `${row.slice(0, 600)}...` : row
    inputLines.push(line)
    totalChars += line.length
  }

  const systemPrompt = [
    'You are a context compressor for an AI coding assistant.',
    'You will receive a stripped transcript of older conversation messages.',
    'Summarize it into concise bullet lines that preserve:',
    '1. Key decisions and conclusions reached',
    '2. File paths and code changes mentioned',
    '3. Tool results and their outcomes (especially errors)',
    '4. User requirements and constraints stated',
    '5. Open questions or follow-up items',
    '',
    'Return bullets only. Do not add headings, preambles, or code fences.',
    'Do NOT invent information not present in the messages.',
    'Keep the summary under 10 bullets and under 350 words.',
  ].join('\n')

  const userPrompt = [
    `Summarize these ${sourceRows.length} stripped conversation messages into compact continuity bullets:`,
    '',
    ...inputLines,
  ].join('\n')

  try {
    const { text } = await createStreamWithTools(
      providerId,
      apiKey,
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        model,
        tools: EMPTY_TOOL_SURFACE,
        maxTokens: 800,
        abortSignal,
      },
      () => { },
      () => { },
    )

    const summary = String(text ?? '').trim()
    if (!summary || summary.length < 20) return null

    return buildCompactionSummaryNote(summary, {
      summaryMethod: 'llm',
      stats,
    })
  } catch {
    return null
  }
}

export function estimateHistoryTokens(history = []) {
  if (!Array.isArray(history) || history.length === 0) return 0
  return history.reduce((sum, message) => sum + messageTokenEstimate(message), 0)
}

export async function compactHistoryForContextWindow(history = [], {
  modelLimit = 0,
  softThreshold = DEFAULT_SOFT_THRESHOLD,
  hardThreshold = DEFAULT_HARD_THRESHOLD,
  targetAfterCompactRatio = DEFAULT_TARGET_AFTER_COMPACT,
  preserveRecentMessages = DEFAULT_PRESERVE_RECENT_MESSAGES,
  minCompactCandidates = DEFAULT_MIN_COMPACT_CANDIDATES,
  providerId = '',
  model = '',
  apiKey = '',
  abortSignal = null,
} = {}) {
  const items = Array.isArray(history) ? [...history] : []
  const limit = Number(modelLimit)

  if (!Number.isFinite(limit) || limit <= 0 || items.length < 2) {
    return {
      history: items,
      compacted: false,
      estimatedBeforeTokens: estimateHistoryTokens(items),
      estimatedAfterTokens: estimateHistoryTokens(items),
      removedCount: 0,
      removedMessages: [],
      summary: '',
      summaryMethod: 'none',
    }
  }

  const softRatio = clampRatio(softThreshold, DEFAULT_SOFT_THRESHOLD)
  const hardRatio = clampRatio(hardThreshold, DEFAULT_HARD_THRESHOLD)
  const targetRatio = clampRatio(targetAfterCompactRatio, DEFAULT_TARGET_AFTER_COMPACT)

  const estimatedBeforeTokens = estimateHistoryTokens(items)
  const softLimit = Math.floor(limit * softRatio)
  if (estimatedBeforeTokens <= softLimit) {
    return {
      history: items,
      compacted: false,
      estimatedBeforeTokens,
      estimatedAfterTokens: estimatedBeforeTokens,
      removedCount: 0,
      removedMessages: [],
      summary: '',
      summaryMethod: 'none',
    }
  }

  const preserveTail = Math.max(6, Math.round(Number(preserveRecentMessages) || DEFAULT_PRESERVE_RECENT_MESSAGES))
  const minCandidates = Math.max(2, Math.round(Number(minCompactCandidates) || DEFAULT_MIN_COMPACT_CANDIDATES))

  const sysIdx = items.findIndex((m) => String(m?.role ?? '').toLowerCase() === 'system')
  const systemMessage = sysIdx >= 0 ? items[sysIdx] : null
  const withoutSystem = sysIdx >= 0
    ? [...items.slice(0, sysIdx), ...items.slice(sysIdx + 1)]
    : [...items]

  if (withoutSystem.length <= preserveTail + minCandidates) {
    return {
      history: items,
      compacted: false,
      estimatedBeforeTokens,
      estimatedAfterTokens: estimatedBeforeTokens,
      removedCount: 0,
      removedMessages: [],
      summary: '',
      summaryMethod: 'none',
    }
  }

  const tailStart = Math.max(0, withoutSystem.length - preserveTail)
  const removable = withoutSystem.slice(0, tailStart)
  if (removable.length < minCandidates) {
    return {
      history: items,
      compacted: false,
      estimatedBeforeTokens,
      estimatedAfterTokens: estimatedBeforeTokens,
      removedCount: 0,
      removedMessages: [],
      summary: '',
      summaryMethod: 'none',
    }
  }

  const targetTokens = Math.floor(limit * targetRatio)
  const hardLimit = Math.floor(limit * hardRatio)
  const aggressive = estimatedBeforeTokens > hardLimit
  const removeTarget = aggressive
    ? Math.max(minCandidates, Math.ceil(removable.length * 0.6))
    : Math.max(minCandidates, Math.ceil(removable.length * 0.35))

  const removed = removable.slice(0, removeTarget)
  const keptPrefix = removable.slice(removeTarget)
  const keptTail = withoutSystem.slice(tailStart)

  const llmSummary = await buildLLMSummary(removed, { providerId, model, apiKey, abortSignal })
  const summary = llmSummary || buildFallbackSummaryFromMessages(removed)
  const summaryMethod = llmSummary ? 'llm' : 'fallback'
  const summaryMessage = { role: 'system', content: summary }

  let nextHistory = []
  if (systemMessage) {
    nextHistory = [systemMessage, summaryMessage, ...keptPrefix, ...keptTail]
  } else {
    nextHistory = [summaryMessage, ...keptPrefix, ...keptTail]
  }

  let estimatedAfterTokens = estimateHistoryTokens(nextHistory)
  if (estimatedAfterTokens > targetTokens && removed.length < removable.length) {
    const extraRemoved = removable.slice(removeTarget)
    const allRemoved = [...removed, ...extraRemoved]
    const extraLLMSummary = await buildLLMSummary(allRemoved, { providerId, model, apiKey, abortSignal })
    const extraSummary = extraLLMSummary || buildFallbackSummaryFromMessages(allRemoved)
    const extraSummaryMessage = { role: 'system', content: extraSummary }
    nextHistory = systemMessage
      ? [systemMessage, extraSummaryMessage, ...keptTail]
      : [extraSummaryMessage, ...keptTail]
    estimatedAfterTokens = estimateHistoryTokens(nextHistory)
    return {
      history: nextHistory,
      compacted: true,
      estimatedBeforeTokens,
      estimatedAfterTokens,
      removedCount: removed.length + extraRemoved.length,
      removedMessages: allRemoved,
      summary: extraSummary,
      summaryMethod: extraLLMSummary ? 'llm' : 'fallback',
      llmSummaryUsed: !!extraLLMSummary,
    }
  }

  return {
    history: nextHistory,
    compacted: true,
    estimatedBeforeTokens,
    estimatedAfterTokens,
    removedCount: removed.length,
    removedMessages: removed,
    summary,
    summaryMethod,
    llmSummaryUsed: !!llmSummary,
  }
}
