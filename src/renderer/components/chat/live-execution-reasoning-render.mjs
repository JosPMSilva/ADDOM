const STREAM_FILE_EXTENSION = '(?:js|mjs|cjs|ts|tsx|jsx|md|json|toml|css|scss|html)'
function repairKnownStreamBrokenTokens(text = '') {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\b(Type)\n+(Script)\b/g, '$1$2')
    .replace(/\b(Java)\n+(Script)\b/g, '$1$2')
    .replace(/\b(Saa)\n+(S)\b/g, '$1$2')
    .replace(/\b(Node|Next|Express|React)\n+(\.js)\b/g, '$1$2')
    .replace(new RegExp(`\\b([A-Za-z]{2,})\\n+(\\.(?:${STREAM_FILE_EXTENSION}))\\b`, 'g'), '$1$2')
}

function repairStreamBrokenWordsInParagraph(text = '') {
  let value = repairKnownStreamBrokenTokens(text)

  value = value
    .replace(/([.!?])([A-Z][a-z]+)/g, '$1 $2')
    // Insert missing sentence spaces, but never split file extensions (Next.js, index.mjs).
    .replace(/([a-z])([!?])([A-Za-z])/g, '$1$2 $3')
    .replace(/([a-z])(\.)(?![a-z]{1,8}\b)([A-Za-z])/g, '$1$2 $3')
    .replace(/([A-Za-z0-9])\n{1,}(\?)/g, '$1$2')

  return value
}

function repairStreamBrokenWords(text = '') {
  return repairKnownStreamBrokenTokens(text)
    .split('\n\n')
    .map((paragraph) => repairStreamBrokenWordsInParagraph(paragraph))
    .join('\n\n')
}

function normalizeReasoningCodeBlocks(text = '') {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/(?<!`)```(?!`)[ \t]*([^`\n][^`\n]*?)[ \t]*```(?!`)/g, (_, rawContent) => {
      const content = String(rawContent || '').trim()
      if (!content) return ''
      const shouldBlockRender = /[{}[\]]/.test(content)
      if (!shouldBlockRender) {
        return `\`${content}\``
      }
      return `\n\n\`\`\`text\n${content}\n\`\`\`\n\n`
    })
    .replace(/(?<!`)``(?!`)\s*([\s\S]*?)\s*(?<!`)``(?!`)/g, (_, rawContent) => {
      const content = String(rawContent || '').trim()
      if (!content) return ''
      const shouldBlockRender = content.includes('\n')
        || /[{}[\]]/.test(content)
      if (!shouldBlockRender) {
        return `\`${content}\``
      }
      return `\n\n\`\`\`text\n${content}\n\`\`\`\n\n`
    })
    .replace(/(^|\n{2,})`{1,2}\s*([^`\n]*(?:[{[])[^`\n]*)\s*`{1,2}\s*(?=(\n{2,}|$|\*\*|[A-Z][A-Za-z]))/gi, (_, prefix, rawContent) => {
      const content = String(rawContent || '').trim()
      if (!content) return prefix
      return `${prefix}\`\`\`text\n${content}\n\`\`\`\n\n`
    })
}

function preserveFencedCodeBlocks(text = '') {
  const blocks = []
  const content = String(text || '').replace(/```[^\n]*\n[\s\S]*?(?:```|$)/g, (match) => {
    const token = `__ADDOM_REASONING_CODE_BLOCK_${blocks.length}__`
    blocks.push(match)
    return token
  })
  return { content, blocks }
}

function restoreFencedCodeBlocks(text = '', blocks = []) {
  let content = String(text || '')
  for (const [index, block] of (Array.isArray(blocks) ? blocks : []).entries()) {
    const token = `__ADDOM_REASONING_CODE_BLOCK_${index}__`
    content = content.replaceAll(token, block)
  }
  return content
}

function repairSplitMarkdownBold(text = '') {
  return String(text || '').replace(/\*\*([\s\S]*?)\*\*/g, (_, inner) => {
    const collapsed = inner.replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
    return collapsed ? `**${collapsed}**` : ''
  })
}

function normalizeDuplicateTextKey(text = '') {
  return String(text || '')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/\s+\./g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+\s*$/, '')
    .toLowerCase()
}

function dedupePlainSentenceBeforeDuplicateBold(text = '') {
  const value = String(text || '')
  const match = value.match(/^([\s\S]*?[.!?])(?:\s*\n+\s*|\s+|\s*)\*\*([\s\S]+?)\*\*\s*$/)
  if (!match) return value
  const plain = match[1].replace(/\s*\n+\s*/g, ' ').replace(/\*\*/g, '').trim()
  const boldInner = match[2].replace(/\s*\n+\s*/g, ' ').replace(/\s+/g, ' ').replace(/\s+\./g, '.').trim()
  if (normalizeDuplicateTextKey(plain) === normalizeDuplicateTextKey(boldInner)) {
    return `**${plain.trim()}**`
  }
  return value
}

function escapeMarkdownEmphasisNearQuotes(text = '') {
  return String(text || '')
    .replace(/"\*\*/g, '"\\*\\*')
    .replace(/\*\*"/g, '\\*\\*"')
    .replace(/'\*\*/g, "'\\*\\*")
    .replace(/\*\*'/g, "\\*\\*'")
}

function normalizeReasoningText(text = '') {
  const withNormalizedCodeBlocks = normalizeReasoningCodeBlocks(text)
  const { content, blocks } = preserveFencedCodeBlocks(withNormalizedCodeBlocks)

  const repaired = restoreFencedCodeBlocks(
    repairStreamBrokenWords(content),
    blocks,
  )
    .replace(/\r\n?/g, '\n')
    .replace(/\n{2,}---\n{2,}/g, '\n\n')
    .replace(/^\s*[-*_]{3,}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return dedupePlainSentenceBeforeDuplicateBold(
    repairSplitMarkdownBold(escapeMarkdownEmphasisNearQuotes(repaired)),
  ).trim()
}

export function normalizeReasoningPreview(text = '') {
  return normalizeReasoningText(text)
}
