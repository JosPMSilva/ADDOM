import React, { useMemo, useState } from 'react'
import { useSettingsTranslator } from './settings-panel-ui-utils.mjs'
import { requestAppAlert, requestAppConfirm } from '../../store/useAppStore.js'
import useVaultStore from '../../store/useVaultStore.js'
import Icon from '../ui/Icon.jsx'
import { getLogoUrl } from '../../utils/model-logos.js'
import {
  providerHasStoredApiKey,
  providerSupportsOpenAIAccountAuth,
  providerUsesOpenAIAccountAuth,
} from '../../../common/api-clients/provider-credential-state.mjs'
import { useShallow } from 'zustand/react/shallow'
import CursorProviderSettingsRow from './CursorProviderSettingsRow.jsx'

const PENDING_LOGIN_PHASES = new Set(['starting', 'waiting_for_browser', 'waiting_for_callback'])

function isPendingLogin(login = null) {
  const phase = String(login?.phase || '').trim().toLowerCase()
  return PENDING_LOGIN_PHASES.has(phase)
}

function resolveLoginErrorCode(login = null) {
  return String(login?.errorCode || '').trim().toLowerCase()
}

function resolveLoginErrorMessage(login = null, t = (key, options) => options?.defaultValue || key) {
  const errorCode = resolveLoginErrorCode(login)
  if (errorCode === 'callback_port_in_use') {
    return t('settings:blocks.apiKeys.loginErrors.callbackPortInUse', { defaultValue: 'The local OpenAI login callback port is already in use. Retry the login flow or close the conflicting process and try again.' })
  }
  if (errorCode === 'consent_denied') {
    return t('settings:blocks.apiKeys.loginErrors.consentDenied', { defaultValue: 'The OpenAI browser consent step was cancelled or denied. Start the login flow again to retry.' })
  }
  if (errorCode === 'callback_not_completed') {
    return t('settings:blocks.apiKeys.loginErrors.callbackNotCompleted', { defaultValue: 'The OpenAI browser sign-in did not complete the localhost callback. Retry the login flow and finish consent before returning to ADDOM.' })
  }
  if (errorCode === 'browser_open_failed') {
    return t('settings:blocks.apiKeys.loginErrors.browserOpenFailed', { defaultValue: 'ADDOM could not open the OpenAI login page automatically. Use Open browser again or Copy login link.' })
  }
  if (errorCode === 'missing_auth_url') {
    return t('settings:blocks.apiKeys.loginErrors.missingAuthUrl', { defaultValue: 'The OpenAI login link is no longer available. Start the login flow again to request a fresh browser link.' })
  }
  if (errorCode === 'bridge_process_exited') {
    return t('settings:blocks.apiKeys.loginErrors.bridgeProcessExited', { defaultValue: 'The local Codex runtime stopped while waiting for the OpenAI browser callback. Start the login flow again.' })
  }
  if (errorCode === 'login_timed_out') {
    return t('settings:blocks.apiKeys.loginErrors.loginTimedOut', { defaultValue: 'The OpenAI login flow timed out before the browser callback completed. Start the login flow again to retry.' })
  }
  return String(login?.errorMessage || '').trim()
}

