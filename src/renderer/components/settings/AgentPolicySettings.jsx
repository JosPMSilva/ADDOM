import React from 'react'
import {
  AGENT_POLICY_HARD_CEILINGS,
  AGENT_POLICY_PROFILE_IDS,
  resolveAgentPolicyProfile,
} from '../../../common/agents/agent-policy-profile.mjs'
import { normalizeAgentSettings } from '../../../common/agents/agent-settings.mjs'
import { providerHasCredential } from '../../../common/api-clients/provider-credential-state.mjs'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'

const LIMIT_ROWS = Object.freeze([
  { field: 'maxLiveAgents', label: 'Active at once', unit: 'agents', min: 1 },
  { field: 'maxDepth', label: 'Nesting depth', unit: 'levels', min: 1 },
  { field: 'maxDescendants', label: 'Agents per run', unit: 'agents', min: 1 },
  { field: 'maxTotalTokens', label: 'Token budget', unit: 'k tokens', min: 1, divisor: 1_000 },
  { field: 'maxCostUsd', label: 'Cost budget', unit: 'USD', min: 0, step: 0.01 },
  { field: 'maxDurationMs', label: 'Time budget', unit: 'minutes', min: 1, divisor: 60_000 },
])

const toTitleCase = (value) => `${value.charAt(0).toUpperCase()}${value.slice(1)}`

function buildLimitDraft(limits = {}) {
  return Object.fromEntries(LIMIT_ROWS.map(({ field, divisor = 1 }) => [
    field,
    Number(limits[field]) / divisor,
  ]))
}

function buildLimitsFromDraft(draft = {}) {
  return Object.fromEntries(LIMIT_ROWS.map(({ field, divisor = 1 }) => [
    field,
    Number(draft[field]) * divisor,
  ]))
}

function isDraftValid(limitDraft, capDraft, fanoutThresholdDraft) {
  const limitsValid = LIMIT_ROWS.every(({ field, min }) => {
    const value = Number(limitDraft[field])
    return String(limitDraft[field]).trim() !== '' && Number.isFinite(value) && value >= min
  })
  const threshold = Number(fanoutThresholdDraft)
  return limitsValid
    && String(fanoutThresholdDraft).trim() !== ''
    && Number.isFinite(threshold)
    && threshold >= 1
    && threshold <= AGENT_POLICY_HARD_CEILINGS.maxDescendants
    && Object.values(capDraft).every((value) => (
    String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 1
    ))
}

