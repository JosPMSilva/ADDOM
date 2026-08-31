import React from 'react'

import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'

function formatTerminalReason(value = '') {
  return String(value || '')
    .replace(/_/g, ' ')
    .trim()
}

function formatPlatformLabel(value = '', t) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'win32') return 'Windows'
  if (normalized === 'darwin') return 'macOS'
  if (normalized === 'linux') return 'Linux'
  return normalized || t('core:terminal.banner.thisPlatform', { defaultValue: 'this platform' })
}

function formatTerminalHealthMessage(runtimeHealth = null, t) {
  const source = runtimeHealth && typeof runtimeHealth === 'object' ? runtimeHealth : {}
  const status = String(source.status || '').trim().toLowerCase()
  const rawReason = String(source.reason || '').trim().toLowerCase()
  const reason = formatTerminalReason(rawReason)
  const rollout = source.rollout && typeof source.rollout === 'object' ? source.rollout : null

  if (status === 'disabled') {
    if (rawReason === 'disabled_by_env') {
      return {
        title: t('core:terminal.banner.runtimeDisabled', { defaultValue: 'Runtime disabled' }),
        detail: t('core:terminal.banner.disabledByEnv', {
          defaultValue: 'The ADDOM_DISABLE_TERMINAL_SESSIONS override is on.',
        }),
        tone: 'warning',
      }
    }

    if (rawReason === 'disabled_by_rollout_policy') {
      return {
        title: t('core:terminal.banner.rolloutDisabled', { defaultValue: 'Rollout disabled' }),
        detail: t('core:terminal.banner.disabledByRollout', {
          defaultValue: 'Terminal sessions are disabled by the current rollout policy.',
        }),
        tone: 'warning',
      }
    }

    if (rawReason === 'rollout_platform_not_enabled') {
      const allowedPlatforms = Array.isArray(rollout?.allowedPlatforms)
        ? rollout.allowedPlatforms.map((entry) => formatPlatformLabel(entry, t)).filter(Boolean)
        : []
      const allowedLabel = allowedPlatforms.length > 0
        ? allowedPlatforms.join(', ')
        : t('core:terminal.banner.anotherPlatform', { defaultValue: 'another platform' })
      return {
        title: t('core:terminal.banner.platformGated', { defaultValue: 'Platform gated' }),
        detail: t('core:terminal.banner.platformGatedDetail', {
          defaultValue: '{{platform}} is still behind rollout. Packaged verification is only recorded for {{allowedLabel}}.',
          platform: formatPlatformLabel(source.platform, t),
          allowedLabel,
        }),
        tone: 'warning',
      }
    }

    if (rawReason === 'platform_not_supported') {
      return {
        title: t('core:terminal.banner.unsupportedPlatform', { defaultValue: 'Unsupported platform' }),
        detail: t('core:terminal.banner.unsupportedPlatformDetail', {
          defaultValue: '{{platform}} is outside the supported PTY target set for terminal sessions.',
          platform: formatPlatformLabel(source.platform, t),
        }),
        tone: 'warning',
      }
    }

    return {
      title: t('core:terminal.banner.runtimeDisabled', { defaultValue: 'Runtime disabled' }),
      detail: reason || t('core:terminal.banner.disabledGeneric', {
        defaultValue: 'Terminal sessions are disabled on this runtime.',
      }),
      tone: 'warning',
    }
  }

  if (status === 'failed') {
    return {
      title: t('core:terminal.banner.runtimeFailed', { defaultValue: 'Runtime failed' }),
      detail: String(source.error || reason || t('core:terminal.banner.failedDetail', {
        defaultValue: 'The PTY runtime health check failed.',
      })),
      tone: 'danger',
    }
  }

  if (status === 'loading' || status === 'idle') {
    return {
      title: t('core:terminal.banner.checkingRuntime', { defaultValue: 'Checking runtime' }),
      detail: t('core:terminal.banner.checkingRuntimeDetail', {
        defaultValue: 'ADDOM is verifying PTY support for this app runtime.',
      }),
      tone: 'neutral',
    }
  }

  return {
    title: t('core:terminal.banner.runtimeReady', { defaultValue: 'Runtime ready' }),
    detail: t('core:terminal.banner.runtimeReadyDetail', {
      defaultValue: 'Interactive terminal sessions are available for this workspace.',
    }),
    tone: 'success',
  }
}

const LEAD_BY_TONE = {
  neutral: 'border-l-2 border-l-border-strong/50',
  success: 'border-l-2 border-l-accent/45',
  warning: 'border-l-2 border-l-warning/50',
  danger: 'border-l-2 border-l-danger/50',
}

function QuietMetaRow({
  message = '',
  tone = 'neutral',
  title = '',
  dataUi = '',
}) {
  const resolvedMessage = String(message || '').trim()
  if (!resolvedMessage) return null
  return (
    <p
      data-ui={dataUi || undefined}
      data-tone={tone}
      title={title || undefined}
      className={[
        'min-w-0 px-2.5 py-0.5 text-[11px] leading-snug text-text-tertiary',
        LEAD_BY_TONE[tone] || LEAD_BY_TONE.neutral,
      ].join(' ')}
    >
      {resolvedMessage}
    </p>
  )
}

export default function TerminalStatusBanner({
  runtimeHealth = null,
  actionError = '',
  actionNotice = null,
}) {
  const { t } = useRendererTranslation(['core'])
  const source = runtimeHealth && typeof runtimeHealth === 'object' ? runtimeHealth : null
  const showHealth = source && source.status !== 'supported'
  const showActionError = String(actionError || '').trim().length > 0
  const actionNoticeMessage = String(actionNotice?.message || '').trim()
  const showActionNotice = actionNoticeMessage.length > 0

  if (!showHealth && !showActionError && !showActionNotice) return null

  const healthMessage = formatTerminalHealthMessage(source, t)

  return (
    <div className="flex flex-col gap-1.5" data-ui="terminal-status-banner">
      {showHealth && (
        <QuietMetaRow
          dataUi="terminal-status-health"
          tone={healthMessage.tone}
          title={healthMessage.title}
          message={[healthMessage.title, healthMessage.detail].filter(Boolean).join(' · ')}
        />
      )}
      {showActionError && (
        <QuietMetaRow
          dataUi="terminal-status-error"
          tone="danger"
          title={t('core:terminal.banner.lastActionFailed', { defaultValue: 'Last action failed' })}
          message={String(actionError)}
        />
      )}
      {showActionNotice && (
        <QuietMetaRow
          dataUi="terminal-status-notice"
          tone={String(actionNotice?.tone || '').trim().toLowerCase() === 'danger' ? 'danger' : 'success'}
          message={actionNoticeMessage}
        />
      )}
    </div>
  )
}
