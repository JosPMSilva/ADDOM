export const CAPABILITY_CATALOG_LIMITS = Object.freeze({
  summaryChars: 420,
  textChars: 1200,
  exampleChars: 600,
  examples: 5,
  related: 20,
  toolsAfterActivation: 40,
  metadataChars: 1600,
  pageChars: 6000,
})

export const CAPABILITY_CATALOG_TRUST_LEVELS = Object.freeze([
  'curated',
  'external',
])

const SCHEMA_LIKE_KEYS = new Set([
  'additionalProperties',
  'inputSchema',
  'jsonSchema',
  'parameters',
  'properties',
  'required',
  'schema',
  'toolSchema',
])

export function normalizeCatalogTrust(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return CAPABILITY_CATALOG_TRUST_LEVELS.includes(normalized) ? normalized : 'external'
}

export function sanitizeCatalogText(value = '', {
  maxChars = CAPABILITY_CATALOG_LIMITS.textChars,
  singleLine = false,
} = {}) {
  const normalized = String(value ?? '')
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0)
      return code === 10 || code === 13 || code === 9 || (code > 31 && code !== 127)
    })
    .join('')
    .replace(/\r\n?/g, '\n')
    .trim()
  const compact = singleLine
    ? normalized.replace(/\s+/g, ' ')
    : normalized.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
  if (!Number.isFinite(maxChars) || maxChars <= 0 || compact.length <= maxChars) return compact
  return `${compact.slice(0, Math.max(0, maxChars - 16)).trimEnd()} ... [truncated]`
}

export function sanitizeCatalogStringList(values = [], {
  maxItems = 12,
  maxChars = 160,
  lowercase = false,
} = {}) {
  if (!Array.isArray(values)) return []
  const seen = new Set()
  const result = []
  for (const value of values) {
    const normalized = sanitizeCatalogText(value, { maxChars, singleLine: true })
    const item = lowercase ? normalized.toLowerCase() : normalized
    if (!item || seen.has(item)) continue
    seen.add(item)
    result.push(item)
    if (result.length >= maxItems) break
  }
  return result
}

export function sanitizeCatalogExamples(values = []) {
  if (!Array.isArray(values)) return []
  return values
    .slice(0, CAPABILITY_CATALOG_LIMITS.examples)
    .map((example, index) => {
      if (typeof example === 'string') {
        return {
          title: `Example ${index + 1}`,
          prompt: sanitizeCatalogText(example, { maxChars: CAPABILITY_CATALOG_LIMITS.exampleChars }),
        }
      }
      if (!example || typeof example !== 'object' || Array.isArray(example)) return null
      const title = sanitizeCatalogText(example.title || `Example ${index + 1}`, { maxChars: 120, singleLine: true })
      const prompt = sanitizeCatalogText(example.prompt || example.description || '', {
        maxChars: CAPABILITY_CATALOG_LIMITS.exampleChars,
      })
      const toolName = sanitizeCatalogText(example.toolName || '', { maxChars: 120, singleLine: true })
      return prompt || toolName ? { title, ...(prompt ? { prompt } : {}), ...(toolName ? { toolName } : {}) } : null
    })
    .filter(Boolean)
}

function sanitizeMetadataValue(value, depth = 0) {
  if (depth > 2) return '[nested metadata omitted]'
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return sanitizeCatalogText(value, { maxChars: 240, singleLine: true })
  }
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((entry) => sanitizeMetadataValue(entry, depth + 1))
  }
  if (typeof value !== 'object') return sanitizeCatalogText(String(value), { maxChars: 160, singleLine: true })
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SCHEMA_LIKE_KEYS.has(String(key || '')))
      .slice(0, 12)
      .map(([key, entry]) => [
        sanitizeCatalogText(key, { maxChars: 80, singleLine: true }),
        sanitizeMetadataValue(entry, depth + 1),
      ])
      .filter(([key]) => Boolean(key)),
  )
}

export function sanitizeExternalMetadata(metadata = null, {
  maxChars = CAPABILITY_CATALOG_LIMITS.metadataChars,
} = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return sanitizeCatalogText(metadata || '', { maxChars, singleLine: true })
  }
  const sanitized = sanitizeMetadataValue(metadata)
  return sanitizeCatalogText(JSON.stringify(sanitized, null, 2), { maxChars })
}

export function escapeMarkdownData(value = '') {
  return sanitizeCatalogText(value)
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/([*_#[\]])/g, '\\$1')
}

export function capCatalogMarkdown(markdown = '', {
  maxChars = CAPABILITY_CATALOG_LIMITS.pageChars,
} = {}) {
  return sanitizeCatalogText(markdown, { maxChars })
}
