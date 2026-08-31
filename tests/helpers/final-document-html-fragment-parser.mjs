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

export function parseHtmlFragment(html) {
  const root = { type: 'element', tagName: '#fragment', attrs: {}, children: [] }
  const stack = [root]
  let cursor = 0

  while (cursor < html.length) {
    const nextTagStart = html.indexOf('<', cursor)
    if (nextTagStart < 0) {
      pushTextNode(stack.at(-1), html.slice(cursor))
      break
    }

    if (nextTagStart > cursor) {
      pushTextNode(stack.at(-1), html.slice(cursor, nextTagStart))
    }

    if (html.startsWith('<!--', nextTagStart)) {
      const commentEnd = html.indexOf('-->', nextTagStart + 4)
      cursor = commentEnd >= 0 ? commentEnd + 3 : html.length
      continue
    }

    const tagEnd = findTagEnd(html, nextTagStart + 1)
    if (tagEnd < 0) {
      pushTextNode(stack.at(-1), html.slice(nextTagStart))
      break
    }

    const token = html.slice(nextTagStart + 1, tagEnd).trim()
    cursor = tagEnd + 1
    if (!token) continue

    if (token.startsWith('/')) {
      const closeTagName = parseCloseTagName(token)
      if (!closeTagName) continue
      while (stack.length > 1) {
        const node = stack.pop()
        if (node?.tagName === closeTagName) break
      }
      continue
    }

    const parsed = parseStartTagToken(token)
    if (!parsed) continue
    const node = { type: 'element', tagName: parsed.tagName, attrs: parsed.attrs, children: [] }
    stack.at(-1).children.push(node)
    if (!parsed.selfClosing && !VOID_ELEMENTS.has(parsed.tagName)) {
      stack.push(node)
    }
  }

  return root.children
}

function parseStartTagToken(token) {
  const source = String(token ?? '')
  let index = 0
  const length = source.length

  while (index < length && /\s/.test(source[index])) index += 1
  const tagNameStart = index
  while (index < length && /[^\s/>]/.test(source[index])) index += 1
  const tagName = source.slice(tagNameStart, index).toLowerCase()
  if (!tagName) return null

  const attrs = {}
  let selfClosing = false

  while (index < length) {
    while (index < length && /\s/.test(source[index])) index += 1
    if (index >= length) break
    if (source[index] === '/') {
      selfClosing = true
      break
    }

    const attrNameStart = index
    while (index < length && !/[\s=/>]/.test(source[index])) index += 1
    const attrName = source.slice(attrNameStart, index).toLowerCase()
    if (!attrName) break

    while (index < length && /\s/.test(source[index])) index += 1

    let value = ''
    if (source[index] === '=') {
      index += 1
      while (index < length && /\s/.test(source[index])) index += 1
      const quote = source[index]
      if (quote === '"' || quote === '\'') {
        index += 1
        const valueStart = index
        while (index < length && source[index] !== quote) index += 1
        value = source.slice(valueStart, index)
        if (index < length && source[index] === quote) index += 1
      } else {
        const valueStart = index
        while (index < length && !/[\s>]/.test(source[index])) index += 1
        value = source.slice(valueStart, index)
      }
    }

    attrs[attrName] = decodeHtmlEntities(value)
  }

  return { tagName, attrs, selfClosing }
}

function parseCloseTagName(token) {
  const match = String(token ?? '').replace(/^\/\s*/, '').match(/^([^\s>]+)/)
  return match ? match[1].toLowerCase() : ''
}

function findTagEnd(source, startIndex) {
  let quote = ''
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '>') return index
  }
  return -1
}

function pushTextNode(parent, text) {
  if (!parent || typeof parent !== 'object') return
  parent.children.push({
    type: 'text',
    text: String(text ?? ''),
  })
}

function decodeHtmlEntities(value) {
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
