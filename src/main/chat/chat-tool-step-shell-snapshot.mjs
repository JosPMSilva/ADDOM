import fs from 'node:fs/promises'
import path from 'path'
import { recordWrite } from '../memory/artifact-store.mjs'
import { countLineDelta } from './diff-math.mjs'
import { buildPreviewableUnifiedDiff } from '../tools/apply-patch-core.mjs'

const MAX_PREVIEW_FILE_BYTES = 1_048_576
const MAX_SHELL_SNAPSHOT_FILES = 6_000
const MAX_SHELL_TRACKED_CHANGES = 64
const SHELL_SNAPSHOT_IGNORED_DIRS = new Set(['.git'])
const SHELL_BROAD_CHURN_COMMAND_RE = /\b(?:npm|pnpm|yarn|bun|pip|pip3|poetry|composer|cargo|dotnet|go)\s+(?:install|add|update|upgrade|restore|sync|vendor)\b|\b(?:prettier|eslint|stylelint|black|ruff|isort|goimports|gofmt|rustfmt)\b[\s\S]*(?:--write|--fix)?|\b(?:create|scaffold|generate|init)\b/i
const SHELL_STATE_KIND_PRESENT = 'present'
const SHELL_STATE_KIND_MISSING = 'missing'
const SHELL_STATE_KIND_OVERSIZED = 'oversized'
const SHELL_STATE_KIND_BINARY = 'binary'
const SHELL_STATE_KIND_UNREADABLE = 'unreadable'
const SHELL_STATE_KIND_NOT_FILE = 'not_file'

function toPosixRelative(filePath = '') {
  return String(filePath || '').replace(/\\/g, '/')
}

function uniqueShellReasonCodes(values = []) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean),
  ))
}

function buildShellHydrationDiagnostics({
  status = 'non_file',
  source = 'run_command',
  reasonCodes = [],
  changedPaths = [],
  candidatePaths = [],
  snapshotTruncated = false,
} = {}) {
  return {
    status: String(status || 'non_file').trim().toLowerCase(),
    source: String(source || 'run_command').trim().toLowerCase(),
    reasonCodes: uniqueShellReasonCodes(reasonCodes),
    changedPathCount: Array.isArray(changedPaths) ? changedPaths.length : 0,
    candidatePathCount: Array.isArray(candidatePaths) ? candidatePaths.length : 0,
    changedPathsPreview: Array.isArray(changedPaths) ? changedPaths.slice(0, 8) : [],
    candidatePathsPreview: Array.isArray(candidatePaths) ? candidatePaths.slice(0, 8) : [],
    snapshotTruncated: snapshotTruncated === true,
  }
}

function buildShellWriteDetectionOutcome({
  changes = [],
  diagnostics = null,
} = {}) {
  return {
    changes: Array.isArray(changes) ? changes : [],
    diagnostics: diagnostics && typeof diagnostics === 'object' ? diagnostics : null,
  }
}

function shellSuppressedOutcome({
  source = 'run_command',
  reasonCodes = [],
  changedPaths = [],
  candidatePaths = [],
  snapshotTruncated = false,
} = {}) {
  return buildShellWriteDetectionOutcome({
    changes: [],
    diagnostics: buildShellHydrationDiagnostics({
      status: 'suppressed',
      source,
      reasonCodes,
      changedPaths,
      candidatePaths,
      snapshotTruncated,
    }),
  })
}

function shellNonFileOutcome({
  source = 'run_command',
  reasonCodes = [],
  changedPaths = [],
  candidatePaths = [],
  snapshotTruncated = false,
} = {}) {
  return buildShellWriteDetectionOutcome({
    changes: [],
    diagnostics: buildShellHydrationDiagnostics({
      status: 'non_file',
      source,
      reasonCodes,
      changedPaths,
      candidatePaths,
      snapshotTruncated,
    }),
  })
}

function shellNoWriteOutcome({
  source = 'run_command',
  reasonCodes = [],
  changedPaths = [],
  candidatePaths = [],
  snapshotTruncated = false,
} = {}) {
  return buildShellWriteDetectionOutcome({
    changes: [],
    diagnostics: buildShellHydrationDiagnostics({
      status: 'no_write',
      source,
      reasonCodes,
      changedPaths,
      candidatePaths,
      snapshotTruncated,
    }),
  })
}

