import React, { startTransition } from 'react'
import useAppStore from '../store/useAppStore.js'
import Icon from './ui/Icon.jsx'
import { useShallow } from 'zustand/react/shallow'
import {
  loadArtifactsPanel,
  loadEditorPanel,
  loadMemoryPanel,
  loadSettingsPanel,
} from '../workspace-panel-loaders.mjs'

const NAV_ITEMS = [
  {
    id: 'chat',
    label: 'Chat',
    icon: <Icon name="chat-circle" className="text-[18px]" />,
  },
  {
    id: 'editor',
    label: 'Editor',
    icon: <Icon name="code" className="text-[18px]" />,
  },
  {
    id: 'artifacts',
    label: 'Artifacts',
    icon: <Icon name="stack" className="text-[18px]" />,
  },
  {
    id: 'memory',
    label: 'Memory',
    icon: <Icon name="book-open" className="text-[18px]" />,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: <Icon name="gear" className="text-[18px]" />,
  },
]

const PRIMARY_NAV_ITEMS = NAV_ITEMS.filter((item) => item.id !== 'settings')
const SETTINGS_ITEM = NAV_ITEMS.find((item) => item.id === 'settings')

const PANEL_PRELOADERS = Object.freeze({
  editor: loadEditorPanel,
  artifacts: loadArtifactsPanel,
  memory: loadMemoryPanel,
  settings: loadSettingsPanel,
})

export default function Sidebar() {
  const { activePanel, setActivePanel, sidebarCollapsed, toggleSidebar } = useAppStore(useShallow((s) => ({
    activePanel: s.activePanel,
    setActivePanel: s.setActivePanel,
    sidebarCollapsed: s.sidebarCollapsed,
    toggleSidebar: s.toggleSidebar,
  })))

  const prewarmPanel = React.useCallback((panelId) => {
    const preloader = PANEL_PRELOADERS[String(panelId || '').trim()]
    if (typeof preloader === 'function') {
      void preloader()
    }
  }, [])

  return (
    <aside
      className="flex flex-col bg-surface shrink-0 border-r border-surface-border panel-slide select-none"
      style={{
        width: sidebarCollapsed
          ? 'var(--app-sidebar-collapsed-width)'
          : 'var(--app-sidebar-expanded-width)',
        minWidth: sidebarCollapsed
          ? 'var(--app-sidebar-collapsed-width)'
          : 'var(--app-sidebar-expanded-width)',
        maxWidth: sidebarCollapsed
          ? 'var(--app-sidebar-collapsed-width)'
          : 'var(--app-sidebar-expanded-width)',
      }}
    >
      <nav className="mt-2 flex flex-col gap-1 p-2">
        {PRIMARY_NAV_ITEMS.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            active={activePanel === item.id}
            collapsed={sidebarCollapsed}
            onClick={() => {
              startTransition(() => {
                setActivePanel(item.id)
              })
            }}
            onPrewarm={() => prewarmPanel(item.id)}
          />
        ))}
      </nav>

      <button
        type="button"
        data-ui="sidebar-whitespace-toggle"
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        style={{ outline: 'none' }}
        className="relative mx-2 min-h-8 flex-1 cursor-pointer bg-transparent outline-none after:absolute after:-right-2 after:inset-y-0 after:w-px after:bg-transparent after:transition-colors after:duration-100 hover:after:bg-surface-border/60 focus-visible:after:bg-border-strong"
      />

      <nav className="flex flex-col gap-1 p-2 pt-0">
        <NavItem
          item={SETTINGS_ITEM}
          active={activePanel === SETTINGS_ITEM.id}
          collapsed={sidebarCollapsed}
          onClick={() => {
            startTransition(() => {
              setActivePanel(SETTINGS_ITEM.id)
            })
          }}
          onPrewarm={() => prewarmPanel(SETTINGS_ITEM.id)}
        />
      </nav>
    </aside>
  )
}

/* ── Sub-components ───────────────────────────────────────────────────────── */

function NavItem({ item, active, collapsed, onClick, onPrewarm }) {
  return (
    <button
      onClick={onClick}
      onPointerEnter={onPrewarm}
      onFocus={onPrewarm}
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
      className={[
        'group flex items-center w-full rounded-md transition-all duration-200',
        collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
        active
          ? 'text-accent'
          : 'text-text-secondary hover:text-text-primary',
      ].join(' ')}
    >
      <span className={[
        'shrink-0 flex items-center justify-center transition-all duration-300',
        active ? 'text-accent' : 'text-text-muted group-hover:text-text-primary',
        collapsed ? 'group-hover:scale-110' : 'group-hover:translate-x-0.5'
      ].join(' ')}>
        {React.cloneElement(item.icon, { weight: active ? 'fill' : 'regular' })}
      </span>
      {!collapsed && (
        <span className={[
          'text-[13px] font-semibold font-display tracking-tight transition-transform duration-300',
          'group-hover:translate-x-0.5'
        ].join(' ')}>
          {item.label}
        </span>
      )}
    </button>
  )
}

/* ── Icons ────────────────────────────────────────────────────────────────── */
