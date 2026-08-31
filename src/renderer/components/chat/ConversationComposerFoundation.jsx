import React from 'react'

const INPUT_SURFACE_CLASS = 'overflow-visible rounded-t-2xl rounded-b-none border border-b-0 border-surface-border/85 bg-surface-panel-alt/85 backdrop-blur-sm transition-colors focus-within:border-accent/50 shadow-[0_12px_36px_rgb(var(--theme-shadow-rgb)_/_0.26),inset_0_1px_0_rgb(var(--theme-highlight-rgb)_/_0.05)]'
const CONTROL_SURFACE_CLASS = 'relative rounded-b-2xl border border-t-0 border-surface-border/85 bg-surface-panel-alt/80 px-3 py-1.5 backdrop-blur-sm shadow-[inset_0_1px_0_rgb(var(--theme-highlight-rgb)_/_0.035)]'
const ACTION_BUTTON_CLASS = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-35'

function mergeClasses(baseClassName, className) {
  return `${baseClassName} ${className || ''}`.trim()
}

export function ConversationComposerInputSurface({ className = '', children, ...props }) {
  return (
    <div className={mergeClasses(INPUT_SURFACE_CLASS, className)} {...props}>
      {children}
    </div>
  )
}

export const ConversationComposerControlSurface = React.forwardRef(function ConversationComposerControlSurface({
  className = '',
  children,
  ...props
}, ref) {
  return (
    <div ref={ref} className={mergeClasses(CONTROL_SURFACE_CLASS, className)} {...props}>
      {children}
    </div>
  )
})

export const ConversationComposerActionButton = React.forwardRef(function ConversationComposerActionButton({
  tone = 'send',
  className = '',
  type = 'button',
  children,
  ...props
}, ref) {
  const toneClassName = tone === 'stop'
    ? 'border-danger-border bg-danger text-white hover:bg-danger-strong'
    : 'border-accent bg-accent text-surface hover:bg-accent-hover'
  return (
    <button
      ref={ref}
      type={type}
      className={mergeClasses(`${ACTION_BUTTON_CLASS} ${toneClassName}`, className)}
      {...props}
    >
      {children}
    </button>
  )
})

/** Shared visual boundary; each conversation supplies only the controls valid for its scope. */
export default function ConversationComposerFoundation({ variant = 'root', children }) {
  return (
    <div
      className={variant === 'agent' ? 'shrink-0 bg-transparent' : 'contents'}
      data-composer-variant={variant}
    >
      {children}
    </div>
  )
}
