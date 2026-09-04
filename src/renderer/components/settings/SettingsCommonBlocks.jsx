import React from 'react'
import SettingsSection from './SettingsSection.jsx'
import SettingsApiKeyRow from './SettingsApiKeyRow.jsx'
import { normalizePermissionMode } from '../../../common/chat/permission-mode.mjs'
import {
  DEFAULT_UI_LOCALE,
  SYSTEM_UI_LOCALE,
  getUiLocaleDefinition,
  isExposedUiLocale,
  isShippedUiLocale,
  listUiLocaleOptions,
  normalizeUiLocale,
  resolveSystemUiLocale,
} from '../../../common/i18n/locale-config.mjs'
import {
  getLocalizedInstructionsGuideBlock,
} from '../../content/instructions-catalog-i18n.mjs'
import { useRendererFormattingLocale } from '../../i18n/formatters.mjs'
import PermissionModeToggle from '../chat/PermissionModeToggle.jsx'
import Icon from '../ui/Icon.jsx'
import FieldRow from '../ui/FieldRow.jsx'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'

const SHOW_DEV_SETTINGS_SURFACES = import.meta.env.DEV
const OPENROUTER_PROVIDER_ID = 'openrouter'
const PROVIDER_SORT_ORDER = new Map([
  ['openai', 0],
  ['cursor', 1],
  ['openrouter', 2],
  ['anthropic', 3],
  ['gemini', 4],
  ['deepseek', 5],
  ['grok', 6],
])
const LOCAL_PROVIDER_NAMES = ['ollama', 'vm studio', 'lm studio', 'lmstudio']

function isLocalProvider(provider = {}) {
  const name = String(provider?.name || provider?.id || '').trim().toLowerCase()
  return LOCAL_PROVIDER_NAMES.some((token) => name.includes(token))
}

function getProviderSortRank(provider = {}) {
  const providerId = String(provider?.id || '').trim().toLowerCase()
  if (PROVIDER_SORT_ORDER.has(providerId)) return PROVIDER_SORT_ORDER.get(providerId)
  if (isLocalProvider(provider)) return 101
  return 100
}

function OpenRouterCatalogManageAction({ onOpen = () => {} }) {
  const t = useSettingsTranslator(['settings', 'core'])

  return (
    <button
      type="button"
      data-ui="settings-openrouter-manage"
      onClick={onOpen}
      className="min-h-7 rounded-md border border-surface-border bg-transparent px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-border-hover hover:bg-surface-panel hover:text-text-primary"
    >
      {t('settings:blocks.openRouterCatalogVisibility.showInlineAction', {
        defaultValue: 'Manage visibility',
      })}
    </button>
  )
}

export function InstructionsBlock({ onOpenInstructions }) {
  const t = useSettingsTranslator(['settings', 'core'])
  const locale = useRendererFormattingLocale()
  const guideCopy = getLocalizedInstructionsGuideBlock(locale)

  return (
    <SettingsSection
      title={<><Icon name="book-open" className="text-accent" size={18} weight="fill" /> {guideCopy.sectionTitle}</>}
      description={guideCopy.sectionDescription}
    >
      <div data-ui="settings-usage-guide">
        <FieldRow
          label={guideCopy.guideLabel}
          description={t('settings:blocks.instructions.compactDescription', {
            defaultValue: 'Quick reference for core ADDOM workflows and controls.',
          })}
        >
          <div className="flex justify-start md:justify-end">
          <button
            onClick={onOpenInstructions}
            className="flex min-h-7 items-center gap-1.5 rounded-md border border-surface-border bg-transparent px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-border-hover hover:bg-surface-panel hover:text-text-primary"
          >
            <Icon name="book-open" size={14} weight="bold" /> {guideCopy.openGuide}
          </button>
          </div>
        </FieldRow>
      </div>
    </SettingsSection>
  )
}

