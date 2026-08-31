import React from 'react'

function SlashCommandMenu({
  open = false,
  items = [],
  selectedIndex = 0,
  listId = 'chat-composer-slash-menu-listbox',
  extraWidthPx = 0,
  onSelect = () => {},
  onHighlight = () => {},
}) {
  const listRef = React.useRef(null)

  React.useEffect(() => {
    if (!open) return
    const listNode = listRef.current
    if (!listNode) return
    const optionNode = listNode.querySelector(`[data-slash-item-index="${selectedIndex}"]`)
    if (optionNode && typeof optionNode.scrollIntoView === 'function') {
      optionNode.scrollIntoView({ block: 'nearest' })
    }
  }, [open, selectedIndex, items])

  if (!open || !Array.isArray(items) || items.length === 0) return null

  const resolvedExtraWidthPx = Math.max(0, Math.round(Number(extraWidthPx) || 0))

  return (
    <div
      className="absolute left-0 bottom-[calc(100%+8px)] z-40"
      style={{
        width: resolvedExtraWidthPx > 0
          ? `calc(100% + ${resolvedExtraWidthPx}px)`
          : '100%',
      }}
      data-ui="chat-composer-slash-menu"
    >
      <div className="rounded-lg border border-surface-border bg-surface-panel p-1 shadow-[0_18px_40px_rgb(var(--theme-shadow-rgb)_/_0.24)]">
        <div
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label="Slash commands"
          data-ui="chat-composer-slash-menu-list"
          className="max-h-56 overflow-y-auto scrollbar-thin"
        >
          <div className="flex flex-col gap-0.5">
            {items.map((item, index) => {
              const selected = index === selectedIndex
              const optionId = `${listId}-option-${item.id}`
              const detailId = `${optionId}-details`
              const detailText = [item.description, item.example].filter(Boolean).join(' ')
              return (
                <button
                  key={item.id}
                  id={optionId}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  aria-describedby={detailText ? detailId : undefined}
                  title={detailText || item.label}
                  data-slash-item-index={index}
                  data-ui="chat-composer-slash-menu-item"
                  onMouseEnter={() => onHighlight(index)}
                  onMouseDown={(event) => {
                    event.preventDefault()
                  }}
                  onClick={() => onSelect(item)}
                  className={[
                    'group w-full rounded-md px-2 py-1.5 text-left transition-colors',
                    selected
                      ? 'bg-surface-panel-alt text-text-primary'
                      : 'text-text-secondary hover:bg-surface-panel-alt hover:text-text-primary',
                  ].join(' ')}
                >
                  <div className="flex min-h-6 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{item.label}</span>
                    <span className="shrink-0 truncate text-[10px] text-text-tertiary">{item.category}</span>
                    <span className={`shrink-0 text-[10px] ${selected ? 'text-accent-soft' : 'text-text-tertiary opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>
                      Enter
                    </span>
                  </div>
                  {detailText ? (
                    <span id={detailId} className="sr-only">{detailText}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

const MemoSlashCommandMenu = React.memo(SlashCommandMenu)
MemoSlashCommandMenu.displayName = 'MemoSlashCommandMenu'

export { SlashCommandMenu, MemoSlashCommandMenu }
export default MemoSlashCommandMenu
