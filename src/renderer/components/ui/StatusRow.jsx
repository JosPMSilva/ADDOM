import React from 'react'

const TONE_CLASS = Object.freeze({
  neutral: 'border-surface-border bg-surface-panel-alt text-text-secondary',
  info: 'border-info-border bg-info-bg text-info-soft',
  success: 'border-success-border bg-success-bg text-success-soft',
  warning: 'border-warning-border bg-warning-bg text-warning-soft',
  danger: 'border-danger-border bg-danger-bg text-danger-soft',
})

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

export default function StatusRow({ tone = 'neutral', className = '', ...props }) {
  return (
    <div
      className={cx('rounded-md border px-2.5 py-2 text-xs leading-5', TONE_CLASS[tone] || TONE_CLASS.neutral, className)}
      {...props}
    />
  )
}
