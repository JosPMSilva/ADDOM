import fs from 'node:fs'
import path from 'node:path'

import { splitContentLines } from '../chat/diff-math.mjs'
import { deleteFile, writeFile } from './file-tools.mjs'

const PATCH_BEGIN_MARKER = '*** Begin Patch'
const PATCH_END_MARKER = '*** End Patch'
const PATCH_END_OF_FILE_MARKER = '*** End of File'

export function normalizeRelativeWorkspacePath(projectRoot = '', rawPath = '') {
  const root = String(projectRoot || '').trim()
  const candidate = String(rawPath || '').trim()
  if (!root || !candidate) {
    throw new Error('A workspace-relative path is required.')
  }
  const absolutePath = path.resolve(root, candidate)
  const relativePath = path.relative(root, absolutePath)
  if ((!relativePath && candidate !== '.') || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Patch paths must stay inside the active workspace.')
  }
  return relativePath.replace(/\\/g, '/')
}

function normalizeApplyPatchPath(projectRoot = '', rawPath = '', options = {}) {
  const root = String(projectRoot || '').trim()
  const candidate = String(rawPath || '').trim()
  if (!root || !candidate) {
    throw new Error('A workspace-relative path is required.')
  }
  const absolutePath = path.resolve(root, candidate)
  const relativePath = path.relative(root, absolutePath)
  const staysInsideWorkspace = !(relativePath.startsWith('..') || path.isAbsolute(relativePath))
  if (staysInsideWorkspace) {
    return relativePath.replace(/\\/g, '/')
  }
  if (options?.fileSystemHostFullAccess === true) {
    return path.normalize(absolutePath)
  }
  throw new Error('Patch paths must stay inside the active workspace.')
}

function resolvePatchAbsolutePath(projectRoot = '', normalizedPath = '') {
  const candidate = String(normalizedPath || '').trim()
  if (!candidate) return ''
  return path.isAbsolute(candidate) ? candidate : path.resolve(projectRoot, candidate)
}

function splitTextIntoLines(text = '') {
  const normalized = String(text || '').replace(/\r\n/g, '\n')
  const hasTrailingNewline = normalized.endsWith('\n')
  const body = hasTrailingNewline ? normalized.slice(0, -1) : normalized
  return {
    lines: body ? body.split('\n') : [],
    hasTrailingNewline,
  }
}

function parseUnifiedDiff(diffText = '') {
  const normalized = String(diffText || '').replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const hunks = []
  let currentHunk = null
  let sawNoNewlineMarker = false

  for (const line of lines) {
    if (line.startsWith('@@ ')) {
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (!match) {
        throw new Error('Unsupported apply_patch hunk header.')
      }
      currentHunk = {
        oldStart: Number(match[1] || 0) || 0,
        lines: [],
      }
      hunks.push(currentHunk)
      continue
    }

    if (line === '@@') {
      currentHunk = {
        oldStart: 1,
        lines: [],
      }
      hunks.push(currentHunk)
      continue
    }

    if (!currentHunk) continue
    if (
      line.startsWith(' ')
      || line.startsWith('+')
      || line.startsWith('-')
      || line === '\\ No newline at end of file'
    ) {
      if (line === '\\ No newline at end of file') {
        sawNoNewlineMarker = true
      }
      currentHunk.lines.push(line)
    }
  }

  if (hunks.length === 0) {
    throw new Error('apply_patch requires unified diff hunks.')
  }

  return {
    hunks,
    sawNoNewlineMarker,
  }
}

function getHunkConsumedLineCount(hunk = null) {
  if (!hunk || !Array.isArray(hunk.lines)) return 0
  let count = 0
  for (const line of hunk.lines) {
    if (line === '\\ No newline at end of file') continue
    const prefix = line[0]
    if (prefix === ' ' || prefix === '-') count += 1
  }
  return count
}

function tryApplyHunkAt(sourceLines = [], hunk = null, startIndex = 0) {
  const outputLines = []
  let sourceIndex = startIndex

  for (const line of (Array.isArray(hunk?.lines) ? hunk.lines : [])) {
    if (line === '\\ No newline at end of file') continue
    const prefix = line[0]
    const text = line.slice(1)
    if (prefix === ' ') {
      if (sourceLines[sourceIndex] !== text) {
        return {
          ok: false,
          reason: 'Patch context did not match the current file content.',
        }
      }
      outputLines.push(sourceLines[sourceIndex])
      sourceIndex += 1
      continue
    }
    if (prefix === '-') {
      if (sourceLines[sourceIndex] !== text) {
        return {
          ok: false,
          reason: 'Patch removal did not match the current file content.',
        }
      }
      sourceIndex += 1
      continue
    }
    if (prefix === '+') {
      outputLines.push(text)
    }
  }

  return {
    ok: true,
    outputLines,
    nextSourceIndex: sourceIndex,
  }
}