function resolveLoginAlertTitle(login = null, fallbackTitle = 'OpenAI Account Login Unavailable', t = (key, options) => options?.defaultValue || key) {
  const errorCode = resolveLoginErrorCode(login)
  if (errorCode === 'callback_port_in_use') return t('settings:blocks.apiKeys.loginAlerts.callbackPortInUse', { defaultValue: 'Local Callback Port Busy' })
  if (errorCode === 'consent_denied') return t('settings:blocks.apiKeys.loginAlerts.consentDenied', { defaultValue: 'Browser Consent Denied' })
  if (errorCode === 'callback_not_completed') return t('settings:blocks.apiKeys.loginAlerts.callbackNotCompleted', { defaultValue: 'Browser Callback Incomplete' })
  if (errorCode === 'browser_open_failed') return t('settings:blocks.apiKeys.loginAlerts.browserOpenFailed', { defaultValue: 'Browser Launch Failed' })
  if (errorCode === 'missing_auth_url') return t('settings:blocks.apiKeys.loginAlerts.missingAuthUrl', { defaultValue: 'Login Link Unavailable' })
  if (errorCode === 'bridge_process_exited') return t('settings:blocks.apiKeys.loginAlerts.bridgeProcessExited', { defaultValue: 'Codex Runtime Stopped' })
  if (errorCode === 'login_timed_out') return t('settings:blocks.apiKeys.loginAlerts.loginTimedOut', { defaultValue: 'Login Timed Out' })
  return fallbackTitle
}

function resolveAccountMessage({ hasAccountSession = false, provider = {}, session = null, login = null, storage = null, t = (key, options) => options?.defaultValue || key } = {}) {
  if (hasAccountSession) {
    const label = String(provider?.accountLabel || session?.label || session?.email || '').trim()
    const planType = String(provider?.accountPlanType || session?.planType || '').trim()
    if (label && planType) return `${label} - ${planType}`
    if (label) return label
    if (planType) return planType
    return t('settings:blocks.apiKeys.account.connected', { defaultValue: 'OpenAI account session is connected.' })
  }
  const runtimeStatus = String(storage?.runtime?.status || '').trim().toLowerCase()
  const runtimeMessage = String(storage?.runtime?.message || '').trim()
  const loginError = resolveLoginErrorMessage(login, t)
  if (isPendingLogin(login)) {
    if (loginError) return loginError
    if (String(login?.phase || '').trim().toLowerCase() === 'waiting_for_callback') {
      return t('settings:blocks.apiKeys.account.waitingForCallback', { defaultValue: 'Finish sign-in and consent in the browser, then return after the localhost callback completes.' })
    }
    return t('settings:blocks.apiKeys.account.waitingForBrowser', { defaultValue: 'ADDOM is waiting for the browser login flow to begin.' })
  }
  if (loginError) return loginError
  if (runtimeStatus && runtimeStatus !== 'runtime_ready' && runtimeMessage) return runtimeMessage
  const sessionError = String(session?.lastErrorMessage || '').trim()
  if (sessionError) return sessionError
  const availabilityMessage = String(session?.availability?.message || provider?.accountStatusMessage || '').trim()
  if (availabilityMessage) return availabilityMessage
  return t('settings:blocks.apiKeys.account.notCompleted', { defaultValue: 'OpenAI account login has not been completed yet.' })
}

