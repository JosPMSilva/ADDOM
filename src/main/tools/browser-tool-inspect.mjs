import { buildSelectorCandidates } from './browser-tool-selectors.mjs'

const DEFAULT_ELEMENT_LIMIT = 100
const TEXT_SNIPPET_LIMIT = 180

function cleanString(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function truncateText(value = '', limit = TEXT_SNIPPET_LIMIT) {
  const text = cleanString(value)
  if (!text || text.length <= limit) return text
  return `${text.slice(0, Math.max(0, limit - 3)).trim()}...`
}

function normalizeBoolean(value) {
  return value === true ? true : value === false ? false : undefined
}

function normalizeBoundingBox(value = null) {
  if (!value || typeof value !== 'object') return null
  const box = {
    x: Number(value.x),
    y: Number(value.y),
    width: Number(value.width),
    height: Number(value.height),
  }
  if (Object.values(box).some((entry) => !Number.isFinite(entry))) return null
  return Object.fromEntries(
    Object.entries(box).map(([key, entry]) => [key, Math.round(entry)]),
  )
}

function inferRole(element = {}) {
  const explicitRole = cleanString(element.role)
  if (explicitRole) return explicitRole
  const tag = cleanString(element.tag || element.tagName).toLowerCase()
  if (tag === 'a') return 'link'
  if (tag === 'button') return 'button'
  if (tag === 'select') return 'combobox'
  if (tag === 'textarea') return 'textbox'
  if (tag === 'input') {
    const type = cleanString(element.type || element.attributes?.type || 'text').toLowerCase()
    if (type === 'checkbox') return 'checkbox'
    if (type === 'radio') return 'radio'
    if (type === 'button' || type === 'submit') return 'button'
    return 'textbox'
  }
  return 'generic'
}

function inferSuggestedActions(summary = {}) {
  if (summary.disabled || summary.hidden) return []
  if (summary.tag === 'select') return ['list_options', 'select_option']
  if (summary.tag === 'textarea') return ['type']
  if (summary.tag === 'input') {
    if (summary.role === 'checkbox' || summary.role === 'radio') return ['click']
    if (summary.role === 'button') return ['click']
    return ['type']
  }
  if (summary.role === 'button' || summary.role === 'link') return ['click']
  return []
}

export function normalizeBrowserElementSummary(element = {}, index = 0) {
  const attributes = element.attributes && typeof element.attributes === 'object' ? element.attributes : {}
  const tag = cleanString(element.tag || element.tagName).toLowerCase()
  const name = cleanString(
    element.name
    || element.accessibleName
    || element.label
    || element.ariaLabel
    || attributes['aria-label']
    || '',
  )
  const summary = {
    index: Number.isFinite(Number(element.index)) ? Number(element.index) : index,
    tag,
    role: inferRole(element),
    name,
    text: truncateText(element.text || element.textContent || element.innerText || ''),
    value: truncateText(element.value || ''),
    placeholder: truncateText(element.placeholder || attributes.placeholder || ''),
    checked: normalizeBoolean(element.checked),
    disabled: element.disabled === true || attributes['aria-disabled'] === 'true',
    hidden: element.hidden === true || element.visible === false || element.isVisible === false,
    boundingBox: normalizeBoundingBox(element.boundingBox || element.box || element.rect),
  }
  summary.selectors = buildSelectorCandidates({
    ...element,
    tag: summary.tag,
    role: summary.role,
    name: summary.name,
  })
  summary.suggestedActions = inferSuggestedActions(summary)
  return summary
}

export function normalizeBrowserPageInspection(snapshot = {}, options = {}) {
  const limit = Math.min(
    DEFAULT_ELEMENT_LIMIT,
    Math.max(0, Number(options.limit) || DEFAULT_ELEMENT_LIMIT),
  )
  const elements = Array.isArray(snapshot.elements) ? snapshot.elements : []
  return {
    url: cleanString(snapshot.url),
    title: cleanString(snapshot.title),
    elementCount: elements.length,
    elements: elements.slice(0, limit).map((element, index) => normalizeBrowserElementSummary(element, index)),
  }
}

export function buildDomInspectionSnapshot(options = {}) {
  const interactiveSelector = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[role]',
    '[aria-label]',
    '[aria-labelledby]',
    '[title]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')
  const limit = Math.min(500, Math.max(1, Number(options.limit) || 200))
  const selector = String(options.selector || '').trim() || interactiveSelector
  const includeHidden = options.includeHidden === true
  const clean = (value = '') => String(value ?? '').replace(/\s+/g, ' ').trim()
  const readAttributes = (element) => {
    const attributes = {}
    for (const name of [
      'id',
      'type',
      'role',
      'aria-label',
      'aria-labelledby',
      'aria-disabled',
      'aria-checked',
      'data-testid',
      'data-test',
      'data-cy',
      'placeholder',
      'title',
      'alt',
    ]) {
      const value = element.getAttribute(name)
      if (value) attributes[name] = value
    }
    return attributes
  }
  const isHidden = (element) => {
    const rect = element.getBoundingClientRect()
    const style = window.getComputedStyle(element)
    return (
      element.hidden === true
      || element.getAttribute('aria-hidden') === 'true'
      || style.display === 'none'
      || style.visibility === 'hidden'
      || Number(style.opacity) === 0
      || rect.width <= 0
      || rect.height <= 0
    )
  }
  const roleFor = (element) => {
    const explicitRole = element.getAttribute('role')
    if (explicitRole) return explicitRole
    const tag = element.tagName.toLowerCase()
    if (tag === 'a') return 'link'
    if (tag === 'button') return 'button'
    if (tag === 'select') return 'combobox'
    if (tag === 'textarea') return 'textbox'
    if (tag === 'input') {
      const type = String(element.getAttribute('type') || 'text').toLowerCase()
      if (type === 'checkbox') return 'checkbox'
      if (type === 'radio') return 'radio'
      if (type === 'button' || type === 'submit') return 'button'
      return 'textbox'
    }
    return 'generic'
  }
  const nameFor = (element) => {
    const labelledBy = element.getAttribute('aria-labelledby')
    if (labelledBy) {
      const name = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' ')
        .trim()
      if (name) return name
    }
    return clean(
      element.getAttribute('aria-label')
      || element.getAttribute('title')
      || element.getAttribute('alt')
      || element.textContent
      || '',
    )
  }
  const nthOfTypeSelectorFor = (element) => {
    const parts = []
    let current = element
    while (current && current.nodeType === 1 && current !== document.documentElement && parts.length < 5) {
      const tag = current.tagName.toLowerCase()
      let index = 1
      let sibling = current.previousElementSibling
      while (sibling) {
        if (sibling.tagName.toLowerCase() === tag) index += 1
        sibling = sibling.previousElementSibling
      }
      parts.unshift(`${tag}:nth-of-type(${index})`)
      current = current.parentElement
    }
    return parts.join(' > ')
  }
  const elements = Array.from(document.querySelectorAll(selector))
    .filter((element) => includeHidden || !isHidden(element))
    .slice(0, limit)
    .map((element, index) => {
      const rect = element.getBoundingClientRect()
      return {
        index,
        tag: element.tagName.toLowerCase(),
        role: roleFor(element),
        name: nameFor(element),
        text: clean(element.innerText || element.textContent || ''),
        value: element.value,
        placeholder: element.getAttribute('placeholder') || '',
        checked: element.checked === true || element.getAttribute('aria-checked') === 'true',
        disabled: element.disabled === true || element.getAttribute('aria-disabled') === 'true',
        hidden: isHidden(element),
        attributes: readAttributes(element),
        boundingBox: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        nthOfTypeSelector: nthOfTypeSelectorFor(element),
      }
    })
  return {
    url: window.location.href,
    title: document.title || '',
    elements,
  }
}

