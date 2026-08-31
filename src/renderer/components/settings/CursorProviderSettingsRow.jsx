import React from 'react'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'
import { requestAppConfirm } from '../../store/useAppStore.js'
import useVaultStore from '../../store/useVaultStore.js'
import Icon from '../ui/Icon.jsx'
import { getLogoUrl } from '../../utils/model-logos.js'

function initialCursorState(provider = {}) {
  return {
    runtime: {
      status: String(provider.runtimeStatus || 'runtime_missing'),
      message: String(provider.runtimeStatusMessage || ''),
      version: '',
      percent: 0,
      updateStatus: String(provider.runtimeUpdateStatus || 'idle'),
      updateAvailable: provider.runtimeUpdateAvailable === true,
      latestVersion: String(provider.latestRuntimeVersion || ''),
      updateMessage: String(provider.runtimeUpdateMessage || ''),
    },
    account: {
      status: String(provider.accountStatus || 'unauthenticated'),
      accountLabel: String(provider.accountLabel || ''),
    },
    loginPending: false,
  }
}

function normalizeCursorState(raw = {}, provider = {}) {
  const fallback = initialCursorState(provider)
  return {
    runtime: raw?.runtime && typeof raw.runtime === 'object' ? raw.runtime : fallback.runtime,
    account: raw?.account && typeof raw.account === 'object' ? raw.account : fallback.account,
    loginPending: raw?.loginPending === true,
  }
}

