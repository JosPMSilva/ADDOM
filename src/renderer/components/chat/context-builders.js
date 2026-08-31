import {
  normalizeStringArray,
  normalizeRequestLimit,
  truncate,
  describeMemoryFilters,
} from './chat-utils.js'

export async function buildMemoryReviewContext(projectFolder, request = {}) {
  const includeGlobal = !!request.includeGlobal
  const nodes = await window.addom.memory.list(projectFolder, {
    includeCompressed: false,
    includeGlobal,
  })
  if (!nodes?.length) {
    return {
      context: 'No active memory nodes were found for this project.',
      traceSummary: includeGlobal
        ? 'No memory nodes available (project + global).'
        : 'No memory nodes available.',
    }
  }

  const sortIdFrom = Number.isFinite(request.sortIdFrom) ? request.sortIdFrom : null
  const sortIdTo = Number.isFinite(request.sortIdTo) ? request.sortIdTo : null
  const tagFilters = normalizeStringArray(request.tags, 16).map((t) => t.toLowerCase())
  const sourceFilters = normalizeStringArray(request.sources, 10).map((s) => s.toLowerCase())
  const limit = normalizeRequestLimit(request.limit, 12)

  let filtered = [...nodes]
  if (Number.isFinite(sortIdFrom)) filtered = filtered.filter((n) => Number(n.sortId || 0) >= sortIdFrom)
  if (Number.isFinite(sortIdTo)) filtered = filtered.filter((n) => Number(n.sortId || 0) <= sortIdTo)
  if (tagFilters.length > 0) {
    filtered = filtered.filter((n) => {
      const tags = Array.isArray(n.tags) ? n.tags.map((t) => String(t).toLowerCase()) : []
      return tagFilters.some((tag) => tags.includes(tag))
    })
  }
  if (sourceFilters.length > 0) {
    filtered = filtered.filter((n) => sourceFilters.includes(String(n.source || '').toLowerCase()))
  }

  const selected = filtered.slice(0, limit)
  const filterParts = describeMemoryFilters({
    sortIdFrom,
    sortIdTo,
    tags: tagFilters,
    sources: sourceFilters,
    limit,
  })

  const lines = [
    `Memory snapshot (${selected.length} nodes returned, ${filtered.length} matched):`,
    ...(filterParts.length > 0 ? [`Applied filters: ${filterParts.join(' | ')}`] : []),
    ...selected.map((n) => `- [#${n.sortId}] ${n.topic}: ${truncate(n.content.replace(/\n/g, ' '), 180)}`),
  ]
  if (selected.length === 0) {
    lines.push('- No nodes matched the requested filters.')
  }

  const sortIds = selected.map((n) => `#${n.sortId}`)
  const nodeIds = selected.map((n) => n.id)

  return {
    context: lines.join('\n'),
    traceSummary: [
      `includeGlobal=${includeGlobal ? 'yes' : 'no'}`,
      `usedSortIds=${sortIds.length ? sortIds.join(', ') : 'none'}`,
      `usedNodeIds=${nodeIds.length ? nodeIds.join(', ') : 'none'}`,
      `matched=${filtered.length}`,
      `returned=${selected.length}`,
    ].join(' | '),
  }
}

export async function buildArtifactReviewContext(projectFolder, request = {}) {
  const filePathFilters = normalizeStringArray(request.filePaths, 20).map((p) => p.replace(/\\/g, '/'))
  const response = await window.addom.artifacts.reviewContext(projectFolder, {
    filePaths: filePathFilters,
    limit: normalizeRequestLimit(request.limit, 12),
    includeRevisions: request.includeRevisions !== false,
    revisionsPerFile: Number.isFinite(request.revisionsPerFile)
      ? request.revisionsPerFile
      : 3,
    fromRev: Number.isFinite(request.fromRev) ? request.fromRev : null,
    toRev: Number.isFinite(request.toRev) ? request.toRev : null,
  })

  return {
    context: String(response?.context ?? 'No artifacts were found for this project.'),
    traceSummary: String(response?.traceSummary ?? 'No artifact files available.'),
  }
}
