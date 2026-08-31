import React from 'react'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'
import SettingsSection from './SettingsSection.jsx'
import Icon from '../ui/Icon.jsx'
import FieldRow from '../ui/FieldRow.jsx'
import {
  CHAT_TYPOGRAPHY_SCALE_MAX,
  CHAT_TYPOGRAPHY_SCALE_MIN,
  CHAT_TYPOGRAPHY_SCALE_STEP,
  DEFAULT_CHAT_TYPOGRAPHY_SETTINGS,
  normalizeChatTypographyScale,
  normalizeChatTypographySettings,
} from '../../../common/chat/chat-typography-settings.mjs'
import {
  DEFAULT_UI_SCALING_SETTINGS,
  UI_SCALING_MODE_AUTO,
  UI_SCALING_SCALE_MAX,
  UI_SCALING_SCALE_MIN,
  UI_SCALING_SCALE_STEP,
  normalizeUiScalingSettings,
  normalizeUiScalingScale,
} from '../../../common/ui/ui-scaling-settings.mjs'

function SettingsScaleInput({
  draftValue = '',
  onDraftChange = () => {},
  onCommit = () => {},
  min = 0,
  max = 2,
  step = 0.05,
  disabled = false,
  resetDisabled = false,
  onReset = () => {},
  rangeText = '',
  resetLabel = '',
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="w-24 rounded-md border border-surface-border bg-surface px-2.5 py-1.5 text-text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-55"
        value={draftValue}
        onChange={(event) => onDraftChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onCommit()
          }
        }}
      />
      <span className="text-[12px] text-text-tertiary">{rangeText}</span>
      <button
        type="button"
        onClick={onReset}
        disabled={resetDisabled}
        className="rounded-md border border-surface-border bg-surface px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {resetLabel}
      </button>
    </div>
  )
}