function StandardSettingsApiKeyRow({ provider, onSave, onDelete, onSetAuthMethod, extraContent = null }) {
  const t = useSettingsTranslator(['settings', 'core'])
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copiedLoginUrl, setCopiedLoginUrl] = useState(false)
  const {
    openAIAccountSession,
    activeOpenAIAccountLogin,
    openAIAccountStorage,
    openAIAccountBusy,
    startOpenAIAccountLogin,
    checkOpenAIAccountRuntimeUpdate,
    installOpenAIAccountRuntimeUpdate,
    reopenOpenAIAccountLoginBrowser,
    cancelOpenAIAccountLogin,
    disconnectOpenAIAccount,
  } = useVaultStore(useShallow((state) => ({
    openAIAccountSession: state.openAIAccountSession,
    activeOpenAIAccountLogin: state.activeOpenAIAccountLogin,
    openAIAccountStorage: state.openAIAccountStorage,
    openAIAccountBusy: state.openAIAccountBusy,
    startOpenAIAccountLogin: state.startOpenAIAccountLogin,
    checkOpenAIAccountRuntimeUpdate: state.checkOpenAIAccountRuntimeUpdate,
    installOpenAIAccountRuntimeUpdate: state.installOpenAIAccountRuntimeUpdate,
    reopenOpenAIAccountLoginBrowser: state.reopenOpenAIAccountLoginBrowser,
    cancelOpenAIAccountLogin: state.cancelOpenAIAccountLogin,
    disconnectOpenAIAccount: state.disconnectOpenAIAccount,
  })))

  const logoUrl = getLogoUrl(provider.logoPath)
  const computedFallbackName = provider.noKeyRequired ? "cube" : "cloud"
  const providerId = String(provider?.id || '').trim().toLowerCase()
  const isOpenAIProvider = providerId === 'openai'
  const usesAccountAuth = providerUsesOpenAIAccountAuth(provider)
  const supportsAccountAuth = providerSupportsOpenAIAccountAuth(provider)
  const hasStoredApiKey = providerHasStoredApiKey(provider)
  const accountSession = isOpenAIProvider
    ? openAIAccountSession
    : null
  const activeAccountLogin = isOpenAIProvider
    ? activeOpenAIAccountLogin
    : null
  const accountStorage = isOpenAIProvider
    ? openAIAccountStorage
    : null
  const hasAccountSession = provider?.hasAccountSession === true || accountSession?.hasSession === true
  const runtimeStatus = String(accountStorage?.runtime?.status || '').trim().toLowerCase()
  const runtimePreparing = runtimeStatus === 'runtime_downloading' || runtimeStatus === 'runtime_verifying'
  const runtimeVersion = String(accountStorage?.runtime?.version || '').trim()
  const latestRuntimeVersion = String(accountStorage?.runtime?.latestVersion || '').trim()
  const runtimeUpdateStatus = String(accountStorage?.runtime?.updateStatus || '').trim().toLowerCase()
  const runtimeUpdateMessage = String(accountStorage?.runtime?.updateMessage || '').trim()
  const runtimeUpdateAvailable = accountStorage?.runtime?.updateAvailable === true
  const runtimeUpdateChecking = runtimeUpdateStatus === 'checking'
  const runtimeUpdateFailed = runtimeUpdateStatus === 'failed'
  const hasPendingLoginUrl = isPendingLogin(activeAccountLogin) && !!String(activeAccountLogin?.authUrl || '').trim()
  const accountMessage = useMemo(
    () => resolveAccountMessage({
      hasAccountSession,
      provider,
      session: accountSession,
      login: activeAccountLogin,
      storage: accountStorage,
      t,
    }),
    [hasAccountSession, provider, accountSession, activeAccountLogin, accountStorage, t],
  )
  const accountActionBusy = saving || openAIAccountBusy
  const canCopyLoginLink = hasPendingLoginUrl
  const canRunRuntimeUpdateAction = usesAccountAuth && !accountActionBusy && !runtimePreparing && !isPendingLogin(activeAccountLogin)

  if (provider.noKeyRequired) {
    const running = provider.localAvailable
    const modelCount = provider.models?.length ?? 0
    return (
      <div data-ui="settings-provider-credential-row" className="border-b border-surface-border/55 py-3 last:border-b-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 overflow-hidden">
            <div className="flex items-center gap-2.5 min-w-[116px] shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt={`${provider.name} logo`} className="w-4 h-4 object-contain dark:invert opacity-90" />
              ) : (
                <Icon name={computedFallbackName} weight="fill" className="text-accent-muted" size={16} />
              )}
              <span className="text-text-primary text-[13px] font-semibold tracking-tight font-display truncate">{provider.name}</span>
            </div>
            {running ? (
              <span className="text-[11px] font-medium text-text-secondary shrink-0">
                {t('settings:blocks.apiKeys.localProvider.running', {
                  defaultValue: 'Running - {{count}} model{{suffix}}',
                  count: modelCount,
                  suffix: modelCount !== 1 ? 's' : '',
                })}
              </span>
            ) : (
              <span className="text-[11px] font-medium text-text-muted shrink-0">
                {t('settings:blocks.apiKeys.localProvider.notRunning', { defaultValue: 'Not running' })}
              </span>
            )}
            <span className="hidden text-[11px] text-text-muted truncate sm:inline-block">{t('settings:blocks.apiKeys.localProvider.label', { defaultValue: 'Local provider' })}</span>
          </div>
          {provider.keyUrl && (
            <button
              onClick={() => window.addom.shell.openExternal(provider.keyUrl)}
              className="shrink-0 rounded-md border border-transparent p-1.5 text-text-secondary transition-colors hover:border-border-hover hover:bg-surface-panel hover:text-text-primary"
              aria-label={t('settings:blocks.apiKeys.localProvider.downloadTitle', { defaultValue: 'Download {{name}}', name: provider.name })}
              title={t('settings:blocks.apiKeys.localProvider.downloadTitle', { defaultValue: 'Download {{name}}', name: provider.name })}
            >
              <Icon name="download-simple" size={14} />
            </button>
          )}
        </div>
        {extraContent ? (
          <div className="mt-2 border-t border-surface-border/50 pt-2">
            {extraContent}
          </div>
        ) : null}
      </div>
    )
  }

  const handleSave = async () => {
    if (!value.trim()) return
    setSaving(true)
    try {
      await onSave(value.trim())
      setValue('')
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    const ok = await requestAppConfirm({
      title: t('settings:blocks.apiKeys.removeDialog.title', { defaultValue: 'Remove API Key' }),
      message: t('settings:blocks.apiKeys.removeDialog.message', { defaultValue: 'Remove API key for {{name}}?', name: provider.name }),
      confirmLabel: t('settings:blocks.apiKeys.removeDialog.confirm', { defaultValue: 'Remove Key' }),
      cancelLabel: t('core:common.cancel', { defaultValue: 'Cancel' }),
      tone: 'danger',
    })
    if (!ok) return
    await onDelete()
  }

  const handleSetAuthMethod = async (nextAuthMethod) => {
    if (typeof onSetAuthMethod !== 'function' || saving || openAIAccountBusy) return
    const normalizedNextMethod = String(nextAuthMethod || '').trim().toLowerCase()
    if (!normalizedNextMethod || normalizedNextMethod === provider.authMethod) return
    setSaving(true)
    try {
      await onSetAuthMethod(normalizedNextMethod)
      setEditing(false)
      setValue('')
    } finally {
      setSaving(false)
    }
  }

  const handleStartAccountLogin = async () => {
    if (accountActionBusy) return
    const result = await startOpenAIAccountLogin()
    const loginError = resolveLoginErrorMessage(result?.activeLogin, t)
    if ((result?.ok === false || resolveLoginErrorCode(result?.activeLogin) === 'browser_open_failed') && loginError) {
      await requestAppAlert({
        title: resolveLoginAlertTitle(result?.activeLogin, t('settings:blocks.apiKeys.loginAlerts.unavailable', { defaultValue: 'OpenAI Account Login Unavailable' }), t),
        message: loginError,
        tone: 'warning',
      })
    }
  }

  const handleCancelAccountLogin = async () => {
    if (accountActionBusy) return
    await cancelOpenAIAccountLogin(activeAccountLogin?.loginId || '')
  }

  const handleDisconnectAccount = async () => {
    if (accountActionBusy) return
    const ok = await requestAppConfirm({
      title: t('settings:blocks.apiKeys.disconnectDialog.title', { defaultValue: 'Disconnect OpenAI Account' }),
      message: t('settings:blocks.apiKeys.disconnectDialog.message', { defaultValue: 'Disconnect the stored OpenAI account session for this ADDOM profile?' }),
      confirmLabel: t('settings:blocks.apiKeys.disconnectDialog.confirm', { defaultValue: 'Disconnect' }),
      cancelLabel: t('core:common.cancel', { defaultValue: 'Cancel' }),
      tone: 'danger',
    })
    if (!ok) return
    await disconnectOpenAIAccount()
  }

  const handleOpenLoginUrl = async () => {
    if (!hasPendingLoginUrl || accountActionBusy) return
    const result = await reopenOpenAIAccountLoginBrowser(activeAccountLogin?.loginId || '')
    const loginError = resolveLoginErrorMessage(result?.activeLogin, t)
    if (result?.ok === false && loginError) {
      await requestAppAlert({
        title: resolveLoginAlertTitle(result?.activeLogin, t('settings:blocks.apiKeys.loginAlerts.browserOpenFailed', { defaultValue: 'Browser Launch Failed' }), t),
        message: loginError,
        tone: 'warning',
      })
    }
  }

  const handleCopyLoginUrl = async () => {
    const authUrl = String(activeAccountLogin?.authUrl || '').trim()
    if (!authUrl) return
    try {
      await navigator.clipboard.writeText(authUrl)
      setCopiedLoginUrl(true)
      window.setTimeout(() => setCopiedLoginUrl(false), 1500)
    } catch {
      await requestAppAlert({
        title: t('settings:blocks.apiKeys.copyFailed.title', { defaultValue: 'Copy Failed' }),
        message: t('settings:blocks.apiKeys.copyFailed.message', { defaultValue: 'ADDOM could not copy the OpenAI account login link to the clipboard.' }),
        tone: 'warning',
      })
    }
  }

  const handleCheckRuntimeUpdate = async () => {
    if (!canRunRuntimeUpdateAction) return
    try {
      const result = await checkOpenAIAccountRuntimeUpdate()
      const runtime = result?.storage?.runtime
      if (String(runtime?.updateStatus || '').trim().toLowerCase() === 'failed') {
        await requestAppAlert({
          title: t('settings:blocks.apiKeys.account.runtimeUpdateCheckFailedTitle', { defaultValue: 'Runtime Update Check Failed' }),
          message: String(runtime?.updateMessage || '').trim() || t('settings:blocks.apiKeys.account.runtimeUpdateCheckFailedMessage', { defaultValue: 'ADDOM could not check for a Codex runtime update.' }),
          tone: 'warning',
        })
      }
    } catch (error) {
      await requestAppAlert({
        title: t('settings:blocks.apiKeys.account.runtimeUpdateCheckFailedTitle', { defaultValue: 'Runtime Update Check Failed' }),
        message: String(error?.message || '').trim() || t('settings:blocks.apiKeys.account.runtimeUpdateCheckFailedMessage', { defaultValue: 'ADDOM could not check for a Codex runtime update.' }),
        tone: 'warning',
      })
    }
  }

  const handleInstallRuntimeUpdate = async () => {
    if (!canRunRuntimeUpdateAction || !runtimeUpdateAvailable) return
    try {
      const result = await installOpenAIAccountRuntimeUpdate()
      const runtime = result?.storage?.runtime
      const status = String(runtime?.status || '').trim().toLowerCase()
      const updateStatus = String(runtime?.updateStatus || '').trim().toLowerCase()
      if (status === 'runtime_failed' || updateStatus === 'failed') {
        await requestAppAlert({
          title: t('settings:blocks.apiKeys.account.runtimeUpdateFailedTitle', { defaultValue: 'Runtime Update Failed' }),
          message: String(runtime?.message || runtime?.updateMessage || '').trim() || t('settings:blocks.apiKeys.account.runtimeUpdateFailedMessage', { defaultValue: 'ADDOM could not install the Codex runtime update.' }),
          tone: 'warning',
        })
      }
    } catch (error) {
      await requestAppAlert({
        title: t('settings:blocks.apiKeys.account.runtimeUpdateFailedTitle', { defaultValue: 'Runtime Update Failed' }),
        message: String(error?.message || '').trim() || t('settings:blocks.apiKeys.account.runtimeUpdateFailedMessage', { defaultValue: 'ADDOM could not install the Codex runtime update.' }),
        tone: 'warning',
      })
    }
  }

  const apiKeyContent = (!hasStoredApiKey || editing) ? (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <input
        type="password"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') handleSave() }}
        placeholder={provider.keyHint || t('settings:blocks.apiKeys.apiKeyInput.placeholder', { defaultValue: 'Paste your API key...' })}
        autoFocus={editing}
        className="min-w-0 flex-1 rounded-md border border-surface-border bg-surface px-3 py-1.5 font-mono text-[12px] text-text-primary outline-none transition-colors placeholder-text-muted focus:border-accent-muted focus:ring-1 focus:ring-accent-muted/30"
      />
      <button
        onClick={handleSave}
        disabled={saving || !value.trim()}
        aria-label={t('settings:blocks.apiKeys.apiKeyInput.save', { defaultValue: 'Save key' })}
        title={t('settings:blocks.apiKeys.apiKeyInput.save', { defaultValue: 'Save key' })}
        className="flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent bg-accent p-1.5 text-surface transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saving ? <Icon name="spinner" className="animate-spin" size={14} /> : <Icon name="check" size={14} weight="bold" />}
      </button>
      {editing ? (
        <button
          onClick={() => { setEditing(false); setValue('') }}
          aria-label={t('core:common.cancel', { defaultValue: 'Cancel' })}
          title={t('core:common.cancel', { defaultValue: 'Cancel' })}
          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-surface-border bg-surface-panel p-1.5 text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
        >
          <Icon name="x" size={14} weight="bold" />
        </button>
      ) : null}
      {!editing && provider.keyUrl ? (
        <button
          onClick={() => window.addom.shell.openExternal(provider.keyUrl)}
          aria-label={t('settings:blocks.apiKeys.apiKeyInput.getKeyTitle', { defaultValue: 'Get API key from {{name}}', name: provider.name })}
          title={t('settings:blocks.apiKeys.apiKeyInput.getKeyTitle', { defaultValue: 'Get API key from {{name}}', name: provider.name })}
          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-transparent p-1.5 text-text-secondary transition-colors hover:border-border-hover hover:bg-surface-panel hover:text-text-primary"
        >
          <Icon name="link" size={14} weight="bold" />
        </button>
      ) : null}
      {extraContent}
    </div>
  ) : (
    <div className="flex min-w-0 flex-1 items-center justify-between">
      <span className="shrink-0 text-[11px] font-medium text-text-secondary">
        {t('settings:blocks.apiKeys.configured', { defaultValue: 'Configured' })}
      </span>
      <div className="ml-2 flex shrink-0 items-center gap-1.5">
        {saved ? <span className="mr-2 text-[11px] font-medium text-text-secondary">{t('settings:blocks.apiKeys.saved', { defaultValue: 'Saved' })}</span> : null}
        {extraContent}
        <button aria-label={t('settings:blocks.apiKeys.replaceKey', { defaultValue: 'Replace key' })} title={t('settings:blocks.apiKeys.replaceKey', { defaultValue: 'Replace key' })} onClick={() => setEditing(true)} className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary"><Icon name="arrows-clockwise" size={14} weight="bold"/></button>
        <button aria-label={t('settings:blocks.apiKeys.removeDialog.confirm', { defaultValue: 'Remove Key' })} title={t('settings:blocks.apiKeys.removeDialog.confirm', { defaultValue: 'Remove Key' })} onClick={handleDelete} className="rounded-md p-1.5 text-danger-soft transition-colors hover:bg-surface-panel hover:text-danger-softer"><Icon name="trash" size={14} weight="bold"/></button>
      </div>
    </div>
  )

  return (
    <div data-ui="settings-provider-credential-row" className="border-b border-surface-border/55 py-3 last:border-b-0">
      <div className={[
        'flex w-full flex-col gap-2 sm:flex-row',
        supportsAccountAuth ? 'sm:items-start' : 'sm:items-center',
      ].join(' ')}>
        <div className={[
          'flex min-w-[116px] shrink-0 items-center gap-2.5',
          supportsAccountAuth ? 'pt-0.5' : '',
        ].join(' ')}>
          {logoUrl ? (
            <img src={logoUrl} alt={`${provider.name} logo`} className="w-4 h-4 object-contain dark:invert opacity-90" />
          ) : (
            <Icon name={computedFallbackName} weight="fill" className="text-accent-muted" size={16} />
          )}
          <span className="text-text-primary text-[13px] font-semibold tracking-tight font-display truncate">{provider.name}</span>
        </div>

        <div className="min-w-0 flex-1">
          {supportsAccountAuth ? (
            <>
              <div data-ui="openai-access-row" className="flex min-h-8 flex-wrap items-center justify-between gap-2 pb-2">
                <span className="text-[11px] font-medium text-text-muted">{t('settings:blocks.apiKeys.accessMethod.label', { defaultValue: 'Access' })}</span>
              <div className="inline-flex rounded-md border border-surface-border/70 bg-surface-panel/60 p-0.5">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSetAuthMethod('account')}
                  className={[
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                    usesAccountAuth
                      ? 'bg-accent text-surface'
                      : 'text-text-muted hover:bg-surface-panel-alt hover:text-text-primary disabled:opacity-45',
                  ].join(' ')}
                >
                  {t('settings:blocks.apiKeys.accessMethod.openAiAccount', { defaultValue: 'OpenAI account' })}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSetAuthMethod('api_key')}
                  className={[
                    'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors',
                    !usesAccountAuth
                      ? 'bg-accent text-surface'
                      : 'text-text-muted hover:bg-surface-panel-alt hover:text-text-primary disabled:opacity-45',
                  ].join(' ')}
                >
                  {t('settings:blocks.apiKeys.accessMethod.apiKey', { defaultValue: 'API key' })}
                </button>
              </div>
              </div>
              {usesAccountAuth ? (
                <>
                  <div data-ui="openai-account-row" className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border/45 py-2">
                    <div className="min-w-0 flex-1 text-[12px] text-text-secondary">
                      <div className="truncate text-text-primary">{accountMessage}</div>
                      {hasStoredApiKey ? <div className="mt-0.5 text-[11px] text-text-muted">{t('settings:blocks.apiKeys.account.storedKeyInactive', { defaultValue: 'Stored API key remains available but inactive.' })}</div> : null}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                {isPendingLogin(activeAccountLogin) ? (
                  <button
                    type="button"
                    disabled={accountActionBusy}
                    onClick={handleCancelAccountLogin}
                    className="rounded-md px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary disabled:opacity-45"
                  >
                    {t('core:common.cancel', { defaultValue: 'Cancel' })}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={accountActionBusy}
                    onClick={handleStartAccountLogin}
                    className="rounded-md bg-surface-panel px-2 py-1 text-[11px] font-medium text-text-primary transition-colors hover:bg-surface-panel-alt disabled:opacity-45"
                  >
                    {runtimePreparing
                      ? t('settings:blocks.apiKeys.account.preparingRuntime', { defaultValue: 'Preparing Codex runtime' })
                      : hasAccountSession
                        ? t('settings:blocks.apiKeys.account.reconnect', { defaultValue: 'Reconnect' })
                        : t('settings:blocks.apiKeys.account.continueInBrowser', { defaultValue: 'Continue in browser' })}
                  </button>
                )}
                {hasAccountSession && (
                  <button
                    type="button"
                    disabled={accountActionBusy}
                    onClick={handleDisconnectAccount}
                    className="rounded-md px-2 py-1 text-[11px] text-danger-soft transition-colors hover:bg-surface-panel disabled:opacity-45"
                  >
                    {t('settings:blocks.apiKeys.disconnectDialog.confirm', { defaultValue: 'Disconnect' })}
                  </button>
                )}
                {canCopyLoginLink && (
                  <button
                    type="button"
                    disabled={accountActionBusy}
                    onClick={handleOpenLoginUrl}
                    className="rounded-md px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary disabled:opacity-45"
                  >
                    {t('settings:blocks.apiKeys.account.openBrowserAgain', { defaultValue: 'Open browser again' })}
                  </button>
                )}
                {canCopyLoginLink && (
                  <button
                    type="button"
                    disabled={accountActionBusy}
                    onClick={handleCopyLoginUrl}
                    className="rounded-md px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary disabled:opacity-45"
                  >
                    {copiedLoginUrl
                      ? t('settings:blocks.apiKeys.account.copiedLink', { defaultValue: 'Copied link' })
                      : t('settings:blocks.apiKeys.account.copyLoginLink', { defaultValue: 'Copy login link' })}
                  </button>
                )}
                    </div>
                  </div>
                  <div data-ui="openai-runtime-row" className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border/45 pt-2">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-muted">
                      <span className="font-medium text-text-secondary">
                        {runtimeVersion
                          ? t('settings:blocks.apiKeys.account.runtimeVersion', { defaultValue: 'Codex runtime {{version}}', version: runtimeVersion })
                          : t('settings:blocks.apiKeys.account.runtimeNotInstalled', { defaultValue: 'Codex runtime not installed' })}
                      </span>
                      {runtimeUpdateChecking ? <span>{t('settings:blocks.apiKeys.account.runtimeUpdateChecking', { defaultValue: 'Checking for updates...' })}</span> : null}
                      {runtimeUpdateAvailable && latestRuntimeVersion ? <span className="text-text-secondary">{t('settings:blocks.apiKeys.account.runtimeUpdateAvailableShort', { defaultValue: '{{version}} available', version: latestRuntimeVersion })}</span> : null}
                      {runtimeUpdateStatus === 'current' ? <span>{t('settings:blocks.apiKeys.account.runtimeCurrent', { defaultValue: 'Current' })}</span> : null}
                      {runtimeUpdateFailed ? <span className="text-danger-soft">{runtimeUpdateMessage || t('settings:blocks.apiKeys.account.runtimeUpdateCheckFailedInline', { defaultValue: 'Update check failed' })}</span> : null}
                    </div>
                    {runtimeUpdateAvailable ? (
                      <button type="button" disabled={!canRunRuntimeUpdateAction} onClick={handleInstallRuntimeUpdate} className="rounded-md border border-surface-border px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-panel disabled:opacity-45">
                        {runtimePreparing ? t('settings:blocks.apiKeys.account.installingRuntimeUpdate', { defaultValue: 'Installing' }) : t('settings:blocks.apiKeys.account.installRuntimeUpdate', { defaultValue: 'Install update' })}
                      </button>
                    ) : (
                      <button type="button" disabled={!canRunRuntimeUpdateAction || runtimeUpdateChecking} onClick={handleCheckRuntimeUpdate} className="rounded-md px-2 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-panel hover:text-text-primary disabled:opacity-45">
                        {runtimeUpdateChecking ? t('settings:blocks.apiKeys.account.checkingRuntimeUpdates', { defaultValue: 'Checking updates' }) : t('settings:blocks.apiKeys.account.checkRuntimeUpdates', { defaultValue: 'Check runtime updates' })}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div data-ui="openai-api-key-row" className="border-t border-surface-border/45 pt-2">{apiKeyContent}</div>
              )}
            </>
          ) : (
            apiKeyContent
          )}
        </div>
      </div>
    </div>
  )
}

export default function SettingsApiKeyRow(props) {
  if (String(props?.provider?.id || '').trim().toLowerCase() === 'cursor') {
    return <CursorProviderSettingsRow {...props} />
  }
  return <StandardSettingsApiKeyRow {...props} />
}