export default function CursorProviderSettingsRow({ provider, onSave, onDelete, onSetAuthMethod }) {
  const t = useSettingsTranslator(['settings', 'core'])
  const loadProviders = useVaultStore((state) => state.loadProviders)
  const [cursorState, setCursorState] = React.useState(() => initialCursorState(provider))
  const [busyAction, setBusyAction] = React.useState('')
  const [editingKey, setEditingKey] = React.useState(provider?.hasApiKey !== true)
  const [keyValue, setKeyValue] = React.useState('')
  const [errorMessage, setErrorMessage] = React.useState('')

  const authMethod = String(provider?.authMethod || 'account').trim().toLowerCase()
  const usesAccount = authMethod === 'account'
  const runtime = cursorState.runtime || {}
  const account = cursorState.account || {}
  const runtimeStatus = String(runtime.status || 'runtime_missing').trim().toLowerCase()
  const runtimeReady = runtimeStatus === 'runtime_ready'
  const runtimePending = runtimeStatus === 'runtime_downloading' || runtimeStatus === 'runtime_installing'
  const runtimeUpdateStatus = String(runtime.updateStatus || 'idle').trim().toLowerCase()
  const runtimeUpdateAvailable = runtime.updateAvailable === true
  const latestRuntimeVersion = String(runtime.latestVersion || '').trim()
  const accountConnected = String(account.status || '').trim().toLowerCase() === 'authenticated'
  const logoUrl = getLogoUrl(provider?.logoPath || 'provider-logos/cursor.svg')

  const loginPendingSeenRef = React.useRef(false)

  const refreshCursorState = React.useCallback(async ({ refreshProviders = false } = {}) => {
    const api = typeof window !== 'undefined' ? window?.addom?.cursorAgent : null
    if (!api?.getState) return null
    const nextState = await api.getState({ forceRefresh: true })
    setCursorState(normalizeCursorState(nextState, provider))
    if (refreshProviders) await loadProviders(true)
    return nextState
  }, [loadProviders, provider])

  React.useEffect(() => {
    void refreshCursorState().catch(() => {})
  }, [refreshCursorState])

  React.useEffect(() => {
    if (!cursorState.loginPending || typeof window === 'undefined') return undefined
    loginPendingSeenRef.current = true
    const intervalId = window.setInterval(() => {
      void refreshCursorState({ refreshProviders: false }).catch(() => {})
    }, 1500)
    return () => window.clearInterval(intervalId)
  }, [cursorState.loginPending, refreshCursorState])

  React.useEffect(() => {
    if (cursorState.loginPending || !loginPendingSeenRef.current) return
    loginPendingSeenRef.current = false
    void loadProviders(true)
  }, [cursorState.loginPending, loadProviders])

  const runAction = async (action, callback, { refreshProviders = true } = {}) => {
    if (busyAction) return null
    setBusyAction(action)
    setErrorMessage('')
    try {
      const result = await callback()
      await refreshCursorState({ refreshProviders })
      return result
    } catch (error) {
      setErrorMessage(String(error?.message || '').trim() || t('settings:blocks.apiKeys.cursor.actionFailed', {
        defaultValue: 'Cursor could not complete this action.',
      }))
      return null
    } finally {
      setBusyAction('')
    }
  }

  const handleSetAuthMethod = async (nextMethod) => {
    if (nextMethod === authMethod || typeof onSetAuthMethod !== 'function') return
    await runAction('auth', () => onSetAuthMethod(nextMethod))
  }

  const handleInstallRuntime = async () => {
    const api = window?.addom?.cursorAgent
    if (!api?.prepareRuntime) return
    await runAction('runtime', () => api.prepareRuntime())
  }

  const handleCheckRuntime = async () => {
    const api = window?.addom?.cursorAgent
    if (!api?.checkRuntimeUpdate) return
    const result = await runAction('runtime', () => api.checkRuntimeUpdate(), { refreshProviders: false })
    if (result && typeof result === 'object') {
      setCursorState((current) => ({ ...current, runtime: result }))
    }
  }

  const handleInstallRuntimeUpdate = async () => {
    const api = window?.addom?.cursorAgent
    if (!api?.installRuntimeUpdate) return
    const result = await runAction('runtime', () => api.installRuntimeUpdate(), { refreshProviders: false })
    if (result && typeof result === 'object') {
      setCursorState((current) => ({ ...current, runtime: result }))
    }
  }

  const handleStartLogin = async () => {
    const api = window?.addom?.cursorAgent
    if (!api?.startLogin || !runtimeReady) return
    const result = await runAction('account', () => api.startLogin(), { refreshProviders: false })
    const authUrl = String(result?.authUrl || '').trim()
    if (authUrl) await window?.addom?.shell?.openExternal?.(authUrl)
    await refreshCursorState()
  }

  const handleCancelLogin = async () => {
    const api = window?.addom?.cursorAgent
    if (!api?.cancelLogin) return
    await runAction('account', () => api.cancelLogin())
  }

  const handleLogout = async () => {
    const confirmed = await requestAppConfirm({
      title: t('settings:blocks.apiKeys.cursor.disconnectTitle', { defaultValue: 'Disconnect Cursor?' }),
      message: t('settings:blocks.apiKeys.cursor.disconnectMessage', {
        defaultValue: 'ADDOM will stop using this Cursor account until you reconnect. Your API key and project files are unchanged.',
      }),
      confirmLabel: t('settings:blocks.apiKeys.cursor.disconnect', { defaultValue: 'Disconnect' }),
      cancelLabel: t('core:common.cancel', { defaultValue: 'Cancel' }),
      tone: 'danger',
    })
    if (!confirmed) return
    const api = window?.addom?.cursorAgent
    if (!api?.logout) return
    await runAction('account', () => api.logout())
  }

  const handleSaveKey = async () => {
    const trimmedKey = keyValue.trim()
    if (!trimmedKey || typeof onSave !== 'function') return
    await runAction('key', () => onSave(trimmedKey))
    setKeyValue('')
    setEditingKey(false)
  }

  const handleDeleteKey = async () => {
    const confirmed = await requestAppConfirm({
      title: t('settings:blocks.apiKeys.removeDialog.title', { defaultValue: 'Remove API Key' }),
      message: t('settings:blocks.apiKeys.removeDialog.message', {
        defaultValue: 'Remove API key for {{name}}?',
        name: provider?.name || 'Cursor',
      }),
      confirmLabel: t('settings:blocks.apiKeys.removeDialog.confirm', { defaultValue: 'Remove Key' }),
      cancelLabel: t('core:common.cancel', { defaultValue: 'Cancel' }),
      tone: 'danger',
    })
    if (!confirmed || typeof onDelete !== 'function') return
    await runAction('key', onDelete)
    setEditingKey(true)
  }

  const runtimeLabel = runtimePending
    ? `${String(runtime.message || t('settings:blocks.apiKeys.cursor.installingRuntime', { defaultValue: 'Installing runtime' }))}${Number(runtime.percent) > 0 ? ` ${Number(runtime.percent)}%` : ''}`
    : runtimeReady
      ? t('settings:blocks.apiKeys.cursor.runtimeReady', {
          defaultValue: 'Runtime {{version}} is ready',
          version: String(runtime.version || '').trim(),
        }).replace(/\s+is ready/, ' is ready')
      : String(runtime.message || t('settings:blocks.apiKeys.cursor.runtimeMissing', { defaultValue: 'Cursor Agent runtime is not installed.' }))

  return (
    <div data-ui="cursor-provider-row" className="border-b border-surface-border/55 py-3 last:border-b-0">
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex min-w-[116px] shrink-0 items-center gap-2.5 pt-0.5">
          {logoUrl ? (
            <img src={logoUrl} alt="Cursor logo" className="h-4 w-4 object-contain opacity-90 invert" />
          ) : (
            <Icon name="cursor-click" weight="fill" className="text-accent-muted" size={16} />
          )}
          <span className="truncate font-display text-[13px] font-semibold tracking-tight text-text-primary">{provider?.name || 'Cursor'}</span>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div data-ui="cursor-access-row" className="flex min-h-8 flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-text-muted">{t('settings:blocks.apiKeys.accessMethod.label', { defaultValue: 'Access' })}</span>
            <div data-ui="cursor-auth-method" className="inline-flex rounded-md border border-surface-border/70 bg-surface-panel/60 p-0.5">
              <button type="button" disabled={Boolean(busyAction)} onClick={() => handleSetAuthMethod('account')} className={`rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors ${usesAccount ? 'bg-accent text-surface' : 'text-text-muted hover:text-text-primary'}`}>
                {t('settings:blocks.apiKeys.cursor.accountMethod', { defaultValue: 'Cursor account' })}
              </button>
              <button type="button" disabled={Boolean(busyAction)} onClick={() => handleSetAuthMethod('api_key')} className={`rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors ${!usesAccount ? 'bg-accent text-surface' : 'text-text-muted hover:text-text-primary'}`}>
                {t('settings:blocks.apiKeys.accessMethod.apiKey', { defaultValue: 'API key' })}
              </button>
            </div>
          </div>

          {usesAccount ? (
            <div data-ui="cursor-account-row" className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border/45 py-2">
              <div className="min-w-0 text-[12px] text-text-secondary">
                <div className="truncate text-text-primary">{accountConnected ? (account.accountLabel || t('settings:blocks.apiKeys.cursor.accountConnected', { defaultValue: 'Cursor account connected' })) : t('settings:blocks.apiKeys.cursor.accountDisconnected', { defaultValue: 'Cursor account not connected' })}</div>
                {provider?.hasApiKey ? <div className="text-[11px] text-text-muted">{t('settings:blocks.apiKeys.account.storedKeyInactive', { defaultValue: 'Stored API key remains available but inactive.' })}</div> : null}
              </div>
              <div className="flex items-center gap-1">
                {cursorState.loginPending ? (
                  <button type="button" disabled={Boolean(busyAction)} onClick={handleCancelLogin} className="rounded-md px-2 py-1 text-[11px] text-text-secondary hover:bg-surface-panel disabled:opacity-45">{t('core:common.cancel', { defaultValue: 'Cancel' })}</button>
                ) : (
                  <button type="button" disabled={Boolean(busyAction) || !runtimeReady} onClick={handleStartLogin} className="rounded-md bg-surface-panel px-2.5 py-1 text-[11px] font-medium text-text-primary hover:bg-surface-panel-alt disabled:opacity-45">
                    {accountConnected
                      ? t('settings:blocks.apiKeys.cursor.reconnect', { defaultValue: 'Reconnect' })
                      : t('settings:blocks.apiKeys.cursor.connect', { defaultValue: 'Connect account' })}
                  </button>
                )}
                {accountConnected ? <button type="button" disabled={Boolean(busyAction)} onClick={handleLogout} className="rounded-md px-2 py-1 text-[11px] text-danger-soft hover:bg-surface-panel disabled:opacity-45">{t('settings:blocks.apiKeys.cursor.disconnect', { defaultValue: 'Disconnect' })}</button> : null}
              </div>
            </div>
          ) : (
            <div data-ui="cursor-account-row" className="border-t border-surface-border/45 py-2">
              {provider?.hasApiKey && !editingKey ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-text-secondary">{t('settings:blocks.apiKeys.configured', { defaultValue: 'Configured' })}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setEditingKey(true)} aria-label={t('settings:blocks.apiKeys.replaceKey', { defaultValue: 'Replace key' })} className="rounded-md p-1.5 text-text-secondary hover:bg-surface-panel hover:text-text-primary"><Icon name="arrows-clockwise" size={14} weight="bold" /></button>
                    <button type="button" onClick={handleDeleteKey} aria-label={t('settings:blocks.apiKeys.removeDialog.confirm', { defaultValue: 'Remove Key' })} className="rounded-md p-1.5 text-danger-soft hover:bg-surface-panel"><Icon name="trash" size={14} weight="bold" /></button>
                  </div>
                </div>
              ) : (
                <div className="flex min-w-0 items-center gap-2">
                  <input type="password" value={keyValue} onChange={(event) => setKeyValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void handleSaveKey() }} placeholder={provider?.keyPlaceholder || 'crsr_...'} aria-label={t('settings:blocks.apiKeys.cursor.apiKeyLabel', { defaultValue: 'Cursor API key' })} className="min-w-0 flex-1 rounded-md border border-surface-border bg-surface px-3 py-1.5 font-mono text-[12px] text-text-primary outline-none focus:border-accent-muted" />
                  <button type="button" disabled={Boolean(busyAction) || !keyValue.trim()} onClick={handleSaveKey} aria-label={t('settings:blocks.apiKeys.apiKeyInput.save', { defaultValue: 'Save key' })} className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-surface disabled:opacity-40"><Icon name={busyAction === 'key' ? 'spinner' : 'check'} className={busyAction === 'key' ? 'animate-spin' : ''} size={14} weight="bold" /></button>
                  {provider?.hasApiKey ? <button type="button" onClick={() => { setEditingKey(false); setKeyValue('') }} aria-label={t('core:common.cancel', { defaultValue: 'Cancel' })} className="flex size-8 shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-surface-panel"><Icon name="x" size={14} weight="bold" /></button> : null}
                </div>
              )}
            </div>
          )}

          <div data-ui="cursor-runtime-row" className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border/45 pt-2">
            <div className="min-w-0 text-[12px] leading-4 text-text-secondary">
              <div className={runtimeStatus === 'runtime_failed' ? 'text-danger-soft' : ''}>{runtimeLabel}</div>
              {runtimeUpdateAvailable && latestRuntimeVersion ? (
                <div className="text-[11px] text-text-muted">
                  {t('settings:blocks.apiKeys.account.runtimeUpdateAvailableShort', { defaultValue: '{{version}} available', version: latestRuntimeVersion })}
                </div>
              ) : null}
              {runtimeUpdateStatus === 'failed' ? <div className="text-[11px] text-danger-soft">{String(runtime.updateMessage || '')}</div> : null}
              <div className="text-[11px] text-text-muted">{t('settings:blocks.apiKeys.cursor.executionScope', { defaultValue: 'Composer 2.5 runs in Chat Execute with Full Access.' })}</div>
            </div>
            {runtimeReady ? (
              runtimeUpdateAvailable ? (
                <button type="button" disabled={Boolean(busyAction)} onClick={handleInstallRuntimeUpdate} className="rounded-md border border-surface-border px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-panel disabled:opacity-45">
                  {runtimePending ? t('settings:blocks.apiKeys.account.installingRuntimeUpdate', { defaultValue: 'Installing' }) : t('settings:blocks.apiKeys.account.installRuntimeUpdate', { defaultValue: 'Install update' })}
                </button>
              ) : (
                <button type="button" disabled={Boolean(busyAction)} onClick={handleCheckRuntime} className="rounded-md px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary disabled:opacity-45">
                  {busyAction === 'runtime' ? t('settings:blocks.apiKeys.account.checkingRuntimeUpdates', { defaultValue: 'Checking updates' }) : t('settings:blocks.apiKeys.cursor.checkRuntime', { defaultValue: 'Check runtime' })}
                </button>
              )
            ) : (
              <button type="button" disabled={Boolean(busyAction)} onClick={handleInstallRuntime} className="rounded-md bg-surface-panel px-2.5 py-1 text-[11px] font-medium text-text-primary transition-colors hover:bg-surface-panel-alt disabled:opacity-45">
                {runtimePending ? t('settings:blocks.apiKeys.cursor.installingRuntime', { defaultValue: 'Installing runtime' }) : t('settings:blocks.apiKeys.cursor.installRuntime', { defaultValue: 'Install runtime' })}
              </button>
            )}
          </div>
          {errorMessage ? <p role="alert" className="text-[11px] leading-4 text-danger-soft">{errorMessage}</p> : null}
        </div>
      </div>
    </div>
  )
}