function resolveHunkStartIndex(sourceLines = [], hunk = null, sourceIndex = 0) {
  const targetIndex = Math.max(sourceIndex, Math.max(0, Number(hunk?.oldStart || 1) - 1))
  const consumedLineCount = getHunkConsumedLineCount(hunk)
  const firstAttempt = tryApplyHunkAt(sourceLines, hunk, targetIndex)
  if (firstAttempt.ok || consumedLineCount === 0) {
    return {
      targetIndex,
      match: firstAttempt,
    }
  }

  const maxStartIndex = Math.max(sourceIndex, sourceLines.length - consumedLineCount)
  const searchWindow = Math.min(
    Math.max(consumedLineCount * 4, 24),
    Math.max(24, sourceLines.length - sourceIndex),
  )
  const seen = new Set([targetIndex])

  for (let offset = 1; offset <= searchWindow; offset += 1) {
    const forwardIndex = targetIndex + offset
    if (forwardIndex <= maxStartIndex && !seen.has(forwardIndex)) {
      seen.add(forwardIndex)
      const forwardMatch = tryApplyHunkAt(sourceLines, hunk, forwardIndex)
      if (forwardMatch.ok) {
        return {
          targetIndex: forwardIndex,
          match: forwardMatch,
        }
      }
    }

    const backwardIndex = targetIndex - offset
    if (backwardIndex >= sourceIndex && !seen.has(backwardIndex)) {
      seen.add(backwardIndex)
      const backwardMatch = tryApplyHunkAt(sourceLines, hunk, backwardIndex)
      if (backwardMatch.ok) {
        return {
          targetIndex: backwardIndex,
          match: backwardMatch,
        }
      }
    }
  }

  return {
    targetIndex,
    match: firstAttempt,
  }
}

export function applyUnifiedDiffToText(sourceText = '', diffText = '', { defaultTrailingNewline = false } = {}) {
  const source = splitTextIntoLines(sourceText)
  const parsed = parseUnifiedDiff(diffText)
  const output = []
  let sourceIndex = 0

  for (const hunk of parsed.hunks) {
    const { targetIndex, match } = resolveHunkStartIndex(source.lines, hunk, sourceIndex)
    while (sourceIndex < targetIndex && sourceIndex < source.lines.length) {
      output.push(source.lines[sourceIndex])
      sourceIndex += 1
    }

    if (!match.ok) {
      throw new Error(match.reason || 'Patch context did not match the current file content.')
    }
    output.push(...match.outputLines)
    sourceIndex = match.nextSourceIndex
  }

  while (sourceIndex < source.lines.length) {
    output.push(source.lines[sourceIndex])
    sourceIndex += 1
  }

  const shouldEndWithNewline = parsed.sawNoNewlineMarker
    ? false
    : (source.hasTrailingNewline || defaultTrailingNewline)
  return output.join('\n') + (shouldEndWithNewline ? '\n' : '')
}

function readWorkspaceFile(projectRoot = '', relativePath = '') {
  const absolutePath = path.resolve(projectRoot, relativePath)
  if (!fs.existsSync(absolutePath)) return null
  return fs.readFileSync(absolutePath, 'utf8')
}

function nextNonEmptyIndex(lines = [], startIndex = 0, endIndex = lines.length) {
  for (let index = startIndex; index < endIndex; index += 1) {
    if (String(lines[index] || '').trim()) return index
  }
  return -1
}

function buildContentFromAddLines(lines = []) {
  const bodyLines = Array.isArray(lines) ? lines : []
  if (bodyLines.length === 0) {
    throw new Error('apply_patch add-file blocks require content lines.')
  }
  let sawNoNewlineMarker = false
  const output = []
  for (const line of bodyLines) {
    if (line === '\\ No newline at end of file') {
      sawNoNewlineMarker = true
      continue
    }
    if (!line.startsWith('+')) {
      throw new Error('apply_patch add-file blocks must use "+" lines or unified diff hunks.')
    }
    output.push(line.slice(1))
  }
  const body = output.join('\n')
  if (!body) return sawNoNewlineMarker ? '' : '\n'
  return sawNoNewlineMarker ? body : `${body}\n`
}

