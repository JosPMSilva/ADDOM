import { parseHtmlFragment } from './final-document-html-fragment-parser.mjs'
import {
  countSourceCharacters,
  normalizeMetaValue,
  normalizeSource,
  normalizeDomLikeRoot,
} from './final-document-semantic-snapshot-dom.mjs'
import {
  collectBlocks,
  countBlocks,
  countBlocksOfKind,
  maxListDepth,
} from './final-document-semantic-snapshot-blocks.mjs'

export function buildNormalizedFinalDocumentSemanticSnapshot({
  root = null,
  html = '',
  source = 'ssr',
  messageMeta = {},
  includeInlineAnnotations = true,
} = {}) {
  const nodes = root ? normalizeDomLikeRoot(root) : parseHtmlFragment(String(html ?? ''))
  const snapshot = {
    schemaVersion: 1,
    scope: 'final_document',
    source: {
      captureMode: normalizeSource(source),
      renderMode: 'final',
      messageId: normalizeMetaValue(messageMeta?.messageId),
      turnId: normalizeMetaValue(messageMeta?.turnId),
      threadId: normalizeMetaValue(messageMeta?.threadId),
      providerId: normalizeMetaValue(messageMeta?.providerId),
      modelId: normalizeMetaValue(messageMeta?.modelId),
    },
    document: {
      kind: 'markdown_document',
      blocks: [],
    },
    annotations: {
      links: [],
      controls: [],
    },
    stats: {
      blockCount: 0,
      headingCount: 0,
      paragraphCount: 0,
      blockquoteCount: 0,
      listCount: 0,
      tableCount: 0,
      codeBlockCount: 0,
      thematicBreakCount: 0,
      linkCount: 0,
      controlCount: 0,
      maxListDepth: 0,
      sourceCharacterCount: countSourceCharacters(root, html),
    },
  }

  const state = {
    snapshot,
    includeInlineAnnotations,
    nextLinkId: 1,
    nextControlId: 1,
  }

  snapshot.document.blocks = collectBlocks(nodes, state, [], 1)
  snapshot.stats.blockCount = countBlocks(snapshot.document.blocks)
  snapshot.stats.headingCount = countBlocksOfKind(snapshot.document.blocks, 'heading')
  snapshot.stats.paragraphCount = countBlocksOfKind(snapshot.document.blocks, 'paragraph')
  snapshot.stats.blockquoteCount = countBlocksOfKind(snapshot.document.blocks, 'blockquote')
  snapshot.stats.listCount = countBlocksOfKind(snapshot.document.blocks, 'list')
  snapshot.stats.tableCount = countBlocksOfKind(snapshot.document.blocks, 'table')
  snapshot.stats.codeBlockCount = countBlocksOfKind(snapshot.document.blocks, 'code_block')
  snapshot.stats.thematicBreakCount = countBlocksOfKind(snapshot.document.blocks, 'thematic_break')
  snapshot.stats.linkCount = snapshot.annotations.links.length
  snapshot.stats.controlCount = snapshot.annotations.controls.length
  snapshot.stats.maxListDepth = maxListDepth(snapshot.document.blocks)

  return snapshot
}