export function ExecutionModeBlock({
  permissionMode = 'ask',
  permissionModeChangePending = false,
  onPermissionModeChange,
}) {
  const t = useSettingsTranslator(['settings', 'core'])
  const activeMode = normalizePermissionMode(permissionMode)
  const activeLabel = (
    activeMode === 'autonomy'
      ? t('settings:blocks.executionMode.mode.autonomy', { defaultValue: '[[canon:autonomy]]' })
      : activeMode === 'full_access'
        ? t('settings:blocks.executionMode.mode.fullAccess', { defaultValue: '[[canon:full_access]]' })
        : t('settings:blocks.executionMode.mode.ask', { defaultValue: '[[canon:ask]]' })
  )
  const summary = activeMode === 'full_access'
    ? t('settings:blocks.executionMode.summary.fullAccess', {
      defaultValue: 'Execute turns auto-approve tools for this session while explicit hard policy denies still block dangerous paths.',
    })
    : activeMode === 'autonomy'
      ? t('settings:blocks.executionMode.summary.autonomy', {
        defaultValue: 'Execute turns can act inside workspace guardrails without routine confirmation. Hard blocks and out-of-scope actions still surface explicitly.',
      })
      : t('settings:blocks.executionMode.summary.ask', {
        defaultValue: 'Execute turns continue normally for workspace-safe actions and pause when riskier network, install, or host-affecting steps need approval.',
      })

  return (
    <SettingsSection
      title={<><Icon name="shield-check" className="text-accent" size={18} weight="fill" /> {t('settings:blocks.executionMode.title', { defaultValue: 'Execution Mode' })}</>}
      description={t('settings:blocks.executionMode.description', {
        defaultValue: 'Secondary surface for the default [[canon:ask]] / [[canon:autonomy]] / [[canon:full_access]] mode used by [[canon:execute]] turns.',
      })}
    >
      <div data-ui="settings-execution-mode" className="flex flex-col gap-4 py-3">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">{t('settings:blocks.executionMode.currentDefault', { defaultValue: 'Current default:' })} <span className="text-text-secondary">{activeLabel}</span></p>
            <p className="text-[13px] text-text-secondary mt-1.5 leading-relaxed max-w-prose">{summary}</p>
          </div>

          <PermissionModeToggle
            permissionMode={activeMode}
            align="start"
            disabled={permissionModeChangePending}
            neutralTones
            onChange={onPermissionModeChange}
          />
        </div>

        <div className="flex items-start gap-3 border-t border-surface-border/55 pt-2.5 text-[12px] leading-4 text-text-secondary">
          <span className="text-[12px] font-medium text-text-muted">{t('settings:blocks.executionMode.noticeLabel', { defaultValue: '[[canon:info]]' })}</span>
          <div>
            {t('settings:blocks.executionMode.notice', {
              defaultValue: 'Execute turns use this saved default. Plan and Thinking mode keep the same default visible in chat but do not execute tools blindly.',
            })}
          </div>
        </div>
      </div>
    </SettingsSection>
  )
}

export function AssistantPromptBlock({
  value = '',
  onSave,
}) {
  const t = useSettingsTranslator(['settings', 'core'])
  const savedValue = String(value ?? '')
  const [draftValue, setDraftValue] = React.useState(savedValue)

  React.useEffect(() => {
    setDraftValue(savedValue)
  }, [savedValue])

  return (
    <SettingsSection
      title={<><Icon name="terminal-window" className="text-accent" size={18} weight="fill" /> {t('settings:blocks.assistantPrompt.title', { defaultValue: 'Custom instructions' })}</>}
      description={t('settings:blocks.assistantPrompt.description', {
        defaultValue: 'Add persistent guidance to each chat turn.',
      })}
    >
      <div data-ui="settings-custom-instructions" className="flex flex-col gap-3 py-3">
        <textarea
          value={draftValue}
          onChange={(event) => setDraftValue(event.target.value)}
          placeholder={t('settings:blocks.assistantPrompt.placeholder', {
            defaultValue: 'Example: Prefer TypeScript. Keep code changes minimal and test-first. Do not use Tailwind.',
          })}
          className="min-h-[112px] w-full resize-y rounded-md border border-surface-border bg-surface px-3 py-2.5 font-mono text-[12px] leading-5 text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent-muted focus:ring-1 focus:ring-accent-muted/25"
        />
        <div className="flex justify-end">
          <button
            onClick={() => onSave?.(draftValue)}
            className="flex min-h-7 items-center gap-1.5 rounded-md border border-surface-border bg-transparent px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-border-hover hover:bg-surface-panel hover:text-text-primary"
          >
            <Icon name="floppy-disk" size={14} weight="bold" /> {t('settings:blocks.assistantPrompt.save', { defaultValue: 'Save instructions' })}
          </button>
        </div>
      </div>
    </SettingsSection>
  )
}

