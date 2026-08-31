import React from 'react'
import { useHighlightTheme } from '../chat/highlight-theme-loader.mjs'
import {
  DIFF_HUNK_BACKGROUND,
} from './diff-hunk-grouping.mjs'

export {
  DIFF_HUNK_BACKGROUND,
  DIFF_HUNK_RAIL,
  DIFF_LINE_RAIL_TRACK,
  groupConsecutiveDiffHunks,
} from './diff-hunk-grouping.mjs'

export function formatLineNo(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? String(Math.trunc(n)) : ''
}

export function inferLanguage(filePath = '') {
  const ext = String(filePath || '').trim().replace(/\\/g, '/').split('/').pop()?.split('.')?.pop()?.toLowerCase() || ''
  const map = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript', py: 'python', java: 'java', cs: 'csharp',
    cpp: 'cpp', c: 'c', h: 'c', go: 'go', rs: 'rust', rb: 'ruby', php: 'php',
    sh: 'bash', zsh: 'bash', ps1: 'powershell', html: 'xml', htm: 'xml', xml: 'xml',
    css: 'css', scss: 'scss', json: 'json', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', sql: 'sql', toml: 'ini', ini: 'ini',
  }
  return map[ext] || 'text'
}

const LINE_STYLE = Object.freeze({
  added: { bg: DIFF_HUNK_BACKGROUND.added, text: 'text-success-soft', rail: 'bg-success', lineNoColor: 'text-success' },
  removed: { bg: DIFF_HUNK_BACKGROUND.removed, text: 'text-danger-soft', rail: 'bg-danger', lineNoColor: 'text-danger' },
  unchanged: { bg: '', text: 'text-text-subtle', rail: '', lineNoColor: 'text-text-secondary' },
  ellipsis: { bg: 'bg-surface-panel', text: 'text-text-secondary', rail: '', lineNoColor: 'text-text-secondary' },
})

/**
 * Grid-based unified diff line renderer with a single line number column,
 * semantic change rail (no +/− glyphs), expandable ellipsis rows, and optional
 * syntax highlighting.
 *
 * Line number logic (unified view):
 *   - removed lines → show oldLine (the line being deleted from the original)
 *   - added / unchanged lines → show newLine (the line in the resulting file)
 *   - ellipsis → no line number
 *
 * When paintBackground is false, the parent is expected to supply a hunk band.
 * When paintChangeRail is false, the parent is expected to supply DIFF_HUNK_RAIL.
 */
export function DiffLine({
  type,
  oldLine,
  newLine,
  text,
  highlightedHtml,
  gridTemplate,
  expandable,
  onToggleExpand,
  fullRowBackground = false,
  paintBackground = true,
  paintChangeRail = true,
  changeLabel = '',
}) {
  useHighlightTheme(Boolean(highlightedHtml))
  const style = LINE_STYLE[type] ?? { bg: '', text: 'text-text-subtle', rail: '', lineNoColor: 'text-text-secondary' }
  const showRowBackground = paintBackground && Boolean(style.bg)
  const showChangeRail = paintChangeRail && Boolean(style.rail)
  const rowClass = fullRowBackground
    ? 'grid w-full min-w-0 items-stretch'
    : 'grid w-max min-w-full items-stretch rounded-sm'
  const codeClass = fullRowBackground
    ? 'hljs block min-w-0 whitespace-pre'
    : 'hljs block min-w-full w-max whitespace-pre'
  const textClass = fullRowBackground
    ? `block min-w-0 whitespace-pre ${style.text}`
    : `block min-w-full w-max whitespace-pre ${style.text}`

  const lineNo = type === 'removed' ? formatLineNo(oldLine) : formatLineNo(newLine)

  if (type === 'ellipsis') {
    const interactive = expandable && typeof onToggleExpand === 'function'
    return (
      <span
        className={[
          rowClass,
          fullRowBackground && showRowBackground ? `rounded-sm ${style.bg}` : '',
          interactive ? 'cursor-pointer hover:bg-surface-border/30 transition-colors' : '',
        ].join(' ')}
        style={{ gridTemplateColumns: gridTemplate }}
        onClick={interactive ? onToggleExpand : undefined}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleExpand() } } : undefined}
      >
        <span aria-hidden="true" className="inline-flex min-w-0 items-center justify-end py-0.5 pl-4 pr-3 leading-5 text-text-secondary select-none" />
        <span
          aria-hidden="true"
          data-ui="diff-change-rail"
          className="block self-stretch"
        />
        <span className={`inline-flex items-center gap-1 py-0.5 pl-2 leading-5 select-none text-text-secondary ${fullRowBackground || !showRowBackground ? '' : `rounded-sm ${style.bg}`}`}>
          {interactive ? (
            <span className="inline-flex items-center gap-1.5 py-0.5">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3 h-3 shrink-0">
                <polyline points="4 6 8 10 12 6" />
              </svg>
              {text}
            </span>
          ) : (
            <span className="py-0.5">{'\u22ee'} {text}</span>
          )}
        </span>
      </span>
    )
  }

  return (
    <span
      className={[
        rowClass,
        fullRowBackground && showRowBackground ? `rounded-sm ${style.bg}` : '',
      ].join(' ')}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      <span aria-hidden="true" className={`inline-flex min-w-0 items-center justify-end py-0.5 pl-4 pr-3 leading-5 select-none ${style.lineNoColor}`}>
        {lineNo}
      </span>
      <span
        aria-hidden="true"
        data-ui="diff-change-rail"
        data-diff-rail={showChangeRail ? type : undefined}
        className={[
          'block self-stretch',
          showChangeRail ? style.rail : '',
          !fullRowBackground && showRowBackground && showChangeRail ? 'rounded-l-sm' : '',
        ].filter(Boolean).join(' ')}
      />
      <span className={[
        'block py-0.5',
        fullRowBackground || !showRowBackground ? '' : `rounded-r-sm ${style.bg}`,
      ].filter(Boolean).join(' ')}>
        {changeLabel ? <span className="sr-only">{changeLabel}: </span> : null}
        {highlightedHtml ? (
          <span className={codeClass} style={{ background: 'transparent' }} dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        ) : (
          <span className={textClass}>{text || ' '}</span>
        )}
      </span>
    </span>
  )
}

export function DiffStats({ diff }) {
  let added = 0
  let removed = 0
  for (const seg of diff) {
    if (seg.type === 'added') added += seg.lines.length
    if (seg.type === 'removed') removed += seg.lines.length
  }
  if (added === 0 && removed === 0) return null
  return (
    <p className="text-xs mt-2 text-text-muted">
      <span className="text-success">+{added}</span>{' / '}
      <span className="text-danger">-{removed}</span>{' lines'}
    </p>
  )
}
