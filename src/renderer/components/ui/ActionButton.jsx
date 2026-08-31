import React from 'react'

const VARIANT_CLASS = Object.freeze({
  primary: 'border-transparent bg-accent-hover text-surface hover:bg-accent-soft',
  secondary: 'border-surface-border bg-surface-panel text-text-secondary hover:border-border-hover hover:text-text-primary',
  ghost: 'border-transparent bg-transparent text-text-secondary hover:bg-surface-panel hover:text-text-primary',
  danger: 'border-danger-border bg-danger-bg text-danger-soft hover:bg-danger-bg-hover hover:text-danger-softer',
})

const SIZE_CLASS = Object.freeze({
  sm: 'min-h-7 px-2.5 py-1 text-xs',
  md: 'min-h-8 px-3 py-1.5 text-sm',
})

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

export default function ActionButton({
  as: Component = 'button',
  variant = 'secondary',
  size = 'sm',
  className = '',
  type,
  ...props
}) {
  return (
    <Component
      type={Component === 'button' ? (type || 'button') : type}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border font-display font-medium tracking-normal transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        SIZE_CLASS[size] || SIZE_CLASS.sm,
        VARIANT_CLASS[variant] || VARIANT_CLASS.secondary,
        className,
      )}
      {...props}
    />
  )
}
