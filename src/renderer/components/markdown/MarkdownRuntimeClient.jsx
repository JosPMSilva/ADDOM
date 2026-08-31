import React from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { sanitizePreviewHref } from '../editor/editor-markdown-preview-utils.mjs'
import '../../styles/highlight-theme.css'

const DEFAULT_REMARK_PLUGINS = Object.freeze([remarkGfm])
const DEFAULT_REHYPE_PLUGINS = Object.freeze([rehypeHighlight])

function MarkdownRuntimeClient({
  text,
  components,
  remarkPlugins,
  rehypePlugins,
}) {
  return (
    <ReactMarkdown
      remarkPlugins={Array.isArray(remarkPlugins) ? remarkPlugins : DEFAULT_REMARK_PLUGINS}
      rehypePlugins={Array.isArray(rehypePlugins) ? rehypePlugins : DEFAULT_REHYPE_PLUGINS}
      components={components}
      urlTransform={sanitizePreviewHref}
    >
      {String(text ?? '')}
    </ReactMarkdown>
  )
}

const MemoMarkdownRuntimeClient = React.memo(
  MarkdownRuntimeClient,
  (prev, next) => (
    prev.text === next.text
    && prev.components === next.components
    && prev.remarkPlugins === next.remarkPlugins
    && prev.rehypePlugins === next.rehypePlugins
  ),
)

export default MemoMarkdownRuntimeClient
