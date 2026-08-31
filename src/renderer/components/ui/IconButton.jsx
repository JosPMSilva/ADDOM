import React from 'react'

const VARIANT_CLASS = Object.freeze({
  neutral: 'border-transparent text-text-secondary hover:bg-surface-panel hover:text-text-primary',
  panel: 'border-surface-border bg-surface-panel text-text-secondary hover:border-border-hover hover:text-text-primary',
  danger: 'border-transparent text-danger-soft hover:bg-danger-bg hover:text-danger-softer',
})

const SIZE_CLASS = Object.freeze({
  sm: 'h-7 w-7 text-sm',
  md: 'h-8 w-8 text-base',
})

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

export default function IconButton({
  label,
  variant = 'neutral',
  size = 'sm',
  className = '',
  type = 'button',
  title,
  ...props
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={title || label}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        SIZE_CLASS[size] || SIZE_CLASS.sm,
        VARIANT_CLASS[variant] || VARIANT_CLASS.neutral,
        className,
      )}
      {...props}
    />
  )
}
