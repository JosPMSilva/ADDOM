import React from 'react'
import CopyBlockButton from './CopyBlockButton.jsx'
import {
  CHAT_SNIPPET_MAX_HIGHLIGHT_CHARS,
  CHAT_SNIPPET_MAX_HIGHLIGHT_LINES,
  getBlockRenderMetrics,
} from './code-block-rendering.mjs'
import { highlightCode } from './composer-highlight.mjs'
import { useHighlightTheme } from './highlight-theme-loader.mjs'

const HIGHLIGHT_HTML_CACHE_LIMIT = 200
const HORIZONTAL_SCROLL_STEP = 56
const EDGE_VISIBILITY_EPSILON = 2
const TERMINAL_TRANSCRIPT_LANGUAGES = new Set([
  'terminal',
  'console',
  'shell-session',
  'session',
])
const highlightHtmlCache = new Map()

function isTerminalTranscriptLanguage(language = '') {
  return TERMINAL_TRANSCRIPT_LANGUAGES.has(String(language || '').trim().toLowerCase())
}

function getCachedHighlightedHtml(content, language) {
  const cacheKey = `${String(language || 'text').toLowerCase()}\u0000${String(content ?? '')}`
  if (highlightHtmlCache.has(cacheKey)) {
    const cached = highlightHtmlCache.get(cacheKey)
    highlightHtmlCache.delete(cacheKey)
    highlightHtmlCache.set(cacheKey, cached)
    return cached
  }
  const highlightedHtml = highlightCode(content, language)
  highlightHtmlCache.set(cacheKey, highlightedHtml)
  if (highlightHtmlCache.size > HIGHLIGHT_HTML_CACHE_LIMIT) {
    const oldestKey = highlightHtmlCache.keys().next().value
    if (oldestKey) highlightHtmlCache.delete(oldestKey)
  }
  return highlightedHtml
}

