import React from 'react'

function asNonNegativeInteger(value = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0
}

function getSearchStatusLabel(result = {}, labels = {}) {
  const resultCount = asNonNegativeInteger(result?.resultCount)
  const resultIndex = Number(result?.resultIndex)
  if (!resultCount) return labels.searchNoMatches || 'No matches'
  const current = Number.isFinite(resultIndex) && resultIndex >= 0
    ? resultIndex + 1
    : 1
  const template = labels.searchResultCount || '{{current}}/{{total}}'
  return template
    .replace('{{current}}', String(current))
    .replace('{{total}}', String(resultCount))
}

export default function TerminalSearchBar({
  query = '',
  result = null,
  labels = {},
  onQueryChange = null,
  onNext = null,
  onPrevious = null,
  onClose = null,
}) {
  const inputRef = React.useRef(null)

  React.useEffect(() => {
    inputRef.current?.focus?.()
    inputRef.current?.select?.()
  }, [])

  const stopPointerPropagation = React.useCallback((event) => {
    event.stopPropagation()
  }, [])

  return (
    <div
      className="absolute right-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-lg border border-surface-border bg-surface-panel-muted-strong/95 p-1 shadow-[0_14px_34px_rgb(var(--theme-shadow-rgb)_/_0.38)] backdrop-blur"
      data-ui="terminal-search-bar"
      onMouseDown={stopPointerPropagation}
      onPointerDown={stopPointerPropagation}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => onQueryChange?.(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose?.()
            return
          }
          if (event.key === 'Enter' && event.shiftKey) {
            event.preventDefault()
            onPrevious?.()
            return
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            onNext?.()
          }
        }}
        className="h-8 w-56 max-w-[42vw] rounded-md border border-surface-border bg-surface-panel px-2 text-[12px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-accent/60"
        placeholder={labels.searchPlaceholder || 'Search terminal output'}
        aria-label={labels.searchPlaceholder || 'Search terminal output'}
      />
      <span className="min-w-12 px-1 text-center text-[11px] text-text-tertiary" data-ui="terminal-search-result-count">
        {getSearchStatusLabel(result, labels)}
      </span>
      <button
        type="button"
        onClick={() => onPrevious?.()}
        className="flex h-8 w-8 items-center justify-center rounded-md text-[13px] text-text-secondary hover:bg-surface-panel hover:text-text-primary"
        aria-label={labels.searchPrevious || 'Previous match'}
        title={labels.searchPrevious || 'Previous match'}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5">
          <path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onNext?.()}
        className="flex h-8 w-8 items-center justify-center rounded-md text-[13px] text-text-secondary hover:bg-surface-panel hover:text-text-primary"
        aria-label={labels.searchNext || 'Next match'}
        title={labels.searchNext || 'Next match'}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onClose?.()}
        className="flex h-8 w-8 items-center justify-center rounded-md text-[13px] text-text-secondary hover:bg-surface-panel hover:text-text-primary"
        aria-label={labels.searchClose || 'Close search'}
        title={labels.searchClose || 'Close search'}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5">
          <path d="M5 5l6 6M11 5l-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
