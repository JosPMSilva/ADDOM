function extractRequiredFinalPrefix(instructionText = '') {
  const instruction = String(instructionText || '')
  const directive = /\b(?:begin|start)\s+exactly\s+with\b/i.exec(instruction)
  if (!directive) return ''
  const tail = instruction.slice(directive.index + directive[0].length)
  const openingMatch = /['"`‘“]/.exec(tail.slice(0, 120))
  if (!openingMatch) return ''
  const opening = openingMatch[0]
  const closing = opening === '‘' ? '’' : (opening === '“' ? '”' : opening)
  const valueStart = openingMatch.index + 1
  const valueEnd = tail.indexOf(closing, valueStart)
  if (valueEnd < valueStart) return ''
  return tail.slice(valueStart, valueEnd).trim()
}

export function splitTerminalTextByExactPrefix({
  text = '',
  instructionText = '',
  hasToolContext = false,
} = {}) {
  const source = String(text || '').replace(/\r\n?/g, '\n')
  if (!source || hasToolContext !== true) return { finalText: source, commentaryParts: [] }
  const requiredPrefix = extractRequiredFinalPrefix(instructionText)
  const explicitPrefixIndex = requiredPrefix ? source.indexOf(requiredPrefix) : -1
  const semanticBoundary = /^(?:#{1,6}\s*)?(?:\*\*)?FINAL(?:[ \t]+[A-Z][A-Z0-9_-]*){0,4}:(?:\*\*)?[ \t]*$/m.exec(source)
  const finalIndex = explicitPrefixIndex >= 0 ? explicitPrefixIndex : (semanticBoundary?.index ?? -1)
  if (finalIndex <= 0) return { finalText: source, commentaryParts: [] }
  const commentaryParts = source.slice(0, finalIndex)
    .trim()
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (commentaryParts.length === 0) return { finalText: source, commentaryParts: [] }
  return { finalText: source.slice(finalIndex).trim(), commentaryParts }
}
