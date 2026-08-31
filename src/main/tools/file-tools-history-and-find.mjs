export async function runRollbackFile({
  fs,
  path,
  projectRoot,
  filePath,
  revisionId,
  helpers,
}) {
  const {
    validatePathShape,
    safePath,
    ensureNoSymlinkSegments,
    statIfExists,
    writeFileAtomic,
    maxWriteFileBytes,
    loadArtifactStore,
  } = helpers

  if (!filePath) throw new Error('rollback_file requires a path.')
  validatePathShape(filePath, 'path')
  const normPath = filePath.replace(/\\/g, '/')
  const { listRevisions, getRevision, recordWrite } = await loadArtifactStore()

  if (!revisionId) {
    const revisions = listRevisions(projectRoot, normPath)
    if (!revisions || revisions.length === 0) {
      return `No artifact revisions found for: ${filePath}`
    }
    const lines = [`Revisions for ${filePath} (newest first):`]
    for (const rev of revisions.slice(0, 20)) {
      const date = new Date(rev.created_at).toISOString()
      const size = Number(rev.content_length || 0)
      const note = rev.note ? ` - ${String(rev.note).slice(0, 120)}` : ''
      lines.push(`  rev ${rev.rev} | id: ${rev.id} | ${rev.source} | ${date} | ${size} bytes${note}`)
    }
    if (revisions.length > 20) {
      lines.push(`  ... and ${revisions.length - 20} more revision(s).`)
    }
    return lines.join('\n')
  }

  const revision = getRevision(String(revisionId).trim())
  if (!revision) throw new Error(`Artifact revision not found: ${revisionId}`)

  const abs = safePath(projectRoot, filePath)
  await ensureNoSymlinkSegments(projectRoot, filePath, 'rollback')
  let prevContent = null
  const stat = await statIfExists(abs)
  if (stat) {
    if (stat.isDirectory()) throw new Error(`"${filePath}" is a directory, not a file.`)
    if (stat.size <= 1_048_576) {
      prevContent = await fs.readFile(abs, 'utf8')
    }
  }

  const nextContent = String(revision.content ?? '')
  const bytes = Buffer.byteLength(nextContent, 'utf8')
  if (bytes > maxWriteFileBytes) {
    throw new Error(
      `Refusing oversized rollback_file result (> ${Math.round(maxWriteFileBytes / 1024)} KB): ${filePath}`,
    )
  }
  await fs.mkdir(path.dirname(abs), { recursive: true })
  await ensureNoSymlinkSegments(projectRoot, filePath, 'rollback')
  await writeFileAtomic(abs, nextContent)

  recordWrite({
    project: projectRoot,
    filePath: normPath,
    newContent: nextContent,
    prevContent,
    source: 'ai_write',
    note: `Rolled back to revision ${revisionId} (rev ${revision.rev}).`,
  })

  return {
    message: `File rolled back to revision ${revision.rev}: ${filePath}`,
    prevContent,
  }
}

export async function runFindFiles({
  fs,
  path,
  projectRoot,
  pattern,
  searchDir = '.',
  entryType = 'file',
  limit = 50,
  helpers,
}) {
  const {
    safePath,
    ensureNoSymlinkSegments,
    statIfExists,
    clampInt,
    createPathFilter,
    sortDirEntries,
    isSymbolicLinkEntry,
    wildcardToRegexSource,
    toPosixRel,
    formatDisplayPath,
  } = helpers

  if (!pattern) throw new Error('find_files requires a pattern.')
  const abs = safePath(projectRoot, searchDir)
  await ensureNoSymlinkSegments(projectRoot, searchDir, 'find')
  const stat = await statIfExists(abs)
  if (!stat) throw new Error(`Search directory not found: ${searchDir}`)
  if (!stat.isDirectory()) throw new Error(`"${searchDir}" is not a directory.`)

  const pageLimit = clampInt(limit, 50, 1, 200)
  const shouldIgnore = await createPathFilter(projectRoot, { rootPath: abs })
  const typeFilter = String(entryType || 'file').trim().toLowerCase()
  const results = []

  const hasGlob = /[*?]/.test(pattern)
  let matcher
  if (hasGlob) {
    const regexSrc = wildcardToRegexSource(pattern, { allowSlash: pattern.includes('/') || pattern.includes('**') })
    const regex = new RegExp(`^${regexSrc}$`, 'i')
    matcher = (relPath, baseName) => {
      if (pattern.includes('/') || pattern.includes('**')) return regex.test(relPath)
      return regex.test(baseName)
    }
  } else {
    const lower = pattern.toLowerCase()
    matcher = (_relPath, baseName) => baseName.toLowerCase().includes(lower)
  }

  async function walk(dir) {
    if (results.length >= pageLimit) return
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of sortDirEntries(entries)) {
      if (results.length >= pageLimit) return
      if (isSymbolicLinkEntry(entry)) continue
      const fullPath = path.join(dir, entry.name)
      const isDir = entry.isDirectory()
      if (shouldIgnore(fullPath, entry.name, isDir)) continue
      const relPath = toPosixRel(path.relative(abs, fullPath))

      const matchesType = typeFilter === 'any'
        || (typeFilter === 'file' && !isDir)
        || (typeFilter === 'directory' && isDir)

      if (matchesType && matcher(relPath, entry.name)) {
        const displayPath = typeof formatDisplayPath === 'function'
          ? formatDisplayPath(projectRoot, fullPath)
          : toPosixRel(path.relative(projectRoot, fullPath))
        results.push(`${isDir ? '[dir]' : '[file]'} ${displayPath}`)
      }

      if (isDir) await walk(fullPath)
    }
  }

  await walk(abs)

  if (results.length === 0) return `No matches found for pattern: ${pattern}`
  const limitHint = results.length >= pageLimit
    ? ' (limit reached - refine your pattern or search a subdirectory)'
    : ''
  return `Found ${results.length} result(s) matching "${pattern}"${limitHint}:\n${results.join('\n')}`
}

