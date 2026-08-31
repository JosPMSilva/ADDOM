import React from 'react'
import { normalizeAppearanceSettings } from '../../../common/ui/appearance-settings.mjs'
import FieldRow from '../ui/FieldRow.jsx'
import Icon from '../ui/Icon.jsx'
import SettingsSection from './SettingsSection.jsx'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'

const APPEARANCE_OPTIONS = Object.freeze([
  { id: 'dark', icon: 'moon' },
  { id: 'light', icon: 'sun' },
  { id: 'system', icon: 'desktop' },
])

const MODE_LABELS = Object.freeze({ dark: 'Dark', light: 'Light', system: 'System' })

export default function SettingsAppearanceModeBlock({
  appearanceSettings = null,
  resolvedAppearance = 'dark',
  onAppearanceModeChange = () => {},
}) {
  const t = useSettingsTranslator(['settings'])
  const normalized = normalizeAppearanceSettings(appearanceSettings)
  const selectedLabel = t(`settings:blocks.appearanceMode.modes.${normalized.mode}`, {
    defaultValue: MODE_LABELS[normalized.mode],
  })
  const resolvedLabel = t(`settings:blocks.appearanceMode.modes.${resolvedAppearance}`, {
    defaultValue: MODE_LABELS[resolvedAppearance] || MODE_LABELS.dark,
  })

  return (
    <SettingsSection
      title={(
        <>
          <Icon name="paint-brush" className="text-accent" size={18} weight="fill" />
          {' '}
          {t('settings:sections.general.appearanceMode.title', { defaultValue: 'Theme' })}
        </>
      )}
      description={t('settings:blocks.appearanceMode.description', {
        defaultValue: 'Choose a light or dark interface, or follow your system setting.',
      })}
    >
      <FieldRow
        label={t('settings:blocks.appearanceMode.mode', { defaultValue: 'Color theme' })}
        description={t('settings:blocks.appearanceMode.modeDescription', {
          defaultValue: 'Updates the entire app, including editors and terminals.',
        })}
        status={normalized.mode === 'system'
          ? t('settings:blocks.appearanceMode.systemResolved', {
              defaultValue: 'System currently uses {{name}}.',
              name: resolvedLabel,
            })
          : t('settings:blocks.appearanceMode.selected', {
              defaultValue: 'Selected {{name}}',
              name: selectedLabel,
            })}
      >
        <div className="grid grid-cols-3 gap-2" role="radiogroup" data-ui="appearance-mode-picker">
          {APPEARANCE_OPTIONS.map((option) => {
            const selected = normalized.mode === option.id
            const label = t(`settings:blocks.appearanceMode.modes.${option.id}`, {
              defaultValue: MODE_LABELS[option.id],
            })
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                data-appearance-mode={option.id}
                data-selected={selected ? 'true' : 'false'}
                onClick={() => !selected && onAppearanceModeChange(option.id)}
                className={[
                  'flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-md border px-3 py-2.5 transition-colors',
                  selected
                    ? 'border-accent bg-surface-panel text-text-primary'
                    : 'border-surface-border bg-surface text-text-secondary hover:border-accent/40 hover:text-text-primary',
                ].join(' ')}
              >
                <Icon name={option.icon} size={18} weight={selected ? 'fill' : 'regular'} />
                <span className="text-[11px] font-medium leading-none">{label}</span>
              </button>
            )
          })}
        </div>
      </FieldRow>
    </SettingsSection>
  )
}
