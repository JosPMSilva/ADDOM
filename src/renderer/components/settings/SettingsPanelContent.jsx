import React from 'react'
import {
  SettingsNavTree,
  SettingsPreferenceGroup,
} from './SettingsPanelLayout.jsx'
import { resolveSettingsDetailView } from './settings-panel-detail-view.mjs'

function SettingsPanelContent({
  groups = [],
  categoriesById = {},
  activeCategory = null,
  activeSections = [],
  onSelectCategory = () => {},
}) {
  const [detailViewId, setDetailViewId] = React.useState('')
  const detailTriggerRef = React.useRef(null)
  const detailTriggerKeyRef = React.useRef('')
  const shouldRestoreDetailFocusRef = React.useRef(false)

  React.useEffect(() => {
    setDetailViewId('')
    detailTriggerRef.current = null
    detailTriggerKeyRef.current = ''
    shouldRestoreDetailFocusRef.current = false
  }, [activeCategory?.id])

  React.useEffect(() => {
    if (detailViewId || !shouldRestoreDetailFocusRef.current) return undefined
    shouldRestoreDetailFocusRef.current = false
    const timerId = window.setTimeout(() => {
      const triggerKey = detailTriggerKeyRef.current
      const trigger = triggerKey
        ? document.querySelector(`[data-ui="${triggerKey}"]`)
        : detailTriggerRef.current
      trigger?.focus()
      detailTriggerRef.current = null
      detailTriggerKeyRef.current = ''
    })
    return () => window.clearTimeout(timerId)
  }, [detailViewId])

  const activeDetailView = React.useMemo(
    () => resolveSettingsDetailView(activeSections, detailViewId),
    [activeSections, detailViewId],
  )
  const openDetailView = React.useCallback((viewId, trigger = null) => {
    detailTriggerRef.current = typeof trigger === 'string' ? null : trigger
    detailTriggerKeyRef.current = typeof trigger === 'string'
      ? trigger
      : String(trigger?.dataset?.ui || '')
    shouldRestoreDetailFocusRef.current = false
    setDetailViewId(String(viewId || '').trim())
  }, [])
  const closeDetailView = React.useCallback(() => {
    shouldRestoreDetailFocusRef.current = true
    setDetailViewId('')
  }, [])

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[12rem_minmax(0,1fr)] lg:grid-rows-1">
        <div className="min-h-0 overflow-x-auto border-b border-surface-border/60 px-3 py-2 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-2.5 lg:py-3">
          <SettingsNavTree
            groups={groups}
            categoriesById={categoriesById}
            activeCategoryId={activeCategory?.id}
            onSelectCategory={onSelectCategory}
          />
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          {activeDetailView ? activeDetailView.render({ closeDetailView }) : null}
          {activeCategory ? (
            <div className="mx-auto max-w-[52rem]" hidden={Boolean(activeDetailView)}>
              <div className="pb-5">
                <h3 className="text-base font-semibold text-text-primary">
                  {activeCategory.label}
                </h3>
                {activeCategory.description ? (
                  <p className="mt-1 text-xs leading-5 text-text-secondary">{activeCategory.description}</p>
                ) : null}
              </div>

              <div className="pb-10">
                {activeSections.map((section) => {
                  const compositeKey = `${activeCategory.id}:${section.id}`
                  return (
                    <SettingsPreferenceGroup
                      key={compositeKey}
                      sectionKey={compositeKey}
                      title={section.title}
                      summary={section.summary}
                      renderContent={section.render}
                      openDetailView={openDetailView}
                      showHeading={activeSections.length > 1}
                    />
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const MemoSettingsPanelContent = React.memo(SettingsPanelContent)
MemoSettingsPanelContent.displayName = 'MemoSettingsPanelContent'

export { SettingsPanelContent }
export default MemoSettingsPanelContent
