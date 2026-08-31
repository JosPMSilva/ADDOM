import React from 'react'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'
import SettingsSection from './SettingsSection.jsx'
import Icon from '../ui/Icon.jsx'
import FieldRow from '../ui/FieldRow.jsx'
import {
  DEFAULT_BACKGROUND_TONE_SETTINGS,
  listBackgroundTonePresets,
  normalizeBackgroundToneSettings,
} from '../../../common/ui/background-tone-settings.mjs'

const TONE_LABEL_DEFAULTS = Object.freeze({
  obsidian: 'Obsidian',
  charcoal: 'Charcoal',
  graphite: 'Graphite',
  slate: 'Slate',
  ash: 'Ash',
})

export default function SettingsBackgroundToneBlock({
  backgroundToneSettings = null,
  onBackgroundToneChange = () => {},
  disabled = false,
}) {
  const t = useSettingsTranslator(['settings'])
  const normalized = React.useMemo(
    () => normalizeBackgroundToneSettings(backgroundToneSettings),
    [backgroundToneSettings],
  )
  const presets = React.useMemo(() => listBackgroundTonePresets(), [])

  return (
    <SettingsSection
      title={(
        <>
          <Icon name="palette" className="text-accent" size={18} weight="fill" />
          {' '}
          {t('settings:sections.general.backgroundTone.title', { defaultValue: 'Background' })}
        </>
      )}
      description={t('settings:blocks.backgroundTone.description', {
        defaultValue: 'Choose a gray workspace tone. Graphite matches the current ADDOM default.',
      })}
    >
      <FieldRow
        label={t('settings:blocks.backgroundTone.tone', { defaultValue: 'Workspace tone' })}
        description={t('settings:blocks.backgroundTone.toneDescription', {
          defaultValue: 'Shifts the shared surface, panel, and border stack together.',
        })}
        status={t('settings:blocks.backgroundTone.selected', {
          defaultValue: 'Selected {{name}}',
          name: t(`settings:blocks.backgroundTone.tones.${normalized.tone}`, {
            defaultValue: TONE_LABEL_DEFAULTS[normalized.tone] || normalized.tone,
          }),
        })}
      >
        <div className="flex flex-col gap-2">
          <div
            className="flex flex-wrap gap-2"
            role="radiogroup"
            aria-label={t('settings:blocks.backgroundTone.tone', { defaultValue: 'Workspace tone' })}
            aria-disabled={disabled}
            data-ui="background-tone-picker"
          >
            {presets.map((preset) => {
              const selected = preset.id === normalized.tone
              const label = t(`settings:blocks.backgroundTone.tones.${preset.id}`, {
                defaultValue: TONE_LABEL_DEFAULTS[preset.id] || preset.id,
              })
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  data-background-tone={preset.id}
                  data-selected={selected ? 'true' : 'false'}
                  onClick={() => {
                    if (disabled) return
                    if (preset.id === normalized.tone) return
                    onBackgroundToneChange({
                      ...DEFAULT_BACKGROUND_TONE_SETTINGS,
                      tone: preset.id,
                    })
                  }}
                  className={[
                    'flex min-w-[4.75rem] flex-col items-center gap-1.5 rounded-md border px-2.5 py-2 text-left transition-colors',
                    selected
                      ? 'border-accent bg-surface-panel text-text-primary'
                      : 'border-surface-border bg-surface text-text-secondary hover:border-accent/40 hover:text-text-primary',
                    disabled ? 'cursor-not-allowed opacity-45' : '',
                  ].join(' ')}
                >
                  <span
                    aria-hidden="true"
                    className="h-7 w-7 rounded-full border border-surface-border shadow-[inset_0_0_0_1px_rgb(var(--theme-highlight-rgb)_/_0.04)]"
                    style={{ backgroundColor: preset.swatch }}
                  />
                  <span className="text-[11px] font-medium leading-none">{label}</span>
                </button>
              )
            })}
          </div>
          {disabled ? (
            <p className="text-[11px] leading-4 text-text-muted">
              {t('settings:blocks.backgroundTone.darkOnly', {
                defaultValue: 'Workspace tones are available when the resolved theme is Dark.',
              })}
            </p>
          ) : null}
        </div>
      </FieldRow>
    </SettingsSection>
  )
}
