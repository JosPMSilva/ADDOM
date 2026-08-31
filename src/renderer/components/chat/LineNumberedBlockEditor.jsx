import React from 'react'
import { useHighlightTheme } from './highlight-theme-loader.mjs'

/**
 * LineNumberedBlockEditor
 *
 * A textarea with a synchronized line-number gutter.
 *
 * When `highlightHtml` is provided the component renders a syntax-highlighted
 * overlay behind the textarea using the "transparent textarea over highlighted
 * pre" technique:
 *
 *   KEY: We use `-webkit-text-fill-color: transparent` (NOT `color: transparent`)
 *   because in Chromium/Electron, `color: transparent` also makes the caret
 *   invisible, whereas `-webkit-text-fill-color` only affects rendered glyph
 *   fill — `caret-color` and text selection remain fully functional.
 *
 *   - The <pre> sits BEHIND the textarea in DOM order (z-index: 0).
 *   - The textarea sits ABOVE it (z-index: 1) with a transparent background
 *     and `-webkit-text-fill-color: transparent` so the pre shows through.
 *   - `caret-color` is set explicitly so the caret is always visible.
 *   - Text selection shows the system selection highlight over the pre layer —
 *     no `selection:text-transparent` needed.
 */
export default function LineNumberedBlockEditor({
  value,
  rows,
  placeholder,
  disabled,
  className = '',
  dataUi,
  onChange,
  onKeyDown,
  setTextareaRef,
  highlightHtml = null,
  highlightLanguage = 'plaintext',
}) {
  const gutterRef = React.useRef(null)
  const overlayRef = React.useRef(null)
  const textareaLocalRef = React.useRef(null)

  const lineCount = React.useMemo(
    () => Math.max(1, String(value || '').split(/\r?\n/).length),
    [value],
  )
  const gutterWidthPx = React.useMemo(
    () => Math.max(30, 14 + (String(lineCount).length * 8)),
    [lineCount],
  )

  const assignTextareaRef = React.useCallback((node) => {
    textareaLocalRef.current = node || null
    if (typeof setTextareaRef === 'function') setTextareaRef(node || null)
  }, [setTextareaRef])

  // Sync scroll position of gutter AND highlight overlay with textarea
  const syncScroll = React.useCallback((target) => {
    if (!target) return
    if (gutterRef.current) {
      gutterRef.current.scrollTop = target.scrollTop
    }
    if (overlayRef.current) {
      overlayRef.current.scrollTop = target.scrollTop
      overlayRef.current.scrollLeft = target.scrollLeft
    }
  }, [])

  const handleScroll = React.useCallback((event) => {
    syncScroll(event.currentTarget)
  }, [syncScroll])

  const syncGutterViewportHeight = React.useCallback((target) => {
    const gutter = gutterRef.current
    if (!gutter || !target) return
    const nextHeight = Number(target.clientHeight || 0)
    if (nextHeight > 0) {
      gutter.style.height = `${nextHeight}px`
    } else {
      gutter.style.removeProperty('height')
    }
  }, [])

  React.useEffect(() => {
    syncScroll(textareaLocalRef.current)
    syncGutterViewportHeight(textareaLocalRef.current)
  }, [lineCount, syncScroll, syncGutterViewportHeight])

  React.useEffect(() => {
    const target = textareaLocalRef.current
    if (!target) return undefined
    syncGutterViewportHeight(target)
    if (typeof ResizeObserver !== 'function') return undefined
    const observer = new ResizeObserver(() => {
      syncGutterViewportHeight(textareaLocalRef.current)
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [rows, syncGutterViewportHeight])

  const hasHighlight = Boolean(highlightHtml)
  useHighlightTheme(hasHighlight)
  const langClass = `language-${String(highlightLanguage || 'plaintext').toLowerCase()}`

  // Inline styles for the textarea when highlight overlay is active.
  // -webkit-text-fill-color: transparent hides rendered glyphs without
  // affecting caret-color (Chromium/Electron specific, but that is our target).
  const textareaHighlightStyle = hasHighlight
    ? {
        background: 'transparent',
        WebkitTextFillColor: 'transparent',
        caretColor: 'var(--color-code-caret)',
        position: 'relative',
        zIndex: 1,
      }
    : undefined

  return (
    <div className="flex items-stretch">
      {/* Line number gutter */}
      <div
        ref={gutterRef}
        aria-hidden="true"
        className="shrink-0 overflow-hidden border-r border-surface-border bg-surface-panel-alt px-2 py-2 text-right select-none"
        style={{ width: `${gutterWidthPx}px` }}
      >
        {Array.from({ length: lineCount }).map((_, index) => (
          <div
            key={index}
            className="text-[10px] leading-5 font-mono text-text-muted"
          >
            {index + 1}
          </div>
        ))}
      </div>

      {/* Editor area — relative container for the overlay */}
      <div className="relative flex-1 min-w-0 overflow-hidden">

        {/* Syntax-highlight overlay — z-index 0, BEHIND the textarea */}
        {hasHighlight && (
          <pre
            ref={overlayRef}
            aria-hidden="true"
            className={`hljs ${langClass} pointer-events-none absolute inset-0 m-0 overflow-hidden font-mono text-xs leading-5 whitespace-pre`}
            style={{
              padding: '8px 12px',
              height: '100%',
              zIndex: 0,
            }}
            dangerouslySetInnerHTML={{ __html: highlightHtml }}
          />
        )}

        <textarea
          ref={assignTextareaRef}
          rows={rows}
          value={String(value || '')}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onScroll={handleScroll}
          placeholder={placeholder}
          disabled={disabled}
          data-ui={dataUi}
          className={className}
          style={textareaHighlightStyle}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>
    </div>
  )
}
