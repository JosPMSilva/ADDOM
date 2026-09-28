import React, { useCallback, useEffect, useRef, useState } from 'react'

import { useRendererTranslation } from '../i18n/use-renderer-translation.mjs'
import { createTransientDismissTimer } from './transient-dismiss-timer.mjs'

export const SECOND_INSTANCE_NOTICE_DURATION_MS = 4_000

export function SecondInstanceNotice({ message, dismissLabel, onDismiss }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-ui="second-instance-notice"
      className="fixed right-4 top-12 z-[65] flex w-[min(22rem,calc(100vw-2rem))] items-start gap-3 rounded-lg border border-surface-border bg-surface-panel px-3 py-2.5 text-sm text-text-secondary shadow-[0_16px_38px_rgb(var(--theme-shadow-rgb)_/_0.24)]"
    >
      <span className="min-w-0 flex-1 leading-5">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted transition-colors duration-100 hover:bg-surface-border hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-text-secondary"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
          <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

export default function AppSecondInstanceNotice() {
  const { t } = useRendererTranslation(['core'])
  const [visible, setVisible] = useState(false)
  const timerRef = useRef(null)

  const dismiss = useCallback(() => {
    timerRef.current?.cancel()
    setVisible(false)
  }, [])

  useEffect(() => {
    const subscribe = window?.addom?.app?.onSecondInstance
    if (typeof subscribe !== 'function') return undefined

    const timer = createTransientDismissTimer({
      durationMs: SECOND_INSTANCE_NOTICE_DURATION_MS,
    })
    timerRef.current = timer
    const unsubscribe = subscribe(() => {
      setVisible(true)
      timer.restart(() => setVisible(false))
    })

    return () => {
      timer.dispose()
      timerRef.current = null
      unsubscribe?.()
    }
  }, [])

  if (!visible) return null
  return (
    <SecondInstanceNotice
      message={t('core:app.singleInstanceNotice.message', {
        defaultValue: 'ADDOM is already open. Switched to the existing window.',
      })}
      dismissLabel={t('core:app.singleInstanceNotice.dismiss', {
        defaultValue: 'Dismiss notification',
      })}
      onDismiss={dismiss}
    />
  )
}
