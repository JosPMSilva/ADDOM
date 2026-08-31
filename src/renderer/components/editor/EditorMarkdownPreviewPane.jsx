import React, { useCallback, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import CodeSnippetBlock from '../chat/CodeSnippetBlock.jsx'
import {
  getSharedMarkdownRehypePlugins,
  getSharedMarkdownRemarkPlugins,
} from '../markdown/markdown-plugin-config.mjs'
import {
  resolveProjectMarkdownLink,
  isExternalHttpHref,
  isSupportedPreviewImageSrc,
  slugifyMarkdownHeading,
} from './editor-markdown-preview-utils.mjs'

function reactNodeText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(reactNodeText).join('')
  if (React.isValidElement(node)) return reactNodeText(node.props?.children)
  return ''
}

function markdownCodeBlockLanguageFromPreChildren(children) {
  const parts = React.Children.toArray(children)
  const codeElement = parts.find((part) => React.isValidElement(part))
  if (!React.isValidElement(codeElement)) return 'text'
  const className = String(codeElement.props?.className || '')
  const match = className.match(/language-([a-z0-9_+.-]+)/i)
  return String(match?.[1] || 'text').toLowerCase()
}

function markdownCodeBlockTextFromPreChildren(children) {
  const parts = React.Children.toArray(children)
  const codeElement = parts.find((part) => React.isValidElement(part))
  if (React.isValidElement(codeElement)) {
    return reactNodeText(codeElement.props?.children)
  }
  return reactNodeText(children)
}

function escapeSelectorValue(value = '') {
  const raw = String(value || '')
  if (!raw) return ''
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(raw)
  }
  return raw.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1')
}

function headingClassByLevel(level) {
  if (level === 1) return 'text-xl font-semibold text-text-primary mt-5 mb-2'
  if (level === 2) return 'text-lg font-semibold text-text-primary mt-4 mb-2'
  if (level === 3) return 'text-base font-semibold text-text-secondary mt-3 mb-2'
  if (level === 4) return 'text-sm font-semibold text-text-secondary mt-3 mb-1.5'
  return 'text-sm font-semibold text-text-secondary mt-2.5 mb-1.5'
}

function prettyReason(reason = '') {
  const key = String(reason || '').trim()
  if (!key) return 'Unknown preview link error.'
  if (key === 'path_escapes_project_root') return 'This link points outside the project and was blocked.'
  if (key === 'path_not_allowed') return 'This link points outside the project and was blocked.'
  if (key === 'unsafe_href') return 'This link uses an unsupported protocol and was blocked.'
  if (key === 'empty_target_path') return 'This link does not point to a valid file path.'
  if (key === 'absolute_local_path_disallowed') return 'Absolute local paths are blocked in markdown preview.'
  if (key === 'missing_project_context') return 'Open a project before using markdown file links.'
  if (key === 'missing_open_handler') return 'Markdown preview link handler is unavailable in this view.'
  if (key === 'file_not_found') return 'The linked file was not found in this workspace.'
  if (key === 'open_file_failed') return 'Could not open the linked workspace file.'
  return `Preview navigation failed: ${key}`
}

