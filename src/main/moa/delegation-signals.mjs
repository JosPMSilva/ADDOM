function clean(value) {
  return String(value ?? '').trim()
}

function collectTaskText(task = {}) {
  return [
    clean(task.instruction),
    String(task.injected_context ?? ''),
    clean(task.expected_output_format),
  ].filter(Boolean).join('\n')
}

function parseLikelyFilePaths(text = '') {
  const source = String(text ?? '')
  if (!source) return []
  const matches = source.match(/(?:[A-Za-z]:\\|\.{0,2}\/)?[A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._-]+){1,}/g) || []
  return matches
    .map((row) => clean(row).replace(/\\/g, '/'))
    .filter((row) => row && !row.startsWith('http://') && !row.startsWith('https://'))
}

export function buildProjectSignals(tasks = [], projectFolder = '') {
  const rows = Array.isArray(tasks) ? tasks : []
  const inferredFiles = new Set()
  let writeIntentCount = 0

  for (const task of rows) {
    const text = collectTaskText(task)
    for (const pathLike of parseLikelyFilePaths(text)) {
      inferredFiles.add(pathLike.toLowerCase())
    }
    const normalizedText = text.toLowerCase()
    if (
      normalizedText.includes('write')
      || normalizedText.includes('create file')
      || normalizedText.includes('edit')
      || normalizedText.includes('refactor')
      || normalizedText.includes('rename')
    ) {
      writeIntentCount += 1
    }
  }

  return {
    taskCount: rows.length,
    estimatedChangedFiles: inferredFiles.size,
    writeIntentCount,
    hasProjectFolder: !!clean(projectFolder),
  }
}

export function buildRecentMoaStats(turnToolResults = []) {
  const rows = Array.isArray(turnToolResults) ? turnToolResults : []
  const delegationRows = rows.filter((row) => String(row?.toolName || '') === 'delegate_to_agents' || String(row?.toolName || '') === 'delegate_to_agents')
  const total = delegationRows.length
  if (!total) {
    return {
      totalDelegations: 0,
      recentFailureRate: 0,
    }
  }

  const failures = delegationRows.filter((row) => {
    if (row?.isError) return true
    return String(row?.decision || '').toLowerCase() === 'denied'
  }).length

  return {
    totalDelegations: total,
    recentFailureRate: failures / total,
  }
}

