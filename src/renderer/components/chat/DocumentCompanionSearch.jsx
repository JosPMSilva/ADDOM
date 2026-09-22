import React, { useEffect, useId, useRef, useState } from 'react'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'
import Icon from '../ui/Icon.jsx'
import {
  clearDocumentSearchHighlights,
  collectDocumentSearchRanges,
  moveDocumentSearchIndex,
  observeDocumentSearchChanges,
  renderDocumentSearchHighlights,
  revealDocumentSearchRange,
} from './document-companion-search.mjs'
import { resolveDocumentSearchPresentation } from './document-companion-toolbar-layout.mjs'

export default function DocumentCompanionSearch({ compact = false, content = '', contentRootRef, documentKey = '' }) {
  const { t } = useRendererTranslation(['core'])
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [matchCount, setMatchCount] = useState(0)
  const [focused, setFocused] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const rangesRef = useRef([])
  const inputRef = useRef(null)
  const triggerRef = useRef(null)
  const searchId = useId()

  useEffect(() => {
    setQuery('')
    setFocused(false)
    setExpanded(false)
  }, [documentKey])

  useEffect(() => {
    if (!compact) setExpanded(false)
  }, [compact])

  useEffect(() => {
    clearDocumentSearchHighlights()
    rangesRef.current = []
    setActiveIndex(-1)
    setMatchCount(0)
    if (!query.trim()) return undefined
    let refreshTimer = null
    const refreshMatches = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null
        const ranges = collectDocumentSearchRanges(contentRootRef?.current, query)
        rangesRef.current = ranges
        const nextIndex = ranges.length ? 0 : -1
        setMatchCount(ranges.length)
        setActiveIndex(nextIndex)
        renderDocumentSearchHighlights(ranges, nextIndex)
        if (nextIndex >= 0) revealDocumentSearchRange(ranges[nextIndex])
      })
    }
    refreshMatches()
    const stopObserving = observeDocumentSearchChanges(contentRootRef?.current, refreshMatches)
    return () => {
      stopObserving()
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      clearDocumentSearchHighlights()
    }
  }, [content, contentRootRef, query])

  useEffect(() => () => clearDocumentSearchHighlights(), [])

  const moveMatch = (direction) => {
    const nextIndex = moveDocumentSearchIndex(activeIndex, rangesRef.current.length, direction)
    setActiveIndex(nextIndex)
    renderDocumentSearchHighlights(rangesRef.current, nextIndex)
    if (nextIndex >= 0) revealDocumentSearchRange(rangesRef.current[nextIndex])
  }

  const resultLabel = query
    ? matchCount > 0
      ? t('core:terminal.viewport.search.resultCount', {
          current: activeIndex + 1,
          total: matchCount,
          defaultValue: '{{current}}/{{total}}',
        })
      : t('core:terminal.viewport.search.noMatches', { defaultValue: 'No matches' })
    : ''

  const presentation = resolveDocumentSearchPresentation({
    compact,
    focused: focused || expanded,
    query,
  })
  const searchLabel = t('core:companionDock.document.search', { defaultValue: 'Search document' })

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-ui="document-companion-search-trigger"
        hidden={presentation !== 'button'}
        aria-controls={searchId}
        aria-expanded={false}
        aria-label={searchLabel}
        title={searchLabel}
        onClick={() => {
          setExpanded(true)
          window.requestAnimationFrame(() => inputRef.current?.focus())
        }}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-tertiary outline-none transition-colors hover:bg-surface-panel hover:text-text-primary focus-visible:ring-1 focus-visible:ring-border-strong"
      >
        <Icon name="magnifying-glass" size={14} />
      </button>
      <div
        id={searchId}
        data-ui="document-companion-search"
        data-presentation={presentation}
        hidden={presentation === 'button'}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return
          setFocused(false)
          if (!query) setExpanded(false)
        }}
        className={[
          'flex h-7 min-w-0 flex-1 items-center rounded-md border border-surface-border bg-surface-panel-alt focus-within:border-border-strong',
          presentation === 'overlay'
            ? 'absolute inset-x-3 top-1 z-30 max-w-none'
            : 'max-w-[300px]',
        ].join(' ')}
      >
        <Icon name="magnifying-glass" size={13} className="ml-2 shrink-0 text-text-muted" />
        <input
          ref={inputRef}
          data-ui="document-companion-search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && query) {
              event.preventDefault()
              moveMatch(event.shiftKey ? -1 : 1)
            } else if (event.key === 'Escape' && query) {
              event.preventDefault()
              setQuery('')
            } else if (event.key === 'Escape' && compact) {
              event.preventDefault()
              setExpanded(false)
              setFocused(false)
              window.requestAnimationFrame(() => triggerRef.current?.focus())
            }
          }}
          aria-label={searchLabel}
          placeholder={searchLabel}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-xs text-text-primary outline-none placeholder:text-text-muted"
        />
        {query ? (
          <>
            <span className="max-w-16 shrink-0 truncate px-1 text-[10px] tabular-nums text-text-muted" aria-live="polite">
              {resultLabel}
            </span>
            <button
              type="button"
              onClick={() => moveMatch(-1)}
              disabled={!matchCount}
              aria-label={t('core:terminal.viewport.search.previous', { defaultValue: 'Previous match' })}
              title={t('core:terminal.viewport.search.previous', { defaultValue: 'Previous match' })}
              className="flex size-6 shrink-0 items-center justify-center text-text-tertiary outline-none hover:text-text-primary focus-visible:text-text-primary disabled:opacity-35"
            >
              <Icon name="caret-up" size={12} />
            </button>
            <button
              type="button"
              onClick={() => moveMatch(1)}
              disabled={!matchCount}
              aria-label={t('core:terminal.viewport.search.next', { defaultValue: 'Next match' })}
              title={t('core:terminal.viewport.search.next', { defaultValue: 'Next match' })}
              className="mr-0.5 flex size-6 shrink-0 items-center justify-center text-text-tertiary outline-none hover:text-text-primary focus-visible:text-text-primary disabled:opacity-35"
            >
              <Icon name="caret-down" size={12} />
            </button>
          </>
        ) : null}
      </div>
    </>
  )
}
