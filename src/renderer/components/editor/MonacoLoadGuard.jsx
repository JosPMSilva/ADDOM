import React from 'react'

const DEFAULT_MONACO_TIMEOUT_MS = 8000

export function MonacoLoadError({ message }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-panel-alt px-4 text-center">
      <p className="max-w-md text-xs text-danger-soft">
        {message}
      </p>
    </div>
  )
}

export function useMonacoLoadGuard({
  onMount,
  loadingFallback,
  timeoutMessage = 'Editor runtime failed to initialize. Reload the app.',
  timeoutMs = DEFAULT_MONACO_TIMEOUT_MS,
}) {
  const [timedOut, setTimedOut] = React.useState(false)
  const timeoutRef = React.useRef(0)

  React.useEffect(() => {
    setTimedOut(false)
    if (typeof window === 'undefined') return undefined

    timeoutRef.current = window.setTimeout(() => {
      setTimedOut(true)
    }, timeoutMs)

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = 0
      }
    }
  }, [timeoutMs])

  const handleMount = React.useCallback((editor, monaco) => {
    if (timeoutRef.current && typeof window !== 'undefined') {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = 0
    }
    setTimedOut(false)
    onMount?.(editor, monaco)
  }, [onMount])

  return {
    handleMount,
    loadingElement: timedOut ? <MonacoLoadError message={timeoutMessage} /> : loadingFallback,
  }
}
