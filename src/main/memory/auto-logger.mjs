/**
 * auto-logger.mjs - extracts memory nodes and code artifacts from completed turns.
 */

import { addNode } from './memory-store.mjs'
import { recordWrite } from './artifact-store.mjs'

const MAX_CONTENT_LEN = 1200

function isoNow() {
  return new Date().toISOString()
}

function deriveTopic(text, fallback = 'Note') {
  const firstLine = text.split('\n').find((l) => l.trim().length > 10) || text
  const normalized = firstLine
    .replace(/\s+/g, ' ')
    .replace(/`([^`]*)$/g, '$1')
    .trim()
  if (!normalized) return fallback
  if (normalized.length <= 80) return normalized
  const trimmed = normalized.slice(0, 77).replace(/\s+\S*$/, '').trim()
  return `${trimmed || normalized.slice(0, 77).trim()}...`
}

function hashStr(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = (h * 33) ^ str.charCodeAt(i)
  return (h >>> 0).toString(16)
}

const PLACEHOLDER_NAMES = new Set([
  'filename.js', 'example.js', 'path/to/file', 'file.ext', 'yourfile.js',
  'script.py', 'code.py', 'app.js', 'index.js', 'main.py',
])

function normaliseFilename(raw) {
  if (!raw) return null
  let name = raw
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/^["']|["']$/g, '')
    .replace(/[:\s]+$/, '')
    .trim()

  const lc = name.toLowerCase()
  const hasDot = name.includes('.')
  const isKnown = /^(makefile|dockerfile|gemfile|rakefile|procfile|cmakelists\.txt)$/i.test(name)
  if (!hasDot && !isKnown) return null
  if (PLACEHOLDER_NAMES.has(lc)) return null
  if (!/^[a-z0-9_\-./\\]+$/i.test(name)) return null

  name = name.replace(/\\/g, '/')
  name = name.replace(/^\.\//, '')
  return name || null
}

export function extractCodeBlocks(text) {
  if (!text) return []

  const lines = text.split('\n')
  const results = {}

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fenceMatch = line.match(/^(`{3,}|~{3,})(\S*)/)

    if (!fenceMatch) {
      i++
      continue
    }

    const fence = fenceMatch[1]
    const lang = fenceMatch[2]
    const fenceLen = fence.length
    const startIdx = i

    i++
    const bodyLines = []
    while (i < lines.length) {
      const closing = lines[i]
      if (closing.startsWith(fence.slice(0, fenceLen)) && closing.trim().replace(/`|~/g, '').length === 0) {
        i++
        break
      }
      bodyLines.push(lines[i])
      i++
    }

    const body = bodyLines.join('\n')
    if (!body.trim()) continue

    let filePath = null

    const fileTagInBody = body.match(/\[FILE:\s*([^\]]+)\]/i)
    const fileTagBefore = (() => {
      for (let k = startIdx - 1; k >= Math.max(0, startIdx - 4); k--) {
        const m = lines[k].match(/\[FILE:\s*([^\]]+)\]/i)
        if (m) return m[1].trim()
      }
      return null
    })()

    if (fileTagInBody) {
      filePath = normaliseFilename(fileTagInBody[1])
    } else if (fileTagBefore) {
      filePath = normaliseFilename(fileTagBefore)
    }

    if (!filePath && startIdx > 0) {
      const prevLine = lines[startIdx - 1].trim()
      const m = prevLine.match(/^(?:\*\*|`)?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)(?:`|\*\*)?[:\s]*$/)
      if (m) filePath = normaliseFilename(m[1])
    }

    if (!filePath && bodyLines.length > 0) {
      const firstBodyLine = bodyLines[0].trim()
      const m = firstBodyLine.match(/^(?:\/\/|#|--|\/\*)\s*([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)\s*(?:\*\/)?$/)
      if (m) filePath = normaliseFilename(m[1])
    }

    if (!filePath && startIdx > 1) {
      const twoBack = lines[startIdx - 2].trim()
      const m = twoBack.match(/^#+\s+([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)\s*$/)
      if (m) filePath = normaliseFilename(m[1])
    }

    if (!filePath) continue

    results[filePath] = { filePath, content: body, lang: lang || 'plaintext' }
  }

  return Object.values(results)
}

export async function autoLogTurn({
  project,
  userMessage,
  assistantText,
  reasoningText = '',
  toolResults = [],
  captureSuggestions = true,
  activeThreadId = '',
}) {
  if (!project) return []

  const logged = []
  const loggedAtIso = isoNow()
  const normalizedThreadId = String(activeThreadId || '').trim()
  const autoWriteScope = normalizedThreadId ? 'thread' : 'project'
  void userMessage
  void assistantText
  void reasoningText

  // 1) Durable workspace events from approved file mutations.
  for (const tr of toolResults) {
    const isApprovedAddomWrite = (
      ['write_file', 'edit_file', 'rollback_file'].includes(tr.toolName)
      && tr.decision === 'approved'
    )
    const cursorChangeType = String(tr.fileChange?.changeType || '').trim().toLowerCase()
    const isCursorWrite = (
      tr.providerOwned === true
      && tr.executionOwner === 'cursor'
      && tr.source === 'cursor_agent'
      && ['created', 'modified', 'deleted'].includes(cursorChangeType)
    )
    if (!isApprovedAddomWrite && !isCursorWrite) continue

    const filePath = tr.input?.path ?? tr.fileChange?.filePath ?? 'unknown file'
    const actionLabel = isCursorWrite
      ? ({ created: 'File created', modified: 'File edited', deleted: 'File deleted' })[cursorChangeType]
      : (tr.toolName === 'edit_file'
          ? 'File edited'
          : (tr.toolName === 'rollback_file' ? 'File rolled back' : 'File written'))
    const content = [
      `Timestamp: ${loggedAtIso}`,
      `${actionLabel}: ${filePath}`,
      tr.result ? `Result: ${String(tr.result).slice(0, 400)}` : '',
    ].filter(Boolean).join('\n')

    const id = await addNode({
      project,
      topic: `${actionLabel}: ${filePath}`,
      content: content.slice(0, MAX_CONTENT_LEN),
      tags: ['file_write', ...(isCursorWrite ? ['cursor_agent'] : []), filePath.replace(/\\/g, '/').split('/').pop()],
      source: 'workspace_event',
      dataPolicy: 'preserve',
      scope: autoWriteScope,
      threadId: normalizedThreadId || null,
      originThreadId: normalizedThreadId || null,
    })
    logged.push(id)
  }

  // 2) Optional code blocks in prose -> artifact suggestions.
  if (captureSuggestions) {
    const alreadyWritten = new Set(
      toolResults
        .filter((tr) => tr.toolName === 'write_file' && tr.decision === 'approved')
        .map((tr) => (tr.input?.path ?? '').replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()),
    )

    const codeBlocks = extractCodeBlocks(assistantText)
    const seenHashes = new Set()

    for (const block of codeBlocks) {
      const normPath = block.filePath.toLowerCase()
      if (alreadyWritten.has(normPath)) continue

      const contentHash = hashStr(block.content)
      if (seenHashes.has(contentHash)) continue
      seenHashes.add(contentHash)

      try {
        recordWrite({
          project,
          filePath: block.filePath,
          newContent: block.content,
          prevContent: null,
          source: 'ai_suggestion',
          note: 'Suggested by AI - not yet written to disk',
        })
      } catch {
        // Non-fatal.
      }
    }
  }

  // 3) Validated durable decisions/outcomes.
  const DECISION_PATTERNS = [
    /(?:i(?:'ve| have)?\s+(?:decided|concluded|determined|identified|found|fixed|refactored|updated|created|added|removed))[^.!?]{10,}[.!?]/gi,
    /(?:the (?:issue|problem|bug|error|cause) (?:is|was|appears to be))[^.!?]{10,}[.!?]/gi,
    /(?:solution|approach|fix|change)(?:d|s)?\s*(?:is|:)[^.!?]{10,}[.!?]/gi,
  ]
  const conclusions = []
  for (const pattern of DECISION_PATTERNS) {
    conclusions.push(...(assistantText.match(pattern) || []).slice(0, 2))
  }
  if (conclusions.length > 0) {
    const id = await addNode({
      project,
      topic: deriveTopic(conclusions[0], 'AI decision'),
      content: [`Timestamp: ${loggedAtIso}`, conclusions.join(' ')].join('\n').slice(0, MAX_CONTENT_LEN),
      tags: ['decision'],
      source: 'validated_decision',
      dataPolicy: 'standard',
      scope: autoWriteScope,
      threadId: normalizedThreadId || null,
      originThreadId: normalizedThreadId || null,
    })
    logged.push(id)
  }

  return logged
}
