function defineFormulaTool(id, label, description, group, riskLevel) {
  return Object.freeze({
    id,
    uri: `moonshot/${id}:latest`,
    label,
    description,
    group,
    riskLevel,
    requiresRemoteExecution: true,
    defaultEnabled: false,
  })
}

export const MOONSHOT_FORMULA_GROUP_ORDER = Object.freeze([
  'Utilities',
  'Retrieval',
  'State & Execution',
])

export const MOONSHOT_FORMULA_CATALOG = Object.freeze([
  defineFormulaTool(
    'convert',
    'Convert',
    'Unit conversion for length, mass, volume, temperature, area, time, energy, pressure, speed, and currency.',
    'Utilities',
    'low',
  ),
  defineFormulaTool(
    'web-search',
    'Web Search',
    'Real-time internet search through Moonshot Formula web search.',
    'Retrieval',
    'medium',
  ),
  defineFormulaTool(
    'rethink',
    'Rethink',
    'Additional provider-side reasoning assistance.',
    'Utilities',
    'low',
  ),
  defineFormulaTool(
    'random-choice',
    'Random Choice',
    'Random selection helper.',
    'Utilities',
    'low',
  ),
  defineFormulaTool(
    'mew',
    'Mew',
    'Random cat meowing and blessing tool.',
    'Utilities',
    'low',
  ),
  defineFormulaTool(
    'memory',
    'Memory',
    'Provider-side memory storage and retrieval.',
    'State & Execution',
    'high',
  ),
  defineFormulaTool(
    'excel',
    'Excel',
    'Excel and CSV analysis on provider infrastructure.',
    'Retrieval',
    'medium',
  ),
  defineFormulaTool(
    'date',
    'Date',
    'Date and time processing.',
    'Utilities',
    'low',
  ),
  defineFormulaTool(
    'base64',
    'Base64',
    'Base64 encoding and decoding.',
    'Utilities',
    'low',
  ),
  defineFormulaTool(
    'fetch',
    'Fetch',
    'URL content extraction with Markdown formatting.',
    'Retrieval',
    'medium',
  ),
  defineFormulaTool(
    'quickjs',
    'QuickJS',
    'Provider-side JavaScript execution with QuickJS.',
    'State & Execution',
    'high',
  ),
  defineFormulaTool(
    'code_runner',
    'Code Runner',
    'Provider-side Python code execution.',
    'State & Execution',
    'high',
  ),
])

function normalizeCatalogKey(value = '') {
  return String(value || '').trim().toLowerCase()
}

export function normalizeMoonshotFormulaUri(value = '') {
  let normalized = normalizeCatalogKey(value)
  if (!normalized) return ''
  if (!normalized.includes('/')) normalized = `moonshot/${normalized}`
  if (!normalized.includes(':')) normalized = `${normalized}:latest`
  return normalized
}

export function listMoonshotFormulaCatalog() {
  return MOONSHOT_FORMULA_CATALOG.map((entry) => ({ ...entry }))
}

export function getMoonshotFormulaCatalogEntry(value = '') {
  const normalized = normalizeMoonshotFormulaUri(value)
  if (!normalized) return null
  const direct = MOONSHOT_FORMULA_CATALOG.find((entry) => entry.uri === normalized)
  if (direct) return { ...direct }
  const fallbackId = normalized
    .replace(/^moonshot\//, '')
    .replace(/:latest$/, '')
  const byId = MOONSHOT_FORMULA_CATALOG.find((entry) => normalizeCatalogKey(entry.id) === fallbackId)
  return byId ? { ...byId } : null
}

export function isSupportedMoonshotFormulaUri(value = '') {
  return !!getMoonshotFormulaCatalogEntry(value)
}
