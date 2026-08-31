export const DEFAULT_VISIBLE_PROJECT_THREAD_COUNT = 3
export const MAX_PROJECT_THREAD_SEARCH_CONCURRENCY = 4

function normalizeSearchValue(value) {
  return String(value || '').trim().toLowerCase()
}

export function resolveVisibleProjectThreads(threads = [], visibleCount) {
  const cachedThreads = Array.isArray(threads) ? threads : []
  const count = Number.isFinite(Number(visibleCount))
    ? Math.max(0, Math.floor(Number(visibleCount)))
    : DEFAULT_VISIBLE_PROJECT_THREAD_COUNT
  const total = cachedThreads.length
  const visible = cachedThreads.slice(0, Math.min(count, total))
  return { visible, total, remaining: Math.max(0, total - visible.length) }
}

export function resolveProjectThreadLoadState(rows, error, cachedRows = []) {
  if (error) {
    return {
      status: 'failed',
      threads: Array.isArray(cachedRows) ? cachedRows : [],
      error: String(error?.message || error || 'Failed to load threads.'),
    }
  }
  const threads = Array.isArray(rows) ? rows : []
  return {
    status: threads.length > 0 ? 'loaded' : 'empty',
    threads,
    error: '',
  }
}

export function resolveArchiveDisclosure(archiveExpanded, query = '') {
  return Boolean(archiveExpanded || String(query || '').trim())
}

export function resolveArchiveDisclosureToggle(archiveExpanded, query = '') {
  return String(query || '').trim() ? Boolean(archiveExpanded) : !archiveExpanded
}

export function filterWorkspaceProjectTree(projects = [], threadStateByProject = {}, query = '') {
  const needle = normalizeSearchValue(query)
  if (!needle) {
    return projects.map((project) => ({ project, matchingThreads: [] }))
  }

  return projects.flatMap((project) => {
    const projectHaystack = [
      project?.name,
      project?.path,
      project?.lastProvider,
      project?.lastModel,
    ].map(normalizeSearchValue).join(' ')
    const threads = Array.isArray(threadStateByProject?.[project?.id]?.threads)
      ? threadStateByProject[project.id].threads
      : []
    const matchingThreads = threads.filter((thread) => (
      normalizeSearchValue(thread?.title).includes(needle)
    ))
    return projectHaystack.includes(needle) || matchingThreads.length > 0
      ? [{ project, matchingThreads }]
      : []
  })
}

export async function runBoundedProjectThreadLoads(
  projectIds = [],
  loadProjectThreads,
  concurrency = MAX_PROJECT_THREAD_SEARCH_CONCURRENCY,
) {
  const ids = Array.isArray(projectIds) ? projectIds : []
  const workerCount = Math.min(
    ids.length,
    Math.max(1, Math.floor(Number(concurrency) || MAX_PROJECT_THREAD_SEARCH_CONCURRENCY)),
  )
  const results = new Array(ids.length)
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < ids.length) {
      const index = nextIndex
      nextIndex += 1
      try {
        results[index] = { status: 'fulfilled', value: await loadProjectThreads(ids[index]) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}
