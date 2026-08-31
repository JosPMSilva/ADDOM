import React from 'react'

const ELEVATION = 'shadow-[0_10px_28px_rgb(var(--theme-shadow-rgb)_/_0.22)]'
const LEAD_SUCCESS = 'shadow-[inset_2px_0_0_rgb(var(--theme-success-rgb)_/_0.7),0_10px_28px_rgb(var(--theme-shadow-rgb)_/_0.22)]'
const LEAD_WARNING = 'shadow-[inset_2px_0_0_rgb(var(--theme-warning-rgb)_/_0.65),0_10px_28px_rgb(var(--theme-shadow-rgb)_/_0.22)]'
const LEAD_DANGER = 'shadow-[inset_2px_0_0_rgb(var(--theme-danger-rgb)_/_0.7),0_10px_28px_rgb(var(--theme-shadow-rgb)_/_0.22)]'

const TONE_CLASS = Object.freeze({
  neutral: `bg-surface-panel-alt ${ELEVATION}`,
  decision: `bg-surface-panel ${ELEVATION}`,
  success: `bg-surface-panel-alt ${LEAD_SUCCESS}`,
  warning: `bg-surface-panel-alt ${LEAD_WARNING}`,
  danger: `bg-surface-panel-alt ${LEAD_DANGER}`,
})

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

export default function PromptSurface({ tone = 'neutral', className = '', ...props }) {
  const resolvedTone = TONE_CLASS[tone] ? tone : 'neutral'
  return (
    <section
      data-tone={resolvedTone}
      className={cx(
        'rounded-xl border-0 px-3.5 py-3 text-text-primary',
        TONE_CLASS[resolvedTone],
        className,
      )}
      {...props}
    />
  )
}
