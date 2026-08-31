export const RECENT_PROJECT_LIMIT = 20
export const DEFAULT_EXPANDED_PROJECT_LIMIT = 10

function numericTimestamp(value) {
  const timestamp = Number(value || 0)
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0
}

export function normalizeProjectRestorePriorities(restoredAtById = {}) {
  return Object.fromEntries(Object.entries(restoredAtById || {}).flatMap(([rawId, value]) => {
    const id = String(rawId || '').trim()
    const timestamp = numericTimestamp(value)
    return id && timestamp > 0 ? [[id, timestamp]] : []
  }))
}

export function pruneProjectRestorePriorities(projects = [], restoredAtById = {}) {
  const validIds = new Set(
    projects.map((project) => String(project?.id || '').trim()).filter(Boolean),
  )
  return Object.fromEntries(
    Object.entries(normalizeProjectRestorePriorities(restoredAtById))
      .filter(([id]) => validIds.has(id)),
  )
}

export function normalizeProjectArchiveOverrides(archivedAtById = {}) {
  return Object.fromEntries(Object.entries(archivedAtById || {}).flatMap(([rawId, value]) => {
    const id = String(rawId || '').trim()
    const timestamp = numericTimestamp(value)
    return id && timestamp > 0 ? [[id, timestamp]] : []
  }))
}

export function pruneProjectArchiveOverrides(projects = [], archivedAtById = {}) {
  const validIds = new Set(
    projects.map((project) => String(project?.id || '').trim()).filter(Boolean),
  )
  return Object.fromEntries(
    Object.entries(normalizeProjectArchiveOverrides(archivedAtById))
      .filter(([id]) => validIds.has(id)),
  )
}

export function partitionWorkspaceProjects(projects = [], restoredAtById = {}, archivedAtById = {}) {
  const restorePriorities = pruneProjectRestorePriorities(projects, restoredAtById)
  const archiveOverrides = pruneProjectArchiveOverrides(projects, archivedAtById)
  const manuallyArchived = []
  const activeProjects = []
  projects.forEach((project, sourceIndex) => {
    const entry = { project, sourceIndex }
    if (archiveOverrides[String(project?.id || '')]) manuallyArchived.push(entry)
    else activeProjects.push(entry)
  })
  const ranked = activeProjects.map(({ project, sourceIndex }) => ({
    project,
    sourceIndex,
    rank: Math.max(
      numericTimestamp(project?.lastWorkedAt),
      numericTimestamp(restorePriorities[String(project?.id || '')]),
    ),
  })).sort((left, right) => right.rank - left.rank || left.sourceIndex - right.sourceIndex)
  const recent = ranked.slice(0, RECENT_PROJECT_LIMIT)
  const archived = [...manuallyArchived, ...ranked.slice(RECENT_PROJECT_LIMIT)]
    .sort((left, right) => (
      numericTimestamp(right.project?.lastWorkedAt) - numericTimestamp(left.project?.lastWorkedAt)
      || left.sourceIndex - right.sourceIndex
    ))

  return {
    recentProjects: recent.map((entry) => entry.project),
    archivedProjects: archived.map((entry) => entry.project),
    restorePriorities,
    archiveOverrides,
  }
}

export function resolveInitialExpandedProjectIds(recentProjects = []) {
  return recentProjects.slice(0, DEFAULT_EXPANDED_PROJECT_LIMIT)
    .map((project) => String(project?.id || '').trim())
    .filter(Boolean)
}

export function resolveProjectMenuPosition(anchorRect = {}, menuSize = {}, viewport = {}) {
  const margin = Math.max(0, Number(viewport.margin || 0))
  const gap = Math.max(0, Number(viewport.gap || 0))
  const viewportWidth = Math.max(0, Number(viewport.width || 0))
  const viewportHeight = Math.max(0, Number(viewport.height || 0))
  const menuWidth = Math.max(0, Number(menuSize.width || 0))
  const menuHeight = Math.max(0, Number(menuSize.height || 0))
  const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin)
  const preferredLeft = Number(anchorRect.right || anchorRect.left || 0) - menuWidth
  const left = Math.min(maxLeft, Math.max(margin, preferredLeft))
  const belowTop = Number(anchorRect.bottom || 0) + gap
  const aboveTop = Number(anchorRect.top || 0) - menuHeight - gap
  const top = belowTop + menuHeight <= viewportHeight - margin
    ? belowTop
    : Math.max(margin, aboveTop)
  return { left, top }
}
