import React, { useEffect, useRef, useState } from 'react'
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

export default function DocumentCompanionSearch({ content = '', contentRootRef, documentKey = '' }) {
  const { t } = useRendererTranslation(['core'])
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [matchCount, setMatchCount] = useState(0)
  const rangesRef = useRef([])

  useEffect(() => setQuery(''), [documentKey])

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

  return (
    <div
      data-ui="document-companion-search"
      className="flex h-7 min-w-0 max-w-[300px] flex-1 items-center rounded-md border border-surface-border bg-surface-panel-alt focus-within:border-border-strong"
    >
      <Icon name="magnifying-glass" size={13} className="ml-2 shrink-0 text-text-muted" />
      <input
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
          }
        }}
        aria-label={t('core:companionDock.document.search', { defaultValue: 'Search document' })}
        placeholder={t('core:companionDock.document.search', { defaultValue: 'Search document' })}
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
  )
}
