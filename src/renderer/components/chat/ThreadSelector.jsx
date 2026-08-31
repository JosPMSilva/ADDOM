import React from 'react'
import Icon from '../ui/Icon.jsx'
import { MenuSurface } from '../ui/MenuSurface.jsx'

export default function ThreadSelector({
  threads = [],
  activeThreadId,
  onSelect,
  onCreate,
  onRename,
  menuPlacement = 'bottom',
}) {
  const rows = Array.isArray(threads) ? threads : []
  const [menuOpen, setMenuOpen] = React.useState(false)
  const menuRef = React.useRef(null)
  const opensUpward = menuPlacement === 'top'

  React.useEffect(() => {
    if (!menuOpen) return undefined
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  React.useEffect(() => {
    setMenuOpen(false)
  }, [activeThreadId])

  const formatThreadDate = (thread) => {
    if (!thread || !(thread.createdAt > 0)) return ''
    return new Date(thread.createdAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  const getThreadTitle = (thread) => {
    if (!thread) return rows.length > 0 ? 'Thread' : 'No threads'
    return String(thread.title || '').trim() || formatThreadDate(thread) || 'Thread'
  }
  const formatThreadLabel = (thread) => {
    const title = getThreadTitle(thread)
    const dateLabel = formatThreadDate(thread)
    return dateLabel && title !== dateLabel ? `${title} - ${dateLabel}` : title
  }

  const activeThread = rows.find((thread) => thread.id === activeThreadId) || null
  const activeLabel = getThreadTitle(activeThread)
  const activeTitle = activeThread ? formatThreadLabel(activeThread) : 'No threads'

  return (
    <div data-ui="thread-selector" className="flex min-w-0 flex-wrap items-center gap-2">
      <div ref={menuRef} className="relative shrink-0 min-w-[11rem] max-w-56">
        <div className="inline-flex h-8 w-full items-stretch overflow-hidden rounded-lg border border-surface-border bg-surface-panel-alt transition-colors hover:border-border-hover focus-within:border-border-strong">
          <button
            onClick={onRename}
            disabled={!activeThreadId}
            aria-label={activeThreadId ? 'Rename thread' : 'Select a thread to rename'}
            title={activeThreadId ? 'Rename thread' : 'Select a thread to rename'}
            data-ui="thread-selector-rename"
            className="inline-flex h-full w-8 shrink-0 items-center justify-center border-r border-surface-border text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Icon name="pencil-simple" size={14} />
          </button>
          <button
            type="button"
            onClick={() => rows.length > 0 && setMenuOpen((value) => !value)}
            disabled={rows.length === 0}
            title={activeTitle}
            className="inline-flex h-full w-full min-w-0 flex-1 items-center justify-between gap-2 bg-transparent px-2.5 text-[12px] font-medium text-text-secondary transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            data-ui="thread-selector-toggle"
          >
            <span className="truncate text-left">{activeLabel}</span>
            <Icon name="caret-down" size={13} className={`shrink-0 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {menuOpen && rows.length > 0 && (
          <MenuSurface
            data-ui="thread-selector-menu"
            className={[
              'absolute left-0 right-0 z-30',
              opensUpward ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]',
            ].join(' ')}
          >
            <div className="max-h-56 overflow-y-auto pr-0.5" role="listbox" aria-label="Threads">
              {rows.map((thread) => {
                const selected = thread.id === activeThreadId
                const label = formatThreadLabel(thread)
                const title = getThreadTitle(thread)
                const dateLabel = formatThreadDate(thread)
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => {
                      onSelect?.(thread.id)
                      setMenuOpen(false)
                    }}
                    className={[
                      'grid min-h-7 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2 text-left text-[12px] transition-colors',
                      selected
                        ? 'border-border-strong bg-surface-panel-alt text-text-primary'
                        : 'border-transparent text-text-subtle hover:border-surface-border hover:bg-surface-panel-alt hover:text-text-primary',
                    ].join(' ')}
                    role="option"
                    aria-selected={selected}
                    title={label}
                    data-ui="thread-selector-option"
                  >
                    <span className="block min-w-0 truncate">{title}</span>
                    {dateLabel ? <span className="text-[10px] text-text-tertiary">{dateLabel}</span> : null}
                  </button>
                )
              })}
            </div>
          </MenuSurface>
        )}
      </div>
      <button
        onClick={onCreate}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-surface-border bg-surface-panel-alt px-2.5 text-[12px] font-medium text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
        title="New thread"
        data-ui="thread-selector-new"
      >
        <Icon name="plus" size={12} />
        <span>New</span>
      </button>
    </div>
  )
}
