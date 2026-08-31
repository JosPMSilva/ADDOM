import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'

const MAX_SEEN_EVENT_IDS = 128
const markdownParser = unified().use(remarkParse).use(remarkGfm)

function normalizeSequence(value = 0) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : 0
}

function rememberEventId(eventIds = [], eventId = '') {
  const normalized = String(eventId || '').trim()
  if (!normalized) return Array.isArray(eventIds) ? eventIds : []
  const next = [...(Array.isArray(eventIds) ? eventIds : []), normalized]
  return next.length > MAX_SEEN_EVENT_IDS ? next.slice(-MAX_SEEN_EVENT_IDS) : next
}

function stableTextHash(text = '') {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function validTopLevelNodes(text = '') {
  const tree = markdownParser.parse(text)
  return (Array.isArray(tree?.children) ? tree.children : []).filter((node) => {
    const start = Number(node?.position?.start?.offset)
    const end = Number(node?.position?.end?.offset)
    return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start
  })
}

function trailingBoundaryIsStable(text = '', lastNode = null) {
  const end = Number(lastNode?.position?.end?.offset)
  if (!Number.isInteger(end) || end < 0) return false
  return /(?:\r?\n)[\t ]*(?:\r?\n)[\s]*$/.test(text.slice(end))
}

function repairOpenFence(text = '') {
  const lines = String(text || '').split(/\r?\n/)
  let openFence = null
  for (const line of lines) {
    const match = line.match(/^[\t ]{0,3}(`{3,}|~{3,})(.*)$/)
    if (!match) continue
    const marker = match[1]
    if (!openFence) {
      openFence = { char: marker[0], length: marker.length }
      continue
    }
    if (
      marker[0] === openFence.char
      && marker.length >= openFence.length
      && String(match[2] || '').trim() === ''
    ) {
      openFence = null
    }
  }
  if (!openFence) return text
  const closing = openFence.char.repeat(openFence.length)
  return `${text}${text.endsWith('\n') ? '' : '\n'}${closing}`
}

function createBlock({ messageId = '', start = 0, end = 0, text = '' } = {}) {
  return Object.freeze({
    id: `${messageId || 'message'}:final-block:${start}:${end}:${stableTextHash(text)}`,
    start,
    end,
    text,
    renderText: text,
  })
}

function stablePrefixFromProjection(projection = null) {
  return (Array.isArray(projection?.blocks) ? projection.blocks : [])
    .map((block) => String(block?.text || ''))
    .join('')
}

export function advanceCanonicalFinalText(previous = null, input = {}) {
  const prior = previous && typeof previous === 'object'
    ? previous
    : { text: '', lastSequence: 0, seenEventIds: [], settled: false }
  const eventId = String(input?.eventId || '').trim()
  if (eventId && prior.seenEventIds?.includes(eventId)) return prior

  const sequence = normalizeSequence(input?.sequence)
  const final = input?.final === true
  if (!final && sequence > 0 && prior.lastSequence > 0 && sequence <= prior.lastSequence) return prior

  const incoming = String(input?.text ?? '')
  const operation = String(input?.operation || 'append').trim().toLowerCase()
  let text = prior.text || ''
  if (operation === 'replace') {
    text = incoming
  } else if (operation === 'cumulative') {
    if (incoming.startsWith(text)) text = incoming
    else if (!text.startsWith(incoming)) text = incoming
  } else if (operation === 'opaque' || operation === 'mixed') {
    if (incoming.startsWith(text)) text = incoming
    else if (!text.startsWith(incoming)) text += incoming
  } else {
    text += incoming
  }

  return {
    text,
    lastSequence: sequence || prior.lastSequence || 0,
    seenEventIds: rememberEventId(prior.seenEventIds, eventId),
    settled: final || prior.settled === true,
  }
}

export function projectStreamingFinalDocument({
  previous = null,
  messageId = '',
  text = '',
  settled = false,
} = {}) {
  const canonicalText = String(text ?? '')
  const normalizedMessageId = String(messageId || '').trim() || 'message'
  const previousMatchesMessage = previous?.messageId === normalizedMessageId
  const previousStableText = previousMatchesMessage ? stablePrefixFromProjection(previous) : ''
  const canReuseStableBlocks = previousMatchesMessage && canonicalText.startsWith(previousStableText)
  const blocks = canReuseStableBlocks ? [...previous.blocks] : []
  const sourceStart = canReuseStableBlocks ? previousStableText.length : 0
  const source = canonicalText.slice(sourceStart)
  const nodes = validTopLevelNodes(source)

  let completeCount = settled ? nodes.length : Math.max(0, nodes.length - 1)
  if (!settled && nodes.length > 0 && trailingBoundaryIsStable(source, nodes.at(-1))) {
    completeCount = nodes.length
  }

  let cursor = 0
  for (let index = 0; index < completeCount; index += 1) {
    const nextNodeStart = Number(nodes[index + 1]?.position?.start?.offset)
    const localEnd = Number.isInteger(nextNodeStart) ? nextNodeStart : source.length
    const blockText = source.slice(cursor, localEnd)
    blocks.push(createBlock({
      messageId: normalizedMessageId,
      start: sourceStart + cursor,
      end: sourceStart + localEnd,
      text: blockText,
    }))
    cursor = localEnd
  }

  const tailText = source.slice(cursor)
  return {
    messageId: normalizedMessageId,
    text: canonicalText,
    settled: settled === true,
    blocks,
    tail: {
      id: `${normalizedMessageId}:final-tail:${sourceStart + cursor}`,
      start: sourceStart + cursor,
      text: tailText,
      renderText: settled ? tailText : repairOpenFence(tailText),
    },
  }
}
