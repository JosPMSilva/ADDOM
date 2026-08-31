function toText(value) {
  return String(value ?? '').trim().toLowerCase()
}

const CLOSE_HINTS = [
  'done',
  'completed',
  'fixed',
  'resolved',
  'implemented',
  'applied',
  'passed',
]

export function deriveOpenLoopFacts(facts = []) {
  const rows = Array.isArray(facts) ? facts : []
  return rows.filter((fact) => {
    const type = String(fact?.factType || fact?.type || '').trim().toLowerCase()
    const status = String(fact?.status || 'active').trim().toLowerCase()
    return type === 'open_loop' && status === 'active'
  })
}

export function autoCloseOpenLoops({
  openLoops = [],
  assistantText = '',
  toolResults = [],
} = {}) {
  const rows = Array.isArray(openLoops) ? openLoops : []
  if (rows.length === 0) return { resolvedIds: [], remaining: [] }

  const toolText = (Array.isArray(toolResults) ? toolResults : [])
    .map((row) => String(row?.result || ''))
    .join('\n')
  const corpus = `${assistantText || ''}\n${toolText}`.toLowerCase()

  const resolvedIds = []
  const remaining = []
  for (const loop of rows) {
    const text = `${toText(loop.factText)} ${toText(loop.factKey)}`
    const closed = CLOSE_HINTS.some((hint) => corpus.includes(hint) && text.length > 0)
      && (
        text.split(/\s+/).filter((t) => t.length >= 5).some((token) => corpus.includes(token))
        || corpus.includes('all tasks completed')
      )
    if (closed) {
      resolvedIds.push(String(loop.id || '').trim())
    } else {
      remaining.push(loop)
    }
  }

  return { resolvedIds, remaining }
}