function parsePatchText(patchText = '') {
  const normalized = String(patchText || '').replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const firstIndex = nextNonEmptyIndex(lines, 0, lines.length)
  if (firstIndex < 0) {
    throw new Error('apply_patch requires non-empty patch text.')
  }
  let lastIndex = lines.length - 1
  while (lastIndex >= firstIndex && !String(lines[lastIndex] || '').trim()) {
    lastIndex -= 1
  }
  if (String(lines[firstIndex] || '').trim() !== PATCH_BEGIN_MARKER) {
    throw new Error(`apply_patch patch text must start with "${PATCH_BEGIN_MARKER}".`)
  }
  if (String(lines[lastIndex] || '').trim() !== PATCH_END_MARKER) {
    throw new Error(`apply_patch patch text must end with "${PATCH_END_MARKER}".`)
  }

  const operations = []
  let index = firstIndex + 1
  while (index < lastIndex) {
    const headerIndex = nextNonEmptyIndex(lines, index, lastIndex)
    if (headerIndex < 0) break
    index = headerIndex
    const header = String(lines[index] || '').trim()
    let kind = ''
    let filePath = ''

    if (header.startsWith('*** Add File: ')) {
      kind = 'add'
      filePath = header.slice('*** Add File: '.length).trim()
    } else if (header.startsWith('*** Update File: ')) {
      kind = 'update'
      filePath = header.slice('*** Update File: '.length).trim()
    } else if (header.startsWith('*** Delete File: ')) {
      kind = 'delete'
      filePath = header.slice('*** Delete File: '.length).trim()
    } else {
      throw new Error(`Unsupported apply_patch block header: ${header || 'unknown'}`)
    }

    if (!filePath) {
      throw new Error('apply_patch file headers require a non-empty path.')
    }

    index += 1
    let moveTo = ''
    if (kind === 'update' && index < lastIndex) {
      const maybeMove = String(lines[index] || '').trim()
      if (maybeMove.startsWith('*** Move to: ')) {
        moveTo = maybeMove.slice('*** Move to: '.length).trim()
        if (!moveTo) {
          throw new Error('apply_patch move targets require a non-empty destination path.')
        }
        index += 1
      }
    }

    const body = []
    while (index < lastIndex) {
      const candidate = String(lines[index] || '').trim()
      if (
        candidate.startsWith('*** Add File: ')
        || candidate.startsWith('*** Update File: ')
        || candidate.startsWith('*** Delete File: ')
      ) {
        break
      }
      if (candidate === PATCH_END_MARKER) break
      if (candidate === PATCH_END_OF_FILE_MARKER) {
        index += 1
        continue
      }
      body.push(lines[index])
      index += 1
    }

    if (kind === 'delete') {
      if (body.some((line) => String(line || '').trim())) {
        throw new Error('apply_patch delete-file blocks cannot include body content.')
      }
      operations.push({
        type: 'delete_file',
        path: filePath,
        newPath: '',
        diffText: '',
        contentText: '',
      })
      continue
    }

    const normalizedBody = body.filter((line) => line !== PATCH_END_OF_FILE_MARKER)
    const hasHunks = normalizedBody.some((line) => /^@@(?: |$)/.test(String(line || '')))

    if (kind === 'add' && !hasHunks) {
      operations.push({
        type: 'create_file',
        path: filePath,
        newPath: '',
        diffText: '',
        contentText: buildContentFromAddLines(normalizedBody),
      })
      continue
    }

    const diffText = normalizedBody.join('\n')
    if (!hasHunks) {
      throw new Error('apply_patch update blocks require unified diff hunks.')
    }
    parseUnifiedDiff(diffText)
    operations.push({
      type: moveTo ? 'move_file' : (kind === 'add' ? 'create_file' : 'update_file'),
      path: filePath,
      newPath: moveTo,
      diffText,
      contentText: '',
    })
  }

  if (operations.length === 0) {
    throw new Error('apply_patch requires at least one patch block.')
  }
  return operations
}

