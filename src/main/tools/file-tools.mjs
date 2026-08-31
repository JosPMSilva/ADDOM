import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  runFindFiles,
  runGrepFile,
  runRollbackFile,
  runViewFileRange,
} from './file-tools-history-and-find.mjs'
import {
  clampInt,
  ensureNoSymlinkSegments,
  ensureNotSymlink,
  formatDisplayPath,
  isSymbolicLinkEntry,
  resolveToolPath,
  sortDirEntries,
  statIfExists,
  toPosixRel,
  validatePathShape,
  writeFileAtomic,
  lstatIfExists,
} from './file-tools-path-utils.mjs'
import {
  buildSafeSearchRegex,
  createPathFilter,
  wildcardToRegexSource,
} from './file-tools-search-utils.mjs'
import {
  isCapabilityCatalogVirtualPath,
  readCapabilityCatalogVirtualFile,
  searchCapabilityCatalogVirtualFiles,
} from './capability-catalog-virtual-fs.mjs'
import { recordDevCapabilityCatalogOperation } from '../chat/dev-tool-surface-diagnostics.mjs'

export const MAX_WRITE_FILE_BYTES = 1_048_576
const MAX_LIST_DIRECTORY_DEPTH = 6
const MAX_LIST_DIRECTORY_LIMIT = 500
const DEFAULT_LIST_DIRECTORY_LIMIT = 200
const MAX_SEARCH_CODE_LIMIT = 200
const DEFAULT_SEARCH_CODE_LIMIT = 50

/**
 * read_file - read the text content of a single file.
 * Falls back to the latest artifact revision when the file is missing on disk.
 */
export async function readFile(projectRoot, { path: filePath }, options = {}) {
  if (isCapabilityCatalogVirtualPath(filePath)) {
    const result = await readCapabilityCatalogVirtualFile({ path: filePath, projectRoot })
    recordDevCapabilityCatalogOperation(options?.errorDiagnostics, {
      operation: 'read',
      path: filePath,
    })
    return result
  }
  const abs = resolveToolPath(projectRoot, filePath, options)
  await ensureNoSymlinkSegments(fs, projectRoot, filePath, 'read', options)
  const stat = await statIfExists(fs, abs)

  if (stat) {
    if (stat.isDirectory()) throw new Error(`"${filePath}" is a directory, not a file.`)
    if (stat.size > 1_048_576) throw new Error(`File too large to read (> 1 MB): ${filePath}`)
    return fs.readFile(abs, 'utf8')
  }

  try {
    const normPath = filePath.replace(/\\/g, '/')
    const { getLatestRevision } = await import('../memory/artifact-store.mjs')
    const rev = getLatestRevision(projectRoot, normPath)
    if (rev?.content?.trim().length > 0) {
      const source = rev.source === 'ai_suggestion'
        ? ' (artifact - not yet on disk)'
        : ' (from artifact store)'
      return rev.content + `\n\n[Note: read from artifact store${source}]`
    }
  } catch {
    // Non-fatal fallback miss.
  }

  throw new Error(`File not found: ${filePath}`)
}

/**
 * write_file - write (create or overwrite) a file and return previous content when available.
 */
export async function writeFile(projectRoot, { path: filePath, content }, options = {}) {
  validatePathShape(filePath, 'path')
  const abs = resolveToolPath(projectRoot, filePath, options)
  const nextContent = String(content ?? '')
  const bytes = Buffer.byteLength(nextContent, 'utf8')
  if (bytes > MAX_WRITE_FILE_BYTES) {
    throw new Error(
      `Refusing oversized write_file payload (> ${Math.round(MAX_WRITE_FILE_BYTES / 1024)} KB): ${filePath}. ` +
      'Split the file into smaller edits or write only the relevant section.',
    )
  }

  let prevContent = null
  const existingStat = await statIfExists(fs, abs)
  if (existingStat) {
    await ensureNotSymlink(fs, abs, 'write')
    try {
      if (!existingStat.isDirectory() && existingStat.size <= 1_048_576) {
        prevContent = await fs.readFile(abs, 'utf8')
      }
    } catch {
      // Ignore, prevContent remains null.
    }
  }

  await fs.mkdir(path.dirname(abs), { recursive: true })
  await ensureNotSymlink(fs, abs, 'write')
  await writeFileAtomic(fs, abs, nextContent)
  return { message: `File written successfully: ${filePath}`, prevContent }
}

