import React from 'react'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function MenuSurface({ className = '', ...props }) {
  return (
    <div
      className={cx('rounded-lg border border-surface-border bg-surface-panel p-1 text-text-secondary shadow-[0_18px_40px_rgb(var(--theme-shadow-rgb)_/_0.28)]', className)}
      {...props}
    />
  )
}

export function MenuRow({
  as: Component = 'button',
  active = false,
  danger = false,
  className = '',
  type,
  ...props
}) {
  return (
    <Component
      type={Component === 'button' ? (type || 'button') : type}
      className={cx(
        'flex min-h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium tracking-normal transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        active ? 'bg-surface-panel-alt text-text-primary' : 'text-text-secondary hover:bg-surface-panel-alt hover:text-text-primary',
        danger ? 'text-danger-soft hover:bg-danger-bg hover:text-danger-softer' : '',
        className,
      )}
      {...props}
    />
  )
}
