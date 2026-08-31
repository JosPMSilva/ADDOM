import React from 'react'
import SettingsSection from './SettingsSection.jsx'
import PermissionRow from './PermissionRow.jsx'
import FieldRow from '../ui/FieldRow.jsx'
import Icon from '../ui/Icon.jsx'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'
import {
  DEFAULT_TERMINAL_SETTINGS,
  TERMINAL_DEFAULT_CWD_BEHAVIOR_OPTIONS,
  TERMINAL_DEFAULT_SHELL_OPTIONS,
  TERMINAL_FONT_FAMILY_OPTIONS,
  normalizeTerminalSettings,
} from '../../../common/terminal/terminal-settings.mjs'

function LabeledSelect({
  id,
  value,
  options = [],
  onChange,
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      className="w-full rounded-md border border-surface-border bg-surface px-2.5 py-1.5 text-[13px] text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  )
}

function NumberField({
  id,
  value,
  hint = '',
  onCommit,
}) {
  const [draftValue, setDraftValue] = React.useState(String(value ?? ''))

  React.useEffect(() => {
    setDraftValue(String(value ?? ''))
  }, [value])

  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="number"
        value={draftValue}
        onChange={(event) => setDraftValue(event.target.value)}
        onBlur={() => onCommit?.(draftValue)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onCommit?.(draftValue)
        }}
        className="w-24 rounded-md border border-surface-border bg-surface px-2.5 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent focus:ring-1 focus:ring-accent/20"
      />
      {hint ? <span className="text-[12px] text-text-tertiary">{hint}</span> : null}
    </div>
  )
}

export default function SettingsTerminalBlock({
  terminalSettings = DEFAULT_TERMINAL_SETTINGS,
  onChange = () => {},
}) {
  const t = useSettingsTranslator(['settings', 'core'])
  const settings = normalizeTerminalSettings(terminalSettings, DEFAULT_TERMINAL_SETTINGS)
  const fontFamilyOptions = React.useMemo(() => TERMINAL_FONT_FAMILY_OPTIONS.map((value) => ({
    value,
    label: t(`settings:blocks.terminal.fontFamilyOptions.${value}`, { defaultValue: value }),
  })), [t])
  const shellOptions = React.useMemo(() => TERMINAL_DEFAULT_SHELL_OPTIONS.map((value) => ({
    value,
    label: t(`settings:blocks.terminal.shellOptions.${value.replace(/-/g, '_')}`, { defaultValue: value }),
  })), [t])
  const cwdBehaviorOptions = React.useMemo(() => TERMINAL_DEFAULT_CWD_BEHAVIOR_OPTIONS.map((value) => ({
    value,
    label: t(`settings:blocks.terminal.cwdBehavior.${value}`, { defaultValue: value }),
  })), [t])

  return (
    <SettingsSection
      title={<><Icon name="terminal-window" className="text-accent" size={18} weight="fill" /> {t('settings:blocks.terminal.title', { defaultValue: 'Terminal' })}</>}
      description={t('settings:blocks.terminal.description', {
        defaultValue: 'Persist conservative terminal defaults without changing the global app text scale.',
      })}
    >
      <div className="mt-1" data-ui="settings-terminal-preferences">
        <FieldRow
          htmlFor="settings-terminal-font-size"
          label={t('settings:blocks.terminal.fontSizeLabel', { defaultValue: 'Font size' })}
          description={t('settings:blocks.terminal.fontSizeDescription', { defaultValue: 'Base xterm font size for new and active terminal surfaces.' })}
        >
          <NumberField
            id="settings-terminal-font-size"
            value={settings.fontSize}
            hint="px"
            onCommit={(value) => onChange({ fontSize: value })}
          />
        </FieldRow>
        <FieldRow
          htmlFor="settings-terminal-font-family"
          label={t('settings:blocks.terminal.fontFamilyLabel', { defaultValue: 'Font family' })}
          description={t('settings:blocks.terminal.fontFamilyDescription', { defaultValue: 'Choose the terminal font preset used by xterm.' })}
        >
          <LabeledSelect
            id="settings-terminal-font-family"
            value={settings.fontFamily}
            options={fontFamilyOptions}
            onChange={(value) => onChange({ fontFamily: value })}
          />
        </FieldRow>
        <FieldRow
          htmlFor="settings-terminal-default-shell"
          label={t('settings:blocks.terminal.defaultShellLabel', { defaultValue: 'Default shell' })}
          description={t('settings:blocks.terminal.defaultShellDescription', { defaultValue: 'Default shell used when a new terminal does not explicitly request one.' })}
        >
          <LabeledSelect
            id="settings-terminal-default-shell"
            value={settings.defaultShell}
            options={shellOptions}
            onChange={(value) => onChange({ defaultShell: value })}
          />
        </FieldRow>
        <FieldRow
          htmlFor="settings-terminal-cwd-behavior"
          label={t('settings:blocks.terminal.defaultCwdBehaviorLabel', { defaultValue: 'Default cwd behavior' })}
          description={t('settings:blocks.terminal.defaultCwdBehaviorDescription', { defaultValue: 'Choose where new terminals start when no explicit cwd is provided.' })}
        >
          <LabeledSelect
            id="settings-terminal-cwd-behavior"
            value={settings.defaultCwdBehavior}
            options={cwdBehaviorOptions}
            onChange={(value) => onChange({ defaultCwdBehavior: value })}
          />
        </FieldRow>
        <PermissionRow
          label={t('settings:blocks.terminal.copyOnSelectionLabel', { defaultValue: 'Copy on selection' })}
          description={t('settings:blocks.terminal.copyOnSelectionDescription', { defaultValue: 'Copy terminal selections to the clipboard immediately after selecting text.' })}
          enabled={settings.copyOnSelection === true}
          onToggle={() => onChange({ copyOnSelection: !settings.copyOnSelection })}
        />

        <FieldRow
          htmlFor="settings-terminal-scrollback"
          label={t('settings:blocks.terminal.scrollbackLabel', { defaultValue: 'Scrollback lines' })}
          description={t('settings:blocks.terminal.scrollbackDescription', { defaultValue: 'How much terminal history xterm keeps in memory.' })}
        >
            <NumberField
              id="settings-terminal-scrollback"
              value={settings.scrollback}
              hint={t('settings:blocks.terminal.scrollbackHint', { defaultValue: 'lines' })}
              onCommit={(value) => onChange({ scrollback: value })}
            />
        </FieldRow>
        <FieldRow
          htmlFor="settings-terminal-paste-threshold"
          label={t('settings:blocks.terminal.pasteConfirmationLabel', { defaultValue: 'Large paste confirmation' })}
          description={t('settings:blocks.terminal.pasteConfirmationDescription', { defaultValue: 'Confirm multi-line pastes once they reach this many lines.' })}
        >
            <NumberField
              id="settings-terminal-paste-threshold"
              value={settings.pasteConfirmationLineThreshold}
              hint={t('settings:blocks.terminal.zeroDisablesHint', { defaultValue: '0 disables the prompt' })}
              onCommit={(value) => onChange({ pasteConfirmationLineThreshold: value })}
            />
        </FieldRow>
      </div>
    </SettingsSection>
  )
}