export default function EditorMarkdownPreviewPane({
  markdownText = '',
  currentFilePath = '',
  projectFolder = '',
  onOpenWorkspaceFile,
  monacoHidden = false,
  onToggleMonaco,
}) {
  const [previewNotice, setPreviewNotice] = useState('')
  const containerRef = useRef(null)
  const markdownRemarkPlugins = useMemo(() => getSharedMarkdownRemarkPlugins(), [])
  const markdownRehypePlugins = useMemo(() => getSharedMarkdownRehypePlugins(), [])

  const scrollToAnchor = useCallback((anchor = '') => {
    const raw = String(anchor || '').trim()
    if (!raw) return false
    const candidates = []
    candidates.push(raw)
    const lower = raw.toLowerCase()
    if (!candidates.includes(lower)) candidates.push(lower)
    const slug = slugifyMarkdownHeading(raw)
    if (!candidates.includes(slug)) candidates.push(slug)

    const root = containerRef.current
    if (!root) return false

    for (const candidate of candidates) {
      const escaped = escapeSelectorValue(candidate)
      if (!escaped) continue
      const node = root.querySelector(`#${escaped}`)
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return true
      }
    }
    return false
  }, [])

  const handleHrefNavigation = useCallback(async (href = '') => {
    const rawHref = String(href || '').trim()
    const resolved = resolveProjectMarkdownLink({
      href: rawHref,
      currentFilePath,
      projectFolder,
    })
    if (!resolved?.ok) {
      setPreviewNotice(prettyReason(resolved?.reason))
      return
    }

    if (isExternalHttpHref(resolved.href)) {
      try {
        await window.addom?.shell?.openExternal?.(resolved.href)
        setPreviewNotice('')
      } catch {
        setPreviewNotice('Could not open external link in your browser.')
      }
      return
    }

    if (resolved.kind === 'anchor') {
      const found = scrollToAnchor(resolved.anchor)
      setPreviewNotice(found ? '' : 'Anchor not found in this preview.')
      return
    }

    if (resolved.kind !== 'file') return
    if (typeof onOpenWorkspaceFile !== 'function') {
      setPreviewNotice(prettyReason('missing_open_handler'))
      return
    }

    const openResult = await onOpenWorkspaceFile(resolved.filePath, {
      line: resolved.line,
      column: resolved.column,
    })
    if (openResult?.ok === false) {
      setPreviewNotice(prettyReason(openResult?.reason || 'open_file_failed'))
      return
    }

    if (resolved.anchor && resolved.filePath === String(currentFilePath || '').replace(/\\/g, '/')) {
      const found = scrollToAnchor(resolved.anchor)
      setPreviewNotice(found ? '' : 'Anchor not found in this preview.')
      return
    }

    setPreviewNotice('')
  }, [currentFilePath, onOpenWorkspaceFile, projectFolder, scrollToAnchor])

  const markdownComponents = useMemo(() => {
    const headingCounts = new Map()
    const buildHeading = (Tag, level) => function Heading({ children }) {
      const headingText = reactNodeText(children)
      const base = slugifyMarkdownHeading(headingText)
      const count = headingCounts.get(base) || 0
      headingCounts.set(base, count + 1)
      const id = count === 0 ? base : `${base}-${count}`
      return (
        <Tag id={id} className={headingClassByLevel(level)}>
          {children}
        </Tag>
      )
    }

    return {
      code({ inline, className, children, ...props }) {
        const domProps = { ...(props || {}) }
        delete domProps.node
        return inline
          ? (
            <code className="px-1 py-0.5 rounded bg-surface-panel text-success-soft font-mono text-xs" {...domProps}>
              {children}
            </code>
          )
          : <code className={className} {...domProps}>{children}</code>
      },
      pre({ children }) {
        const language = markdownCodeBlockLanguageFromPreChildren(children)
        const text = markdownCodeBlockTextFromPreChildren(children)
        return (
          <CodeSnippetBlock
            text={text}
            language={language}
          />
        )
      },
      h1: buildHeading('h1', 1),
      h2: buildHeading('h2', 2),
      h3: buildHeading('h3', 3),
      h4: buildHeading('h4', 4),
      h5: buildHeading('h5', 5),
      h6: buildHeading('h6', 6),
      p({ children }) {
        return <p className="mb-2.5 last:mb-0 text-text-primary">{children}</p>
      },
      ul({ children }) {
        return <ul className="list-disc list-inside mb-3 pl-1 space-y-1 text-text-primary">{children}</ul>
      },
      ol({ children }) {
        return <ol className="list-decimal list-inside mb-3 pl-1 space-y-1 text-text-primary">{children}</ol>
      },
      li({ children }) {
        return <li className="text-text-primary">{children}</li>
      },
      blockquote({ children }) {
        return (
          <blockquote className="my-3 border-l-2 border-accent-muted pl-3 text-text-secondary italic">
            {children}
          </blockquote>
        )
      },
      hr() {
        return <hr className="my-4 border-surface-border" />
      },
      table({ children }) {
        return (
          <div className="my-3 overflow-x-auto border border-surface-border rounded-lg">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        )
      },
      thead({ children }) {
        return <thead className="bg-surface-panel text-accent-soft">{children}</thead>
      },
      tbody({ children }) {
        return <tbody className="bg-surface-panel-alt">{children}</tbody>
      },
      tr({ children }) {
        return <tr className="border-b border-surface-border last:border-b-0">{children}</tr>
      },
      th({ children }) {
        return <th className="px-2 py-1.5 text-left font-semibold text-text-primary">{children}</th>
      },
      td({ children }) {
        return <td className="px-2 py-1.5 text-text-secondary align-top">{children}</td>
      },
      a({ href, children }) {
        const resolved = resolveProjectMarkdownLink({
          href,
          currentFilePath,
          projectFolder,
        })
        const external = resolved?.ok === true && resolved.kind === 'external'
        return (
          <a
            href={external ? resolved.href : '#'}
            className="text-accent-soft underline hover:text-accent"
            target={external ? '_blank' : undefined}
            rel={external ? 'noreferrer' : undefined}
            onClick={(event) => {
              event.preventDefault()
              void handleHrefNavigation(String(href || ''))
            }}
          >
            {children}
          </a>
        )
      },
      img({ src, alt }) {
        const safeSource = String(src || '').trim()
        if (isSupportedPreviewImageSrc(safeSource)) {
          return (
            <img
              src={safeSource}
              alt={String(alt || 'Markdown image')}
              className="my-2 max-w-full rounded-lg border border-surface-border bg-surface-panel"
            />
          )
        }
        return (
          <div className="my-2 rounded-lg border border-info-border bg-info-bg px-3 py-2 text-xs text-info-soft">
            Local workspace image preview will be supported in a follow-up.
          </div>
        )
      },
    }
  }, [currentFilePath, handleHrefNavigation, projectFolder])

  return (
    <div className="h-full min-h-0 w-full border-l border-surface-border bg-surface flex flex-col">
      <div className="shrink-0 px-3 py-2 border-b border-surface-border text-[11px] text-text-muted flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {typeof onToggleMonaco === 'function' && (
            <button
              type="button"
              onClick={onToggleMonaco}
              title={monacoHidden ? 'Show editor' : 'Hide editor'}
              aria-label={monacoHidden ? 'Show Monaco editor' : 'Hide Monaco editor'}
              className="shrink-0 flex items-center justify-center rounded hover:bg-surface-panel transition-colors p-0.5 text-text-muted hover:text-text-primary"
            >
              {monacoHidden ? (
                // chevrons pointing right → show editor on the left
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                  <polyline points="6 3 11 8 6 13" />
                  <polyline points="2 3 7 8 2 13" />
                </svg>
              ) : (
                // chevrons pointing left → hide editor (push it away)
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                  <polyline points="10 3 5 8 10 13" />
                  <polyline points="14 3 9 8 14 13" />
                </svg>
              )}
            </button>
          )}
          <span className="truncate">Markdown Preview</span>
        </div>
        <span className="text-text-tertiary shrink-0">Ctrl/Cmd+Shift+V</span>
      </div>
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto px-4 py-3 text-sm leading-6 text-text-primary"
        data-ui="editor-markdown-preview-pane"
      >
        <ReactMarkdown
          remarkPlugins={markdownRemarkPlugins}
          rehypePlugins={markdownRehypePlugins}
          components={markdownComponents}
        >
          {String(markdownText || '')}
        </ReactMarkdown>
      </div>
      {previewNotice && (
        <div className="shrink-0 px-3 py-2 border-t border-warning-border bg-warning-bg text-warning-soft text-[11px]">
          {previewNotice}
        </div>
      )}
    </div>
  )
}