export default function AgentPolicySettings({
  agentSettings,
  setAgentSettings,
  providers = [],
}) {
  const t = useSettingsTranslator(['settings', 'core'])
  const settings = React.useMemo(() => normalizeAgentSettings(agentSettings), [agentSettings])
  const [advancedOpen, setAdvancedOpen] = React.useState(false)
  const [limitDraft, setLimitDraft] = React.useState(() => buildLimitDraft(settings.limits))
  const [fanoutThresholdDraft, setFanoutThresholdDraft] = React.useState(
    () => settings.fanoutConfirmationThreshold,
  )
  const [capDraft, setCapDraft] = React.useState(() => ({ ...settings.providerConcurrencyCaps }))
  const [dirty, setDirty] = React.useState(false)
  const [saveState, setSaveState] = React.useState('idle')

  React.useEffect(() => {
    if (dirty) return
    setLimitDraft(buildLimitDraft(settings.limits))
    setFanoutThresholdDraft(settings.fanoutConfirmationThreshold)
    setCapDraft({ ...settings.providerConcurrencyCaps })
  }, [dirty, settings])

  const persistAgentSettings = React.useCallback(async (next, previous = settings) => {
    const normalized = normalizeAgentSettings(next)
    setAgentSettings(normalized)
    setSaveState('saving')
    try {
      await window.addom.settings.set({ agentSettings: normalized })
      setSaveState('saved')
      return true
    } catch {
      setAgentSettings(previous)
      setSaveState('error')
      return false
    }
  }, [setAgentSettings, settings])

  const handleToggle = React.useCallback(() => {
    persistAgentSettings({ ...settings, enabled: !settings.enabled })
  }, [persistAgentSettings, settings])

  const handleProfileChange = React.useCallback((event) => {
    const defaultProfile = event.target.value
    const next = {
      ...settings,
      defaultProfile,
      limits: resolveAgentPolicyProfile(defaultProfile).limits,
    }
    setDirty(false)
    setLimitDraft(buildLimitDraft(next.limits))
    persistAgentSettings(next)
  }, [persistAgentSettings, settings])

  const configuredProviders = React.useMemo(() => (
    (Array.isArray(providers) ? providers : [])
      .filter((provider) => providerHasCredential(provider))
      .map((provider) => ({
        id: String(provider.id || '').trim().toLowerCase(),
        name: String(provider.name || provider.id || '').trim(),
      }))
      .filter((provider) => provider.id)
  ), [providers])

  const providerNames = React.useMemo(() => new Map(
    configuredProviders.map((provider) => [provider.id, provider.name]),
  ), [configuredProviders])
  const availableProviders = configuredProviders.filter(({ id }) => !(id in capDraft))
  const draftValid = isDraftValid(limitDraft, capDraft, fanoutThresholdDraft)

  const handleAdvancedSave = React.useCallback(async () => {
    if (!draftValid) return
    const saved = await persistAgentSettings({
      ...settings,
      fanoutConfirmationThreshold: Number(fanoutThresholdDraft),
      limits: buildLimitsFromDraft(limitDraft),
      providerConcurrencyCaps: capDraft,
    })
    if (saved) setDirty(false)
  }, [capDraft, draftValid, fanoutThresholdDraft, limitDraft, persistAgentSettings, settings])

  const handleDiscard = React.useCallback(() => {
    setLimitDraft(buildLimitDraft(settings.limits))
    setFanoutThresholdDraft(settings.fanoutConfirmationThreshold)
    setCapDraft({ ...settings.providerConcurrencyCaps })
    setDirty(false)
    setSaveState('idle')
  }, [settings])

  return (
    <section className="border-b border-surface-border/60" data-ui="agent-policy-settings">
      <div className="flex min-h-14 items-center justify-between gap-4 border-b border-surface-border/55 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-primary">
            {t('settings:blocks.moaAgents.runtime.delegation', { defaultValue: 'Agent delegation' })}
          </p>
          <p className="mt-0.5 text-[11px] leading-4 text-text-secondary">
            {settings.enabled
              ? t('settings:blocks.moaAgents.runtime.delegationEnabled', {
                  defaultValue: 'ADDOM can delegate work to the roles below.',
                })
              : t('settings:blocks.moaAgents.runtime.delegationDisabled', {
                  defaultValue: 'Roles stay available to configure while delegation is off.',
                })}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          aria-label={t('settings:blocks.moaAgents.runtime.enabled', { defaultValue: 'Enable agents' })}
          disabled={saveState === 'saving'}
          onClick={handleToggle}
          className={[
            'relative inline-flex h-5 w-9 items-center shrink-0 rounded-full transition-colors duration-75',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
            settings.enabled ? 'bg-accent' : 'border border-surface-border bg-surface-panel',
          ].join(' ')}
        >
          <span className={[
            'inline-block h-3.5 w-3.5 rounded-full border bg-white transition-transform duration-75',
            settings.enabled ? 'translate-x-4 border-accent' : 'translate-x-1 border-surface-border',
          ].join(' ')} />
        </button>
      </div>

      <label className="flex min-h-12 items-center justify-between gap-4 border-b border-surface-border/55 py-2.5">
        <span className="min-w-0">
          <span className="block text-xs font-medium text-text-primary">
            {t('settings:blocks.moaAgents.runtime.profile', { defaultValue: 'Capacity' })}
          </span>
          <span className="mt-0.5 block text-[11px] text-text-secondary">
            {t('settings:blocks.moaAgents.runtime.profileDescription', {
              defaultValue: 'Sets sensible limits for parallel and nested agents.',
            })}
          </span>
        </span>
        <select
          value={settings.defaultProfile}
          disabled={saveState === 'saving'}
          onChange={handleProfileChange}
          className="h-8 w-36 shrink-0 rounded-md border border-surface-border bg-surface-panel px-2.5 text-xs text-text-primary outline-none focus:border-accent/70"
        >
          {AGENT_POLICY_PROFILE_IDS.map((profileId) => (
            <option key={profileId} value={profileId}>{toTitleCase(profileId)}</option>
          ))}
        </select>
      </label>

      <div data-ui="agent-policy-advanced">
        <button
          type="button"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((open) => !open)}
          className="flex min-h-12 w-full items-center justify-between gap-4 py-2.5 text-left"
        >
          <span>
            <span className="block text-xs font-medium text-text-primary">
              {t('settings:blocks.moaAgents.runtime.advanced', { defaultValue: 'Advanced limits' })}
            </span>
            <span className="mt-0.5 block text-[11px] text-text-secondary">
              {t('settings:blocks.moaAgents.runtime.advancedSummary', {
                defaultValue: '{{count}} active · depth {{depth}}',
                count: settings.limits.maxLiveAgents,
                depth: settings.limits.maxDepth,
              })}
            </span>
          </span>
          <span aria-hidden="true" className="text-xs text-text-muted">{advancedOpen ? '−' : '+'}</span>
        </button>

        {advancedOpen ? (
          <div className="space-y-4 border-t border-surface-border/55 pb-4 pt-3">
            <div className="divide-y divide-surface-border/45">
              <label className="flex min-h-10 items-center justify-between gap-4 py-2">
                <span className="text-[11px] text-text-secondary">
                  {t('settings:blocks.moaAgents.runtime.fanoutConfirmationThreshold', {
                    defaultValue: 'Ask before launching more than',
                  })}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max={AGENT_POLICY_HARD_CEILINGS.maxDescendants}
                    value={fanoutThresholdDraft}
                    onChange={(event) => {
                      setFanoutThresholdDraft(event.target.value)
                      setDirty(true)
                      setSaveState('idle')
                    }}
                    className="h-8 w-24 rounded-md border border-surface-border bg-surface-panel px-2.5 text-right text-xs text-text-primary outline-none focus:border-accent/70"
                  />
                  <span className="w-16 text-[10px] text-text-muted">
                    {t('settings:blocks.moaAgents.runtime.agentsUnit', { defaultValue: 'agents' })}
                  </span>
                </span>
              </label>
              {LIMIT_ROWS.map(({ field, label, unit, min, step = 1 }) => (
                <label key={field} className="flex min-h-10 items-center justify-between gap-4 py-2">
                  <span className="text-[11px] text-text-secondary">
                    {t(`settings:blocks.moaAgents.runtime.limits.${field}`, { defaultValue: label })}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <input
                      type="number"
                      min={min}
                      step={step}
                      value={limitDraft[field]}
                      onChange={(event) => {
                        setLimitDraft((current) => ({ ...current, [field]: event.target.value }))
                        setDirty(true)
                        setSaveState('idle')
                      }}
                      className="h-8 w-24 rounded-md border border-surface-border bg-surface-panel px-2.5 text-right text-xs text-text-primary outline-none focus:border-accent/70"
                    />
                    <span className="w-16 text-[10px] text-text-muted">{unit}</span>
                  </span>
                </label>
              ))}
            </div>

            <div>
              <p className="text-[11px] font-medium text-text-primary">
                {t('settings:blocks.moaAgents.runtime.providerOverrides', {
                  defaultValue: 'Provider overrides',
                })}
              </p>
              {Object.keys(capDraft).length === 0 ? (
                <p className="mt-1 text-[11px] text-text-muted">
                  {t('settings:blocks.moaAgents.runtime.noProviderOverrides', {
                    defaultValue: 'No provider-specific limits.',
                  })}
                </p>
              ) : (
                <div className="mt-2 divide-y divide-surface-border/45">
                  {Object.entries(capDraft).map(([providerId, value]) => (
                    <label key={providerId} className="flex min-h-10 items-center justify-between gap-4 py-2">
                      <span className="truncate text-[11px] text-text-secondary">
                        {providerNames.get(providerId) || providerId}
                      </span>
                      <span className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          value={value}
                          aria-label={`${providerNames.get(providerId) || providerId} concurrency`}
                          onChange={(event) => {
                            setCapDraft((current) => ({ ...current, [providerId]: event.target.value }))
                            setDirty(true)
                            setSaveState('idle')
                          }}
                          className="h-8 w-20 rounded-md border border-surface-border bg-surface-panel px-2.5 text-right text-xs text-text-primary outline-none focus:border-accent/70"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setCapDraft((current) => {
                              const next = { ...current }
                              delete next[providerId]
                              return next
                            })
                            setDirty(true)
                            setSaveState('idle')
                          }}
                          className="text-[11px] text-text-muted hover:text-danger"
                        >
                          {t('settings:blocks.moaAgents.runtime.removeOverride', { defaultValue: 'Remove' })}
                        </button>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {availableProviders.length > 0 ? (
                <select
                  value=""
                  onChange={(event) => {
                    const providerId = event.target.value
                    if (!providerId) return
                    setCapDraft((current) => ({ ...current, [providerId]: settings.limits.maxLiveAgents }))
                    setDirty(true)
                    setSaveState('idle')
                  }}
                  className="mt-2 h-8 w-52 rounded-md border border-surface-border bg-surface-panel px-2.5 text-xs text-text-secondary outline-none focus:border-accent/70"
                >
                  <option value="">
                    {t('settings:blocks.moaAgents.runtime.addProviderOverride', {
                      defaultValue: 'Add provider override…',
                    })}
                  </option>
                  {availableProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>{provider.name}</option>
                  ))}
                </select>
              ) : null}
            </div>

            <p className="text-[10px] leading-4 text-text-muted">
              {t('settings:blocks.moaAgents.runtime.isolationDescription', {
                defaultValue: 'Agent file changes stay isolated until the orchestrator integrates them.',
              })}
            </p>

            {dirty ? (
              <div className="flex items-center justify-end gap-2 border-t border-surface-border/55 pt-3">
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="min-h-8 rounded-md px-3 text-xs text-text-secondary hover:bg-surface-panel hover:text-text-primary"
                >
                  {t('settings:blocks.moaAgents.runtime.discard', { defaultValue: 'Discard' })}
                </button>
                <button
                  type="button"
                  onClick={handleAdvancedSave}
                  disabled={!draftValid || saveState === 'saving'}
                  className="min-h-8 rounded-md bg-accent px-3 text-xs font-semibold text-surface hover:bg-accent-hover disabled:opacity-50"
                >
                  {saveState === 'saving'
                    ? t('core:common.saving', { defaultValue: 'Saving…' })
                    : t('settings:blocks.moaAgents.runtime.saveChanges', { defaultValue: 'Save changes' })}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {saveState === 'error' ? (
        <p role="status" className="pb-3 text-[11px] text-danger-soft">
          {t('core:common.saveFailed', { defaultValue: 'Could not save' })}
        </p>
      ) : null}
    </section>
  )
}
