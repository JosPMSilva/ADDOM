const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

export function normalizeSource(source) {
  const value = String(source ?? '').trim()
  return value.length > 0 ? value : 'ssr'
}

export function normalizeMetaValue(value) {
  return value === null || value === undefined ? '' : String(value)
}

export function countSourceCharacters(root, html) {
  if (root) {
    if (Array.isArray(root)) return serializeDomLikeNodes(root).length
    return serializeDomLikeNode(root).length
  }
  return String(html ?? '').length
}

export function normalizeDomLikeRoot(root) {
  if (Array.isArray(root)) return normalizeDomLikeChildren(root)
  return [normalizeDomLikeNode(root)]
}

export function normalizeDomLikeChildren(children) {
  return Array.from(children || [])
    .map((child) => normalizeDomLikeNode(child))
    .filter(Boolean)
}

export function normalizeDomLikeNode(node) {
  if (!node) return null
  if (Array.isArray(node)) return normalizeDomLikeChildren(node)
  if (typeof node === 'string') return { type: 'text', text: node }
  const nodeType = Number(node.nodeType ?? node.type ?? 0)
  if (nodeType === 3 || nodeType === 4) {
    return { type: 'text', text: String(node.textContent ?? node.nodeValue ?? node.text ?? '') }
  }
  if (nodeType === 1 || String(node.tagName || '').length > 0 || String(node.name || '').length > 0) {
    const tagName = String(node.tagName || node.name || node.nodeName || '').toLowerCase()
    const attrs = {}
    if (node.attrs && typeof node.attrs === 'object') {
      for (const [name, value] of Object.entries(node.attrs)) {
        attrs[String(name).toLowerCase()] = normalizeAttributeValue(value)
      }
    }
    if (Array.isArray(node.attributes)) {
      for (const attr of node.attributes) {
        if (!attr) continue
        attrs[String(attr.name || '').toLowerCase()] = normalizeAttributeValue(attr.value ?? attr.nodeValue ?? '')
      }
    }
    if (typeof node.getAttributeNames === 'function' && typeof node.getAttribute === 'function') {
      for (const name of node.getAttributeNames()) {
        attrs[String(name).toLowerCase()] = normalizeAttributeValue(node.getAttribute(name))
      }
    } else if (node.attributes && typeof node.attributes === 'object' && !Array.isArray(node.attributes)) {
      for (const [name, attr] of Object.entries(node.attributes)) {
        if (attr && typeof attr === 'object' && ('value' in attr || 'nodeValue' in attr)) {
          attrs[String(name).toLowerCase()] = normalizeAttributeValue(attr.value ?? attr.nodeValue ?? '')
          continue
        }
        attrs[String(name).toLowerCase()] = normalizeAttributeValue(attr)
      }
    } else if (node.props && typeof node.props === 'object') {
      for (const [name, value] of Object.entries(node.props)) {
        attrs[String(name).toLowerCase()] = normalizeAttributeValue(value)
      }
    }
    return {
      type: 'element',
      tagName,
      attributes: attrs,
      children: normalizeDomLikeChildren(node.childNodes || node.children || []),
    }
  }
  return null
}

export function normalizeAttributeValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  return decodeHtmlEntities(String(value))
}

export function getAttribute(node, name) {
  if (!node || typeof node !== 'object') return ''
  const attrs = node.attrs && typeof node.attrs === 'object'
    ? node.attrs
    : Array.isArray(node.attributes)
      ? Object.fromEntries(
          node.attributes
            .filter(Boolean)
            .map((attr) => [String(attr.name || '').toLowerCase(), attr.value ?? attr.nodeValue ?? '']),
        )
    : node.attributes && typeof node.attributes === 'object'
      ? node.attributes
      : {}
  const value = attrs[String(name).toLowerCase()]
  return normalizeAttributeValue(value)
}

export function hasTruthyAttribute(node, name) {
  if (!node || typeof node !== 'object') return false
  const key = String(name || '').toLowerCase()
  if (node.attrs && typeof node.attrs === 'object') {
    if (!Object.hasOwn(node.attrs, key)) return false
    const value = normalizeAttributeValue(node.attrs[key])
    return value === '' || value === 'true' || value === key || value === '1'
  }
  if (Array.isArray(node.attributes)) {
    const match = node.attributes.find((attr) => String(attr?.name || '').toLowerCase() === key)
    if (!match) return false
    const value = normalizeAttributeValue(match.value ?? match.nodeValue ?? '')
    return value === '' || value === 'true' || value === key || value === '1'
  }
  if (node.attributes && typeof node.attributes === 'object') {
    if (!Object.hasOwn(node.attributes, key)) return false
    const value = normalizeAttributeValue(node.attributes[key])
    return value === '' || value === 'true' || value === key || value === '1'
  }
  return false
}