/**
 * list_directory - list files and subdirectories with optional depth/pagination.
 */
export async function listDirectory(projectRoot, {
  path: dirPath = '.',
  depth = 1,
  limit = DEFAULT_LIST_DIRECTORY_LIMIT,
  offset = 0,
} = {}, options = {}) {
  const abs = resolveToolPath(projectRoot, dirPath, options)
  await ensureNoSymlinkSegments(fs, projectRoot, dirPath, 'list', options)
  const stat = await statIfExists(fs, abs)
  if (!stat) throw new Error(`Directory not found: ${dirPath}`)
  if (!stat.isDirectory()) throw new Error(`"${dirPath}" is not a directory.`)

  const maxDepth = clampInt(depth, 1, 1, MAX_LIST_DIRECTORY_DEPTH)
  const pageLimit = clampInt(limit, DEFAULT_LIST_DIRECTORY_LIMIT, 1, MAX_LIST_DIRECTORY_LIMIT)
  const pageOffset = clampInt(offset, 0, 0, 1_000_000)
  const shouldIgnore = await createPathFilter(fs, projectRoot, { ...options, rootPath: abs })
  const rendered = []
  let seen = 0
  let hasMore = false

  function pushLine(line) {
    if (hasMore) return
    if (seen >= pageOffset && rendered.length < pageLimit) {
      rendered.push(line)
    }
    seen += 1
    if (seen > (pageOffset + pageLimit)) {
      hasMore = true
    }
  }

  async function walk(dir, currentDepth) {
    if (hasMore) return
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of sortDirEntries(entries)) {
      if (hasMore) return
      if (isSymbolicLinkEntry(entry)) continue
      const fullPath = path.join(dir, entry.name)
      const isDir = entry.isDirectory()
      if (shouldIgnore(fullPath, entry.name, isDir)) continue
      const relFromStart = toPosixRel(path.relative(abs, fullPath))
      pushLine(`${isDir ? '[dir]' : '[file]'} ${relFromStart || entry.name}`)
      if (isDir && currentDepth < maxDepth) {
        await walk(fullPath, currentDepth + 1)
      }
    }
  }

  await walk(abs, 1)

  const baseOutput = rendered.join('\n')
  const hasPaginationMeta = hasMore || pageOffset > 0 || maxDepth !== 1 || pageLimit !== DEFAULT_LIST_DIRECTORY_LIMIT
  if (!baseOutput && !hasMore && pageOffset === 0) {
    if (!hasPaginationMeta) return 'Directory is empty.'
    return `Showing 0 entries from offset 0 (depth=${maxDepth}, limit=${pageLimit}).\nDirectory is empty.`
  }
  if (!hasPaginationMeta) return baseOutput

  const summary = `Showing ${rendered.length} entr${rendered.length === 1 ? 'y' : 'ies'} from offset ${pageOffset} (depth=${maxDepth}, limit=${pageLimit}).`
  const nextHint = hasMore
    ? `\n[More entries available. Re-run list_directory with ${JSON.stringify({
      path: dirPath,
      depth: maxDepth,
      offset: pageOffset + rendered.length,
      limit: pageLimit,
    })}]`
    : ''
  return `${summary}\n${baseOutput}${nextHint}`.trim()
}

/**
 * search_code - regex/string search across text files in the project.
 */
