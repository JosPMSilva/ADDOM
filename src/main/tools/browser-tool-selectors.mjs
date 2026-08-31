const TEST_ID_ATTRIBUTES = ['data-testid', 'data-test', 'data-cy']

function cleanString(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeAttributes(value = {}) {
  if (!value || typeof value !== 'object') return {}
  const entries = Object.entries(value)
    .map(([key, entryValue]) => [cleanString(key).toLowerCase(), cleanString(entryValue)])
    .filter(([key, entryValue]) => key && entryValue)
  return Object.fromEntries(entries)
}

function cssString(value = '') {
  return `"${cleanString(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function safeCssId(value = '') {
  const text = cleanString(value)
  if (/^-?[_a-zA-Z][-_a-zA-Z0-9]*$/.test(text)) return `#${text}`
  return `[id=${cssString(text)}]`
}

function addCandidate(candidates, candidate = {}) {
  const key = [
    candidate.type,
    candidate.selector,
    candidate.attribute,
    candidate.role,
    candidate.name,
  ].map((part) => cleanString(part)).join('|')
  if (!key || candidates.some((entry) => entry.key === key)) return
  candidates.push({ ...candidate, key })
}

function hasStrongCssSelector(candidates = []) {
  return candidates.some((candidate) => (
    candidate.type === 'id'
    || candidate.type === 'testid'
    || candidate.type === 'aria-label'
  ))
}

export function buildSelectorCandidates(element = {}, options = {}) {
  const candidates = []
  const attributes = normalizeAttributes(element.attributes)
  const tag = cleanString(element.tag || element.tagName).toLowerCase()
  const id = cleanString(element.id || attributes.id)
  const includeNthFallback = options.includeNthFallback !== false

  if (id) {
    addCandidate(candidates, {
      type: 'id',
      selector: safeCssId(id),
      reason: 'id',
    })
  }

  for (const attribute of TEST_ID_ATTRIBUTES) {
    const value = cleanString(element[attribute] || attributes[attribute])
    if (!value) continue
    addCandidate(candidates, {
      type: 'testid',
      attribute,
      selector: `[${attribute}=${cssString(value)}]`,
      reason: attribute,
    })
  }

  const ariaLabel = cleanString(element.ariaLabel || attributes['aria-label'])
  if (ariaLabel) {
    addCandidate(candidates, {
      type: 'aria-label',
      attribute: 'aria-label',
      selector: `[aria-label=${cssString(ariaLabel)}]`,
      reason: 'aria-label',
    })
  }

  const role = cleanString(element.role)
  const name = cleanString(element.name)
  if (role || name) {
    addCandidate(candidates, {
      type: 'role-name',
      role,
      name,
      reason: 'accessibility',
    })
  }

  const nthOfTypeSelector = cleanString(element.nthOfTypeSelector || element.cssPath)
  if (includeNthFallback && nthOfTypeSelector && !hasStrongCssSelector(candidates)) {
    addCandidate(candidates, {
      type: 'nth-of-type',
      selector: nthOfTypeSelector,
      reason: tag ? `${tag} position` : 'element position',
    })
  }

  return candidates.map((candidate) => {
    const publicCandidate = { ...candidate }
    delete publicCandidate.key
    return publicCandidate
  })
}
