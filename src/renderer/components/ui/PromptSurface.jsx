import React from 'react'

const ELEVATION = 'shadow-[0_10px_28px_rgb(var(--theme-shadow-rgb)_/_0.22)]'

const TONE_CLASS = Object.freeze({
  neutral: `bg-surface-panel-alt ${ELEVATION}`,
  decision: `bg-surface-panel ${ELEVATION}`,
  success: `bg-surface-panel-alt ${ELEVATION}`,
  warning: `bg-surface-panel-alt ${ELEVATION}`,
  danger: `bg-surface-panel-alt ${ELEVATION}`,
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
