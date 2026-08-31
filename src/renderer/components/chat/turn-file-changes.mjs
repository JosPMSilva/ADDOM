import { formatRelativeTime } from '../../i18n/formatters.mjs'
import { countLineDelta } from '../../../main/chat/diff-math.mjs'

const FILE_TOOL_NAMES = new Set(['write_file', 'edit_file', 'delete_file', 'rename_file', 'apply_artifact_revision'])
const IGNORED_FILE_CHANGE_SEGMENTS = new Set(['node_modules'])
const UNIFIED_DIFF_HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/
const FILE_CHANGE_KIND_ALIASES = Object.freeze({
  add: 'created',
  added: 'created',
  apply: 'applied',
  applied: 'applied',
  create: 'created',
  created: 'created',
  delete: 'deleted',
  deleted: 'deleted',
  edit: 'edited',
  edited: 'edited',
  modify: 'modified',
  modified: 'modified',
  move: 'renamed',
  moved: 'renamed',
  patch: 'applied',
  remove: 'deleted',
  removed: 'deleted',
  rename: 'renamed',
  renamed: 'renamed',
  revert: 'rolled_back',
  reverted: 'rolled_back',
  rollback: 'rolled_back',
  rolled_back: 'rolled_back',
  roll_back: 'rolled_back',
  update: 'modified',
  updated: 'modified',
  write: 'created',
})

function shouldIgnoreFileChangePath(filePath = '') {
  const normalized = String(filePath || '').replace(/\\/g, '/').trim()
  if (!normalized) return false
  const segments = normalized.split('/').filter(Boolean)
  return segments.some((segment) => IGNORED_FILE_CHANGE_SEGMENTS.has(String(segment || '').trim().toLowerCase()))
}

function readFiniteNumber(...values) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number)) return number
  }
  return 0
}

function readFiniteNumberOrNull(...values) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number)) return number
  }
  return null
}

function normalizeUnifiedDiffText(value = '') {
  const text = String(value ?? '').replace(/\r\n?/g, '\n').trim()
  return text
}

export function deriveLineTotalsFromUnifiedDiff(diffText = '') {
  const text = normalizeUnifiedDiffText(diffText)
  if (!text) return { addedLines: 0, removedLines: 0 }

  let addedLines = 0
  let removedLines = 0
  for (const line of text.split('\n')) {
    if (!line || line === '\\ No newline at end of file') continue
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) {
      addedLines += 1
      continue
    }
    if (line.startsWith('-')) {
      removedLines += 1
    }
  }

  return { addedLines, removedLines }
}

export function buildPreviewRowsFromUnifiedDiff(
  diffText = '',
  { maxRows = Number.POSITIVE_INFINITY, truncateMessage = 'Diff preview truncated.' } = {},
) {
  const text = normalizeUnifiedDiffText(diffText)
  if (!text) return []

  const safeMaxRows = Number.isFinite(Number(maxRows)) && Number(maxRows) > 0
    ? Math.max(1, Number(maxRows))
    : Number.POSITIVE_INFINITY
  const rows = []
  let truncated = false
  let currentOldLine = null
  let currentNewLine = null
  let sawHunk = false

  const pushRow = (row) => {
    if (rows.length >= safeMaxRows) {
      truncated = true
      return false
    }
    rows.push(row)
    return true
  }

  for (const rawLine of text.split('\n')) {
    const line = String(rawLine ?? '')
    const hunkMatch = line.match(UNIFIED_DIFF_HUNK_RE)
    if (hunkMatch) {
      const nextOldLine = Number(hunkMatch[1] || 0) || 0
      const nextNewLine = Number(hunkMatch[3] || 0) || 0
      if (sawHunk && Number.isFinite(currentOldLine) && Number.isFinite(currentNewLine)) {
        const omittedOldLines = Math.max(0, nextOldLine - currentOldLine)
        const omittedNewLines = Math.max(0, nextNewLine - currentNewLine)
        const omittedLines = Math.max(omittedOldLines, omittedNewLines)
        if (omittedLines > 0 && !pushRow({
          kind: 'ellipsis',
          oldLine: null,
          newLine: null,
          text: `${omittedLines} unmodified lines`,
        })) break
      }
      sawHunk = true
      currentOldLine = nextOldLine
      currentNewLine = nextNewLine
      continue
    }

    if (!sawHunk) continue
    if (!line || line === '\\ No newline at end of file') continue

    const marker = line.charAt(0)
    const textValue = line.slice(1)
    if (marker === ' ') {
      if (!pushRow({
        kind: 'context',
        oldLine: currentOldLine,
        newLine: currentNewLine,
        text: textValue,
      })) break
      currentOldLine += 1
      currentNewLine += 1
      continue
    }
    if (marker === '-') {
      if (!pushRow({
        kind: 'delete',
        oldLine: currentOldLine,
        newLine: null,
        text: textValue,
      })) break
      currentOldLine += 1
      continue
    }
    if (marker === '+') {
      if (!pushRow({
        kind: 'add',
        oldLine: null,
        newLine: currentNewLine,
        text: textValue,
      })) break
      currentNewLine += 1
    }
  }

  if (truncated) {
    if (rows.length >= safeMaxRows) rows.pop()
    rows.push({
      kind: 'ellipsis',
      oldLine: null,
      newLine: null,
      text: String(truncateMessage || 'Diff preview truncated.'),
    })
  }

  return rows
}