function CodeSnippetBlock({
  text,
  language = 'text',
}) {
  const viewportRef = React.useRef(null)
  const [viewportState, setViewportState] = React.useState({
    hasOverflow: false,
    showLeftFade: false,
    showRightFade: false,
  })
  const { content, highlightEnabled, displayLineCount } = getBlockRenderMetrics(text, {
    maxChars: CHAT_SNIPPET_MAX_HIGHLIGHT_CHARS,
    maxLines: CHAT_SNIPPET_MAX_HIGHLIGHT_LINES,
  })
  const label = String(language || 'text').toLowerCase()
  const isCompactLayout = displayLineCount <= 1
  const isSingleLine = isCompactLayout
  const isTerminalTranscript = isTerminalTranscriptLanguage(label)
  const highlightedHtml = React.useMemo(
    () => (highlightEnabled && !isTerminalTranscript ? getCachedHighlightedHtml(content, label) : ''),
    [highlightEnabled, isTerminalTranscript, content, label],
  )
  const canRenderHighlighted = !isTerminalTranscript && highlightEnabled && highlightedHtml.length > 0
  useHighlightTheme(canRenderHighlighted)

  const syncViewportState = React.useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    const nextState = {
      hasOverflow: maxScrollLeft > EDGE_VISIBILITY_EPSILON,
      showLeftFade: viewport.scrollLeft > EDGE_VISIBILITY_EPSILON,
      showRightFade: (maxScrollLeft - viewport.scrollLeft) > EDGE_VISIBILITY_EPSILON,
    }

    setViewportState((current) => (
      current.hasOverflow === nextState.hasOverflow
      && current.showLeftFade === nextState.showLeftFade
      && current.showRightFade === nextState.showRightFade
        ? current
        : nextState
    ))
  }, [])

  React.useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return undefined

    const handleScroll = () => syncViewportState()
    const rafId = window.requestAnimationFrame(() => syncViewportState())

    viewport.addEventListener('scroll', handleScroll, { passive: true })

    let resizeObserver = null
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => syncViewportState())
      resizeObserver.observe(viewport)
      if (viewport.firstElementChild) resizeObserver.observe(viewport.firstElementChild)
    }

    window.addEventListener('resize', syncViewportState)

    return () => {
      window.cancelAnimationFrame(rafId)
      viewport.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', syncViewportState)
      resizeObserver?.disconnect()
    }
  }, [content, highlightedHtml, syncViewportState])

  const handleViewportKeyDown = React.useCallback((event) => {
    const viewport = viewportRef.current
    if (!viewport || event.altKey || event.ctrlKey || event.metaKey) return

    const pageStep = Math.max(120, viewport.clientWidth - 64)
    let left = null

    switch (event.key) {
      case 'ArrowLeft':
        left = viewport.scrollLeft - HORIZONTAL_SCROLL_STEP
        break
      case 'ArrowRight':
        left = viewport.scrollLeft + HORIZONTAL_SCROLL_STEP
        break
      case 'PageUp':
        left = viewport.scrollLeft - pageStep
        break
      case 'PageDown':
        left = viewport.scrollLeft + pageStep
        break
      case 'Home':
        left = 0
        break
      case 'End':
        left = viewport.scrollWidth
        break
      default:
        break
    }

    if (left === null) return

    event.preventDefault()
    viewport.scrollTo({
      left,
      behavior: 'smooth',
    })
  }, [])

  return (
    <div
      className={[
        'group/code-snippet flex flex-col gap-1',
        isCompactLayout ? 'w-fit max-w-full self-start' : 'w-full',
      ].join(' ')}
      data-chat-render="code-block"
      data-chat-code-layout={isCompactLayout ? 'compact' : 'panel'}
    >
      <div className="flex w-full items-center gap-2 pt-0.5">
        <div className="chat-typo-code-label flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span>{label}</span>
          {displayLineCount > 0 ? (
            <span aria-hidden="true">·</span>
          ) : null}
          {displayLineCount > 0 ? (
            <span>
              {displayLineCount} line{displayLineCount === 1 ? '' : 's'}
            </span>
          ) : null}
          {!canRenderHighlighted && (
            <span className="text-text-muted">plain</span>
          )}
        </div>
        <CopyBlockButton
          text={content}
          variant="ghost"
          className="ml-auto md:opacity-0 md:group-hover/code-snippet:opacity-100 md:group-focus-within/code-snippet:opacity-100 md:transition-opacity"
        />
      </div>
      <div
        className={[
          'relative overflow-hidden rounded-md border shadow-[inset_0_1px_0_rgb(var(--theme-highlight-rgb)_/_0.025)]',
          isTerminalTranscript
            ? 'border-surface-border/60 bg-surface'
            : 'border-surface-border/50 bg-surface-panel-alt/80',
        ].join(' ')}
        data-chat-code-kind={isTerminalTranscript ? 'terminal' : 'code'}
      >
        <div
          ref={viewportRef}
          tabIndex={0}
          role="region"
          aria-label={`${label} ${isTerminalTranscript ? 'terminal output' : 'code snippet'}`}
          className={`chat-code-viewport max-h-72 overflow-auto ${isSingleLine ? 'px-2 py-0.5' : 'px-2.5 py-1.5'} transition-[box-shadow,border-color] duration-200`}
          data-chat-code-viewport="true"
          data-chat-code-single-line={isSingleLine ? 'true' : 'false'}
          data-chat-code-overflow={viewportState.hasOverflow ? 'true' : 'false'}
          onKeyDown={handleViewportKeyDown}
        >
            <pre className={`m-0 w-max leading-none${isCompactLayout ? '' : ' min-w-full'}`}>
              {canRenderHighlighted ? (
                <code
                  className={`chat-typo-code-body hljs block whitespace-pre text-text-primary language-${label}`}
                  style={{ background: 'transparent' }}
                  data-highlight="on"
                  dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                />
              ) : (
                <code
                  className={[
                    'chat-typo-code-body block whitespace-pre',
                    isTerminalTranscript ? 'text-text-secondary' : 'text-text-primary',
                    `language-${label}`,
                  ].join(' ')}
                  data-highlight="off"
                >
                  {content}
                </code>
              )}
            </pre>
        </div>
        <div
          aria-hidden="true"
          className={[
            'pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r to-transparent transition-opacity duration-200',
            isTerminalTranscript ? 'from-surface via-surface/82' : 'from-surface-panel-alt via-surface-panel-alt/82',
            viewportState.showLeftFade ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        />
        <div
          aria-hidden="true"
          className={[
            'pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l to-transparent transition-opacity duration-200',
            isTerminalTranscript ? 'from-surface via-surface/88' : 'from-surface-panel-alt via-surface-panel-alt/88',
            viewportState.showRightFade ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        />
      </div>
    </div>
  )
}

export default React.memo(
  CodeSnippetBlock,
  (prev, next) => (
    prev.text === next.text
    && prev.language === next.language
  ),
)