export function buildDomAccessibilitySnapshot() {
  const interactiveSelector = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[role]',
    '[aria-label]',
    '[aria-labelledby]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')
  const roleFor = (element) => {
    const explicitRole = element.getAttribute('role')
    if (explicitRole) return explicitRole
    const tag = element.tagName.toLowerCase()
    if (tag === 'a') return 'link'
    if (tag === 'button') return 'button'
    if (tag === 'select') return 'combobox'
    if (tag === 'textarea') return 'textbox'
    if (tag === 'input') {
      const type = String(element.getAttribute('type') || 'text').toLowerCase()
      if (type === 'checkbox') return 'checkbox'
      if (type === 'radio') return 'radio'
      if (type === 'button' || type === 'submit') return 'button'
      return 'textbox'
    }
    return 'generic'
  }
  const nameFor = (element) => {
    const labelledBy = element.getAttribute('aria-labelledby')
    if (labelledBy) {
      const name = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' ')
        .trim()
      if (name) return name
    }
    return (
      element.getAttribute('aria-label')
      || element.getAttribute('title')
      || element.getAttribute('alt')
      || element.textContent
      || ''
    ).replace(/\s+/g, ' ').trim()
  }
  const children = Array.from(document.querySelectorAll(interactiveSelector))
    .slice(0, 200)
    .map((element) => ({
      role: roleFor(element),
      name: nameFor(element),
      value: element.value,
      disabled: element.disabled === true || element.getAttribute('aria-disabled') === 'true',
      checked: element.checked === true || element.getAttribute('aria-checked') === 'true',
    }))
  return {
    role: 'document',
    name: document.title || '',
    children,
  }
}
