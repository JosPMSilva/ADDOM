import React from 'react'

import {
  getBrowserSectionLabel,
  getDockPanelDomId,
  getDockTabDomId,
  getPriorityClasses,
  getPriorityIcon,
  getTabPriority,
  getTabStateLabel,
} from './chat-terminal-dock-utils.mjs'
import Icon from '../ui/Icon.jsx'

export default function ChatTerminalDockTitleArea({
  browserOpen = false,
  browserSection = 'current_thread',
  labels = {},
  selectedTab = null,
  showTabs = false,
  tabs = [],
  resolvedSelectedTabId = '',
  selectedIdentityLabel = '',
  selectedIdentityDetail = '',
  onSelectTab = null,
}) {
  const tabButtonRefs = React.useRef(new Map())

  const handleTabKeyDown = React.useCallback((event, currentIndex) => {
    if (!Array.isArray(tabs) || tabs.length <= 1) return
    let nextIndex = -1
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabs.length - 1
    if (nextIndex < 0) return
    event.preventDefault()
    const nextTab = tabs[nextIndex]
    if (!nextTab) return
    onSelectTab?.(nextTab)
    queueMicrotask(() => {
      tabButtonRefs.current.get(nextTab.id)?.focus?.()
    })
  }, [onSelectTab, tabs])

  if (browserOpen || !selectedTab) {
    return (
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium leading-tight text-text-primary">{labels.browserTitle}</p>
        <p className="mt-0.5 truncate text-[11px] leading-snug text-text-tertiary">
          {browserOpen
            ? getBrowserSectionLabel(browserSection, { labels })
            : labels.browserSubtitle}
        </p>
      </div>
    )
  }

  return (
    <div className={showTabs ? 'min-w-0 flex-1 overflow-x-auto scrollbar-none' : 'min-w-0 flex-1'}>
      {showTabs ? (
        <div className="flex min-w-max items-center gap-1" role="tablist" aria-label={labels.tablistAriaLabel}>
          {tabs.map((tab) => {
            const active = tab.id === resolvedSelectedTabId
            const tabStateLabel = getTabStateLabel(tab, { labels })
            const tabPriority = getTabPriority(tab)
            const showTabStateBadge = tab.kind === 'pending' || tabPriority === 'failed'
            const panelId = getDockPanelDomId(tab.id)
            return (
              <button
                key={tab.key}
                type="button"
                id={getDockTabDomId(tab.id)}
                role="tab"
                aria-selected={active}
                aria-controls={panelId}
                tabIndex={active ? 0 : -1}
                onClick={() => onSelectTab?.(tab)}
                onKeyDown={(event) => handleTabKeyDown(event, tabs.indexOf(tab))}
                ref={(element) => {
                  if (element) tabButtonRefs.current.set(tab.id, element)
                  else tabButtonRefs.current.delete(tab.id)
                }}
                className={[
                  'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors',
                  active
                    ? 'bg-surface-panel-alt text-text-primary'
                    : 'bg-transparent text-text-tertiary hover:bg-surface-panel-alt/70 hover:text-text-primary',
                ].join(' ')}
              >
                <span className="max-w-[12rem] truncate">{tab.label}</span>
                {tab.kind === 'session' && tab.session?.hasUnreadOutput === true && (
                  <span className="rounded px-1.5 py-px text-[10px] text-text-secondary">
                    {labels.unread}
                  </span>
                )}
                {showTabStateBadge && (
                  <span
                    className={['inline-flex items-center justify-center rounded p-0.5', getPriorityClasses(tabPriority)].join(' ')}
                    title={tabStateLabel}
                  >
                    <Icon name={getPriorityIcon(tabPriority)} className="text-[12px]" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="min-w-0">
          <p className="truncate text-xs font-medium leading-tight text-text-primary">{selectedIdentityLabel}</p>
          {selectedIdentityDetail && (
            <p className="mt-0.5 truncate text-[11px] leading-snug text-text-tertiary">{selectedIdentityDetail}</p>
          )}
        </div>
      )}
    </div>
  )
}