export async function searchCode(projectRoot, {
  query,
  path: searchPath = '.',
  file_extensions = null,
  limit = DEFAULT_SEARCH_CODE_LIMIT,
  offset = 0,
} = {}, options = {}) {
  if (isCapabilityCatalogVirtualPath(searchPath)) {
    const result = await searchCapabilityCatalogVirtualFiles({ query, path: searchPath, projectRoot, limit, offset })
    const match = String(result || '').match(/^Showing\s+(\d+)\s+match/i)
    recordDevCapabilityCatalogOperation(options?.errorDiagnostics, {
      operation: 'search',
      path: searchPath,
      query,
      matchCount: match ? Number(match[1] || 0) || 0 : 0,
    })
    return result
  }
  const abs = resolveToolPath(projectRoot, searchPath, options)
  await ensureNoSymlinkSegments(fs, projectRoot, searchPath, 'search', options)
  const searchStat = await statIfExists(fs, abs)
  if (!searchStat) throw new Error(`Search path not found: ${searchPath}`)
  const results = []
  const pageLimit = clampInt(limit, DEFAULT_SEARCH_CODE_LIMIT, 1, MAX_SEARCH_CODE_LIMIT)
  const pageOffset = clampInt(offset, 0, 0, 1_000_000)
  const shouldIgnore = await createPathFilter(fs, projectRoot, { ...options, rootPath: abs })
  let totalMatchesSeen = 0
  let hasMore = false

  const defaultTextExts = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
    '.py', '.java', '.c', '.cpp', '.cs', '.h', '.hpp',
    '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.html', '.css', '.scss',
    '.json', '.yaml', '.yml', '.toml', '.md', '.txt', '.sh', '.sql',
    '.vue', '.svelte', '.astro', '.xml', '.env', '.ini', '.cfg',
  ])

  let activeExts = defaultTextExts
  if (Array.isArray(file_extensions) && file_extensions.length > 0) {
    activeExts = new Set(
      file_extensions
        .map((e) => {
          const v = String(e || '').trim().toLowerCase()
          return v.startsWith('.') ? v : `.${v}`
        })
        .filter(Boolean),
    )
  }

  const regex = buildSafeSearchRegex(query, 'query')

  async function walk(dir) {
    if (hasMore) return
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of sortDirEntries(entries)) {
      if (hasMore) return
      if (isSymbolicLinkEntry(entry)) continue
      if (entry.name.startsWith('.')) continue

      const fullPath = path.join(dir, entry.name)
      if (shouldIgnore(fullPath, entry.name, entry.isDirectory())) continue
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else {
        const ext = path.extname(entry.name).toLowerCase()
        if (!activeExts.has(ext)) continue
        const stat = await statIfExists(fs, fullPath)
        if (!stat) continue
        if (stat.size > 512_000) continue
        try {
          const lines = (await fs.readFile(fullPath, 'utf8')).split('\n')
          lines.forEach((line, idx) => {
            if (hasMore) return
            regex.lastIndex = 0
            if (regex.test(line)) {
              totalMatchesSeen += 1
              if (totalMatchesSeen <= pageOffset) return
              if (results.length >= pageLimit) {
                hasMore = true
                return
              }
              const displayPath = formatDisplayPath(projectRoot, fullPath)
              results.push(`${displayPath}:${idx + 1}: ${line.trim()}`)
            }
          })
        } catch {
          // unreadable file - skip
        }
      }
    }
  }

  await walk(abs)

  if (results.length === 0) return `No matches found for: ${query}`
  const header = `Showing ${results.length} match(es) for "${query}" from offset ${pageOffset} (limit=${pageLimit}).\n`
  const nextHint = hasMore
    ? `\n[More matches available. Re-run search_code with ${JSON.stringify({
      query: String(query ?? ''),
      path: searchPath,
      offset: pageOffset + results.length,
      limit: pageLimit,
    })}]`
    : ''
  return header + results.join('\n') + nextHint
}

/**
 * edit_file - apply a targeted search-and-replace edit to an existing file.
 * Returns previous content for artifact versioning + diff display.
 */