export function LanguageBlock({
  uiLocale = DEFAULT_UI_LOCALE,
  onChangeUiLocale,
}) {
  const t = useSettingsTranslator(['settings', 'core'])
  const localeOptions = React.useMemo(() => listUiLocaleOptions(), [])
  const localeOptionValueSet = React.useMemo(
    () => new Set(localeOptions.map((entry) => entry.code)),
    [localeOptions],
  )
  const selectedUiLocale = normalizeUiLocale(uiLocale, DEFAULT_UI_LOCALE)
  const selectedLocaleDefinition = getUiLocaleDefinition(selectedUiLocale, DEFAULT_UI_LOCALE)
  const resolvedSystemLocale = React.useMemo(() => resolveSystemUiLocale({
    language: typeof navigator !== 'undefined' ? navigator.language : '',
    languages: typeof navigator !== 'undefined' && Array.isArray(navigator.languages) ? navigator.languages : [],
  }), [])
  const resolvedSystemLocaleDefinition = getUiLocaleDefinition(resolvedSystemLocale, DEFAULT_UI_LOCALE)
  const selectedUiLocaleIsExposed = selectedUiLocale === SYSTEM_UI_LOCALE || isExposedUiLocale(selectedUiLocale)
  const selectedRendererLocale = selectedUiLocale === SYSTEM_UI_LOCALE
    ? resolvedSystemLocale
    : selectedUiLocale
  const selectedRendererLocaleIsShipped = isShippedUiLocale(selectedRendererLocale)
  const effectiveRendererLocaleDefinition = getUiLocaleDefinition(
    selectedRendererLocaleIsShipped ? selectedRendererLocale : DEFAULT_UI_LOCALE,
    DEFAULT_UI_LOCALE,
  )
  const selectedLocaleIsValidationOnly = (
    selectedUiLocale !== SYSTEM_UI_LOCALE
    && isShippedUiLocale(selectedUiLocale)
    && !isExposedUiLocale(selectedUiLocale)
  )
  const selectedLocaleIsSavedOnly = (
    selectedUiLocale !== SYSTEM_UI_LOCALE
    && !isShippedUiLocale(selectedUiLocale)
  )
  const selectValue = selectedUiLocaleIsExposed && localeOptionValueSet.has(selectedUiLocale)
    ? selectedUiLocale
    : DEFAULT_UI_LOCALE

  return (
    <SettingsSection
      title={<><Icon name="translate" className="text-accent" size={18} weight="fill" /> {t('settings:blocks.language.title', { defaultValue: 'Language' })}</>}
      description={t('settings:blocks.language.description', {
        defaultValue: 'Choose the ADDOM app language for renderer UI surfaces only.',
      })}
    >
      <div className="mt-1" data-ui="settings-language">
        <FieldRow
          htmlFor="settings-ui-locale"
          label={t('settings:blocks.language.appLanguage', { defaultValue: 'App language' })}
          description={t('settings:blocks.language.systemDefaultDescription', {
            defaultValue: 'System default follows your OS language. Assistant replies, [[canon:backend]] behavior, commands, and technical tokens stay canonical English.',
          })}
        >
          <select
            id="settings-ui-locale"
            className="w-full rounded-md border border-surface-border bg-surface px-2.5 py-1.5 text-[13px] text-text-primary transition-colors focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
            value={selectValue}
            onChange={(event) => onChangeUiLocale?.(event?.target?.value)}
          >
            {localeOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </FieldRow>

        {SHOW_DEV_SETTINGS_SURFACES ? (
          <div className="grid grid-cols-1 gap-2 border-t border-surface-border/55 py-2 md:grid-cols-2">
          <div>
            <p className="text-[12px] font-medium text-text-secondary">{t('settings:blocks.language.savedSetting', { defaultValue: 'Saved setting' })}</p>
            <p className="mt-1 text-[14px] font-semibold text-text-primary">
              {selectedLocaleDefinition.label}
            </p>
            <p className="mt-1 text-[11px] text-text-tertiary font-mono">
              {selectedLocaleDefinition.code}
            </p>
          </div>
          <div>
            <p className="text-[12px] font-medium text-text-secondary">{t('settings:blocks.language.currentRendererLocale', { defaultValue: 'Current renderer locale' })}</p>
            <p className="mt-1 text-[14px] font-semibold text-text-primary">
              {effectiveRendererLocaleDefinition.label}
            </p>
            <p className="mt-1 text-[11px] text-text-tertiary font-mono">
              {effectiveRendererLocaleDefinition.code}
            </p>
          </div>
          </div>
        ) : null}

        {selectedUiLocale === SYSTEM_UI_LOCALE ? (
          <div className="border-t border-surface-border/55 py-2 text-[11px] leading-4 text-text-secondary">
            {t('settings:blocks.language.systemResolvedNotice', {
              defaultValue: 'Your system language currently resolves to {{label}}. If that locale is not shipped yet, ADDOM falls back to English.',
              label: resolvedSystemLocaleDefinition.label,
            })}
          </div>
        ) : null}

        {SHOW_DEV_SETTINGS_SURFACES && selectedLocaleIsValidationOnly ? (
          <div className="border-t border-surface-border/55 py-2 text-[11px] leading-4 text-text-secondary">
            {t('settings:blocks.language.validationOnlyNotice', {
              defaultValue: '{{label}} is a validation locale. It stays hidden from normal release settings and should only be enabled during localization checks.',
              label: selectedLocaleDefinition.label,
            })}
          </div>
        ) : null}

        {SHOW_DEV_SETTINGS_SURFACES && selectedLocaleIsSavedOnly ? (
          <div className="border-t border-surface-border/55 py-2 text-[11px] leading-4 text-text-secondary">
            {t('settings:blocks.language.savedOnlyNotice', {
              defaultValue: '{{label}} is saved, but ADDOM currently ships English renderer strings only. The UI stays in English until that locale ships.',
              label: selectedLocaleDefinition.label,
            })}
          </div>
        ) : null}
      </div>
    </SettingsSection>
  )
}

export function ApiKeysBlock({
  providers,
  onSaveProviderKey,
  onDeleteProviderKey,
  onSetProviderAuthMethod,
  openDetailView = () => {},
}) {
  const t = useSettingsTranslator(['settings', 'core'])
  const sortedRows = React.useMemo(() => {
    const rows = Array.isArray(providers) ? providers : []
    return [...rows].sort((a, b) => {
      const sortRankDiff = getProviderSortRank(a) - getProviderSortRank(b)
      if (sortRankDiff !== 0) return sortRankDiff

      const aName = (a.name || a.id || '').toLowerCase()
      const bName = (b.name || b.id || '').toLowerCase()
      return aName.localeCompare(bName)
    })
  }, [providers])

  return (
    <SettingsSection
      title={<><Icon name="key" className="text-accent" size={18} weight="fill" /> {t('settings:blocks.apiKeys.title', { defaultValue: 'API Keys & Identities' })}</>}
      description={t('settings:blocks.apiKeys.description', {
        defaultValue: 'Configure remote provider credentials and identities. Local providers like Ollama may not require keys.',
      })}
    >
      <div className="mt-2 flex flex-col">
        {sortedRows.length === 0 ? (
          <div className="rounded-md border border-surface-border/70 bg-transparent px-3 py-2 text-xs text-text-tertiary">
            {t('settings:blocks.apiKeys.noProviders', { defaultValue: 'No providers available to configure.' })}
          </div>
        ) : sortedRows.map((provider, idx) => (
          <SettingsApiKeyRow
            key={String(provider?.id || provider?.name || `provider-${idx}`)}
            provider={provider}
            onSave={(value) => onSaveProviderKey?.(provider.id, value)}
            onDelete={() => onDeleteProviderKey?.(provider.id)}
            onSetAuthMethod={(authMethod) => onSetProviderAuthMethod?.(provider.id, authMethod)}
            extraContent={String(provider?.id || '').trim().toLowerCase() === OPENROUTER_PROVIDER_ID ? (
              <OpenRouterCatalogManageAction onOpen={() => openDetailView('openrouter-catalog', 'settings-openrouter-manage')} />
            ) : null}
          />
        ))}
      </div>
    </SettingsSection>
  )
}
