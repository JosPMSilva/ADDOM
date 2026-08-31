import React, { useRef, useState } from 'react'
import { getLocalizedInstructionsCatalog } from '../content/instructions-catalog-i18n.mjs'
import { useRendererFormattingLocale } from '../i18n/formatters.mjs'
import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'
import { useDialogFocusTrap } from './use-dialog-focus-trap.mjs'
import Icon from './ui/Icon.jsx'

export default function SettingsInstructionsModal({ onClose }) {
  const dialogRef = useRef(null)
  const topicRefs = useRef([])
  const { t } = useRendererTranslation(['core'])
  const locale = useRendererFormattingLocale()
  const catalog = getLocalizedInstructionsCatalog(locale)
  const [activeSectionId, setActiveSectionId] = useState(catalog.sections[0]?.id || '')
  const activeSection = catalog.sections.find((section) => section.id === activeSectionId)
    || catalog.sections[0]

  useDialogFocusTrap(true, dialogRef)

  const handleTopicKeyDown = (event, index) => {
    let nextIndex = null
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = (index + 1) % catalog.sections.length
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + catalog.sections.length) % catalog.sections.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = catalog.sections.length - 1
    }
    if (nextIndex === null) return
    event.preventDefault()
    setActiveSectionId(catalog.sections[nextIndex].id)
    topicRefs.current[nextIndex]?.focus()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 px-4 py-6 pointer-events-auto sm:px-6">
      <div className="absolute inset-0 z-0" onClick={onClose} />

      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-instructions-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose?.()
        }}
        className="relative z-10 flex max-h-[min(44rem,calc(100vh-3rem))] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-panel shadow-xl focus:outline-none"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-surface-border px-5 py-4">
          <div className="min-w-0">
            <h3 id="settings-instructions-title" className="text-base font-semibold tracking-tight text-text-primary">
              {catalog.title}
            </h3>
            <p className="mt-1 text-[11px] leading-4 text-text-secondary">
              {t('core:settings.instructions.guideSummary', {
                defaultValue: 'Quick reference for ADDOM workflows and controls.',
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-panel-alt hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title={t('core:common.close', { defaultValue: 'Close' })}
            aria-label={t('core:common.close', { defaultValue: 'Close' })}
          >
            <Icon name="x" size={16} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[13rem_minmax(0,1fr)] md:grid-rows-1">
          <nav
            role="tablist"
            aria-label={t('core:settings.instructions.topicsLabel', { defaultValue: 'Guide topics' })}
            className="flex min-w-0 gap-1 overflow-x-auto border-b border-surface-border p-2 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r"
          >
            {catalog.sections.map((section, index) => {
              const isActive = section.id === activeSection?.id
              return (
                <button
                  key={section.id}
                  ref={(element) => { topicRefs.current[index] = element }}
                  id={`settings-guide-tab-${section.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`settings-guide-panel-${section.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveSectionId(section.id)}
                  onKeyDown={(event) => handleTopicKeyDown(event, index)}
                  className={[
                    'shrink-0 rounded-md px-2.5 py-2 text-left text-xs leading-4 transition-colors md:w-full',
                    isActive
                      ? 'bg-surface-panel-alt font-medium text-text-primary'
                      : 'text-text-secondary hover:bg-surface-panel-alt/60 hover:text-text-primary',
                  ].join(' ')}
                >
                  {section.title}
                </button>
              )
            })}
          </nav>

          {activeSection ? (
            <section
              id={`settings-guide-panel-${activeSection.id}`}
              role="tabpanel"
              aria-labelledby={`settings-guide-tab-${activeSection.id}`}
              tabIndex={0}
              className="min-h-0 overflow-y-auto px-5 py-5 focus:outline-none sm:px-6"
            >
              <h4 className="text-sm font-semibold text-text-primary">{activeSection.title}</h4>
              <ul className="mt-3 divide-y divide-surface-border/55">
                {activeSection.items.map((item, index) => (
                  <li key={`${activeSection.id}-${index}`} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-text-muted" />
                    <span className="text-xs leading-5 text-text-secondary">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
