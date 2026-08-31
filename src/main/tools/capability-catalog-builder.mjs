import { renderCapabilityCatalogEntryMarkdown } from './capability-catalog-renderer.mjs'
import {
  CAPABILITY_CATALOG_LIMITS,
  capCatalogMarkdown,
  escapeMarkdownData,
  sanitizeCatalogText,
} from './capability-catalog-sanitize.mjs'

export const CAPABILITY_CATALOG_BASE_URI = 'addom://capabilities'
export const CAPABILITY_CATALOG_INDEX_PATH = `${CAPABILITY_CATALOG_BASE_URI}/index.md`

function normalizeSlug(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function buildCapabilityCatalogPath(slug = '') {
  const normalized = normalizeSlug(slug)
  if (!normalized) throw new Error('Capability catalog page slug is required')
  return `${CAPABILITY_CATALOG_BASE_URI}/${normalized}.md`
}

function renderToolSummaryRows(toolSummaries = []) {
  if (!Array.isArray(toolSummaries) || toolSummaries.length === 0) return []
  const lines = [
    '',
    '## Tool Summary',
    '| Tool | Exposure | Risk | Summary |',
    '| --- | --- | --- | --- |',
  ]
  for (const tool of toolSummaries) {
    const name = sanitizeCatalogText(tool?.name || '', { maxChars: 120, singleLine: true })
    if (!name) continue
    const exposure = sanitizeCatalogText(tool?.defaultExposure || '', { maxChars: 80, singleLine: true })
    const risk = sanitizeCatalogText(tool?.riskClass || '', { maxChars: 80, singleLine: true })
    const summary = sanitizeCatalogText(tool?.summary || '', { maxChars: 220, singleLine: true })
    lines.push(`| \`${name}\` | ${escapeMarkdownData(exposure)} | ${escapeMarkdownData(risk)} | ${escapeMarkdownData(summary)} |`)
  }
  return lines
}

function sourceGroupLabel(source = '') {
  switch (String(source || '').trim()) {
    case 'built_in': return 'Built-In Capabilities'
    case 'mcp': return 'MCP Capabilities'
    case 'skill': return 'Skill Capabilities'
    case 'provider': return 'Provider Capabilities'
    case 'plugin': return 'Plugin Capabilities'
    case 'user': return 'User Capabilities'
    default: return 'External Capabilities'
  }
}

export function renderCapabilityCatalogIndex(entries = [], {
  title = 'ADDOM Capability Catalog',
  maxChars = CAPABILITY_CATALOG_LIMITS.pageChars,
} = {}) {
  const lines = [
    `# ${escapeMarkdownData(title)}`,
    '',
    'Catalog pages summarize ADDOM-managed tool families without embedding full tool schemas.',
    '',
  ]
  const grouped = new Map()
  for (const entry of entries) {
    const source = String(entry?.source || 'external').trim()
    const current = grouped.get(source) || []
    current.push(entry)
    grouped.set(source, current)
  }
  for (const [source, groupEntries] of grouped.entries()) {
    lines.push('', `## ${sourceGroupLabel(source)}`)
    for (const entry of groupEntries) {
      const path = buildCapabilityCatalogPath(entry.slug || entry.id)
      lines.push(`- [${escapeMarkdownData(entry.title)}](${path}): ${escapeMarkdownData(entry.summary)}`)
    }
  }
  return capCatalogMarkdown(lines.join('\n'), { maxChars })
}

export function renderCapabilityCatalogPage(entry = {}, {
  toolSummaries = [],
  maxChars = CAPABILITY_CATALOG_LIMITS.pageChars,
} = {}) {
  const entryMarkdown = renderCapabilityCatalogEntryMarkdown(entry, { maxChars })
  const toolRows = renderToolSummaryRows(toolSummaries)
  return capCatalogMarkdown([entryMarkdown, ...toolRows].join('\n'), { maxChars })
}

export function buildCapabilityCatalogPages(entries = [], {
  maxChars = CAPABILITY_CATALOG_LIMITS.pageChars,
} = {}) {
  const pages = new Map()
  pages.set(CAPABILITY_CATALOG_INDEX_PATH, renderCapabilityCatalogIndex(entries, { maxChars }))
  for (const entry of entries) {
    pages.set(buildCapabilityCatalogPath(entry.slug || entry.id), renderCapabilityCatalogPage(entry, {
      toolSummaries: entry.toolSummaries,
      maxChars,
    }))
  }
  return pages
}

export function assertCapabilityCatalogPageCaps(pages = new Map(), {
  maxChars = CAPABILITY_CATALOG_LIMITS.pageChars,
} = {}) {
  for (const [path, markdown] of pages.entries()) {
    if (String(markdown || '').length > maxChars) {
      throw new Error(`Capability catalog page exceeds ${maxChars} chars: ${path}`)
    }
  }
  return true
}