function shellHydratedOutcome({
  source = 'run_command',
  changes = [],
  changedPaths = [],
  candidatePaths = [],
  snapshotTruncated = false,
} = {}) {
  return buildShellWriteDetectionOutcome({
    changes,
    diagnostics: buildShellHydrationDiagnostics({
      status: 'hydrated',
      source,
      changedPaths,
      candidatePaths,
      snapshotTruncated,
    }),
  })
}

function isBroadShellMutationCommand(commandText = '') {
  return SHELL_BROAD_CHURN_COMMAND_RE.test(String(commandText || ''))
}

function toRelativeWithinRoot(projectFolder = '', value = '') {
  const root = String(projectFolder || '').trim()
  const raw = String(value || '').trim()
  if (!root || !raw) return ''
  const unquoted = raw.replace(/^['"`]|['"`]$/g, '')
  if (!unquoted) return ''
  try {
    const absolute = path.resolve(root, unquoted)
    const relative = path.relative(root, absolute)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return ''
    return toPosixRelative(relative)
  } catch {
    return ''
  }
}

function resolveRenameDestinationWithinRoot(projectFolder = '', fromPath = '', destination = '') {
  const root = String(projectFolder || '').trim()
  const from = String(fromPath || '').trim()
  const rawDestination = String(destination || '').trim()
  if (!root || !from || !rawDestination) return ''
  const unquotedDestination = rawDestination.replace(/^['"`]|['"`]$/g, '')
  if (!unquotedDestination) return ''
  try {
    const fromAbsolute = path.resolve(root, from)
    const nextAbsolute = path.isAbsolute(unquotedDestination)
      ? path.resolve(unquotedDestination)
      : path.resolve(path.dirname(fromAbsolute), unquotedDestination)
    const relative = path.relative(root, nextAbsolute)
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return ''
    return toPosixRelative(relative)
  } catch {
    return ''
  }
}

function appendShellMutationHint(target = null, {
  filePath = '',
  renamedFrom = '',
} = {}) {
  if (!target || typeof target !== 'object') return
  const normalizedPath = String(filePath || '').trim()
  const normalizedRenamedFrom = String(renamedFrom || '').trim()
  if (!normalizedPath) return
  if (!(target.candidatePathSet instanceof Set)) target.candidatePathSet = new Set()
  target.candidatePathSet.add(normalizedPath)
  if (normalizedRenamedFrom) target.candidatePathSet.add(normalizedRenamedFrom)
}

function buildShellMutationHints(projectFolder = '', commandText = '') {
  const text = String(commandText || '')
  const normalizedCommandText = text.trim()
  const hints = {
    broadCommand: false,
    suppressionReason: '',
    renames: [],
    candidatePathSet: new Set(),
  }
  if (!normalizedCommandText) {
    return {
      broadCommand: false,
      suppressionReason: '',
      renames: [],
      candidatePaths: [],
    }
  }
  if (isBroadShellMutationCommand(normalizedCommandText)) {
    hints.broadCommand = true
    hints.suppressionReason = 'broad_command'
  }

  const push = (rawPath) => {
    const normalizedPath = toRelativeWithinRoot(projectFolder, rawPath)
    if (!normalizedPath) return
    appendShellMutationHint(hints, { filePath: normalizedPath })
  }
  const pushRename = (fromPath, toPath) => {
    const from = toRelativeWithinRoot(projectFolder, fromPath)
    const to = toRelativeWithinRoot(projectFolder, toPath)
    if (!from || !to) return
    appendShellMutationHint(hints, {
      filePath: to,
      renamedFrom: from,
    })
    hints.renames.push({ from, to })
  }
  const pushRenameWithinSourceDir = (fromPath, newName) => {
    const from = toRelativeWithinRoot(projectFolder, fromPath)
    const to = resolveRenameDestinationWithinRoot(projectFolder, fromPath, newName)
    if (!from || !to) return
    appendShellMutationHint(hints, {
      filePath: to,
      renamedFrom: from,
    })
    hints.renames.push({ from, to })
  }

  const patternToPairs = [
    { pattern: /\bset-content\b[\s\S]*?-path\s+("[^"]+"|'[^']+'|[^\s;]+)/ig, changeType: 'modified' },
    { pattern: /\bnew-item\b[\s\S]*?-path\s+("[^"]+"|'[^']+'|[^\s;]+)/ig, changeType: 'created' },
    { pattern: /\badd-content\b[\s\S]*?-path\s+("[^"]+"|'[^']+'|[^\s;]+)/ig, changeType: 'modified' },
    { pattern: /\bremove-item\b[\s\S]*?-path\s+("[^"]+"|'[^']+'|[^\s;]+)/ig, changeType: 'deleted' },
    { pattern: /\bdel\b\s+("[^"]+"|'[^']+'|[^\s;]+)/ig, changeType: 'deleted' },
    { pattern: /\berase\b\s+("[^"]+"|'[^']+'|[^\s;]+)/ig, changeType: 'deleted' },
  ]
  for (const row of patternToPairs) {
    for (const match of normalizedCommandText.matchAll(row.pattern)) {
      push(String(match?.[1] || ''), row.changeType)
    }
  }
  for (const match of normalizedCommandText.matchAll(/\brename-item\b[\s\S]*?-path\s+("[^"]+"|'[^']+'|[^\s;]+)[\s\S]*?-newname\s+("[^"]+"|'[^']+'|[^\s;]+)/ig)) {
    pushRenameWithinSourceDir(String(match?.[1] || ''), String(match?.[2] || ''))
  }
  for (const match of normalizedCommandText.matchAll(/\bmove-item\b[\s\S]*?-path\s+("[^"]+"|'[^']+'|[^\s;]+)[\s\S]*?-destination\s+("[^"]+"|'[^']+'|[^\s;]+)/ig)) {
    pushRename(String(match?.[1] || ''), String(match?.[2] || ''))
  }

  return {
    broadCommand: hints.broadCommand,
    suppressionReason: String(hints.suppressionReason || '').trim(),
    renames: hints.renames.slice(0, MAX_SHELL_TRACKED_CHANGES),
    candidatePaths: Array.from(hints.candidatePathSet).slice(0, MAX_SHELL_TRACKED_CHANGES),
  }
}

async function readProvableShellFileState(absPath = '') {
  const targetPath = String(absPath || '').trim()
  if (!targetPath) return { kind: SHELL_STATE_KIND_MISSING }
  let stat = null
  try {
    stat = await fs.stat(targetPath)
  } catch (error) {
    if (String(error?.code || '').trim().toUpperCase() === 'ENOENT') {
      return { kind: SHELL_STATE_KIND_MISSING }
    }
    return { kind: SHELL_STATE_KIND_UNREADABLE }
  }
  if (!stat?.isFile?.()) return { kind: SHELL_STATE_KIND_NOT_FILE }
  if (Number(stat.size || 0) > MAX_PREVIEW_FILE_BYTES) {
    return {
      kind: SHELL_STATE_KIND_OVERSIZED,
      size: Number(stat.size || 0) || 0,
    }
  }
  let buffer = null
  try {
    buffer = await fs.readFile(targetPath)
  } catch {
    return { kind: SHELL_STATE_KIND_UNREADABLE }
  }
  if (buffer.includes(0)) {
    return {
      kind: SHELL_STATE_KIND_BINARY,
      size: Number(stat.size || 0) || 0,
    }
  }
  try {
    const decoder = new TextDecoder('utf8', { fatal: true })
    const content = decoder.decode(buffer)
    return {
      kind: SHELL_STATE_KIND_PRESENT,
      content,
      size: Number(stat.size || 0) || 0,
    }
  } catch {
    return { kind: SHELL_STATE_KIND_UNREADABLE }
  }
}

function mapShellStateToSuppressionReason(state = null) {
  const kind = String(state?.kind || '').trim().toLowerCase()
  if (kind === SHELL_STATE_KIND_OVERSIZED) return 'oversized_file'
  if (kind === SHELL_STATE_KIND_BINARY) return 'binary_file'
  if (kind === SHELL_STATE_KIND_UNREADABLE || kind === SHELL_STATE_KIND_NOT_FILE) return 'unreadable_file'
  return ''
}

async function snapshotProjectFilesForShellTracking(projectFolder = '', { commandText = '' } = {}) {
  const root = String(projectFolder || '').trim()
  if (!root) {
    return {
      entries: new Map(),
      truncated: false,
      commandHints: buildShellMutationHints(root, commandText),
      candidateStates: new Map(),
    }
  }
  const entries = new Map()
  const queue = ['']
  let truncated = false
  const commandHints = buildShellMutationHints(root, commandText)

  while (queue.length > 0 && !truncated) {
    const relDir = queue.shift()
    const absDir = path.resolve(root, relDir || '.')
    let dirEntries = []
    try {
      dirEntries = await fs.readdir(absDir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const dirent of dirEntries) {
      const name = String(dirent?.name || '').trim()
      if (!name) continue
      if (name === '.' || name === '..') continue
      const childRel = relDir ? path.join(relDir, name) : name
      const childRelPosix = toPosixRelative(childRel)

      if (dirent.isDirectory()) {
        if (SHELL_SNAPSHOT_IGNORED_DIRS.has(name)) continue
        queue.push(childRel)
        continue
      }
      if (!dirent.isFile()) continue

      let stat = null
      try {
        stat = await fs.stat(path.resolve(root, childRel))
      } catch {
        continue
      }
      entries.set(childRelPosix, {
        size: Number(stat?.size || 0) || 0,
        mtimeMs: Number(stat?.mtimeMs || 0) || 0,
      })
      if (entries.size >= MAX_SHELL_SNAPSHOT_FILES) {
        truncated = true
        break
      }
    }
  }

  const candidateStates = new Map()
  for (const candidatePath of Array.isArray(commandHints.candidatePaths) ? commandHints.candidatePaths : []) {
    if (candidateStates.size >= MAX_SHELL_TRACKED_CHANGES) break
    candidateStates.set(candidatePath, await readProvableShellFileState(path.resolve(root, candidatePath)))
  }

  return {
    entries,
    truncated,
    commandHints,
    candidateStates,
  }
}

function buildShellSnapshotDiff(beforeSnapshot = null, afterSnapshot = null) {
  const before = beforeSnapshot?.entries instanceof Map ? beforeSnapshot.entries : new Map()
  const after = afterSnapshot?.entries instanceof Map ? afterSnapshot.entries : new Map()
  const createdPaths = []
  const modifiedPaths = []
  const deletedPaths = []

  for (const [filePath, afterMeta] of after.entries()) {
    const beforeMeta = before.get(filePath)
    if (!beforeMeta) {
      createdPaths.push(filePath)
      continue
    }
    if (
      Number(beforeMeta.size || 0) !== Number(afterMeta.size || 0)
      || Number(beforeMeta.mtimeMs || 0) !== Number(afterMeta.mtimeMs || 0)
    ) {
      modifiedPaths.push(filePath)
    }
  }

  for (const [filePath] of before.entries()) {
    if (after.has(filePath)) continue
    deletedPaths.push(filePath)
  }

  const changedPaths = [...createdPaths, ...modifiedPaths, ...deletedPaths].sort((left, right) => left.localeCompare(right))
  return {
    createdPaths: createdPaths.sort((left, right) => left.localeCompare(right)),
    modifiedPaths: modifiedPaths.sort((left, right) => left.localeCompare(right)),
    deletedPaths: deletedPaths.sort((left, right) => left.localeCompare(right)),
    changedPaths,
  }
}

function resolveShellRenamePlan(commandHints = {}, snapshotDiff = {}) {
  const renameHints = Array.isArray(commandHints?.renames)
    ? commandHints.renames.filter((row) => row && typeof row === 'object')
    : []
  if (renameHints.length === 0) return { renames: [], suppressionReason: '' }
  if (renameHints.length !== 1) {
    return { renames: [], suppressionReason: 'ambiguous_rename' }
  }
  const rename = renameHints[0]
  const created = new Set(Array.isArray(snapshotDiff?.createdPaths) ? snapshotDiff.createdPaths : [])
  const deleted = new Set(Array.isArray(snapshotDiff?.deletedPaths) ? snapshotDiff.deletedPaths : [])
  const modifiedCount = Array.isArray(snapshotDiff?.modifiedPaths) ? snapshotDiff.modifiedPaths.length : 0
  const changedCount = Array.isArray(snapshotDiff?.changedPaths) ? snapshotDiff.changedPaths.length : 0
  if (
    !created.has(rename.to)
    || !deleted.has(rename.from)
    || modifiedCount > 0
    || changedCount !== 2
  ) {
    return { renames: [], suppressionReason: 'ambiguous_rename' }
  }
  return { renames: [rename], suppressionReason: '' }
}

function createShellHydratedArtifactChange({
  projectFolder = '',
  filePath = '',
  renamedFrom = '',
  beforeContent = '',
  afterContent = '',
  changeType = '',
  source = 'run_command',
  threadId = '',
  turnId = '',
} = {}) {
  const normalizedPath = String(filePath || '').trim()
  const normalizedRenamedFrom = String(renamedFrom || '').trim()
  const normalizedSource = String(source || 'run_command').trim().toLowerCase()
  if (!normalizedPath) return null
  let primaryRecord = null
  try {
    primaryRecord = recordWrite({
      project: projectFolder,
      filePath: normalizedPath,
      newContent: String(afterContent ?? ''),
      prevContent: changeType === 'created' ? null : String(beforeContent ?? ''),
      source: normalizedSource,
      note: changeType === 'renamed' && normalizedRenamedFrom
        ? `Renamed from ${normalizedRenamedFrom} via shell`
        : `Changed via ${normalizedSource}`,
      threadId,
      turnId,
    })
    if (changeType === 'renamed' && normalizedRenamedFrom && normalizedRenamedFrom !== normalizedPath) {
      recordWrite({
        project: projectFolder,
        filePath: normalizedRenamedFrom,
        newContent: '',
        prevContent: String(beforeContent ?? ''),
        source: normalizedSource,
        note: `Renamed to ${normalizedPath} via shell`,
        threadId,
        turnId,
      })
    }
  } catch {
    primaryRecord = null
  }
  const lineDelta = countLineDelta(beforeContent ?? '', afterContent ?? '')
  return {
    filePath: normalizedPath,
    renamedFrom: normalizedRenamedFrom,
    newRevId: String(primaryRecord?.newRevId || ''),
    prevRevId: String(primaryRecord?.prevRevId || ''),
    rev: Number(primaryRecord?.rev || 0) || 0,
    contentBytes: changeType === 'deleted'
      ? 0
      : Buffer.byteLength(String(afterContent ?? ''), 'utf8'),
    addedLines: Number(lineDelta?.addedLines || 0) || 0,
    removedLines: Number(lineDelta?.removedLines || 0) || 0,
    diffText: buildPreviewableUnifiedDiff({
      previousContent: beforeContent,
      nextContent: afterContent,
    }),
    changeType,
    source: normalizedSource,
    hydrationProven: true,
  }
}

async function buildShellHydratedChanges({
  projectFolder = '',
  beforeSnapshot = null,
  source = 'run_command',
  snapshotDiff = {},
  commandHints = {},
  threadId = '',
  turnId = '',
} = {}) {
  const candidateStates = beforeSnapshot?.candidateStates instanceof Map ? beforeSnapshot.candidateStates : new Map()
  const nextChanges = []
  const handledPaths = new Set()
  const renamePlan = resolveShellRenamePlan(commandHints, snapshotDiff)
  if (renamePlan.suppressionReason) {
    return { changes: [], suppressionReason: renamePlan.suppressionReason }
  }

  for (const rename of renamePlan.renames) {
    const beforeState = candidateStates.get(rename.from) || { kind: SHELL_STATE_KIND_MISSING }
    const afterState = await readProvableShellFileState(path.resolve(projectFolder, rename.to))
    const beforeReason = mapShellStateToSuppressionReason(beforeState)
    if (beforeReason) return { changes: [], suppressionReason: beforeReason }
    const afterReason = mapShellStateToSuppressionReason(afterState)
    if (afterReason) return { changes: [], suppressionReason: afterReason }
    if (beforeState.kind !== SHELL_STATE_KIND_PRESENT) return { changes: [], suppressionReason: 'missing_before_state' }
    if (afterState.kind !== SHELL_STATE_KIND_PRESENT) return { changes: [], suppressionReason: 'missing_after_state' }
    const change = createShellHydratedArtifactChange({
      projectFolder,
      filePath: rename.to,
      renamedFrom: rename.from,
      beforeContent: String(beforeState.content ?? ''),
      afterContent: String(afterState.content ?? ''),
      changeType: 'renamed',
      source,
      threadId,
      turnId,
    })
    if (!change) return { changes: [], suppressionReason: 'unreadable_file' }
    nextChanges.push(change)
    handledPaths.add(rename.from)
    handledPaths.add(rename.to)
  }

  for (const filePath of Array.isArray(snapshotDiff?.createdPaths) ? snapshotDiff.createdPaths : []) {
    if (handledPaths.has(filePath)) continue
    const afterState = await readProvableShellFileState(path.resolve(projectFolder, filePath))
    const afterReason = mapShellStateToSuppressionReason(afterState)
    if (afterReason) return { changes: [], suppressionReason: afterReason }
    if (afterState.kind !== SHELL_STATE_KIND_PRESENT) return { changes: [], suppressionReason: 'missing_after_state' }
    const change = createShellHydratedArtifactChange({
      projectFolder,
      filePath,
      beforeContent: '',
      afterContent: String(afterState.content ?? ''),
      changeType: 'created',
      source,
      threadId,
      turnId,
    })
    if (!change) return { changes: [], suppressionReason: 'unreadable_file' }
    nextChanges.push(change)
  }

  for (const filePath of Array.isArray(snapshotDiff?.modifiedPaths) ? snapshotDiff.modifiedPaths : []) {
    if (handledPaths.has(filePath)) continue
    const beforeState = candidateStates.get(filePath) || { kind: SHELL_STATE_KIND_MISSING }
    const afterState = await readProvableShellFileState(path.resolve(projectFolder, filePath))
    const beforeReason = mapShellStateToSuppressionReason(beforeState)
    if (beforeReason) return { changes: [], suppressionReason: beforeReason }
    const afterReason = mapShellStateToSuppressionReason(afterState)
    if (afterReason) return { changes: [], suppressionReason: afterReason }
    if (beforeState.kind !== SHELL_STATE_KIND_PRESENT) return { changes: [], suppressionReason: 'missing_before_state' }
    if (afterState.kind !== SHELL_STATE_KIND_PRESENT) return { changes: [], suppressionReason: 'missing_after_state' }
    if (String(beforeState.content ?? '') === String(afterState.content ?? '')) continue
    const change = createShellHydratedArtifactChange({
      projectFolder,
      filePath,
      beforeContent: String(beforeState.content ?? ''),
      afterContent: String(afterState.content ?? ''),
      changeType: 'modified',
      source,
      threadId,
      turnId,
    })
    if (!change) return { changes: [], suppressionReason: 'unreadable_file' }
    nextChanges.push(change)
  }

  for (const filePath of Array.isArray(snapshotDiff?.deletedPaths) ? snapshotDiff.deletedPaths : []) {
    if (handledPaths.has(filePath)) continue
    const beforeState = candidateStates.get(filePath) || { kind: SHELL_STATE_KIND_MISSING }
    const beforeReason = mapShellStateToSuppressionReason(beforeState)
    if (beforeReason) return { changes: [], suppressionReason: beforeReason }
    if (beforeState.kind !== SHELL_STATE_KIND_PRESENT) return { changes: [], suppressionReason: 'missing_before_state' }
    const change = createShellHydratedArtifactChange({
      projectFolder,
      filePath,
      beforeContent: String(beforeState.content ?? ''),
      afterContent: '',
      changeType: 'deleted',
      source,
      threadId,
      turnId,
    })
    if (!change) return { changes: [], suppressionReason: 'unreadable_file' }
    nextChanges.push(change)
  }

  return {
    changes: nextChanges,
    suppressionReason: nextChanges.length > 0 ? '' : 'no_textual_change',
  }
}

export async function detectShellWriteArtifactChanges({
  projectFolder = '',
  beforeSnapshot = null,
  commandText = '',
  source = 'run_command',
  threadId = '',
  turnId = '',
} = {}) {
  const root = String(projectFolder || '').trim()
  const normalizedSource = String(source || 'run_command').trim().toLowerCase()
  if (!root || !beforeSnapshot || !(beforeSnapshot.entries instanceof Map)) {
    return shellNonFileOutcome({
      source: normalizedSource,
      reasonCodes: ['missing_before_snapshot'],
    })
  }
  try {
    const commandHints = beforeSnapshot?.commandHints && typeof beforeSnapshot.commandHints === 'object'
      ? beforeSnapshot.commandHints
      : buildShellMutationHints(root, commandText)
    const candidatePaths = Array.isArray(commandHints?.candidatePaths) ? commandHints.candidatePaths : []
    if (commandHints?.broadCommand === true || String(commandHints?.suppressionReason || '').trim()) {
      return shellSuppressedOutcome({
        source: normalizedSource,
        reasonCodes: [String(commandHints?.suppressionReason || '').trim() || 'broad_command'],
        candidatePaths,
      })
    }
    if (candidatePaths.length > MAX_SHELL_TRACKED_CHANGES) {
      return shellSuppressedOutcome({
        source: normalizedSource,
        reasonCodes: ['file_count_cap'],
        candidatePaths,
      })
    }

    const afterSnapshot = await snapshotProjectFilesForShellTracking(root)
    const snapshotTruncated = beforeSnapshot?.truncated === true || afterSnapshot?.truncated === true
    const snapshotDiff = buildShellSnapshotDiff(beforeSnapshot, afterSnapshot)
    const changedPaths = Array.isArray(snapshotDiff?.changedPaths) ? snapshotDiff.changedPaths : []

    if (snapshotTruncated) {
      return shellSuppressedOutcome({
        source: normalizedSource,
        reasonCodes: ['snapshot_truncated'],
        changedPaths,
        candidatePaths,
        snapshotTruncated: true,
      })
    }
    if (changedPaths.length === 0) {
      return candidatePaths.length > 0
        ? shellNoWriteOutcome({
            source: normalizedSource,
            reasonCodes: ['no_diff'],
            candidatePaths,
          })
        : shellNonFileOutcome({ source: normalizedSource })
    }
    if (changedPaths.length > MAX_SHELL_TRACKED_CHANGES) {
      return shellSuppressedOutcome({
        source: normalizedSource,
        reasonCodes: ['file_count_cap'],
        changedPaths,
        candidatePaths,
      })
    }
    if (candidatePaths.length === 0) {
      return shellSuppressedOutcome({
        source: normalizedSource,
        reasonCodes: ['unbounded_path_set'],
        changedPaths,
      })
    }
    const candidatePathSet = new Set(candidatePaths)
    const hasUnboundedPath = changedPaths.some((filePath) => !candidatePathSet.has(filePath))
    if (hasUnboundedPath) {
      return shellSuppressedOutcome({
        source: normalizedSource,
        reasonCodes: ['unbounded_path_set'],
        changedPaths,
        candidatePaths,
      })
    }

    const hydrated = await buildShellHydratedChanges({
      projectFolder: root,
      beforeSnapshot,
      source: normalizedSource,
      snapshotDiff,
      commandHints,
      threadId,
      turnId,
    })
    if (String(hydrated?.suppressionReason || '').trim()) {
      return shellSuppressedOutcome({
        source: normalizedSource,
        reasonCodes: [hydrated.suppressionReason],
        changedPaths,
        candidatePaths,
      })
    }
    return shellHydratedOutcome({
      source: normalizedSource,
      changes: Array.isArray(hydrated?.changes) ? hydrated.changes : [],
      changedPaths,
      candidatePaths,
    })
  } catch {
    return shellSuppressedOutcome({
      source: normalizedSource,
      reasonCodes: ['unreadable_file'],
    })
  }
}

export async function takeShellWriteSnapshot(projectFolder = '', options = {}) {
  return snapshotProjectFilesForShellTracking(projectFolder, options)
}