function normalizePreviewableDiffText(value = '') {
  const normalized = String(value || '').replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  try {
    parseUnifiedDiff(normalized)
    return normalized
  } catch {
    return ''
  }
}

function buildExactUnifiedDiffRows(beforeLines = [], afterLines = []) {
  const a = Array.isArray(beforeLines) ? beforeLines : []
  const b = Array.isArray(afterLines) ? afterLines : []
  const maxCells = 1_200_000
  const cells = (a.length + 1) * (b.length + 1)

  if (cells > maxCells) {
    return [
      ...a.map((line) => ({ kind: 'delete', text: line })),
      ...b.map((line) => ({ kind: 'add', text: line })),
    ]
  }

  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1))
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const rows = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ kind: 'context', text: b[j] })
      i += 1
      j += 1
      continue
    }
    if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ kind: 'delete', text: a[i] })
      i += 1
      continue
    }
    rows.push({ kind: 'add', text: b[j] })
    j += 1
  }
  while (i < a.length) {
    rows.push({ kind: 'delete', text: a[i] })
    i += 1
  }
  while (j < b.length) {
    rows.push({ kind: 'add', text: b[j] })
    j += 1
  }
  return rows
}

export function buildPreviewableUnifiedDiff({
  diffText = '',
  previousContent = '',
  nextContent = '',
} = {}) {
  const normalizedDiff = normalizePreviewableDiffText(diffText)
  if (normalizedDiff) return normalizedDiff

  const before = String(previousContent ?? '').replace(/\r\n/g, '\n')
  const after = String(nextContent ?? '').replace(/\r\n/g, '\n')
  if (before === after) return ''

  const beforeLines = splitContentLines(before)
  const afterLines = splitContentLines(after)
  const exactRows = buildExactUnifiedDiffRows(beforeLines, afterLines)
  return [
    `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
    ...exactRows.map((row) => (
      row.kind === 'delete'
        ? `-${row.text}`
        : (row.kind === 'add' ? `+${row.text}` : ` ${row.text}`)
    )),
  ].join('\n').trim()
}

export function normalizeApplyPatchInput({
  toolInput = null,
} = {}) {
  const source = toolInput && typeof toolInput === 'object' ? toolInput : {}
  const patchText = String(source.patch || '').trim()
  if (!patchText) {
    throw new Error('apply_patch requires a non-empty patch string.')
  }
  return {
    format: 'patch_text',
    operations: parsePatchText(patchText),
  }
}

function buildExactApplyPatchDiffText({
  previousContent = '',
  nextContent = '',
} = {}) {
  const before = String(previousContent ?? '')
  const after = String(nextContent ?? '')
  if (before === after) return ''
  return buildPreviewableUnifiedDiff({
    previousContent: before,
    nextContent: after,
  })
}

export function resolveApplyPatchTargetPaths({
  toolInput = null,
  projectRoot = '',
  fileSystemHostFullAccess = false,
} = {}) {
  const normalized = normalizeApplyPatchInput({ toolInput })
  return normalized.operations
    .map((entry) => normalizeApplyPatchPath(projectRoot, String(entry.newPath || entry.path || '').trim(), {
      fileSystemHostFullAccess,
    }))
    .filter(Boolean)
}

function resolveSingleApplyPatchPreview({
  projectRoot = '',
  entry = null,
  fileSystemHostFullAccess = false,
} = {}) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('apply_patch entry is required.')
  }

  const type = String(entry.type || '').trim().toLowerCase()
  const relativePath = normalizeApplyPatchPath(projectRoot, entry.path, {
    fileSystemHostFullAccess,
  })
  const existingContent = readWorkspaceFile(projectRoot, resolvePatchAbsolutePath(projectRoot, relativePath))

  if (type === 'delete_file') {
    const previousContent = existingContent ?? ''
    const nextContent = ''
    return {
      type,
      relativePath,
      diffText: buildExactApplyPatchDiffText({
        previousContent,
        nextContent,
      }),
      previousContent,
      nextContent,
    }
  }

  if (type === 'move_file') {
    if (existingContent == null) {
      throw new Error('Cannot move a file that does not exist inside the workspace.')
    }
    const targetRelativePath = normalizeApplyPatchPath(projectRoot, entry.newPath, {
      fileSystemHostFullAccess,
    })
    const hasDiff = String(entry.diffText || '').trim().length > 0
    const nextContent = hasDiff
      ? applyUnifiedDiffToText(existingContent, entry.diffText, {
        defaultTrailingNewline: true,
      })
      : existingContent
    return {
      type,
      relativePath,
      targetRelativePath,
      diffText: buildExactApplyPatchDiffText({
        previousContent: existingContent,
        nextContent,
      }),
      previousContent: existingContent,
      nextContent,
    }
  }

  if (type !== 'create_file' && type !== 'update_file') {
    throw new Error(`Unsupported apply_patch operation: ${type || 'unknown'}`)
  }

  if (type === 'update_file' && existingContent == null) {
    throw new Error('Cannot update a file that does not exist inside the workspace.')
  }

  const hasInlineContent = Object.prototype.hasOwnProperty.call(entry, 'contentText') && String(entry.contentText || '') !== ''
  const nextContent = hasInlineContent
    ? String(entry.contentText || '')
    : applyUnifiedDiffToText(existingContent || '', entry.diffText, {
      defaultTrailingNewline: type === 'create_file',
    })

  return {
    type,
    relativePath,
    diffText: buildExactApplyPatchDiffText({
      previousContent: existingContent ?? '',
      nextContent,
    }),
    previousContent: existingContent ?? '',
    nextContent,
  }
}

export function resolveApplyPatchPreview({
  projectRoot = '',
  toolInput = null,
  fileSystemHostFullAccess = false,
} = {}) {
  const normalized = normalizeApplyPatchInput({ toolInput })
  const changes = normalized.operations.map((entry) => resolveSingleApplyPatchPreview({
    projectRoot,
    entry,
    fileSystemHostFullAccess,
  }))
  const primary = changes[0] || null
  if (!primary) {
    throw new Error('apply_patch requires at least one patch block.')
  }
  return {
    ...primary,
    changes,
    operationCount: changes.length,
    format: normalized.format,
  }
}

function buildSingleApplyPatchMessage(preview = null) {
  if (!preview || typeof preview !== 'object') {
    return 'Patch applied successfully.'
  }
  if (preview.type === 'delete_file') {
    return `File deleted successfully: ${preview.relativePath}`
  }
  if (preview.type === 'move_file') {
    return `Patched and moved file: ${preview.relativePath} -> ${preview.targetRelativePath}`
  }
  return preview.type === 'create_file'
    ? `Patched new file successfully: ${preview.relativePath}`
    : `Patched file successfully: ${preview.relativePath}`
}

function buildApplyPatchChangeMeta(preview = null) {
  if (!preview || typeof preview !== 'object') return null
  return {
    type: String(preview.type || '').trim(),
    path: String(preview.relativePath || '').trim(),
    newPath: String(preview.targetRelativePath || '').trim(),
    diffText: String(preview.diffText || '').trim(),
    newContent: String(preview.nextContent ?? ''),
    prevContent: String(preview.previousContent ?? ''),
  }
}

export async function executeApplyPatchOperation({
  projectRoot = '',
  toolInput = null,
  signal = undefined,
  fileSystemHostFullAccess = false,
} = {}) {
  const normalized = normalizeApplyPatchInput({ toolInput })
  const previews = []

  for (const entry of normalized.operations) {
    const preview = resolveSingleApplyPatchPreview({
      projectRoot,
      entry,
      fileSystemHostFullAccess,
    })
    previews.push(preview)

    if (preview.type === 'delete_file') {
      await deleteFile(projectRoot, { path: preview.relativePath }, { signal, fileSystemHostFullAccess })
      continue
    }
    if (preview.type === 'move_file') {
      await writeFile(
        projectRoot,
        { path: preview.targetRelativePath, content: preview.nextContent },
        { signal, fileSystemHostFullAccess },
      )
      await deleteFile(projectRoot, { path: preview.relativePath }, { signal, fileSystemHostFullAccess })
      continue
    }
    await writeFile(projectRoot, { path: preview.relativePath, content: preview.nextContent }, { signal, fileSystemHostFullAccess })
  }

  const primary = previews[0] || null
  const applyPatchChanges = previews
    .map((preview) => buildApplyPatchChangeMeta(preview))
    .filter(Boolean)

  return {
    message: previews.length === 1
      ? buildSingleApplyPatchMessage(primary)
      : `Applied patch successfully: ${previews.length} changes.`,
    prevContent: primary?.previousContent ?? '',
    applyPatchMeta: applyPatchChanges[0] || null,
    applyPatchChanges,
  }
}
