import React from 'react'
import { SettingsSectionHeaderContext } from './settings-section-context.mjs'
import Icon from '../ui/Icon.jsx'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'

const NAV_GROUP_ICONS = Object.freeze({
  general: 'sliders-horizontal',
  appearance: 'paint-brush',
  terminal: 'terminal-window',
  agents: 'users-three',
  providers: 'plugs-connected',
  safety: 'shield-check',
  data: 'database',
})

export function SettingsNavTree({
  groups,
  categoriesById,
  activeCategoryId,
  onSelectCategory,
}) {
  const t = useSettingsTranslator(['settings', 'core'])
  return (
    <nav
      aria-label={t('core:settings.navigationTitle', { defaultValue: 'Settings navigation' })}
      className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col lg:gap-0.5"
      data-ui="settings-nav"
    >
      {groups.map((group) => {
        const category = categoriesById[group.categoryIds?.[0]]
        if (!category) return null
        const isActive = activeCategoryId === category.id
        return (
          <button
            key={group.id}
            type="button"
            onClick={() => onSelectCategory(category.id)}
            className={[
              'flex h-8 w-auto shrink-0 items-center gap-2 rounded-md px-2.5 text-left text-[13px] transition-colors lg:w-full lg:gap-2.5',
              isActive
                ? 'bg-surface-panel-alt font-medium text-text-primary'
                : 'text-text-secondary hover:bg-surface-panel/70 hover:text-text-primary',
            ].join(' ')}
            aria-current={isActive ? 'page' : undefined}
            data-ui="settings-nav-item"
          >
            <Icon
              name={NAV_GROUP_ICONS[group.id] || 'gear-six'}
              className={['text-[15px]', isActive ? 'text-text-secondary' : 'text-text-muted'].join(' ')}
            />
            <span className="min-w-0 truncate">{group.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

export function SettingsPreferenceGroup({
  sectionKey,
  title,
  summary,
  renderContent,
  openDetailView = () => {},
  showHeading = true,
}) {
  return (
    <section
      id={sectionKey}
      className="py-4 first:pt-0"
      data-ui="settings-preference-group"
    >
      {showHeading ? <div className="mb-2 px-1">
        <h4 className="text-[13px] font-semibold text-text-primary">{title}</h4>
        {summary ? <p className="mt-0.5 text-xs leading-5 text-text-secondary">{summary}</p> : null}
      </div> : null}
      <div
        className="overflow-hidden rounded-lg bg-surface-panel/55 px-3"
        data-ui="settings-preference-surface"
      >
        <SettingsSectionHeaderContext.Provider value={false}>
          {typeof renderContent === 'function' ? renderContent({ openDetailView }) : null}
        </SettingsSectionHeaderContext.Provider>
      </div>
    </section>
  )
}
