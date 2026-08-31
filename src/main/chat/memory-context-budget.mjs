import { estimateTextTokens } from './token-utils.mjs'

const MEMORY_CONTEXT_MARKER = 'The following is relevant durable context from '

function normalizePositiveInt(value, fallback = 0, min = 0, max = 100_000) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function findMemorySystemMessageIndex(history = []) {
  return Array.isArray(history)
    ? history.findIndex((row) => String(row?.role || '').trim().toLowerCase() === 'system'
        && String(row?.content || '').includes(MEMORY_CONTEXT_MARKER))
    : -1
}

function splitMemorySystemContent(text = '') {
  const content = String(text || '')
  const markerIndex = content.indexOf(MEMORY_CONTEXT_MARKER)
  if (markerIndex < 0) {
    return {
      prefix: content,
      memoryText: '',
    }
  }
  return {
    prefix: content.slice(0, markerIndex).replace(/\s+$/, ''),
    memoryText: content.slice(markerIndex),
  }
}

function parseMemoryText(memoryText = '') {
  const lines = String(memoryText || '').split('\n')
  const bulletStartIndex = lines.findIndex((line) => /^\s*-\s/.test(line))
  if (bulletStartIndex < 0) {
    return {
      headerLines: lines.filter(Boolean),
      bulletLines: [],
    }
  }
  return {
    headerLines: lines.slice(0, bulletStartIndex),
    bulletLines: lines.slice(bulletStartIndex).filter((line) => /^\s*-\s/.test(line)),
  }
}

function buildMemoryText(headerLines = [], bulletLines = []) {
  const lines = [
    ...headerLines,
    ...(headerLines.length > 0 && bulletLines.length > 0 ? [''] : []),
    ...bulletLines,
  ]
  return lines.join('\n').trim()
}

export function applyMemoryContextBudgetToHistory(history = [], {
  maxNodes = 0,
  maxTokens = 0,
} = {}) {
  const rows = Array.isArray(history) ? [...history] : []
  const systemIndex = findMemorySystemMessageIndex(rows)
  if (systemIndex < 0) {
    return {
      history: rows,
      diagnostics: {
        applied: false,
        memoryPresent: false,
        originalNodeCount: 0,
        reducedNodeCount: 0,
        originalTokens: 0,
        reducedTokens: 0,
        reducedByNodes: false,
        reducedByTokens: false,
      },
    }
  }

  const originalContent = String(rows[systemIndex]?.content || '')
  const { prefix, memoryText } = splitMemorySystemContent(originalContent)
  const { headerLines, bulletLines } = parseMemoryText(memoryText)
  const originalNodeCount = bulletLines.length
  const originalTokens = estimateTextTokens(memoryText)
  if (originalNodeCount === 0) {
    return {
      history: rows,
      diagnostics: {
        applied: false,
        memoryPresent: true,
        originalNodeCount,
        reducedNodeCount: originalNodeCount,
        originalTokens,
        reducedTokens: originalTokens,
        reducedByNodes: false,
        reducedByTokens: false,
      },
    }
  }

  let nextBulletLines = [...bulletLines]
  const normalizedMaxNodes = normalizePositiveInt(maxNodes, 0, 0, 64)
  const normalizedMaxTokens = normalizePositiveInt(maxTokens, 0, 0, 64_000)
  const reducedByNodes = normalizedMaxNodes > 0 && nextBulletLines.length > normalizedMaxNodes
  if (reducedByNodes) {
    nextBulletLines = nextBulletLines.slice(0, normalizedMaxNodes)
  }

  let reducedByTokens = false
  let nextMemoryText = buildMemoryText(headerLines, nextBulletLines)
  while (
    normalizedMaxTokens > 0
    && nextBulletLines.length > 1
    && estimateTextTokens(nextMemoryText) > normalizedMaxTokens
  ) {
    nextBulletLines.pop()
    nextMemoryText = buildMemoryText(headerLines, nextBulletLines)
    reducedByTokens = true
  }

  const reducedNodeCount = nextBulletLines.length
  const reducedTokens = estimateTextTokens(nextMemoryText)
  const applied = reducedNodeCount !== originalNodeCount || reducedTokens !== originalTokens
  if (!applied) {
    return {
      history: rows,
      diagnostics: {
        applied: false,
        memoryPresent: true,
        originalNodeCount,
        reducedNodeCount,
        originalTokens,
        reducedTokens,
        reducedByNodes,
        reducedByTokens,
      },
    }
  }

  rows[systemIndex] = {
    ...rows[systemIndex],
    content: prefix ? `${prefix}\n\n${nextMemoryText}` : nextMemoryText,
  }

  return {
    history: rows,
    diagnostics: {
      applied: true,
      memoryPresent: true,
      originalNodeCount,
      reducedNodeCount,
      originalTokens,
      reducedTokens,
      reducedByNodes,
      reducedByTokens,
    },
  }
}