export async function editFile(projectRoot, { path: filePath, old_text, new_text }, options = {}) {
  if (!old_text && old_text !== '') throw new Error('edit_file requires old_text (the exact text to replace).')
  if (new_text === undefined || new_text === null) throw new Error('edit_file requires new_text (the replacement text).')

  const abs = resolveToolPath(projectRoot, filePath, options)
  await ensureNotSymlink(fs, abs, 'edit')
  const stat = await statIfExists(fs, abs)
  if (!stat) throw new Error(`File not found: ${filePath}`)
  if (stat.isDirectory()) throw new Error(`"${filePath}" is a directory, not a file.`)
  if (stat.size > 1_048_576) throw new Error(`File too large for edit_file (> 1 MB): ${filePath}`)

  const prevContent = await fs.readFile(abs, 'utf8')
  const oldText = String(old_text)
  const newText = String(new_text)

  const idx = prevContent.indexOf(oldText)
  if (idx === -1) {
    const normalizedPrevContent = prevContent.replace(/\r\n/g, '\n')
    const normalizedOldText = oldText.replace(/\r\n/g, '\n')
    const lineEndingNormalizedMatch = normalizedPrevContent.includes(normalizedOldText)
    const oldTextTrimmed = oldText.trim()
    const trimmedTextMatch = !!oldTextTrimmed && prevContent.includes(oldTextTrimmed)
    const fileLineEnding = /\r\n/.test(prevContent) ? 'CRLF' : 'LF'
    const oldTextLineEnding = /\r\n/.test(oldText)
      ? 'CRLF'
      : /\n/.test(oldText)
        ? 'LF'
        : 'none'
    const diagnosticHints = []
    if (lineEndingNormalizedMatch) {
      diagnosticHints.push(
        `Likely line-ending mismatch (file uses ${fileLineEnding}, old_text uses ${oldTextLineEnding}).`,
      )
    }
    if (!lineEndingNormalizedMatch && trimmedTextMatch) {
      diagnosticHints.push('Likely leading/trailing whitespace mismatch around old_text.')
    }
    const diagnosticSuffix = diagnosticHints.length > 0
      ? ` Hints: ${diagnosticHints.join(' ')}`
      : ''
    throw new Error(
      `edit_file: old_text not found in ${filePath}. ` +
      'Make sure old_text matches the file content exactly (including whitespace and line breaks). ' +
      'Use read_file or view_file_range to verify the current content first.' +
      diagnosticSuffix,
    )
  }

  // Check for ambiguous match — if old_text appears more than once.
  const secondIdx = prevContent.indexOf(oldText, idx + 1)
  if (secondIdx !== -1) {
    const occurrences = prevContent.split(oldText).length - 1
    throw new Error(
      `edit_file: old_text appears ${occurrences} times in ${filePath}. ` +
      'Include more surrounding context in old_text to make the match unique.',
    )
  }

  const nextContent = prevContent.slice(0, idx) + newText + prevContent.slice(idx + oldText.length)
  const bytes = Buffer.byteLength(nextContent, 'utf8')
  if (bytes > MAX_WRITE_FILE_BYTES) {
    throw new Error(
      `Refusing oversized edit_file result (> ${Math.round(MAX_WRITE_FILE_BYTES / 1024)} KB): ${filePath}`,
    )
  }

  await ensureNotSymlink(fs, abs, 'edit')
  await writeFileAtomic(fs, abs, nextContent)
  return { message: `File edited successfully: ${filePath}`, prevContent }
}

/**
 * create_directory - create a directory (and parents) inside the project.
 */
export async function createDirectory(projectRoot, { path: dirPath }, options = {}) {
  validatePathShape(dirPath, 'path')
  const abs = resolveToolPath(projectRoot, dirPath, options)
  await fs.mkdir(abs, { recursive: true })
  return `Directory created: ${dirPath}`
}

/**
 * delete_file - delete an existing file and return previous content when available.
 */
export async function deleteFile(projectRoot, { path: filePath }, options = {}) {
  validatePathShape(filePath, 'path')
  const abs = resolveToolPath(projectRoot, filePath, options)
  await ensureNotSymlink(fs, abs, 'delete')
  const stat = await statIfExists(fs, abs)
  if (!stat) throw new Error(`File not found: ${filePath}`)
  if (stat.isDirectory()) throw new Error(`"${filePath}" is a directory, not a file.`)
  let prevContent = null
  if (stat.size <= 1_048_576) {
    prevContent = await fs.readFile(abs, 'utf8')
  }
  await fs.unlink(abs)
  return { message: `File deleted successfully: ${filePath}`, prevContent }
}

/**
 * rename_file - rename or move a file within the project root.
 */
