import React, { useId } from 'react'
import { buildContextMeterViewModel } from './context-meter-view-model.mjs'
import { useRendererTranslation } from '../../i18n/use-renderer-translation.mjs'

export default function ContextMeter({
  usage,
  activeThreadIsEmpty = false,
  activeThreadContextFallbackMode = 'none',
  compact = false,
}) {
  const { t } = useRendererTranslation(['core'])
  const tooltipId = useId()
  const vm = buildContextMeterViewModel({
    usage: {
      ...(usage && typeof usage === 'object' ? usage : {}),
      ...(activeThreadIsEmpty === true ? { emptyThreadContextLeftFallback: true } : {}),
    },
    contextLeftFallbackMode: activeThreadContextFallbackMode,
    compact,
  })
  const {
    modelLimit,
    tone,
    diameter,
    radius,
    circumference,
    ringStyle,
    ringPercent,
    ringAriaLabel,
    tooltipPercentLabel,
    tooltipTokensUsedLabel,
    tooltipCompactionLabel,
  } = vm

  const resolvedRingPercent = modelLimit > 0
    ? Math.max(0, Math.min(100, Math.round(ringPercent)))
    : 0
  const ringStrokeOffset = circumference - ((resolvedRingPercent / 100) * circumference)
  const unavailableRing = ringStyle === 'unavailable'
  const ringDasharray = unavailableRing ? '2.8 4.4' : circumference
  const ringDashoffset = unavailableRing ? 0 : ringStrokeOffset
  const tooltipTitle = t('core:chat.contextMeter.tooltipTitle', { defaultValue: 'Context window:' })

  return (
    <div
      className="group/context-meter relative"
      data-ui="context-meter"
    >
      <div
        role="img"
        tabIndex={0}
        className={[
          compact
            ? 'relative flex h-8 w-8 items-center justify-center rounded-full transition-colors'
            : 'relative flex h-10 w-10 items-center justify-center rounded-full transition-colors',
          'focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent',
        ].join(' ')}
        aria-label={ringAriaLabel}
        aria-describedby={tooltipId}
      >
        <div className="relative" style={{ width: diameter, height: diameter }}>
          <span
            className="pointer-events-none absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent transition-colors group-hover/context-meter:bg-accent-soft/18 group-focus-visible/context-meter:bg-accent-soft/24"
            aria-hidden="true"
          />
          {unavailableRing && (
            <span
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wide text-text-muted"
              aria-hidden="true"
            >
              ?
            </span>
          )}
          <svg width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`} className="-rotate-90">
            <circle cx={diameter / 2} cy={diameter / 2} r={radius} stroke="var(--color-chat-surface)" strokeWidth="2.6" fill="none" />
            <circle
              cx={diameter / 2}
              cy={diameter / 2}
              r={radius}
              stroke="currentColor"
              strokeWidth="2.6"
              fill="none"
              strokeLinecap={unavailableRing ? 'butt' : 'round'}
              strokeDasharray={ringDasharray}
              strokeDashoffset={ringDashoffset}
              className={tone}
              data-meter-ring={ringStyle}
            />
          </svg>
        </div>
        <span className="sr-only">{ringAriaLabel}</span>
      </div>

      <div
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-[72] w-[11.75rem] -translate-x-1/2 rounded-lg border border-surface-border/75 bg-surface-raised/95 px-2.5 py-2.5 text-center shadow-[0_16px_34px_rgb(var(--theme-deep-cool-shadow-rgb)_/_0.32)] opacity-0 transition-opacity duration-150 ease-out group-hover/context-meter:opacity-100 group-focus-within/context-meter:opacity-100"
      >
        <p className="text-[11px] font-medium text-text-tertiary">{tooltipTitle}</p>
        <p className="mt-1.5 text-[12px] font-semibold text-text-secondary">{tooltipPercentLabel}</p>
        <p className="mt-0.5 text-[11px] font-medium text-text-secondary">{tooltipTokensUsedLabel}</p>
        {tooltipCompactionLabel ? (
          <p className="mx-auto mt-3 max-w-[9.5rem] text-[11px] font-medium leading-snug text-text-muted">
            {tooltipCompactionLabel}
          </p>
        ) : null}
      </div>
    </div>
  )
}
