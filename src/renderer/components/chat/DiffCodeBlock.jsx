import React from 'react'
import CopyBlockButton from './CopyBlockButton.jsx'
import { getBlockRenderMetrics } from './code-block-rendering.mjs'

function classifyDiffLine(line) {
  const value = String(line ?? '')
  if (value.startsWith('diff --git ') || value.startsWith('index ')) return 'meta'
  if (value.startsWith('--- ')) return 'file_old'
  if (value.startsWith('+++ ')) return 'file_new'
  if (value.startsWith('@@')) return 'hunk'
  if (value === '\\ No newline at end of file') return 'meta'
  if (value.startsWith('+') && !value.startsWith('+++ ')) return 'addition'
  if (value.startsWith('-') && !value.startsWith('--- ')) return 'deletion'
  return 'context'
}

function diffLineClasses(kind) {
  switch (kind) {
    case 'addition':
      return 'bg-emerald-500/10 text-emerald-100'
    case 'deletion':
      return 'bg-rose-500/10 text-rose-100'
    case 'hunk':
      return 'bg-surface-panel-alt/55 text-text-secondary'
    case 'file_old':
      return 'text-rose-200'
    case 'file_new':
      return 'text-emerald-200'
    case 'meta':
      return 'text-text-muted'
    default:
      return 'text-text-primary'
  }
}

export default function DiffCodeBlock({
  text,
  language = 'diff',
  title = '',
}) {
  const { content, highlightEnabled } = getBlockRenderMetrics(text)
  const lines = highlightEnabled ? content.split('\n') : []
  const lineCount = lines.length || (content ? 1 : 0)

  return (
    <div className="group/diff-block my-2 w-full" data-chat-render="diff-block">
      <div className="flex items-center gap-2 border-b border-chat-border px-1 py-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-5">
          <span className="uppercase tracking-wide text-xs font-medium text-text-primary">diff</span>
          {lineCount > 0 ? (
            <span className="text-text-subtle">
              {lineCount} line{lineCount === 1 ? '' : 's'}
            </span>
          ) : null}
          {title ? (
            <span className="truncate font-mono text-text-muted" title={title}>
              {title}
            </span>
          ) : null}
          {!highlightEnabled && (
            <span className="text-text-muted">plain</span>
          )}
        </div>
        <CopyBlockButton
          text={content}
          variant="ghost"
          className="ml-auto md:opacity-0 md:group-hover/diff-block:opacity-100 md:group-focus-within/diff-block:opacity-100 md:transition-opacity"
        />
      </div>
      <div className="px-1 py-0.5">
        <div className="overflow-hidden rounded-lg border border-surface-border/40 bg-surface-panel/30">
          <pre className="m-0 max-h-72 overflow-auto px-3 py-2.5 text-[12px] leading-6">
            <code
              className={`block min-w-fit font-mono whitespace-pre language-${language}`}
              data-highlight={highlightEnabled ? 'on' : 'off'}
            >
              {highlightEnabled ? (
                <span className="block">
                  {lines.map((line, idx) => {
                    const kind = classifyDiffLine(line)
                    const needsNewline = idx < lines.length - 1
                    return (
                      <span
                        key={`${idx}:${kind}`}
                        className={[
                          'block whitespace-pre rounded-md px-2.5',
                          diffLineClasses(kind),
                        ].join(' ')}
                        data-diff-line-kind={kind}
                      >
                        {line}
                        {needsNewline ? '\n' : ''}
                      </span>
                    )
                  })}
                </span>
              ) : (
                <span className="block text-text-primary">{content}</span>
              )}
            </code>
          </pre>
        </div>
      </div>
    </div>
  )
}
