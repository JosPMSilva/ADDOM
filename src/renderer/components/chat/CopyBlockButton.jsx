import React from 'react'

async function writeClipboardText(text) {
  const value = String(text ?? '')
  if (!value) return false

  if (typeof navigator === 'undefined' || !navigator?.clipboard?.writeText) return false
  await navigator.clipboard.writeText(value)
  return true
}

export default function CopyBlockButton({
  text,
  className = '',
  idleLabel = 'Copy',
  copiedLabel = 'Copied',
  failedLabel = 'Copy failed',
  iconOnly = true,
  variant = 'default',
}) {
  const [status, setStatus] = React.useState('idle')
  const timeoutRef = React.useRef(null)

  React.useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  async function handleCopy() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    try {
      const copied = await writeClipboardText(text)
      setStatus(copied ? 'copied' : 'failed')
    } catch {
      setStatus('failed')
    }
    timeoutRef.current = setTimeout(() => setStatus('idle'), 1400)
  }

  const label = status === 'copied'
    ? copiedLabel
    : status === 'failed'
      ? failedLabel
      : idleLabel

  const currentIconClassName = status === 'copied'
    ? 'ph ph-check'
    : status === 'failed'
      ? 'ph ph-warning-circle'
      : 'ph ph-copy'
  const resolvedVariant = String(variant || 'default').trim().toLowerCase()
  const idleToneClassName = resolvedVariant === 'ghost'
    ? 'border-transparent bg-transparent text-text-tertiary hover:bg-surface-panel hover:text-text-primary'
    : 'border-surface-border bg-surface-panel text-text-tertiary hover:text-text-primary hover:border-border-hover'

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={[
        'inline-flex items-center justify-center rounded-md border text-[10px] font-medium transition-colors',
        iconOnly ? 'h-5 w-5' : 'px-2 py-1',
        status === 'copied'
          ? 'border-success-border bg-success-bg text-success-soft'
          : status === 'failed'
            ? 'border-danger-border bg-danger-bg text-danger-soft'
            : idleToneClassName,
        className,
      ].join(' ')}
      title={label}
      aria-label={label}
    >
      {iconOnly ? <span aria-hidden="true" className={`${currentIconClassName} text-sm leading-none`} /> : label}
    </button>
  )
}
