import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

export function getSharedMarkdownRemarkPlugins() {
  return [remarkGfm]
}

export function getSharedMarkdownRehypePlugins() {
  return [rehypeHighlight]
}