export async function runViewFileRange({
  fs,
  projectRoot,
  filePath,
  startLineInput,
  endLineInput,
  helpers,
}) {
  const {
    safePath,
    ensureNoSymlinkSegments,
    statIfExists,
  } = helpers

  const abs = safePath(projectRoot, filePath)
  await ensureNoSymlinkSegments(projectRoot, filePath, 'view')
  const stat = await statIfExists(abs)
  if (!stat) throw new Error(`File not found: ${filePath}`)
  if (stat.isDirectory()) throw new Error(`"${filePath}" is a directory, not a file.`)
  if (stat.size > 2_097_152) throw new Error(`File too large to read (> 2 MB): ${filePath}`)

  const content = await fs.readFile(abs, 'utf8')
  const allLines = content.split('\n')
  const totalLines = allLines.length
  const startLine = Math.max(1, Math.round(Number(startLineInput) || 1))
  const maxEndLine = Math.min(startLine + 500, totalLines)
  const endLine = Math.min(maxEndLine, Math.max(startLine, Math.round(Number(endLineInput) || startLine)))

  const slice = allLines.slice(startLine - 1, endLine)
  const numbered = slice.map((line, index) => `${startLine + index}: ${line}`)
  const header = `${filePath} (lines ${startLine}-${endLine} of ${totalLines})`
  return `${header}\n${numbered.join('\n')}`
}

export async function runGrepFile({
  fs,
  projectRoot,
  filePath,
  pattern,
  contextLines = 0,
  helpers,
}) {
  const {
    safePath,
    ensureNoSymlinkSegments,
    statIfExists,
    clampInt,
    buildSafeSearchRegex,
  } = helpers

  const abs = safePath(projectRoot, filePath)
  await ensureNoSymlinkSegments(projectRoot, filePath, 'grep')
  const stat = await statIfExists(abs)
  if (!stat) throw new Error(`File not found: ${filePath}`)
  if (stat.isDirectory()) throw new Error(`"${filePath}" is a directory, not a file.`)
  if (stat.size > 2_097_152) throw new Error(`File too large (> 2 MB): ${filePath}`)
  if (!pattern) throw new Error('grep_file requires a pattern.')

  const ctx = clampInt(contextLines, 0, 0, 5)
  const regex = buildSafeSearchRegex(pattern, 'pattern')

  const content = await fs.readFile(abs, 'utf8')
  const lines = content.split('\n')
  const matchIndexes = new Set()

  lines.forEach((line, index) => {
    regex.lastIndex = 0
    if (regex.test(line)) matchIndexes.add(index)
  })

  if (matchIndexes.size === 0) return `No matches for "${pattern}" in ${filePath}`

  const displayIndexes = new Set()
  for (const index of matchIndexes) {
    for (let delta = -ctx; delta <= ctx; delta += 1) {
      const lineIndex = index + delta
      if (lineIndex >= 0 && lineIndex < lines.length) displayIndexes.add(lineIndex)
    }
  }

  const sortedIndexes = [...displayIndexes].sort((a, b) => a - b)
  const output = []
  let lastIndex = -2
  for (const index of sortedIndexes) {
    if (lastIndex >= 0 && index > lastIndex + 1) {
      output.push('---')
    }
    const marker = matchIndexes.has(index) ? '>' : ' '
    output.push(`${marker} ${index + 1}: ${lines[index]}`)
    lastIndex = index
  }

  return `${matchIndexes.size} match(es) for "${pattern}" in ${filePath}:\n${output.join('\n')}`
}
