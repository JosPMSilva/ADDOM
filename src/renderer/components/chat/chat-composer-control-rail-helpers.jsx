import React from 'react'

export const ANTHROPIC_REASONING_EFFORT_OPTIONS = Object.freeze(['low', 'medium', 'high', 'max'])

export const RAIL_INLINE_GAP_PX = 10

export function OverflowIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  )
}

export function ChevronDownIcon({ open = false }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function RefreshIcon({ spinning = false }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={spinning ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  )
}


export function JobsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  )
}

function RateLimitsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <polyline points="20 4 20 10 14 10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="12" x2="15" y2="14" />
    </svg>
  )
}

export function MoAIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <circle cx="9" cy="8" r="2.25" />
      <path d="M4.75 18.25c0-2.35 1.9-4.25 4.25-4.25s4.25 1.9 4.25 4.25" />
      <circle cx="15.5" cy="8" r="2.25" />
      <path d="M11.25 18.25c0-2.35 1.9-4.25 4.25-4.25s4.25 1.9 4.25 4.25" />
    </svg>
  )
}

export function TerminalIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M4.75 6.75h14.5a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5H4.75a1.5 1.5 0 0 1-1.5-1.5v-7.5a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="m7.5 10 2 2-2 2" />
      <path d="M12 14h4.5" />
    </svg>
  )
}

export function formatEffortLabel(value, t) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized || normalized === 'provider_default') {
    return t?.('core:chat.controlRail.reasoningEffort.providerDefault', {
      defaultValue: 'Provider default',
    }) || 'Provider default'
  }
  if (normalized === 'xhigh') {
    return t?.('core:chat.controlRail.reasoningEffort.xhigh', {
      defaultValue: 'Extra High',
    }) || 'Extra High'
  }
  if (normalized === 'low') return 'Light'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function formatAnthropicThinkingLabel(value, t) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized || normalized === 'provider_default') {
    return t?.('core:chat.controlRail.extendedThinking.providerDefault', {
      defaultValue: 'Provider default',
    }) || 'Provider default'
  }
  if (normalized === 'enabled') {
    return t?.('core:chat.controlRail.extendedThinking.enabled', {
      defaultValue: 'On',
    }) || 'On'
  }
  if (normalized === 'disabled') {
    return t?.('core:chat.controlRail.extendedThinking.disabled', {
      defaultValue: 'Off',
    }) || 'Off'
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function formatCollaborationModeLabel(modeId = '', collaborationModes = [], t) {
  const normalizedModeId = String(modeId || '').trim()
  if (!normalizedModeId) {
    return t?.('core:chat.controlRail.collaborationMode.defaultLabel', {
      defaultValue: '[[canon:native_collaboration_mode]]',
    }) || 'Native collaboration mode'
  }
  const match = Array.isArray(collaborationModes)
    ? collaborationModes.find((entry) => String(entry?.id || '').trim() === normalizedModeId)
    : null
  return String(match?.name || normalizedModeId).trim()
    || (t?.('core:chat.controlRail.collaborationMode.defaultLabel', {
      defaultValue: '[[canon:native_collaboration_mode]]',
    }) || 'Native collaboration mode')
}

function normalizeOpenAIAccountRateLimitWindow(window = null) {
  return window && typeof window === 'object' ? window : null
}

function resolveOpenAIAccountRateLimitEntry(rateLimitSummary = null, modelId = '') {
  const summary = rateLimitSummary && typeof rateLimitSummary === 'object' ? rateLimitSummary : null
  if (!summary) return null
  const byLimitId = summary.rateLimitsByLimitId && typeof summary.rateLimitsByLimitId === 'object'
    ? Object.values(summary.rateLimitsByLimitId).filter((entry) => entry && typeof entry === 'object')
    : []
  const defaultEntry = summary.rateLimits && typeof summary.rateLimits === 'object'
    ? summary.rateLimits
    : null
  const normalizedModelId = String(modelId || '').trim().toLowerCase()
  if (normalizedModelId.includes('spark')) {
    const sparkMatch = byLimitId.find((entry) => String(entry?.limitName || '').trim().toLowerCase().includes('spark'))
    if (sparkMatch) return sparkMatch
  }
  if (normalizedModelId.includes('codex')) {
    const codexMatch = byLimitId.find((entry) => String(entry?.limitId || '').trim().toLowerCase() === 'codex')
    if (codexMatch) return codexMatch
  }
  return defaultEntry || byLimitId[0] || null
}

function formatRateLimitWindowLabel(windowDurationMins = 0, fallback = '', labels = {}) {
  const mins = Number(windowDurationMins || 0) || 0
  if (mins === 10080) return labels.weekly || 'Weekly'
  if (mins > 0 && mins % 1440 === 0) return `${mins / 1440}d`
  if (mins > 0 && mins % 60 === 0) return `${mins / 60}h`
  return fallback || `${mins}m`
}

function formatRateLimitResetLabel(resetsAt = 0, windowDurationMins = 0) {
  const timestampMs = (Number(resetsAt || 0) || 0) * 1000
  if (!timestampMs) return ''
  const date = new Date(timestampMs)
  const mins = Number(windowDurationMins || 0) || 0
  if (mins >= 1440) {
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: '2-digit',
    }).format(date)
  }
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function buildOpenAIAccountRateLimitRows(sessionSummary = null, modelId = '', labels = {}) {
  const entry = resolveOpenAIAccountRateLimitEntry(sessionSummary?.rateLimitSummary, modelId)
  if (!entry) return []
  const primary = normalizeOpenAIAccountRateLimitWindow(entry.primary)
  const secondary = normalizeOpenAIAccountRateLimitWindow(entry.secondary)
  return [
    primary
      ? {
        label: formatRateLimitWindowLabel(primary.windowDurationMins, labels.primary || 'Primary', labels),
        remainingPercent: Math.max(0, 100 - (Number(primary.usedPercent || 0) || 0)),
        resetLabel: formatRateLimitResetLabel(primary.resetsAt, primary.windowDurationMins),
      }
      : null,
    secondary
      ? {
        label: formatRateLimitWindowLabel(secondary.windowDurationMins, labels.secondary || 'Secondary', labels),
        remainingPercent: Math.max(0, 100 - (Number(secondary.usedPercent || 0) || 0)),
        resetLabel: formatRateLimitResetLabel(secondary.resetsAt, secondary.windowDurationMins),
      }
      : null,
  ].filter(Boolean)
}

