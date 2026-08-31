import React from 'react'

export default function ModeToggle({ mode, onChange, executeOnly = false, disabled = false }) {
  const disabledClass = disabled ? 'cursor-not-allowed opacity-55' : ''
  return (
    <div className="inline-flex shrink-0 rounded-lg bg-surface-panel-alt/35 p-0.5 text-[10.5px] font-medium">
      <button
        onClick={() => onChange('execute')}
        disabled={disabled}
        className={[
          'inline-flex h-7 items-center whitespace-nowrap rounded-md px-2.5 transition-colors',
          disabledClass,
          mode === 'execute'
            ? 'bg-accent text-surface shadow-[inset_0_1px_0_rgb(var(--theme-highlight-rgb)_/_0.08)]'
            : 'text-text-secondary hover:text-text-primary',
        ].join(' ')}
      >
        Execute
      </button>
      <button
        onClick={() => onChange('plan')}
        disabled={executeOnly || disabled}
        className={[
          'inline-flex h-7 items-center whitespace-nowrap rounded-md px-2.5 transition-colors',
          executeOnly ? 'cursor-not-allowed opacity-35' : disabledClass,
          mode === 'plan'
            ? 'bg-accent text-surface shadow-[inset_0_1px_0_rgb(var(--theme-highlight-rgb)_/_0.08)]'
            : 'text-text-secondary hover:text-text-primary',
        ].join(' ')}
      >
        Plan
      </button>
      <button
        onClick={() => onChange('thinking')}
        disabled={executeOnly || disabled}
        className={[
          'inline-flex h-7 items-center whitespace-nowrap rounded-md px-2.5 transition-colors',
          executeOnly ? 'cursor-not-allowed opacity-35' : disabledClass,
          mode === 'thinking'
            ? 'bg-accent text-surface shadow-[inset_0_1px_0_rgb(var(--theme-highlight-rgb)_/_0.08)]'
            : 'text-text-secondary hover:text-text-primary',
        ].join(' ')}
      >
        Thinking
      </button>
    </div>
  )
}