export default function SettingsUiScalingBlock({
  uiScale = 1,
  uiScalingSettings = null,
  onUiScalingModeChange = () => {},
  onUiScalingScaleChange = () => {},
  onResetUiScaling = () => {},
  chatTypographySettings = null,
  onChatTypographyScaleChange = () => {},
  onResetChatTypographyScale = () => {},
}) {
  const t = useSettingsTranslator(['settings'])
  const normalizedUiScalingSettings = React.useMemo(
    () => normalizeUiScalingSettings(uiScalingSettings),
    [uiScalingSettings],
  )
  const normalizedChatTypographySettings = React.useMemo(
    () => normalizeChatTypographySettings(chatTypographySettings),
    [chatTypographySettings],
  )
  const [uiScaleDraft, setUiScaleDraft] = React.useState(String(normalizedUiScalingSettings.scale))
  const [chatScaleDraft, setChatScaleDraft] = React.useState(String(normalizedChatTypographySettings.scale))

  React.useEffect(() => {
    setUiScaleDraft(String(normalizedUiScalingSettings.scale))
  }, [normalizedUiScalingSettings.scale])

  React.useEffect(() => {
    setChatScaleDraft(String(normalizedChatTypographySettings.scale))
  }, [normalizedChatTypographySettings.scale])

  const commitUiScaleDraft = React.useCallback(() => {
    const nextScale = normalizeUiScalingScale(uiScaleDraft, normalizedUiScalingSettings.scale)
    setUiScaleDraft(String(nextScale))
    onUiScalingScaleChange(nextScale)
  }, [normalizedUiScalingSettings.scale, onUiScalingScaleChange, uiScaleDraft])

  const commitChatScaleDraft = React.useCallback(() => {
    const nextScale = normalizeChatTypographyScale(chatScaleDraft, normalizedChatTypographySettings.scale)
    setChatScaleDraft(String(nextScale))
    onChatTypographyScaleChange(nextScale)
  }, [chatScaleDraft, normalizedChatTypographySettings.scale, onChatTypographyScaleChange])

  return (
    <SettingsSection
      title={<><Icon name="arrows-out-cardinal" className="text-accent" size={18} weight="fill" /> {t('settings:sections.general.uiScaling.title', { defaultValue: 'UI Scaling' })}</>}
      description={t('settings:blocks.uiScaling.description', { defaultValue: 'Control ADDOM shell density and chat text scaling from one place.' })}
    >
      <div className="mt-1" data-ui="settings-ui-scaling">
        <FieldRow
          label={t('settings:blocks.uiScaling.appShellDensity', { defaultValue: 'App shell density' })}
          description={t('settings:blocks.uiScaling.appShellDensityDescription', { defaultValue: '[[canon:auto]] mode follows the effective viewport after OS scaling. [[canon:manual]] mode pins a shell density across displays.' })}
          status={t('settings:blocks.uiScaling.effective', {
            defaultValue: 'Effective {{percent}}%',
            percent: Math.round(Number(uiScale || 1) * 100),
          })}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-0.5">
                <label className="inline-flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="radio"
                    name="ui-scaling-mode"
                    checked={normalizedUiScalingSettings.mode === UI_SCALING_MODE_AUTO}
                    onChange={() => onUiScalingModeChange(UI_SCALING_MODE_AUTO)}
                    className="accent-accent"
                  />
                  <span>{t('settings:blocks.uiScaling.auto', { defaultValue: '[[canon:auto]]' })}</span>
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="radio"
                    name="ui-scaling-mode"
                    checked={normalizedUiScalingSettings.mode !== UI_SCALING_MODE_AUTO}
                    onChange={() => onUiScalingModeChange('manual')}
                    className="accent-accent"
                  />
                  <span>{t('settings:blocks.uiScaling.manual', { defaultValue: '[[canon:manual]]' })}</span>
                </label>
          </div>
        </FieldRow>
        <FieldRow
          label={t('settings:blocks.uiScaling.shellScale', { defaultValue: 'Shell scale' })}
          description={t('settings:blocks.uiScaling.shellScaleDescription', { defaultValue: 'This scales the shell geometry tokens used by the sidebar, thread drawer, MoA rail, and chat content widths.' })}
        >
            <SettingsScaleInput
              draftValue={uiScaleDraft}
              onDraftChange={setUiScaleDraft}
              onCommit={commitUiScaleDraft}
              min={UI_SCALING_SCALE_MIN}
              max={UI_SCALING_SCALE_MAX}
              step={UI_SCALING_SCALE_STEP}
              disabled={normalizedUiScalingSettings.mode === UI_SCALING_MODE_AUTO}
              resetDisabled={
                normalizedUiScalingSettings.mode === DEFAULT_UI_SCALING_SETTINGS.mode
                && normalizedUiScalingSettings.scale === DEFAULT_UI_SCALING_SETTINGS.scale
              }
              onReset={onResetUiScaling}
              rangeText={t('settings:blocks.uiScaling.range', {
                defaultValue: 'Range {{min}}% to {{max}}%',
                min: Math.round(UI_SCALING_SCALE_MIN * 100),
                max: Math.round(UI_SCALING_SCALE_MAX * 100),
              })}
              resetLabel={t('settings:blocks.uiScaling.reset', { defaultValue: 'Reset' })}
            />
        </FieldRow>
        <FieldRow
          label={t('settings:blocks.uiScaling.chatTypographyScale', { defaultValue: 'Text scale' })}
          description={t('settings:blocks.uiScaling.chatTypographyScaleDescription', { defaultValue: 'Adjust chat text size alongside shell density so both layers can be tuned together.' })}
        >
            <SettingsScaleInput
              draftValue={chatScaleDraft}
              onDraftChange={setChatScaleDraft}
              onCommit={commitChatScaleDraft}
              min={CHAT_TYPOGRAPHY_SCALE_MIN}
              max={CHAT_TYPOGRAPHY_SCALE_MAX}
              step={CHAT_TYPOGRAPHY_SCALE_STEP}
              resetDisabled={normalizedChatTypographySettings.scale === DEFAULT_CHAT_TYPOGRAPHY_SETTINGS.scale}
              onReset={onResetChatTypographyScale}
              rangeText={t('settings:blocks.uiScaling.range', {
                defaultValue: 'Range {{min}}% to {{max}}%',
                min: Math.round(CHAT_TYPOGRAPHY_SCALE_MIN * 100),
                max: Math.round(CHAT_TYPOGRAPHY_SCALE_MAX * 100),
              })}
              resetLabel={t('settings:blocks.uiScaling.reset', { defaultValue: 'Reset' })}
            />
        </FieldRow>
        <p className="px-1 py-3 text-xs leading-5 text-text-muted">
          {normalizedUiScalingSettings.mode === UI_SCALING_MODE_AUTO
            ? t('settings:blocks.uiScaling.autoModeDescription', { defaultValue: '[[canon:auto]] mode keeps the shell geometry aligned across 1080p and 4K setups by reacting to the actual CSS viewport.' })
            : t('settings:blocks.uiScaling.manualModeDescription', { defaultValue: '[[canon:manual]] mode is useful if you want one fixed shell density regardless of display scaling.' })}
        </p>
      </div>
    </SettingsSection>
  )
}