export function normalizeFileChangeKind(value = '') {
  const candidate = value && typeof value === 'object'
    ? (
        value.kind
        ?? value.type
        ?? value.name
        ?? value.action
        ?? value.op
        ?? value.operation
        ?? value.value
        ?? ''
      )
    : value
  const normalized = String(candidate || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  return FILE_CHANGE_KIND_ALIASES[normalized] || ''
}

export function normalizeFileChange(fileChange = {}, { defaultSource = '' } = {}) {
  if (!fileChange || typeof fileChange !== 'object') return null
  const filePath = String(
    fileChange.filePath
    || fileChange.path
    || fileChange.targetPath
    || fileChange.filename
    || fileChange.file
    || '',
  ).trim()
  if (!filePath) return null
  if (shouldIgnoreFileChangePath(filePath)) return null
  const diffText = normalizeUnifiedDiffText(
    fileChange.diffText
    ?? fileChange.diff
    ?? fileChange.patch
    ?? fileChange.unifiedDiff
    ?? '',
  )
  const explicitAddedLines = readFiniteNumberOrNull(
    fileChange.addedLines,
    fileChange.linesAdded,
    fileChange.insertions,
    fileChange.additions,
  )
  const explicitRemovedLines = readFiniteNumberOrNull(
    fileChange.removedLines,
    fileChange.linesRemoved,
    fileChange.deletions,
    fileChange.removals,
  )
  const derivedLineTotals = (
    explicitAddedLines == null || explicitRemovedLines == null
      ? deriveLineTotalsFromUnifiedDiff(diffText)
      : { addedLines: 0, removedLines: 0 }
  )
  return {
    filePath,
    renamedFrom: String(
      fileChange.renamedFrom
      || fileChange.oldPath
      || fileChange.from
      || fileChange.previousPath
      || '',
    ).trim(),
    newRevId: String(fileChange.newRevId || fileChange.newRevisionId || '').trim(),
    prevRevId: String(fileChange.prevRevId || fileChange.previousRevId || '').trim(),
    rev: readFiniteNumber(fileChange.rev),
    contentBytes: readFiniteNumber(
      fileChange.contentBytes,
      fileChange.sizeBytes,
      fileChange.bytes,
      fileChange.contentLength,
    ),
    addedLines: explicitAddedLines ?? derivedLineTotals.addedLines,
    removedLines: explicitRemovedLines ?? derivedLineTotals.removedLines,
    changeType: normalizeFileChangeKind(
      fileChange.changeType
      ?? fileChange.kind
      ?? fileChange.change
      ?? fileChange.type
      ?? '',
    ),
    source: String(fileChange.source || defaultSource || '').trim().toLowerCase(),
    diffText,
    prevContent: readOptionalContent(
      fileChange.prevContent,
      fileChange.previousContent,
      fileChange.beforeFullFileContent,
    ),
    newContent: readOptionalContent(
      fileChange.newContent,
      fileChange.afterFullFileContent,
      fileChange.content,
    ),
  }
}

export function normalizeFileChangeList(fileChanges = null, { defaultSource = '' } = {}) {
  if (Array.isArray(fileChanges)) {
    return fileChanges
      .map((entry) => normalizeFileChange(entry, { defaultSource }))
      .filter(Boolean)
  }
  if (!fileChanges || typeof fileChanges !== 'object') return []
  if (Array.isArray(fileChanges.changes)) {
    return normalizeFileChangeList(fileChanges.changes, { defaultSource })
  }
  if (Array.isArray(fileChanges.paths) && fileChanges.paths.length > 0) {
    const changeKinds = Array.isArray(fileChanges.changeKinds) ? fileChanges.changeKinds : []
    return fileChanges.paths
      .map((filePath, index) => normalizeFileChange({
        filePath,
        changeType: changeKinds[index] ?? changeKinds[0] ?? '',
        source: fileChanges.source || defaultSource,
      }, { defaultSource }))
      .filter(Boolean)
  }
  const single = normalizeFileChange(fileChanges, { defaultSource })
  return single ? [single] : []
}

function deriveChangeType({ fileChange, activity }) {
  const explicit = normalizeFileChangeKind(fileChange.changeType || '')
  if (
    explicit === 'created'
    || explicit === 'modified'
    || explicit === 'edited'
    || explicit === 'deleted'
    || explicit === 'renamed'
    || explicit === 'rolled_back'
    || explicit === 'applied'
  ) return explicit

  const source = String(fileChange.source || '').trim().toLowerCase()
  if (source === 'apply_artifact_revision') return 'applied'

  const toolName = String(activity?.toolName || '').trim().toLowerCase()
  if (toolName === 'apply_artifact_revision') return 'applied'
  if (toolName === 'delete_file') return 'deleted'
  if (toolName === 'rename_file') return 'renamed'
  if (toolName === 'edit_file') return 'edited'

  if (String(fileChange.prevRevId || '').trim()) return 'modified'
  return 'created'
}

function deriveSource({ fileChange, activity }) {
  const explicit = String(fileChange.source || '').trim().toLowerCase()
  if (explicit) return explicit
  const toolName = String(activity?.toolName || '').trim().toLowerCase()
  if (toolName) return toolName
  return 'ai_write'
}

function makeDedupKey(activity, fileChange) {
  const normalizedPath = String(fileChange?.filePath || '').replace(/\\/g, '/').trim()
  return normalizedPath || String(
    fileChange?.newRevId
      || fileChange?.prevRevId
      || activity?.stepId
      || activity?.sequence
      || activity?.id
      || globalThis.crypto.randomUUID().slice(0, 8),
  )
}

function resolveActivityFileChanges(activity = {}) {
  const defaultSource = String(activity?.toolName || '').trim().toLowerCase()
  const multi = normalizeFileChangeList(activity?.fileChanges, { defaultSource })
  if (multi.length > 0) return multi
  const fallback = normalizeFileChange(activity.fileChange || activity?.toolInput || {}, { defaultSource })
  return fallback ? [fallback] : []
}

function rowPriority(row = {}) {
  let score = 0
  const eventKind = String(row?.eventKind || '').trim().toLowerCase()
  const toolName = String(row?.toolName || '').trim().toLowerCase()
  const fileChange = row?.fileChange && typeof row.fileChange === 'object' ? row.fileChange : {}

  if (eventKind === 'file_change') score += 100
  if (eventKind === 'provider_tool_output' && toolName === 'file_change') score += 80
  if (FILE_TOOL_NAMES.has(toolName)) score += 70
  if (eventKind.startsWith('openai_account_native_')) score += 30
  if (String(row?.type || '').trim().toLowerCase() === 'file_change') score += 10
  if (String(fileChange.newRevId || '').trim()) score += 10
  if (String(fileChange.prevRevId || '').trim()) score += 10
  if (String(fileChange.diffText || '').trim()) score += 8
  if ((Number(fileChange.addedLines || 0) || 0) !== 0 || (Number(fileChange.removedLines || 0) || 0) !== 0) score += 5
  if (String(fileChange.changeType || '').trim()) score += 3

  return score
}

function shouldReplaceRow(existing = {}, candidate = {}) {
  const existingSource = String(existing?.fileChange?.source || '').trim().toLowerCase()
  const candidateSource = String(candidate?.fileChange?.source || '').trim().toLowerCase()
  if (existingSource === 'cursor_agent' && candidateSource === 'cursor_agent') {
    const cursorSequenceDelta = Number(candidate.sequence || 0) - Number(existing.sequence || 0)
    if (cursorSequenceDelta !== 0) return cursorSequenceDelta > 0

    const cursorCreatedAtDelta = Number(candidate.createdAt || 0) - Number(existing.createdAt || 0)
    if (cursorCreatedAtDelta !== 0) return cursorCreatedAtDelta > 0
  }

  const priorityDelta = rowPriority(candidate) - rowPriority(existing)
  if (priorityDelta !== 0) return priorityDelta > 0

  const sequenceDelta = Number(candidate.sequence || 0) - Number(existing.sequence || 0)
  if (sequenceDelta !== 0) return sequenceDelta > 0

  const createdAtDelta = Number(candidate.createdAt || 0) - Number(existing.createdAt || 0)
  if (createdAtDelta !== 0) return createdAtDelta > 0

  const addedDelta = Number(candidate?.fileChange?.addedLines || 0) - Number(existing?.fileChange?.addedLines || 0)
  if (addedDelta !== 0) return addedDelta > 0

  const removedDelta = Number(candidate?.fileChange?.removedLines || 0) - Number(existing?.fileChange?.removedLines || 0)
  if (removedDelta !== 0) return removedDelta > 0

  return false
}

function readOptionalContent(...values) {
  for (const value of values) {
    if (typeof value === 'string') return value
  }
  return null
}

export function readDisplayedLineTotals(fileChange = {}) {
  const added = Number(fileChange.turnNetAddedLines ?? fileChange.addedLines ?? 0) || 0
  const removed = Number(fileChange.turnNetRemovedLines ?? fileChange.removedLines ?? 0) || 0
  return { addedLines: added, removedLines: removed }
}

/**
 * Resolve the before/after revision pair for turn-scoped preview.
 * Prefers the turn baseline so multi-write turns match displayed +/− totals.
 */
export function resolvePreviewRevisionPair(fileChange = {}) {
  const fc = fileChange && typeof fileChange === 'object' ? fileChange : {}
  const afterRevId = String(fc.newRevId || '').trim()
  const lastWritePrevRevId = String(fc.prevRevId || '').trim()
  const turnBaselineChangeType = String(fc.turnBaselineChangeType || fc.changeType || '').trim().toLowerCase()
  const turnBaselinePrevRevId = String(fc.turnBaselinePrevRevId || '').trim()

  // Created-in-turn files start from empty content even if later writes have a prevRevId.
  const beforeRevId = (
    turnBaselineChangeType === 'created'
      ? ''
      : (turnBaselinePrevRevId || lastWritePrevRevId)
  )
  const usesTurnBaseline = Boolean(
    turnBaselineChangeType === 'created'
    || (turnBaselinePrevRevId && turnBaselinePrevRevId !== lastWritePrevRevId),
  )

  const baselineContent = readOptionalContent(
    fc.turnBaselineContent,
    fc.turnBaselinePrevContent,
    fc.prevContent,
  )
  const latestContent = readOptionalContent(fc.newContent)
  const hasInlineTurnContent = (
    turnBaselineChangeType === 'created'
      ? typeof latestContent === 'string'
      : (typeof baselineContent === 'string' && typeof latestContent === 'string')
  )

  return {
    beforeRevId,
    afterRevId,
    lastWritePrevRevId,
    usesTurnBaseline,
    hasInlineTurnContent,
    beforeContent: turnBaselineChangeType === 'created'
      ? ''
      : (typeof baselineContent === 'string' ? baselineContent : null),
    afterContent: typeof latestContent === 'string' ? latestContent : null,
  }
}

export function countPreviewChangedLines(diffRows = []) {
  let addedLines = 0
  let removedLines = 0
  let collapsedRegions = 0
  for (const row of Array.isArray(diffRows) ? diffRows : []) {
    const kind = String(row?.kind || '').trim()
    if (kind === 'add') addedLines += 1
    else if (kind === 'delete') removedLines += 1
    else if (kind === 'ellipsis') collapsedRegions += 1
  }
  return { addedLines, removedLines, collapsedRegions }
}

function applyTurnNetMetadata(existing = null, candidate = {}) {
  const candidateFc = candidate?.fileChange || {}
  const existingFc = existing?.fileChange || {}
  const hasExisting = !!existing

  // Preserve the first write's baseline. Do not adopt a later write's prevRevId
  // when the turn started as a create (empty prev) or when baseline is already set.
  const turnBaselinePrevRevId = String(
    hasExisting
      ? (existingFc.turnBaselinePrevRevId || existingFc.prevRevId || '')
      : (candidateFc.prevRevId || ''),
  ).trim()
  const turnBaselineChangeType = String(
    existingFc.turnBaselineChangeType || existingFc.changeType || candidateFc.changeType || '',
  ).trim()
  const turnBaselineContent = readOptionalContent(
    existingFc.turnBaselineContent,
    existingFc.turnBaselinePrevContent,
    hasExisting ? existingFc.prevContent : candidateFc.prevContent,
  )

  const accumulatedAdded = (
    hasExisting
      ? Number(existingFc.turnNetAddedLines ?? existingFc.addedLines ?? 0) || 0
      : Number(candidateFc.addedLines ?? 0) || 0
  ) + (hasExisting ? Number(candidateFc.addedLines ?? 0) || 0 : 0)
  const accumulatedRemoved = (
    hasExisting
      ? Number(existingFc.turnNetRemovedLines ?? existingFc.removedLines ?? 0) || 0
      : Number(candidateFc.removedLines ?? 0) || 0
  ) + (hasExisting ? Number(candidateFc.removedLines ?? 0) || 0 : 0)

  const latestChangeType = String(candidateFc.changeType || existingFc.changeType || '').trim()
  const latestContent = readOptionalContent(candidateFc.newContent)

  let turnNetAddedLines = accumulatedAdded
  let turnNetRemovedLines = accumulatedRemoved

  const createdThenDeleted = (
    turnBaselineChangeType === 'created'
    && latestChangeType === 'deleted'
  )
  if (createdThenDeleted) {
    turnNetAddedLines = 0
    turnNetRemovedLines = 0
  } else if (turnBaselineContent !== null && latestContent !== null) {
    const delta = countLineDelta(
      turnBaselineContent,
      latestChangeType === 'deleted' ? '' : latestContent,
    )
    turnNetAddedLines = delta.addedLines
    turnNetRemovedLines = delta.removedLines
  } else if (latestChangeType === 'deleted' && turnBaselineContent !== null) {
    const delta = countLineDelta(turnBaselineContent, '')
    turnNetAddedLines = delta.addedLines
    turnNetRemovedLines = delta.removedLines
  }

  return {
    ...candidateFc,
    turnBaselinePrevRevId,
    turnBaselineChangeType,
    ...(turnBaselineContent !== null ? {
      turnBaselineContent,
      turnBaselinePrevContent: turnBaselineContent,
    } : {}),
    turnNetAddedLines,
    turnNetRemovedLines,
  }
}

function mergeTurnFileChangeRow(existing = {}, candidate = {}) {
  return {
    ...candidate,
    fileChange: applyTurnNetMetadata(existing, candidate),
  }
}

function isFileActivity(activity = {}) {
  const type = String(activity.type || '').trim()
  const eventKind = String(activity.eventKind || '').trim()
  const toolName = String(activity.toolName || '').trim()
  const decision = String(activity.decision || '').trim()
  const isError = !!activity.isError
  if (type === 'file_change' || eventKind === 'file_change') return true
  if (Array.isArray(activity.fileChanges) && activity.fileChanges.length > 0) return true
  if (activity.fileChange && typeof activity.fileChange === 'object') return true
  return (
    type === 'result'
    && FILE_TOOL_NAMES.has(toolName)
    && decision !== 'denied'
    && !isError
  )
}

export function collectTurnFileChanges(activities = [], { includeStaged = false } = {}) {
  const rows = Array.isArray(activities) ? activities : []
  const filesByKey = new Map()
  for (const activity of rows) {
    if (!activity || typeof activity !== 'object') continue
    if (!isFileActivity(activity)) continue
    for (const fileChange of resolveActivityFileChanges(activity)) {
      const row = {
        key: makeDedupKey(activity, fileChange),
        activity,
        type: String(activity.type || '').trim(),
        fileChange: {
          ...fileChange,
          changeType: deriveChangeType({ fileChange, activity }),
          source: deriveSource({ fileChange, activity }),
        },
        sequence: Number(activity.sequence || 0) || 0,
        stepId: String(activity.stepId || '').trim(),
        eventKind: String(activity.eventKind || '').trim(),
        turnId: String(activity.turnId || '').trim(),
        createdAt: Number(activity.createdAt || 0) || 0,
        toolName: String(activity.toolName || '').trim(),
      }

      const isStagedOnly = row.eventKind === 'moa_agent_file_staged'
        || String(row.fileChange?.source || '').toLowerCase() === 'moa_stage'
      if (!includeStaged && isStagedOnly) continue

      const existing = filesByKey.get(row.key)
      if (!existing) {
        filesByKey.set(row.key, mergeTurnFileChangeRow(null, row))
        continue
      }
      if (shouldReplaceRow(existing, row)) {
        filesByKey.set(row.key, mergeTurnFileChangeRow(existing, row))
      }
    }
  }

  return Array.from(filesByKey.values()).sort((a, b) => {
    const seqDelta = Number(a.sequence || 0) - Number(b.sequence || 0)
    if (seqDelta !== 0) return seqDelta
    const tsDelta = Number(a.createdAt || 0) - Number(b.createdAt || 0)
    if (tsDelta !== 0) return tsDelta
    return String(a.fileChange?.filePath || '').localeCompare(String(b.fileChange?.filePath || ''))
  })
}

function resolveRowKey(row = {}) {
  return String(
    row?.key
      || row?.stepId
      || row?.sequence
      || row?.fileChange?.newRevId
      || row?.fileChange?.prevRevId
      || row?.fileChange?.filePath
      || '',
  ).trim()
}

export function buildLiveTurnFileChangeState(
  rows = [],
  {
    isLiveTurn = false,
    previousByKey = {},
    prefetchedByRevision = {},
    now = Date.now(),
  } = {},
) {
  const list = Array.isArray(rows) ? rows : []
  const previous = previousByKey && typeof previousByKey === 'object' ? previousByKey : {}
  const prefetched = prefetchedByRevision && typeof prefetchedByRevision === 'object' ? prefetchedByRevision : {}
  const timestamp = Number(now || 0) || Date.now()
  const nextByKey = {}

  for (const row of list) {
    const rowKey = resolveRowKey(row)
    if (!rowKey) continue
    const revisionId = String(row?.fileChange?.newRevId || '').trim()
    const previousState = previous[rowKey] && typeof previous[rowKey] === 'object'
      ? previous[rowKey]
      : {}
    const snapshot = revisionId ? prefetched[revisionId] : null
    const status = String(snapshot?.status || '').trim().toLowerCase()
    const previousRevisionId = String(previousState?.revisionId || '').trim()
    const revisionChanged = !!revisionId && revisionId !== previousRevisionId
    const snapshotUpdatedAt = Number(snapshot?.lastUpdatedAt || 0) || 0
    const baseUpdatedAt = Number(previousState?.lastUpdatedAt || row?.createdAt || 0) || timestamp
    const lastUpdatedAt = revisionChanged
      ? timestamp
      : Math.max(baseUpdatedAt, snapshotUpdatedAt)
    nextByKey[rowKey] = {
      isLive: !!isLiveTurn,
      revisionId,
      diffReady: status === 'ready',
      diffFailed: status === 'error',
      lastUpdatedAt: lastUpdatedAt > 0 ? lastUpdatedAt : timestamp,
    }
  }

  return nextByKey
}

export function formatLiveUpdatedAgo(lastUpdatedAt = 0, now = Date.now()) {
  const updatedAt = Number(lastUpdatedAt || 0) || 0
  if (updatedAt <= 0) return ''
  return formatRelativeTime(updatedAt, {
    now,
    fallback: '',
    numeric: 'auto',
    style: 'narrow',
  })
}

export function summarizeTurnFileChanges(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  return list.reduce(
    (acc, row) => {
      acc.fileCount += 1
      const totals = readDisplayedLineTotals(row?.fileChange || {})
      acc.totalAdded += totals.addedLines
      acc.totalRemoved += totals.removedLines
      return acc
    },
    { fileCount: 0, totalAdded: 0, totalRemoved: 0 },
  )
}
