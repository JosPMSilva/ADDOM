import { retrieveToolResultSpillover } from './tool-result-spillover.mjs'

function formatNullableOffset(value) {
  if (value === null || value === undefined || value === '') return 'none'
  return Number.isFinite(Number(value)) ? String(Math.max(0, Math.trunc(Number(value)))) : 'none'
}

export function readToolResult(projectRoot, toolInput = {}, options = {}) {
  const retrieval = retrieveToolResultSpillover({
    handle: toolInput?.handle,
    projectRoot,
    threadId: options?.threadId,
    turnId: options?.turnId,
    offset: toolInput?.offset,
    maxChars: toolInput?.max_chars,
    query: toolInput?.query,
    userDataPath: options?.userDataPath,
  })
  if (!retrieval.ok) {
    throw new Error(retrieval.message)
  }

  const lines = [
    `Stored tool result ${retrieval.mode}:`,
    `offset: ${formatNullableOffset(retrieval.offset)}`,
    `end_offset: ${formatNullableOffset(retrieval.endOffset)}`,
    `total_chars: ${formatNullableOffset(retrieval.totalChars)}`,
    `has_more: ${retrieval.hasMore === true ? 'true' : 'false'}`,
    `next_offset: ${formatNullableOffset(retrieval.nextOffset)}`,
  ]
  if (retrieval.mode === 'search') {
    lines.push(`query_found: ${retrieval.queryFound === true ? 'true' : 'false'}`)
    if (retrieval.queryFound === true) {
      lines.push(`match_offset: ${formatNullableOffset(retrieval.matchOffset)}`)
    }
  }
  lines.push('', retrieval.content || '(no content)')
  return lines.join('\n')
}