export async function renameFile(projectRoot, { old_path, new_path }, options = {}) {
  validatePathShape(old_path, 'old_path')
  validatePathShape(new_path, 'new_path')
  const fromAbs = resolveToolPath(projectRoot, old_path, options)
  const toAbs = resolveToolPath(projectRoot, new_path, options)
  await ensureNoSymlinkSegments(fs, projectRoot, old_path, 'rename', options)
  await ensureNoSymlinkSegments(fs, projectRoot, new_path, 'rename', options)
  const fromStat = await statIfExists(fs, fromAbs)
  if (!fromStat) throw new Error(`Source file not found: ${old_path}`)
  if (fromStat.isDirectory()) throw new Error(`"${old_path}" is a directory, not a file.`)
  const toLstat = await lstatIfExists(fs, toAbs)
  if (toLstat?.isSymbolicLink()) {
    throw new Error('Refusing to rename through a symbolic link.')
  }
  if (toLstat) throw new Error(`Destination already exists: ${new_path}`)
  let prevContent = null
  if (fromStat.size <= 1_048_576) {
    prevContent = await fs.readFile(fromAbs, 'utf8')
  }
  await fs.mkdir(path.dirname(toAbs), { recursive: true })
  await fs.rename(fromAbs, toAbs)
  return {
    message: `File renamed successfully: ${old_path} -> ${new_path}`,
    oldPath: String(old_path || ''),
    newPath: String(new_path || ''),
    prevContent,
  }
}

/**
 * view_file_range - read a specific range of lines from a file.
 */
export async function viewFileRange(projectRoot, { path: filePath, start_line, end_line }, options = {}) {
  return runViewFileRange({
    fs,
    projectRoot,
    filePath,
    startLineInput: start_line,
    endLineInput: end_line,
    helpers: {
      safePath: (root, targetPath) => resolveToolPath(root, targetPath, options),
      ensureNoSymlinkSegments: (root, targetPath, operation) => ensureNoSymlinkSegments(fs, root, targetPath, operation, options),
      statIfExists: (absPath) => statIfExists(fs, absPath),
    },
  })
}

/**
 * grep_file - search for a pattern within a single file with optional context.
 */
export async function grepFile(projectRoot, { path: filePath, pattern, context_lines = 0 }, options = {}) {
  return runGrepFile({
    fs,
    projectRoot,
    filePath,
    pattern,
    contextLines: context_lines,
    helpers: {
      safePath: (root, targetPath) => resolveToolPath(root, targetPath, options),
      ensureNoSymlinkSegments: (root, targetPath, operation) => ensureNoSymlinkSegments(fs, root, targetPath, operation, options),
      statIfExists: (absPath) => statIfExists(fs, absPath),
      clampInt,
      buildSafeSearchRegex,
    },
  })
}

/**
 * rollback_file - list revisions or apply a specific previous revision.
 */
export async function rollbackFile(projectRoot, { path: filePath, revision_id } = {}, options = {}) {
  return runRollbackFile({
    fs,
    path,
    projectRoot,
    filePath,
    revisionId: revision_id,
    helpers: {
      validatePathShape,
      safePath: (root, targetPath) => resolveToolPath(root, targetPath, options),
      ensureNoSymlinkSegments: (root, targetPath, operation) => ensureNoSymlinkSegments(fs, root, targetPath, operation, options),
      statIfExists: (absPath) => statIfExists(fs, absPath),
      writeFileAtomic: (absPath, content) => writeFileAtomic(fs, absPath, content),
      maxWriteFileBytes: MAX_WRITE_FILE_BYTES,
      loadArtifactStore: () => import('../memory/artifact-store.mjs'),
    },
  })
}

/**
 * find_files - find files matching a glob pattern or name fragment.
 */
export async function findFiles(projectRoot, {
  pattern,
  path: searchDir = '.',
  type: entryType = 'file',
  limit = 50,
} = {}, options = {}) {
  return runFindFiles({
    fs,
    path,
    projectRoot,
    pattern,
    searchDir,
    entryType,
    limit,
    helpers: {
      safePath: (root, targetPath) => resolveToolPath(root, targetPath, options),
      ensureNoSymlinkSegments: (root, targetPath, operation) => ensureNoSymlinkSegments(fs, root, targetPath, operation, options),
      statIfExists: (absPath) => statIfExists(fs, absPath),
      clampInt,
      createPathFilter: (root, filterOptions = {}) => createPathFilter(fs, root, { ...options, ...filterOptions }),
      sortDirEntries,
      isSymbolicLinkEntry,
      wildcardToRegexSource,
      toPosixRel,
      formatDisplayPath,
    },
  })
}