export function OpenAIAccountRateLimitsSection({
  sessionSummary = null,
  modelId = '',
  t = null,
} = {}) {
  const rows = React.useMemo(
    () => buildOpenAIAccountRateLimitRows(sessionSummary, modelId, {
      weekly: t?.('core:chat.controlRail.rateLimits.weekly', { defaultValue: 'Weekly' }) || 'Weekly',
      primary: t?.('core:chat.controlRail.rateLimits.primary', { defaultValue: 'Primary' }) || 'Primary',
      secondary: t?.('core:chat.controlRail.rateLimits.secondary', { defaultValue: 'Secondary' }) || 'Secondary',
    }),
    [modelId, sessionSummary, t],
  )
  if (rows.length === 0) return null

  return (
    <div
      className="mt-1.5 border-t border-surface-border/50 px-1 pt-2"
      title={t?.('core:chat.controlRail.rateLimits.remainingTitle', {
        defaultValue: 'OpenAI account rate limits remaining',
      }) || 'OpenAI account rate limits remaining'}
      data-ui="chat-composer-rate-limits"
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
        <RateLimitsIcon />
        <span>{t?.('core:chat.controlRail.rateLimits.title', { defaultValue: 'Rate Limits' }) || 'Rate Limits'}</span>
      </div>
      <div className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <div key={`${row.label}:${row.resetLabel}`} className="grid min-w-[10rem] grid-cols-[auto_1fr_auto] items-center gap-x-3 rounded-lg px-1 py-0.5 text-[12px] leading-tight">
            <span className="font-semibold text-text-primary">{row.label}</span>
            <span className="text-right text-text-secondary">{row.remainingPercent}%</span>
            <span className="text-text-muted">{row.resetLabel}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
