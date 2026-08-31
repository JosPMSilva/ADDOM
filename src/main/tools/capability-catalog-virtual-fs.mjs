import {
  CAPABILITY_CATALOG_BASE_URI,
  CAPABILITY_CATALOG_INDEX_PATH,
  buildCapabilityCatalogPages,
  assertCapabilityCatalogPageCaps,
} from './capability-catalog-builder.mjs'
import { buildBuiltInCapabilityCatalog } from './capability-catalog-builtins.mjs'
import { buildMcpCapabilityEntries } from './capability-catalog-mcp.mjs'
import { buildSkillCapabilityEntries } from './capability-catalog-skills.mjs'
import { buildSafeSearchRegex } from './file-tools-search-utils.mjs'
import { clampInt, isCapabilityCatalogVirtualPath } from './file-tools-path-utils.mjs'

const DEFAULT_SEARCH_LIMIT = 50
const MAX_SEARCH_LIMIT = 200

function normalizeCatalogUri(input = '') {
  const raw = String(input ?? '').trim().replace(/\\/g, '/')
  const lower = raw.toLowerCase()
  if (!isCapabilityCatalogVirtualPath(raw)) return ''
  if (/[?#]/.test(raw)) {
    throw new Error(`Invalid capability catalog path: ${raw}`)
  }
  const root = lower.startsWith('addom:/capabilities')
    ? 'addom:/capabilities'
    : CAPABILITY_CATALOG_BASE_URI
  const suffix = lower.slice(root.length).replace(/^\/+|\/+$/g, '')
  if (!suffix) return CAPABILITY_CATALOG_INDEX_PATH
  if (suffix.includes('/') || suffix === '.' || suffix === '..' || suffix.includes('..')) {
    throw new Error(`Invalid capability catalog path: ${raw}`)
  }
  if (!/^[a-z0-9][a-z0-9-]*\.md$/.test(suffix)) {
    throw new Error(`Invalid capability catalog page path: ${raw}`)
  }
  return `${CAPABILITY_CATALOG_BASE_URI}/${suffix}`
}

function getCatalogPages({ projectRoot = '' } = {}) {
  const entries = [
    ...buildBuiltInCapabilityCatalog().entries,
    ...buildMcpCapabilityEntries(),
    ...buildSkillCapabilityEntries({ projectFolder: projectRoot }),
  ]
  const pages = buildCapabilityCatalogPages(entries)
  assertCapabilityCatalogPageCaps(pages)
  return pages
}

function listCatalogPaths(pages) {
  return [...pages.keys()].sort()
}

export { isCapabilityCatalogVirtualPath }

export function normalizeCapabilityCatalogVirtualPath(filePath = '') {
  return normalizeCatalogUri(filePath)
}

export async function readCapabilityCatalogVirtualFile({ path: filePath, projectRoot = '' } = {}) {
  const catalogPath = normalizeCatalogUri(filePath)
  const pages = getCatalogPages({ projectRoot })
  const page = pages.get(catalogPath)
  if (page === undefined) {
    throw new Error(
      `Capability catalog page not found: ${filePath}. Available pages: ${listCatalogPaths(pages).join(', ')}`,
    )
  }
  return page
}

export async function searchCapabilityCatalogVirtualFiles({
  query,
  path: searchPath = CAPABILITY_CATALOG_BASE_URI,
  projectRoot = '',
  limit = DEFAULT_SEARCH_LIMIT,
  offset = 0,
} = {}) {
  const catalogPath = normalizeCatalogUri(searchPath)
  const pages = getCatalogPages({ projectRoot })
  const pageLimit = clampInt(limit, DEFAULT_SEARCH_LIMIT, 1, MAX_SEARCH_LIMIT)
  const pageOffset = clampInt(offset, 0, 0, 1_000_000)
  const regex = buildSafeSearchRegex(query, 'query')
  const entries = catalogPath === CAPABILITY_CATALOG_INDEX_PATH
    ? listCatalogPaths(pages).map((path) => [path, pages.get(path)])
    : [[catalogPath, pages.get(catalogPath)]]
  const results = []
  let totalMatchesSeen = 0
  let hasMore = false

  for (const [path, markdown] of entries) {
    if (markdown === undefined) {
      throw new Error(`Capability catalog page not found: ${searchPath}`)
    }
    const lines = String(markdown || '').split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      regex.lastIndex = 0
      if (!regex.test(lines[index])) continue
      totalMatchesSeen += 1
      if (totalMatchesSeen <= pageOffset) continue
      if (results.length >= pageLimit) {
        hasMore = true
        break
      }
      results.push(`${path}:${index + 1}: ${lines[index].trim()}`)
    }
    if (hasMore) break
  }

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