export function isCheckboxInput(node) {
  return String(node?.tagName || '').toLowerCase() === 'input' && String(getAttribute(node, 'type')).toLowerCase() === 'checkbox'
}

export function findCheckboxInput(nodes) {
  for (const node of nodes || []) {
    if (node?.type === 'element' && isCheckboxInput(node)) return node
  }
  return null
}

export function isWindowsDriveAbsolutePath(value) {
  return /^[a-z]:[\\/]/i.test(String(value ?? ''))
}

export function firstElementChild(nodes, tagName) {
  const target = String(tagName || '').toLowerCase()
  for (const node of nodes || []) {
    if (node?.type === 'element' && String(node.tagName || '').toLowerCase() === target) return node
  }
  return null
}

export function elementChildren(nodes, tagName) {
  const target = String(tagName || '').toLowerCase()
  return Array.from(nodes || []).filter(
    (node) => node?.type === 'element' && String(node.tagName || '').toLowerCase() === target,
  )
}

export function firstTextDescendantNode(node) {
  if (!node || typeof node !== 'object') return null
  if (node.type === 'text') return node
  for (const child of node.children || []) {
    const match = firstTextDescendantNode(child)
    if (match) return match
  }
  return null
}

export function pushTextNode(parent, text) {
  const value = String(text ?? '')
  if (!value) return
  const children = parent.children || (parent.children = [])
  const last = children.at(-1)
  if (last?.type === 'text') {
    last.text += value
    return
  }
  children.push({ type: 'text', text: value })
}

export function serializeDomLikeNodes(nodes) {
  return Array.from(nodes || []).map((node) => serializeDomLikeNode(node)).join('')
}

export function serializeDomLikeNode(node) {
  if (!node) return ''
  if (Number(node.nodeType) === 3 || node.type === 'text' || String(node.nodeName || '').toLowerCase() === '#text') {
    return escapeHtmlText(String(node.textContent ?? node.nodeValue ?? node.text ?? ''))
  }
  if (Array.isArray(node)) return serializeDomLikeNodes(node)
  const tagName = String(node.tagName || '').toLowerCase()
  if (!tagName) return ''
  const attrs = []
  if (typeof node.getAttributeNames === 'function' && typeof node.getAttribute === 'function') {
    for (const name of node.getAttributeNames().sort()) {
      const value = normalizeAttributeValue(node.getAttribute(name))
      attrs.push(`${name}="${escapeHtmlAttribute(value)}"`)
    }
  } else if (node.attrs && typeof node.attrs === 'object') {
    for (const name of Object.keys(node.attrs).sort()) {
      const value = normalizeAttributeValue(node.attrs[name])
      attrs.push(`${name}="${escapeHtmlAttribute(value)}"`)
    }
  } else if (Array.isArray(node.attributes)) {
    for (const attr of node.attributes) {
      if (!attr) continue
      const name = String(attr.name || '').toLowerCase()
      const value = normalizeAttributeValue(attr.value ?? attr.nodeValue ?? '')
      attrs.push(`${name}="${escapeHtmlAttribute(value)}"`)
    }
  } else if (node.attributes && typeof node.attributes === 'object') {
    for (const name of Object.keys(node.attributes).sort()) {
      const value = normalizeAttributeValue(node.attributes[name])
      attrs.push(`${name}="${escapeHtmlAttribute(value)}"`)
    }
  }
  const open = attrs.length > 0 ? `<${tagName} ${attrs.join(' ')}>` : `<${tagName}>`
  if (VOID_ELEMENTS.has(tagName)) return open
  return `${open}${serializeDomLikeNodes(node.childNodes || node.children || [])}</${tagName}>`
}

export function escapeHtmlText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function escapeHtmlAttribute(value) {
  return escapeHtmlText(value).replaceAll('"', '&quot;')
}

export function formatAnnotationPath(path = []) {
  return Array.from(path || [])
}

export function decodeHtmlEntities(value) {
  const text = String(value ?? '')
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, num) => String.fromCodePoint(Number.parseInt(num, 10)))
}
